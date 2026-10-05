//! Consistent live snapshots; the running database is never copied as a raw file.
use serde::Serialize;
use sqlx::{sqlite::{SqliteConnectOptions, SqlitePoolOptions}, SqlitePool};
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};
static BACKUP_LOCK: tokio::sync::Mutex<()> = tokio::sync::Mutex::const_new(());
type Result<T> = std::result::Result<T,String>;
#[derive(Serialize, Clone)]
#[serde(rename_all="camelCase")]
pub struct Backup { pub id:String, pub created_at_ms:u64, pub size_bytes:u64, pub warning:Option<String> }
fn managed(name:&str)->bool {
    let Some(s)=name.strip_prefix("gs-backup-").and_then(|s|s.strip_suffix(".sqlite")) else {return false;};
    let Some((stamp,uuid))=s.split_once('-') else{return false;};
    stamp.parse::<u64>().is_ok() && uuid::Uuid::parse_str(uuid).is_ok()
}
pub fn list(directory:&Path)->Result<Vec<Backup>> {
    if !directory.exists(){return Ok(Vec::new());}
    let mut backups=Vec::new();
    for entry in std::fs::read_dir(directory).map_err(|e|e.to_string())? {
        let entry=entry.map_err(|e|e.to_string())?;let name=entry.file_name().to_string_lossy().into_owned();
        if !managed(&name) || !entry.file_type().map_err(|e|e.to_string())?.is_file(){continue;}
        let meta=entry.metadata().map_err(|e|e.to_string())?;
        let created=meta.modified().unwrap_or(UNIX_EPOCH).duration_since(UNIX_EPOCH).unwrap_or_default().as_millis() as u64;
        backups.push(Backup{id:name,created_at_ms:created,size_bytes:meta.len(),warning:None});
    }
    backups.sort_by(|a,b|b.created_at_ms.cmp(&a.created_at_ms).then(b.id.cmp(&a.id)));Ok(backups)
}
pub fn selected(directory:&Path,name:&str)->Result<PathBuf> {
    if !managed(name){return Err("Backup inválido.".into());}
    let path=directory.join(name);
    if !std::fs::symlink_metadata(&path).map_err(|e|e.to_string())?.file_type().is_file(){return Err("Arquivo de backup inválido.".into());}
    Ok(path)
}
pub async fn validate(path:&Path)->Result<()> {
    let pool=SqlitePoolOptions::new().max_connections(1).connect_with(SqliteConnectOptions::new().filename(path).read_only(true).create_if_missing(false)).await.map_err(|e|format!("Backup ilegível: {e}"))?;
    let result=async {
        let integrity:Vec<String>=sqlx::query_scalar("PRAGMA quick_check").fetch_all(&pool).await.map_err(|e|e.to_string())?;
        if integrity!=["ok"] {return Err("O backup está corrompido.".into());}
        if !sqlx::query("PRAGMA foreign_key_check").fetch_all(&pool).await.map_err(|e|e.to_string())?.is_empty(){return Err("O backup possui vínculos inválidos.".into());}
        let names:Vec<String>=sqlx::query_scalar("SELECT name FROM sqlite_master WHERE type='table'").fetch_all(&pool).await.map_err(|e|e.to_string())?;
        for required in ["app_settings","categories","products","customers","cash_sessions","sales","sale_items","payments","inventory_movements","customer_account_entries","cash_transactions","sale_receipt_snapshots","receipt_output_events","operation_results","account_payment_allocations"] {
            if !names.iter().any(|name|name==required){return Err(format!("Backup incompatível: falta a tabela {required}."));}
        }
        Ok(())
    }.await;
    pool.close().await;result
}
pub async fn create(pool:&SqlitePool,directory:&Path,retention:usize)->Result<Backup> {
    if !(3..=30).contains(&retention){return Err("Retenção inválida.".into());}
    let _guard=BACKUP_LOCK.lock().await;
    std::fs::create_dir_all(directory).map_err(|e|e.to_string())?;
    let stamp=SystemTime::now().duration_since(UNIX_EPOCH).unwrap_or_default().as_millis();
    let name=format!("gs-backup-{stamp}-{}.sqlite",uuid::Uuid::new_v4());
    let partial=directory.join(format!("{name}.partial"));let completed=directory.join(&name);
    // Reserve a unique empty output before SQLite opens it; existing files are untouched.
    std::fs::OpenOptions::new().write(true).create_new(true).open(&partial).map_err(|e|e.to_string())?;
    let result=async {
        sqlx::query("VACUUM INTO ?").bind(partial.to_string_lossy().as_ref()).execute(pool).await.map_err(|e|format!("Não foi possível criar o backup: {e}"))?;
        validate(&partial).await?;
        std::fs::OpenOptions::new().write(true).open(&partial).map_err(|e|e.to_string())?.sync_all().map_err(|e|e.to_string())?;
        std::fs::rename(&partial,&completed).map_err(|e|e.to_string())?;
        // Retention only runs after a new, checked snapshot exists. Unknown files are kept.
        let mut backups=list(directory)?;
        backups.retain(|backup| backup.id != name);
        let mut warning=None;
        for old in backups.iter().skip(retention-1) {
            if let Err(error)=std::fs::remove_file(directory.join(&old.id)) { warning=Some(format!("Backup salvo, mas não foi possível remover uma cópia antiga: {error}")); }
        }
        let size=std::fs::metadata(&completed).map_err(|e|e.to_string())?.len();
        Ok(Backup{id:name,created_at_ms:stamp as u64,size_bytes:size,warning})
    }.await;
    if result.is_err(){let _=std::fs::remove_file(&partial);}
    result
}
pub fn export(source:&Path,destination:&Path)->Result<()> {
    if !destination.extension().and_then(|e|e.to_str()).is_some_and(|e|e.eq_ignore_ascii_case("sqlite")){return Err("Escolha um nome com extensão .sqlite.".into());}
    let mut input=std::fs::File::open(source).map_err(|e|e.to_string())?;
    // Do not overwrite another backup, even if the picker allowed selecting it.
    let mut output=std::fs::OpenOptions::new().write(true).create_new(true).open(destination).map_err(|e|format!("Escolha um arquivo novo para a cópia: {e}"))?;
    let result=std::io::copy(&mut input,&mut output).and_then(|_|output.sync_all());drop(output);
    if let Err(e)=result {let _=std::fs::remove_file(destination);return Err(format!("Não foi possível exportar: {e}"));}Ok(())
}
