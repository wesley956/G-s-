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
        let mut path = selected.into_path().map_err(|err| err.to_string())?;
        if path.extension().is_none() { path.set_extension("pdf"); }
        if !path.extension().and_then(|ext| ext.to_str()).is_some_and(|ext| ext.eq_ignore_ascii_case("pdf")) {
            return Err("Escolha um arquivo com extensão .pdf.".into());
        }
        std::fs::write(&path, pdf_bytes)
            .map_err(|err| format!("Não foi possível salvar o PDF: {}", err))?;
        Ok(Some(path.to_string_lossy().into_owned()))
    }).await.map_err(|err| err.to_string())?
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
    ];

    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![save_receipt_pdf])
        .plugin(
            tauri_plugin_sql::Builder::default()
                .add_migrations("sqlite:deposito.db", migrations)
                .build(),
        )
        .run(tauri::generate_context!())
        .expect("erro ao iniciar o aplicativo");
}
