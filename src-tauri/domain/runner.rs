// Test harness executable. The desktop uses exactly the same domain library.
use std::io::Read;
#[tokio::main]
async fn main() {
    let mut input=String::new();std::io::stdin().read_to_string(&mut input).unwrap();
    let v:serde_json::Value=serde_json::from_str(&input).unwrap();
    let options=sqlx::sqlite::SqliteConnectOptions::new().filename(v["dbPath"].as_str().unwrap()).foreign_keys(true).busy_timeout(std::time::Duration::from_secs(10));
    let pool=sqlx::sqlite::SqlitePoolOptions::new().max_connections(5).connect_with(options).await.unwrap();
    let operation:deposito_domain::Operation=serde_json::from_value(v["operation"].clone()).unwrap();
    let result = match operation.kind.as_str() {
        "BACKUP_CREATE" => deposito_domain::backup::create(&pool,std::path::Path::new(v["backupDirectory"].as_str().unwrap()),7).await.map(|b|serde_json::to_value(b).unwrap()),
        "BACKUP_LIST" => deposito_domain::backup::list(std::path::Path::new(v["backupDirectory"].as_str().unwrap())).map(|b|serde_json::to_value(b).unwrap()),
        _ => deposito_domain::apply(&pool,operation).await,
    };
    let result=match result {Ok(value)=>serde_json::json!({"value":value}),Err(error)=>serde_json::json!({"error":error})};
    pool.close().await;println!("{result}");
}
