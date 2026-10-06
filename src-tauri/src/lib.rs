use deposito_domain as domain;
use tauri::Manager;
use tauri_plugin_sql::{Migration, MigrationKind};
use tauri_plugin_dialog::DialogExt;

#[tauri::command]
async fn save_receipt_pdf(
    app: tauri::AppHandle,
    sale_number: u32,
    pdf_bytes: Vec<u8>,
) -> Result<Option<String>, String> {
    if pdf_bytes.len() > 20_000_000 || !pdf_bytes.starts_with(b"%PDF-") {
        return Err("Arquivo PDF inválido ou muito grande.".into());
    }
    // The frontend cannot supply an arbitrary filesystem path. The user selects it.
    tauri::async_runtime::spawn_blocking(move || {
        let selected = app.dialog().file()
            .add_filter("Comprovante PDF", &["pdf"])
            .set_file_name(format!("venda-{}.pdf", sale_number))
            .blocking_save_file();
        let Some(selected) = selected else { return Ok(None); };
        let path = selected.into_path().map_err(|err| err.to_string())?;
        if !path.extension().and_then(|ext| ext.to_str()).is_some_and(|ext| ext.eq_ignore_ascii_case("pdf")) {
            return Err("Escolha um arquivo com extensão .pdf.".into());
        }
        std::fs::write(&path, pdf_bytes)
            .map_err(|err| format!("Não foi possível salvar o PDF: {}", err))?;
        Ok(Some(path.to_string_lossy().into_owned()))
    }).await.map_err(|err| err.to_string())?
}

#[tauri::command]
fn log_error(app: tauri::AppHandle, message: String) -> Result<(), String> {
    use std::io::Write;
    let dir = app.path().app_log_dir().map_err(|e| e.to_string())?;
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let path = dir.join("errors.log");
    // Bound log size; keep the previous log for diagnosis.
    if std::fs::metadata(&path).is_ok_and(|m| m.len() > 2_000_000) {
        let _ = std::fs::rename(&path, dir.join("errors.previous.log"));
    }
    let mut file = std::fs::OpenOptions::new().create(true).append(true).open(path).map_err(|e| e.to_string())?;
    let stamp = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap_or_default().as_secs();
    let safe: String = message.replace(['\n','\r'], " ").chars().take(4000).collect();
    writeln!(file, "{stamp} {safe}").map_err(|e| e.to_string())
}

#[tauri::command]
async fn write_operation(app: tauri::AppHandle, operation: domain::Operation) -> Result<serde_json::Value, String> {
    let instances = app.state::<tauri_plugin_sql::DbInstances>();
    let pool = {
        let lock = instances.0.read().await;
        match lock.get("sqlite:deposito.db") {
            Some(tauri_plugin_sql::DbPool::Sqlite(pool)) => pool.clone(),
            _ => return Err("Banco local não inicializado. Reabra o aplicativo.".into()),
        }
    };
    domain::apply(&pool, operation).await
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let migrations = vec![
        Migration {
            version: 1,
            description: "create_core_tables",
            sql: include_str!("../migrations/0001_core.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 2,
            description: "allow_customer_receipts_in_cash",
            sql: include_str!("../migrations/0002_cash_receipts.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 3,
            description: "sale_receipts_and_output_events",
            sql: include_str!("../migrations/0003_sale_receipts.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 4,
            description: "atomic_operations_and_ledger_allocations",
            sql: include_str!("../migrations/0004_integrity.sql"),
            kind: MigrationKind::Up,
        },
    ];

    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![save_receipt_pdf, write_operation, log_error])
        .plugin(
            tauri_plugin_sql::Builder::default()
                .add_migrations("sqlite:deposito.db", migrations)
                .build(),
        )
        .run(tauri::generate_context!())
        .expect("erro ao iniciar o aplicativo");
}
