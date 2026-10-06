//! Restoration is staged while running, then applied before the SQL plugin opens.
use crate::backup;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use sqlx::{sqlite::{SqliteConnectOptions, SqlitePoolOptions}, Row};
use std::{io::{Read, Write}, path::Path};
type Result<T> = std::result::Result<T,String>;
const STAGE: &str = "restore-pending.sqlite";
const MARKER: &str = "restore-pending.json";
const PREVIOUS: &str = "deposito.restore-previous.sqlite";
#[derive(Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
struct Pending { sha256: String, preventive_backup_id: Option<String> }
#[derive(Clone, Serialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct Report { pub restored: bool, pub message: String, pub preventive_backup_id: Option<String> }
fn sync_directory(directory: &Path) -> Result<()> {
    #[cfg(unix)]
    std::fs::File::open(directory).and_then(|file|file.sync_all()).map_err(|e|e.to_string())?;
    #[cfg(not(unix))]
    let _ = directory;
    Ok(())
}
fn digest(path: &Path) -> Result<String> {
    let mut input=std::fs::File::open(path).map_err(|e|e.to_string())?;
    let mut hash=Sha256::new(); let mut buffer=[0u8;65536];
    loop { let count=input.read(&mut buffer).map_err(|e|e.to_string())?; if count==0 {break;} hash.update(&buffer[..count]); }
    Ok(format!("{:x}",hash.finalize()))
}
fn write_marker(directory: &Path, pending: &Pending) -> Result<()> {
    let temporary=directory.join(format!("restore-marker-{}.tmp",uuid::Uuid::new_v4()));
    let result=(|| {
        let mut file=std::fs::OpenOptions::new().write(true).create_new(true).open(&temporary).map_err(|e|e.to_string())?;
        file.write_all(&serde_json::to_vec(pending).map_err(|e|e.to_string())?).and_then(|_|file.sync_all()).map_err(|e|e.to_string())?;drop(file);
        std::fs::rename(&temporary,directory.join(MARKER)).map_err(|e|e.to_string())?;sync_directory(directory)
    })();
    if result.is_err() {let _=std::fs::remove_file(temporary);} result
}
pub async fn prepare(source: &Path, directory: &Path) -> Result<()> {
    std::fs::create_dir_all(directory).map_err(|e|e.to_string())?;
    if directory.join(MARKER).exists() || directory.join(PREVIOUS).exists() {return Err("Há uma recuperação pendente. Reinicie o aplicativo antes de restaurar novamente.".into());}
    if !std::fs::symlink_metadata(source).map_err(|e|e.to_string())?.file_type().is_file() {return Err("Escolha um arquivo de backup válido.".into());}
    backup::validate_restore(source).await?;
    let stage=directory.join(STAGE);
    // An orphan stage has no authorization marker and was never applied.
    if stage.exists() {std::fs::remove_file(&stage).map_err(|e|e.to_string())?;}
    let pool=SqlitePoolOptions::new().max_connections(1).connect_with(SqliteConnectOptions::new().filename(source).read_only(true).create_if_missing(false)).await.map_err(|e|e.to_string())?;
    let result:Result<()>=async {
        backup::snapshot(&pool,&stage).await?;
        write_marker(directory,&Pending{sha256:digest(&stage)?,preventive_backup_id:Some(format!("gs-backup-{}-{}.sqlite",std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap_or_default().as_millis(),uuid::Uuid::new_v4()))})
    }.await;
    pool.close().await;
    if result.is_err() && !directory.join(MARKER).exists() {let _=std::fs::remove_file(stage);} result
}
async fn matches(path: &Path, pending: &Pending) -> Result<()> {
    if digest(path)? != pending.sha256 {return Err("A cópia preparada foi alterada ou está incompleta.".into());}
    backup::validate_restore(path).await
}
fn clear_sidecars(database: &Path) -> Result<()> {
    for suffix in ["-wal","-shm"] {
        let path=std::path::PathBuf::from(format!("{}{suffix}",database.to_string_lossy()));
        if path.exists() {std::fs::remove_file(path).map_err(|e|e.to_string())?;}
    } Ok(())
}
fn quarantine(directory: &Path, path: &Path) -> Result<()> {
    if path.exists() {std::fs::rename(path,directory.join(format!("restore-rejected-{}.sqlite",uuid::Uuid::new_v4()))).map_err(|e|e.to_string())?;} Ok(())
}
async fn reject(directory: &Path, reason: String, pending: &Pending) -> Result<Report> {
    let live=directory.join("deposito.db");let previous=directory.join(PREVIOUS);
    if previous.exists() {
        backup::validate(&previous).await?;
        // Rollback is a checkpointed, closed database, so no old WAL is required.
        quarantine(directory,&live)?;clear_sidecars(&live)?;
        std::fs::rename(&previous,&live).map_err(|e|e.to_string())?;
    } else if !live.exists() {return Err(format!("Recuperação interrompida e banco original ausente: {reason}"));}
    quarantine(directory,&directory.join(STAGE))?;
    std::fs::remove_file(directory.join(MARKER)).map_err(|e|e.to_string())?;sync_directory(directory)?;
    Ok(Report{restored:false,message:format!("Restauração cancelada: {reason} Os dados anteriores foram preservados."),preventive_backup_id:pending.preventive_backup_id.clone()})
}
/// Call only before opening the app's SQL pool, protected by single-instance.
pub async fn apply_pending(directory: &Path) -> Result<Option<Report>> {
    let marker=directory.join(MARKER); if !marker.exists() {return Ok(None);}
    let pending:Pending=serde_json::from_slice(&std::fs::read(&marker).map_err(|e|e.to_string())?).map_err(|e|format!("Marcador de recuperação inválido: {e}. O banco não foi alterado."))?;
    let stage=directory.join(STAGE);let live=directory.join("deposito.db");let previous=directory.join(PREVIOUS);
    if !pending.preventive_backup_id.as_deref().is_some_and(backup::managed) || pending.sha256.len()!=64 {
        return Err("Marcador de recuperação inválido. Nenhum dado foi alterado.".into());
    }
    // Validate before creating a preventive copy or renaming any database.
    if let Err(error)=matches(if stage.exists(){&stage}else{&live},&pending).await {
        return reject(directory,error,&pending).await.map(Some);
    }
    let copy=directory.join("backups").join(pending.preventive_backup_id.as_ref().unwrap());
    if !copy.exists() {
        let original=if previous.exists(){&previous}else{&live};
        std::fs::create_dir_all(directory.join("backups")).map_err(|e|e.to_string())?;
        let pool=SqlitePoolOptions::new().max_connections(1).connect_with(SqliteConnectOptions::new().filename(original).create_if_missing(false).busy_timeout(std::time::Duration::from_secs(10))).await.map_err(|e|e.to_string())?;
        let result:Result<()>=async {
            backup::snapshot(&pool,&copy).await?;
            let checkpoint=sqlx::query("PRAGMA wal_checkpoint(TRUNCATE)").fetch_one(&pool).await.map_err(|e|e.to_string())?;
            if checkpoint.get::<i64,_>(0)!=0 {return Err("Banco ocupado. A restauração não foi aplicada.".into());}
            Ok(())
        }.await;
        pool.close().await;
        if let Err(error)=result {return reject(directory,format!("Não foi possível guardar a cópia preventiva: {error}"),&pending).await.map(Some);}
        sync_directory(&directory.join("backups"))?;
    } else if let Err(error)=backup::validate_restore(&copy).await {
        return reject(directory,format!("A cópia preventiva está inválida: {error}"),&pending).await.map(Some);
    }
    if !stage.exists() {
        // Process interrupted after installing the staged file, before cleanup.
        if let Err(error)=matches(&live,&pending).await {return reject(directory,error,&pending).await.map(Some);}
    } else {
        if let Err(error)=matches(&stage,&pending).await {return reject(directory,error,&pending).await.map(Some);}
        if !previous.exists() {
            if !live.exists() {return Err("O banco atual não foi encontrado. A restauração não foi aplicada.".into());}
            let pool=SqlitePoolOptions::new().max_connections(1).connect_with(SqliteConnectOptions::new().filename(&live).create_if_missing(false).busy_timeout(std::time::Duration::from_secs(10))).await.map_err(|e|e.to_string())?;
            let checkpoint=sqlx::query("PRAGMA wal_checkpoint(TRUNCATE)").fetch_one(&pool).await.map_err(|e|e.to_string());
            pool.close().await;
            if checkpoint?.get::<i64,_>(0)!=0 {return Err("Banco ocupado. A restauração não foi aplicada.".into());}
            std::fs::OpenOptions::new().write(true).open(&live).and_then(|file|file.sync_all()).map_err(|e|e.to_string())?;
            std::fs::rename(&live,&previous).map_err(|e|e.to_string())?;sync_directory(directory)?;
        }
        clear_sidecars(&live)?;
        if let Err(error)=std::fs::rename(&stage,&live) {return reject(directory,error.to_string(),&pending).await.map(Some);}
        sync_directory(directory)?;
        if let Err(error)=matches(&live,&pending).await {return reject(directory,error,&pending).await.map(Some);}
    }
    let report=Report{restored:true,message:"Backup restaurado. A cópia preventiva está na lista de backups.".into(),preventive_backup_id:pending.preventive_backup_id};
    // Once the installed copy is checked, keep the independent preventive snapshot.
    if previous.exists() {std::fs::remove_file(previous).map_err(|e|e.to_string())?;}
    std::fs::remove_file(marker).map_err(|e|e.to_string())?;sync_directory(directory)?;
    Ok(Some(report))
}
