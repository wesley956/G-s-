use deposito_domain as domain;
mod backup_commands;
use backup_commands::*;
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
    if app.state::<BackupState>().restoring.load(std::sync::atomic::Ordering::SeqCst) { return Err("Restauração em andamento. Aguarde o reinício.".into()); }
    let pool = database_pool(&app).await?;
    domain::apply(&pool, operation).await
}

async fn database_pool(app: &tauri::AppHandle) -> Result<domain::SqlitePool, String> {
    let instances = app.state::<tauri_plugin_sql::DbInstances>();
    let pool = {
        let lock = instances.0.read().await;
        match lock.get("sqlite:deposito.db") {
            Some(tauri_plugin_sql::DbPool::Sqlite(pool)) => pool.clone(),
            _ => return Err("Banco local não inicializado. Reabra o aplicativo.".into()),
        }
    };
    Ok(pool)
}
fn backup_directory(app: &tauri::AppHandle) -> Result<std::path::PathBuf, String> {
    Ok(app.path().app_config_dir().map_err(|e|e.to_string())?.join("backups"))
}
#[tauri::command]
async fn create_backup(app: tauri::AppHandle) -> Result<domain::backup::Backup, String> {
    let pool = database_pool(&app).await?;
    domain::backup::create(&pool, &backup_directory(&app)?, domain::backup_policy::get(&pool).await?.retention).await
}
#[tauri::command]
fn list_backups(app: tauri::AppHandle) -> Result<Vec<domain::backup::Backup>, String> {
    domain::backup::list(&backup_directory(&app)?)
}
#[tauri::command]
async fn export_backup(app: tauri::AppHandle, backup_id: String) -> Result<Option<String>, String> {
    let source = domain::backup::selected(&backup_directory(&app)?, &backup_id)?;
    domain::backup::validate(&source).await?;
    tauri::async_runtime::spawn_blocking(move || {
        let selected = app.dialog().file().add_filter("Backup SQLite", &["sqlite"])
            .set_file_name(backup_id).blocking_save_file();
        let Some(selected) = selected else { return Ok(None); };
        let path = selected.into_path().map_err(|e|e.to_string())?;
        domain::backup::export(&source,&path)?;
        Ok(Some(path.to_string_lossy().into_owned()))
    }).await.map_err(|e|e.to_string())?
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
        // Single-instance must run first: no recovery can overlap another app.
        .plugin(tauri_plugin_single_instance::init(|app,_,_| {
            if let Some(window)=app.get_webview_window("main") {let _=window.unminimize();let _=window.set_focus();}
        }))
        // This plugin runs before SQL and before any app window is created.
        .plugin(tauri::plugin::Builder::<tauri::Wry>::new("backup-recovery").setup(|app,_| {
            let directory=app.path().app_config_dir()?;
            let report=tauri::async_runtime::block_on(domain::recovery::apply_pending(&directory))
                .map_err(std::io::Error::other)?;
            app.manage(BackupState {restore_report:report,..Default::default()});
            Ok(())
        }).build())
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![save_receipt_pdf, write_operation, log_error, create_backup, list_backups, export_backup, get_backup_policy, set_backup_policy, check_backup_schedule, backup_status, restore_backup])
        .plugin(
            tauri_plugin_sql::Builder::default()
                .add_migrations("sqlite:deposito.db", migrations)
                .build(),
        )
        .setup(|app| { start_schedule(app.handle().clone()); Ok(()) })
        .run(tauri::generate_context!())
        .expect("erro ao iniciar o aplicativo");
}
