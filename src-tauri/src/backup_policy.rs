//! Automatic backups run only while the app is open; missed runs happen on startup.
use crate::{backup, SqlitePool};
use serde::{Deserialize, Serialize};
use std::path::Path;
static SCHEDULE_LOCK: tokio::sync::Mutex<()> = tokio::sync::Mutex::const_new(());
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Policy { pub enabled: bool, pub interval_hours: u32, pub retention: usize }
impl Default for Policy {
    fn default() -> Self { Self { enabled: true, interval_hours: 24, retention: 7 } }
}
impl Policy {
    pub fn validate(&self) -> Result<(), String> {
        if ![1,6,12,24].contains(&self.interval_hours) || !(3..=30).contains(&self.retention) {
            return Err("Escolha um intervalo válido e mantenha entre 3 e 30 cópias.".into());
        }
        Ok(())
    }
}
pub async fn get(pool: &SqlitePool) -> Result<Policy, String> {
    let stored: Option<String> = sqlx::query_scalar("SELECT value FROM app_settings WHERE key='backup_policy'").fetch_optional(pool).await.map_err(|e|e.to_string())?.flatten();
    let policy = match stored { Some(value) => serde_json::from_str(&value).map_err(|_|"Configuração de backup inválida. Salve novamente a rotina.".to_string())?, None => Policy::default() };
    policy.validate()?; Ok(policy)
}
pub async fn set(pool: &SqlitePool, policy: &Policy) -> Result<(), String> {
    policy.validate()?;
    sqlx::query("INSERT INTO app_settings(key,value) VALUES ('backup_policy',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=CURRENT_TIMESTAMP")
        .bind(serde_json::to_string(policy).map_err(|e|e.to_string())?).execute(pool).await.map_err(|e|e.to_string())?;
    Ok(())
}
pub async fn check(pool: &SqlitePool, directory: &Path, now_ms: u64) -> Result<Option<backup::Backup>, String> {
    let _guard = SCHEDULE_LOCK.lock().await;
    let policy = get(pool).await?;
    if !policy.enabled { return Ok(None); }
    let last = backup::list(directory)?.first().map(|copy|copy.created_at_ms);
    let due = last.is_none_or(|last| now_ms.saturating_sub(last) >= u64::from(policy.interval_hours)*3_600_000);
    if due { Ok(Some(backup::create(pool,directory,policy.retention).await?)) } else { Ok(None) }
}
