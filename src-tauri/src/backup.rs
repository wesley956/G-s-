//! Consistent live snapshots; the running database is never copied as a raw file.
use serde::Serialize;
use sqlx::{sqlite::{SqliteConnectOptions, SqlitePoolOptions}, Row, SqlitePool};
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};
static BACKUP_LOCK: tokio::sync::Mutex<()> = tokio::sync::Mutex::const_new(());
type Result<T> = std::result::Result<T,String>;
#[derive(Serialize, Clone)]
#[serde(rename_all="camelCase")]
pub struct Backup { pub id:String, pub created_at_ms:u64, pub size_bytes:u64, pub warning:Option<String> }
pub fn managed(name:&str)->bool {
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
        // Check every application column, not only table names. A database from
        // a newer release or an unrelated lookalike is never installed.
        for (table, columns) in [
            ("app_settings","key,value,updated_at"), ("categories","id,name,active,created_at,updated_at"),
            ("products","id,category_id,sku,name,description,cost_price_cents,counter_price_cents,delivery_price_cents,stock_quantity,minimum_stock,active,created_at,updated_at"),
            ("customers","id,type,name,phone,whatsapp,document,address,notes,active,created_at,updated_at"),
            ("cash_sessions","id,status,opening_balance_cents,closing_expected_cents,closing_informed_cents,opened_at,closed_at,notes"),
            ("sales","id,sale_number,cash_session_id,customer_id,sale_type,status,subtotal_cents,discount_cents,total_cents,created_at,completed_at,cancelled_at,cancellation_reason"),
            ("sale_items","id,sale_id,product_id,product_name_snapshot,quantity,unit_price_cents,total_cents"),
            ("payments","id,sale_id,method,amount_cents,received_cents,change_cents,created_at"),
            ("inventory_movements","id,product_id,type,quantity,reference_type,reference_id,reason,created_at"),
            ("customer_account_entries","id,customer_id,sale_id,type,description,amount_cents,due_date,status,attachment_path,created_at"),
            ("cash_transactions","id,cash_session_id,sale_id,type,payment_method,amount_cents,description,created_at"),
            ("sale_receipt_snapshots","sale_id,snapshot_json,created_at"), ("receipt_output_events","id,sale_id,kind,paper_format,copies,created_at"),
            ("operation_results","id,request_json,result_json,created_at"), ("account_payment_allocations","payment_id,debit_id,amount_cents")
        ] {
            let rows=sqlx::query(&format!("PRAGMA table_info({table})")).fetch_all(&pool).await.map_err(|e|e.to_string())?;
            for column in columns.split(',') {if !rows.iter().any(|row|row.get::<String,_>("name")==column) {return Err(format!("Backup incompatível: falta {table}.{column}."));}}
        }
        if names.iter().any(|name|name=="_sqlx_migrations") {
            let versions:Vec<i64>=sqlx::query_scalar("SELECT version FROM _sqlx_migrations WHERE success=1").fetch_all(&pool).await.map_err(|e|e.to_string())?;
            if versions.iter().any(|version|*version>7) {return Err("Este backup é de uma versão mais nova do aplicativo.".into());}
            if versions.contains(&7) {
                for (table,columns) in [("expenses","id,cash_transaction_id,category,supplier_id,supplier_name_snapshot,notes,origin"),("expense_refunds","expense_id,cash_transaction_id,reason,created_at")] {
                    let rows=sqlx::query(&format!("PRAGMA table_info({table})")).fetch_all(&pool).await.map_err(|e|e.to_string())?;
                    for column in columns.split(',') {if !rows.iter().any(|row|row.get::<String,_>("name")==column){return Err(format!("Backup incompatível: falta {table}.{column}."));}}
                }
            }
            if versions.contains(&6) {
                let rows=sqlx::query("PRAGMA table_info(suppliers)").fetch_all(&pool).await.map_err(|e|e.to_string())?;
                for column in "id,name,contact_name,phone,whatsapp,document,email,address,notes,active,created_at,updated_at".split(',') {
                    if !rows.iter().any(|row|row.get::<String,_>("name")==column) {return Err(format!("Backup incompatível: falta suppliers.{column}."));}
                }
            }
            if versions.contains(&5) {
                for (table,columns) in [("account_payment_receipts","payment_id,receipt_transaction_id"),("account_payment_refunds","payment_id,cash_transaction_id,reason,created_at")] {
                    let rows=sqlx::query(&format!("PRAGMA table_info({table})")).fetch_all(&pool).await.map_err(|e|e.to_string())?;
                    for column in columns.split(',') {if !rows.iter().any(|row|row.get::<String,_>("name")==column){return Err(format!("Backup incompatível: falta {table}.{column}."));}}
                }
            }
        }
        Ok(())
    }.await;
    pool.close().await;result
}
/// Produce a standalone checked SQLite snapshot, including committed WAL data.
pub async fn snapshot(pool:&SqlitePool, destination:&Path)->Result<()> {
    std::fs::OpenOptions::new().write(true).create_new(true).open(destination).map_err(|e|e.to_string())?;
    let result=async {
        sqlx::query("VACUUM INTO ?").bind(destination.to_string_lossy().as_ref()).execute(pool).await.map_err(|e|format!("Não foi possível criar a cópia: {e}"))?;
        validate(destination).await?;
        std::fs::OpenOptions::new().write(true).open(destination).and_then(|file|file.sync_all()).map_err(|e|e.to_string())?;
        Ok(())
    }.await;
    if result.is_err() {let _=std::fs::remove_file(destination);} result
}
pub async fn create(pool:&SqlitePool,directory:&Path,retention:usize)->Result<Backup> {
    if !(3..=30).contains(&retention){return Err("Retenção inválida.".into());}
    let _guard=BACKUP_LOCK.lock().await;
    std::fs::create_dir_all(directory).map_err(|e|e.to_string())?;
    let stamp=SystemTime::now().duration_since(UNIX_EPOCH).unwrap_or_default().as_millis();
    let name=format!("gs-backup-{stamp}-{}.sqlite",uuid::Uuid::new_v4());
    let partial=directory.join(format!("{name}.partial"));let completed=directory.join(&name);
    // Reserve a unique empty output before SQLite opens it; existing files are untouched.
    let result=async {
        snapshot(pool,&partial).await?;
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
/// Accept known v4/v5/v6/v7 histories; SQLx upgrades older known schemas after recovery, before use.
/// Real app backups must retain their exact migration checksums.
pub async fn validate_restore(path:&Path)->Result<()> {
    use sha2::{Digest,Sha384};
    validate(path).await?;
    let pool=SqlitePoolOptions::new().max_connections(1).connect_with(SqliteConnectOptions::new().filename(path).read_only(true).create_if_missing(false)).await.map_err(|e|e.to_string())?;
    let result=async {
        let rows=sqlx::query("SELECT version,success,checksum FROM _sqlx_migrations ORDER BY version").fetch_all(&pool).await.map_err(|_|"Backup incompatível: histórico de migrações ausente.".to_string())?;
        let migrations=[include_str!("../migrations/0001_core.sql"),include_str!("../migrations/0002_cash_receipts.sql"),include_str!("../migrations/0003_sale_receipts.sql"),include_str!("../migrations/0004_integrity.sql"),include_str!("../migrations/0005_receipt_refunds.sql"),include_str!("../migrations/0006_suppliers.sql"),include_str!("../migrations/0007_expenses.sql")];
        if !(4..=migrations.len()).contains(&rows.len()) {return Err("Backup incompatível: versão do banco não suportada.".into());}
        for (index,row) in rows.iter().enumerate() {
            let checksum:Vec<u8>=row.get("checksum");
            if row.get::<i64,_>("version")!=(index as i64)+1 || !row.get::<bool,_>("success") || checksum.as_slice()!=Sha384::digest(migrations[index].as_bytes()).as_slice() {
                return Err("Backup incompatível: migrações diferentes ou incompletas.".into());
            }
        } Ok(())
    }.await;
    pool.close().await;result
}
