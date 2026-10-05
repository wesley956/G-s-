use super::*;
use sqlx::{sqlite::{SqliteConnectOptions, SqlitePoolOptions}, Executor};
struct Fixture { pool: SqlitePool, dir: tempfile::TempDir }
async fn connect(path: &std::path::Path)->SqlitePool {
    SqlitePoolOptions::new().min_connections(3).max_connections(5).connect_with(SqliteConnectOptions::new().filename(path).create_if_missing(true).foreign_keys(true).busy_timeout(std::time::Duration::from_secs(10))).await.unwrap()
}
async fn setup()->Fixture {
    let dir=tempfile::tempdir().unwrap();let pool=connect(&dir.path().join("test.db")).await;
    for migration in [include_str!("../migrations/0001_core.sql"),include_str!("../migrations/0002_cash_receipts.sql"),include_str!("../migrations/0003_sale_receipts.sql"),include_str!("../migrations/0004_integrity.sql")] {sqlx::raw_sql(migration).execute(&pool).await.unwrap();}
    pool.execute("INSERT INTO cash_sessions(id,status,opening_balance_cents) VALUES ('cash','OPEN',10000)").await.unwrap();
    pool.execute("INSERT INTO products(id,name,counter_price_cents,delivery_price_cents,stock_quantity) VALUES ('product','Gás P13',11000,12000,10)").await.unwrap();
    pool.execute("INSERT INTO customers(id,name,phone) VALUES ('customer','José','123')").await.unwrap();Fixture{pool,dir}
}
fn operation(kind:&str,data:Value)->Operation {Operation{id:id(),kind:kind.into(),data}}
fn input()->Value {json!({"saleType":"DELIVERY","customerId":"customer","discountCents":1000,"items":[{"productId":"product","quantity":1}],"payments":[{"method":"CASH","amountCents":6000,"receivedCents":10000},{"method":"CREDIT_CUSTOMER","amountCents":5000}],"dueDate":"2026-12-01"})}
async fn count(pool:&SqlitePool,table:&str)->i64 {sqlx::query_scalar(&format!("SELECT COUNT(*) FROM {table}")).fetch_one(pool).await.unwrap()}
async fn stock_qty(pool:&SqlitePool)->f64 {sqlx::query_scalar("SELECT stock_quantity FROM products WHERE id='product'").fetch_one(pool).await.unwrap()}
#[tokio::test]
async fn sale_snapshot_rollback_restores_every_table_on_multi_connection_pool(){
 let f=setup().await; assert!(f.pool.size()>=3);
 f.pool.execute("CREATE TRIGGER fail_snapshot BEFORE INSERT ON sale_receipt_snapshots BEGIN SELECT RAISE(ABORT,'forced failure'); END").await.unwrap();
 assert!(apply(&f.pool,operation("SALE",input())).await.unwrap_err().contains("forced failure"));
 for table in ["sales","sale_items","payments","inventory_movements","cash_transactions","customer_account_entries","sale_receipt_snapshots","operation_results"]{assert_eq!(count(&f.pool,table).await,0,"{table}");}
 assert_eq!(stock_qty(&f.pool).await,10.0);
}
#[tokio::test]
async fn concurrent_sales_cannot_oversell_or_duplicate_numbers(){
 let f=setup().await;f.pool.execute("UPDATE products SET stock_quantity=1").await.unwrap();
 let (a,b)=tokio::join!(apply(&f.pool,operation("SALE",input())),apply(&f.pool,operation("SALE",input())));
 assert_eq!(usize::from(a.is_ok())+usize::from(b.is_ok()),1);assert_eq!(count(&f.pool,"sales").await,1);assert_eq!(stock_qty(&f.pool).await,0.0);
 f.pool.execute("UPDATE products SET stock_quantity=2").await.unwrap();
 let (a,b)=tokio::join!(apply(&f.pool,operation("SALE",input())),apply(&f.pool,operation("SALE",input())));assert!(a.is_ok()&&b.is_ok());
 assert_ne!(a.unwrap()["saleNumber"],b.unwrap()["saleNumber"]);
}
#[tokio::test]
async fn retry_is_idempotent_and_reusing_id_with_different_data_is_rejected(){
 let f=setup().await;let op=operation("SALE",input());let (a,b)=tokio::join!(apply(&f.pool,op.clone()),apply(&f.pool,op.clone()));assert_eq!(a.unwrap(),b.unwrap());assert_eq!(count(&f.pool,"sales").await,1);
 let mut changed=op;changed.data["discountCents"]=json!(0);assert!(apply(&f.pool,changed).await.is_err());assert_eq!(stock_qty(&f.pool).await,9.0);
}
#[tokio::test]
async fn concurrent_cancel_returns_stock_once(){
 let f=setup().await;let s=apply(&f.pool,operation("SALE",input())).await.unwrap();let v=json!({"saleId":s["saleId"],"reason":"Cliente desistiu"});
 let (a,b)=tokio::join!(apply(&f.pool,operation("CANCEL_SALE",v.clone())),apply(&f.pool,operation("CANCEL_SALE",v)));
 assert_eq!(usize::from(a.is_ok())+usize::from(b.is_ok()),1);assert_eq!(stock_qty(&f.pool).await,10.0);
 let mut tx=f.pool.begin_with("BEGIN IMMEDIATE").await.unwrap();assert_eq!(cash_expected(&mut tx,"cash").await.unwrap(),10000);tx.commit().await.unwrap();
}
#[tokio::test]
async fn price_quantity_payment_and_credit_validation_is_native(){
 let f=setup().await;
 for (key,value) in [("discountCents",json!(-1)),("discountCents",json!(12001)),("saleType",json!("OTHER")),("dueDate",json!("2026-02-30"))] {let mut v=input();v[key]=value;assert!(apply(&f.pool,operation("SALE",v)).await.is_err());}
 for qty in [0.0,-1.0,11.0,0.001] {let mut v=input();v["items"][0]["quantity"]=json!(qty);assert!(apply(&f.pool,operation("SALE",v)).await.is_err());}
 let mut v=input();v["customerId"]=Value::Null;assert!(apply(&f.pool,operation("SALE",v)).await.is_err());
 let mut v=input();v["payments"][0]["receivedCents"]=json!(1000);assert!(apply(&f.pool,operation("SALE",v)).await.is_err());
 let mut v=input();v["items"].as_array_mut().unwrap().push(json!({"productId":"product","quantity":1}));assert!(apply(&f.pool,operation("SALE",v)).await.is_err());
 f.pool.execute("UPDATE products SET delivery_price_cents=15000").await.unwrap();assert!(apply(&f.pool,operation("SALE",input())).await.is_err());assert_eq!(count(&f.pool,"sales").await,0);
}
#[tokio::test]
async fn partial_payment_allocates_debts_and_blocks_cancellation_of_received_credit(){
 let f=setup().await;let sale=apply(&f.pool,operation("SALE",input())).await.unwrap();
 let p=json!({"customerId":"customer","amountCents":2000,"method":"PIX","description":"Recebimento"});apply(&f.pool,operation("RECEIVE",p)).await.unwrap();
 let row=sqlx::query("SELECT status,due_date FROM customer_account_entries WHERE type='DEBIT'").fetch_one(&f.pool).await.unwrap();assert_eq!(row.get::<String,_>("status"),"PARTIAL");assert_eq!(row.get::<String,_>("due_date"),"2026-12-01");
 assert!(apply(&f.pool,operation("CANCEL_SALE",json!({"saleId":sale["saleId"],"reason":"Desistência"}))).await.is_err());
 apply(&f.pool,operation("RECEIVE",json!({"customerId":"customer","amountCents":3000,"method":"CASH"}))).await.unwrap();
 assert_eq!(sqlx::query_scalar::<_,String>("SELECT status FROM customer_account_entries WHERE type='DEBIT'").fetch_one(&f.pool).await.unwrap(),"PAID");
 assert!(apply(&f.pool,operation("RECEIVE",json!({"customerId":"customer","amountCents":1,"method":"CASH"}))).await.is_err());
 assert!(apply(&f.pool,operation("RECEIVE",json!({"customerId":"customer","amountCents":1,"method":"CREDIT_CUSTOMER"}))).await.is_err());
}
#[tokio::test]
async fn receipt_failure_rolls_back_payment_allocation_and_cash(){
 let f=setup().await;apply(&f.pool,operation("SALE",input())).await.unwrap();
 f.pool.execute("CREATE TRIGGER fail_receipt BEFORE INSERT ON cash_transactions WHEN NEW.type='RECEIPT' BEGIN SELECT RAISE(ABORT,'forced receipt failure'); END").await.unwrap();
 assert!(apply(&f.pool,operation("RECEIVE",json!({"customerId":"customer","amountCents":2000,"method":"CASH"}))).await.is_err());
 assert_eq!(count(&f.pool,"customer_account_entries").await,1);assert_eq!(count(&f.pool,"account_payment_allocations").await,0);assert_eq!(count(&f.pool,"cash_transactions").await,2);
}
#[tokio::test]
async fn reopening_preserves_sales_and_safe_retry(){
 let f=setup().await;let op=operation("SALE",input());let saved=apply(&f.pool,op.clone()).await.unwrap();f.pool.close().await;
 let pool=connect(&f.dir.path().join("test.db")).await;assert_eq!(apply(&pool,op).await.unwrap(),saved);assert_eq!(count(&pool,"sales").await,1);assert_eq!(stock_qty(&pool).await,9.0);pool.close().await;
}
#[tokio::test]
async fn late_cancel_records_refund_in_current_cash_and_preserves_closed_session(){
 let f=setup().await;let s=apply(&f.pool,operation("SALE",input())).await.unwrap();
 apply(&f.pool,operation("CLOSE_CASH",json!({"sessionId":"cash","informedCents":16000}))).await.unwrap();
 let new_cash=apply(&f.pool,operation("OPEN_CASH",json!({"amountCents":10000}))).await.unwrap();
 apply(&f.pool,operation("CANCEL_SALE",json!({"saleId":s["saleId"],"reason":"Devolução"}))).await.unwrap();
 assert_eq!(sqlx::query_scalar::<_,i64>("SELECT closing_expected_cents FROM cash_sessions WHERE id='cash'").fetch_one(&f.pool).await.unwrap(),16000);
 let mut tx=f.pool.begin_with("BEGIN IMMEDIATE").await.unwrap();assert_eq!(cash_expected(&mut tx,new_cash.as_str().unwrap()).await.unwrap(),4000);tx.commit().await.unwrap();
}
#[tokio::test]
async fn stock_history_is_atomic_and_return_requires_reason(){
 let f=setup().await;assert!(apply(&f.pool,operation("STOCK",json!({"productId":"product","action":"ADJUSTMENT","targetQuantity":0,"reason":""}))).await.is_err());
 apply(&f.pool,operation("STOCK",json!({"productId":"product","action":"RETURN","quantity":2,"reason":"Retorno físico"}))).await.unwrap();assert_eq!(stock_qty(&f.pool).await,12.0);
 f.pool.execute("CREATE TRIGGER fail_move BEFORE INSERT ON inventory_movements BEGIN SELECT RAISE(ABORT,'failed move'); END").await.unwrap();
 assert!(apply(&f.pool,operation("STOCK",json!({"productId":"product","action":"LOSS","quantity":3,"reason":"Danificado"}))).await.is_err());assert_eq!(stock_qty(&f.pool).await,12.0);
}
#[tokio::test]
async fn simultaneous_cash_open_and_close_cannot_duplicate_sessions_or_late_writes(){
 let f=setup().await;apply(&f.pool,operation("CLOSE_CASH",json!({"sessionId":"cash","informedCents":10000}))).await.unwrap();
 let (a,b)=tokio::join!(apply(&f.pool,operation("OPEN_CASH",json!({"amountCents":0}))),apply(&f.pool,operation("OPEN_CASH",json!({"amountCents":0}))));assert_eq!(usize::from(a.is_ok())+usize::from(b.is_ok()),1);
 assert!(apply(&f.pool,operation("CASH_MOVE",json!({"sessionId":"cash","type":"SUPPLY","amountCents":100}))).await.is_err());
}
#[tokio::test]
async fn receipt_snapshot_keeps_original_names_and_prices(){
 let f=setup().await;f.pool.execute("INSERT INTO app_settings(key,value) VALUES ('receipt_settings','{\"businessName\":\"Loja original\",\"printMode\":\"AUTO_TWO\"}')").await.unwrap();
 let s=apply(&f.pool,operation("SALE",input())).await.unwrap();assert_eq!(s["printMode"],"AUTO_TWO");f.pool.execute("UPDATE customers SET name='Outro'; UPDATE products SET name='Outro',delivery_price_cents=99999; UPDATE app_settings SET value='{}'").await.unwrap();
 let stored:String=sqlx::query_scalar("SELECT snapshot_json FROM sale_receipt_snapshots").fetch_one(&f.pool).await.unwrap();let value:Value=serde_json::from_str(&stored).unwrap();assert_eq!(value["business"]["businessName"],"Loja original");assert_eq!(value["customer"]["name"],"José");assert_eq!(sqlx::query_scalar::<_,i64>("SELECT unit_price_cents FROM sale_items").fetch_one(&f.pool).await.unwrap(),12000);
}
#[tokio::test]
async fn backup_is_consistent_and_reopens_without_source_wal(){
 let f=setup().await;let s=apply(&f.pool,operation("SALE",input())).await.unwrap();let dir=f.dir.path().join("backups");
 let copy=backup::create(&f.pool,&dir,7).await.unwrap();let path=backup::selected(&dir,&copy.id).unwrap();backup::validate(&path).await.unwrap();
 apply(&f.pool,operation("CANCEL_SALE",json!({"saleId":s["saleId"],"reason":"Depois do backup"}))).await.unwrap();
 let restored=connect(&path).await;assert_eq!(stock_qty(&restored).await,9.0);assert_eq!(count(&restored,"sales").await,1);assert_eq!(count(&restored,"sale_receipt_snapshots").await,1);
 assert_eq!(sqlx::query_scalar::<_,String>("SELECT status FROM sales").fetch_one(&restored).await.unwrap(),"COMPLETED");restored.close().await;
}
#[tokio::test]
async fn backup_excludes_uncommitted_writes(){
 let f=setup().await;let mut tx=f.pool.begin_with("BEGIN IMMEDIATE").await.unwrap();exec(&mut tx,"UPDATE products SET stock_quantity=1 WHERE id='product'",vec![]).await.unwrap();
 let copy=backup::create(&f.pool,&f.dir.path().join("backups"),7).await.unwrap();let restored=connect(&f.dir.path().join("backups").join(copy.id)).await;
 assert_eq!(stock_qty(&restored).await,10.0);restored.close().await;tx.rollback().await.unwrap();assert_eq!(stock_qty(&f.pool).await,10.0);
}
#[tokio::test]
async fn backup_retention_keeps_unknown_files_and_export_never_overwrites(){
 let f=setup().await;let dir=f.dir.path().join("backups");std::fs::create_dir_all(&dir).unwrap();std::fs::write(dir.join("important.sqlite"),b"keep").unwrap();
 let mut latest=None;for _ in 0..5 {latest=Some(backup::create(&f.pool,&dir,3).await.unwrap());}
 assert_eq!(backup::list(&dir).unwrap().len(),3);assert_eq!(std::fs::read(dir.join("important.sqlite")).unwrap(),b"keep");
 let source=backup::selected(&dir,&latest.unwrap().id).unwrap();let external=f.dir.path().join("external.sqlite");backup::export(&source,&external).unwrap();backup::validate(&external).await.unwrap();
 let original=std::fs::read(&external).unwrap();assert!(backup::export(&source,&external).is_err());assert_eq!(std::fs::read(&external).unwrap(),original);
 assert!(backup::selected(&dir,"../../deposito.db").is_err());
}
#[tokio::test]
async fn corrupt_or_unrelated_backup_is_rejected_without_modifying_source(){
 let f=setup().await;let bad=f.dir.path().join("bad.sqlite");std::fs::write(&bad,b"broken backup").unwrap();assert!(backup::validate(&bad).await.is_err());
 let unrelated=f.dir.path().join("other.sqlite");let other=connect(&unrelated).await;other.execute("CREATE TABLE other(id TEXT)").await.unwrap();other.close().await;assert!(backup::validate(&unrelated).await.is_err());
 assert_eq!(stock_qty(&f.pool).await,10.0);assert_eq!(count(&f.pool,"sales").await,0);
}
