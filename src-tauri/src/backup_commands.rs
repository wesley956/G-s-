use crate::{backup_directory, database_pool, domain, log_error};
use std::{path::PathBuf, sync::{atomic::{AtomicBool,Ordering}, Mutex}};
use tauri::Manager;
use tauri_plugin_dialog::{DialogExt, MessageDialogButtons};
#[derive(Default)]
pub struct BackupState {
    pub restoring: AtomicBool,
    pub restore_lock: tokio::sync::Mutex<()>,
    pub restore_report: Option<domain::recovery::Report>,
    pub automatic_error: Mutex<Option<String>>,
}
#[derive(serde::Serialize)]
#[serde(rename_all="camelCase")]
pub struct Status { restore_report: Option<domain::recovery::Report>, automatic_error: Option<String> }
#[tauri::command]
pub fn backup_status(app: tauri::AppHandle) -> Status {
    let state=app.state::<BackupState>();
    Status{restore_report:state.restore_report.clone(),automatic_error:state.automatic_error.lock().ok().and_then(|error|error.clone())}
}
#[tauri::command]
pub async fn get_backup_policy(app: tauri::AppHandle) -> Result<domain::backup_policy::Policy,String> {
    domain::backup_policy::get(&database_pool(&app).await?).await
}
#[tauri::command]
pub async fn set_backup_policy(app: tauri::AppHandle, policy: domain::backup_policy::Policy) -> Result<(),String> {
    if app.state::<BackupState>().restoring.load(Ordering::SeqCst) {return Err("Restauração em andamento. Aguarde o reinício.".into());}
    domain::backup_policy::set(&database_pool(&app).await?,&policy).await
}
pub fn now_ms() -> u64 {
    std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap_or_default().as_millis() as u64
}
#[tauri::command]
pub async fn check_backup_schedule(app: tauri::AppHandle) -> Result<Option<domain::backup::Backup>,String> {
    let state=app.state::<BackupState>();
    if state.restoring.load(Ordering::SeqCst) {return Ok(None);}
    let result=domain::backup_policy::check(&database_pool(&app).await?,&backup_directory(&app)?,now_ms()).await;
    if let Ok(mut error)=state.automatic_error.lock() {*error=result.as_ref().err().cloned();}
    if let Err(error)=&result {let _=log_error(app.clone(),format!("Backup automático: {error}"));}
    result
}
#[tauri::command]
pub async fn restore_backup(app: tauri::AppHandle, backup_id: Option<String>) -> Result<bool,String> {
    let state=app.state::<BackupState>();let _guard=state.restore_lock.lock().await;
    if state.restoring.load(Ordering::SeqCst) {return Err("Reinicie para concluir a recuperação pendente.".into());}
    let source=if let Some(id)=backup_id {
        domain::backup::selected(&backup_directory(&app)?,&id)?
    } else {
        let handle=app.clone();
        let picked=tauri::async_runtime::spawn_blocking(move ||handle.dialog().file().add_filter("Backup SQLite",&["sqlite","db"]).blocking_pick_file()).await.map_err(|e|e.to_string())?;
        let Some(picked)=picked else {return Ok(false);};
        picked.into_path().map_err(|e|e.to_string())?
    };
    domain::backup::validate_restore(&source).await?;
    let handle=app.clone();let file_name=source.file_name().unwrap_or_default().to_string_lossy().into_owned();
    let confirmed=tauri::async_runtime::spawn_blocking(move ||handle.dialog().message(format!("Restaurar o arquivo {file_name}?\n\nAs vendas, estoque, caixa, clientes e configurações serão substituídos pelos dados dessa cópia. Antes da troca será salva uma cópia preventiva dos dados atuais. O aplicativo será reiniciado."))
        .title("Confirmar restauração")
        .buttons(MessageDialogButtons::OkCancelCustom("Restaurar e reiniciar".into(),"Cancelar".into())).blocking_show()).await.map_err(|e|e.to_string())?;
    if !confirmed {return Ok(false);}
    let directory:PathBuf=app.path().app_config_dir().map_err(|e|e.to_string())?;
    domain::recovery::prepare(&source,&directory).await?;
    state.restoring.store(true,Ordering::SeqCst);
    // No swap occurs in this process. The SQL plugin closes pools on Exit,
    // then the recovery plugin applies the pending copy on the next startup.
    database_pool(&app).await?.close().await;
    app.request_restart();
    Ok(true)
}
pub fn start_schedule(app: tauri::AppHandle) {
    tauri::async_runtime::spawn(async move {
        loop {
            tokio::time::sleep(std::time::Duration::from_secs(60)).await;
            if database_pool(&app).await.is_ok() {let _=check_backup_schedule(app.clone()).await;}
        }
    });
}
