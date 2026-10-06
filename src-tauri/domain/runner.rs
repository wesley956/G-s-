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
        "REPORT_READ" | "REPORT_EXPORT" => {
            match serde_json::from_value(operation.data.clone()) {
                Ok(period) => match deposito_domain::reports::read(&pool,period).await {
                    Ok(report) => if operation.kind=="REPORT_EXPORT" {
                        deposito_domain::reports::csv(&report).map(|csv|serde_json::json!({"report":report,"csv":csv}))
                    } else {Ok(serde_json::to_value(report).unwrap())},
                    Err(e) => Err(e),
                },
                Err(e) => Err(e.to_string()),
            }
        },
        "BACKUP_CREATE" => {
            let policy=deposito_domain::backup_policy::get(&pool).await.unwrap();
            deposito_domain::backup::create(&pool,std::path::Path::new(v["backupDirectory"].as_str().unwrap()),policy.retention).await.map(|b|serde_json::to_value(b).unwrap())
        },
        "BACKUP_POLICY_GET" => deposito_domain::backup_policy::get(&pool).await.map(|b|serde_json::to_value(b).unwrap()),
        "BACKUP_POLICY_SET" => match serde_json::from_value(operation.data.clone()) {
            Ok(policy) => deposito_domain::backup_policy::set(&pool,&policy).await.map(|_|serde_json::Value::Null),
            Err(e) => Err(e.to_string()),
        },
        "BACKUP_CHECK" => deposito_domain::backup_policy::check(&pool,std::path::Path::new(v["backupDirectory"].as_str().unwrap()),std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap().as_millis() as u64).await.map(|b|serde_json::to_value(b).unwrap()),
        "BACKUP_RESTORE" => {
            let directory=std::path::Path::new(operation.data["recoveryDirectory"].as_str().unwrap());
            let source=std::path::Path::new(operation.data["sourcePath"].as_str().unwrap());
            let result=async {
                deposito_domain::recovery::prepare(source,directory).await?;
                deposito_domain::backup::snapshot(&pool,&directory.join("deposito.db")).await?;
                pool.close().await;
                deposito_domain::recovery::apply_pending(directory).await.map(|report|serde_json::to_value(report).unwrap())
            }.await;
            result
        },
        "BACKUP_LIST" => deposito_domain::backup::list(std::path::Path::new(v["backupDirectory"].as_str().unwrap())).map(|b|serde_json::to_value(b).unwrap()),
        _ => deposito_domain::apply(&pool,operation).await,
    };
    let result=match result {Ok(value)=>serde_json::json!({"value":value}),Err(error)=>serde_json::json!({"error":error})};
    pool.close().await;println!("{result}");
}
