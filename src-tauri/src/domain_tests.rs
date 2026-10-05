use super::*;
use sqlx::{sqlite::{SqliteConnectOptions, SqlitePoolOptions}, Executor};
struct Fixture { pool: SqlitePool, dir: tempfile::TempDir }
async fn connect(path: &std::path::Path)->SqlitePool {
    SqlitePoolOptions::new().min_connections(3).max_connections(5).connect_with(SqliteConnectOptions::new().filename(path).create_if_missing(true).foreign_keys(true).busy_timeout(std::time::Duration::from_secs(10))).await.unwrap()
}
async fn setup()->Fixture {
    let dir=tempfile::tempdir().unwrap();let pool=connect(&dir.path().join("test.db")).await;
    for migration in [include_str!("../migrations/0001_core.sql"),include_str!("../migrations/0002_cash_receipts.sql"),include_str!("../migrations/0003_sale_receipts.sql"),include_str!("../migrations/0004_integrity.sql"),include_str!("../migrations/0005_receipt_refunds.sql"),include_str!("../migrations/0006_suppliers.sql")] {sqlx::raw_sql(migration).execute(&pool).await.unwrap();}
    pool.execute("CREATE TABLE _sqlx_migrations(version BIGINT PRIMARY KEY,description TEXT,installed_on TEXT DEFAULT CURRENT_TIMESTAMP,success BOOLEAN,checksum BLOB,execution_time BIGINT)").await.unwrap();
    for (index,migration) in [include_str!("../migrations/0001_core.sql"),include_str!("../migrations/0002_cash_receipts.sql"),include_str!("../migrations/0003_sale_receipts.sql"),include_str!("../migrations/0004_integrity.sql"),include_str!("../migrations/0005_receipt_refunds.sql"),include_str!("../migrations/0006_suppliers.sql")].iter().enumerate() {
        use sha2::{Digest,Sha384};
        sqlx::query("INSERT INTO _sqlx_migrations(version,description,success,checksum,execution_time) VALUES (?, 'test migration',1,?,0)").bind(index as i64+1).bind(Sha384::digest(migration.as_bytes()).to_vec()).execute(&pool).await.unwrap();
    }
    pool.execute("INSERT INTO cash_sessions(id,status,opening_balance_cents) VALUES ('cash','OPEN',10000)").await.unwrap();
    pool.execute("INSERT INTO products(id,name,counter_price_cents,delivery_price_cents,stock_quantity) VALUES ('product','Gás P13',11000,12000,10)").await.unwrap();
    pool.execute("INSERT INTO customers(id,name,phone) VALUES ('customer','José','123')").await.unwrap();Fixture{pool,dir}
}
fn operation(kind:&str,data:Value)->Operation {Operation{id:id(),kind:kind.into(),data}}
fn supplier_input()->Value {json!({"name":"  Águas São João  ","contactName":"  José  ","phone":"(19) 99999-0000","whatsapp":"19988880000","document":"12.345.678/0001-99","email":"  contato@agua.example  ","address":"Rua do Comércio, 10","notes":"Entrega terça\nConfirmar pedido","active":true})}
#[tokio::test]
async fn supplier_create_edit_status_and_concurrent_replay_preserve_one_record(){
    let f=setup().await;let op=operation("SUPPLIER",supplier_input());
    let (a,b)=tokio::join!(apply(&f.pool,op.clone()),apply(&f.pool,op.clone()));let supplier=a.unwrap();assert_eq!(supplier,b.unwrap());assert_eq!(count(&f.pool,"suppliers").await,1);
    let row=sqlx::query("SELECT name,contact_name,email FROM suppliers").fetch_one(&f.pool).await.unwrap();assert_eq!(row.get::<String,_>("name"),"Águas São João");assert_eq!(row.get::<String,_>("contact_name"),"José");assert_eq!(row.get::<String,_>("email"),"contato@agua.example");
    let mut edited=supplier_input();edited["id"]=supplier.clone();edited["phone"]=json!("19977770000");edited["notes"]=json!("");apply(&f.pool,operation("SUPPLIER",edited)).await.unwrap();
    let status=operation("SUPPLIER_ACTIVE",json!({"id":supplier,"active":false}));apply(&f.pool,status.clone()).await.unwrap();apply(&f.pool,status).await.unwrap();
    let row=sqlx::query("SELECT active,phone,notes FROM suppliers").fetch_one(&f.pool).await.unwrap();assert_eq!(row.get::<i64,_>("active"),0);assert_eq!(row.get::<String,_>("phone"),"19977770000");assert!(row.get::<Option<String>,_>("notes").is_none());
    apply(&f.pool,operation("SUPPLIER_ACTIVE",json!({"id":supplier,"active":true}))).await.unwrap();assert_eq!(count(&f.pool,"suppliers").await,1);
    let mut changed=op;changed.data["name"]=json!("Outra empresa");assert!(apply(&f.pool,changed).await.is_err());
}
#[tokio::test]
async fn supplier_validation_and_missing_update_cannot_create_or_damage_records(){
    let f=setup().await;
    for (key,value) in [("name",json!("  ")),("name",json!("a".repeat(161))),("active",json!(1)),("phone",json!(1)),("notes",json!("a".repeat(4001))),("email",json!("invalido")),("name",json!("nome\u{0}invalido")),("id",json!("missing"))] {
        let mut input=supplier_input();input[key]=value;assert!(apply(&f.pool,operation("SUPPLIER",input)).await.is_err());
    }
    assert!(apply(&f.pool,operation("SUPPLIER_ACTIVE",json!({"id":"missing","active":true}))).await.is_err());
    assert_eq!(count(&f.pool,"suppliers").await,0);assert_eq!(count(&f.pool,"operation_results").await,0);
}
#[tokio::test]
async fn supplier_history_failure_rolls_back_create_and_edit(){
    let f=setup().await;
    f.pool.execute("CREATE TRIGGER fail_operation BEFORE INSERT ON operation_results BEGIN SELECT RAISE(ABORT,'forced operation failure'); END").await.unwrap();
    assert!(apply(&f.pool,operation("SUPPLIER",supplier_input())).await.is_err());assert_eq!(count(&f.pool,"suppliers").await,0);
    f.pool.execute("DROP TRIGGER fail_operation").await.unwrap();let supplier=apply(&f.pool,operation("SUPPLIER",supplier_input())).await.unwrap();
    f.pool.execute("CREATE TRIGGER fail_supplier_edit BEFORE INSERT ON operation_results BEGIN SELECT RAISE(ABORT,'forced operation failure'); END").await.unwrap();
    let mut edited=supplier_input();edited["id"]=supplier;edited["name"]=json!("Novo nome");assert!(apply(&f.pool,operation("SUPPLIER",edited)).await.is_err());
    assert_eq!(sqlx::query_scalar::<_,String>("SELECT name FROM suppliers").fetch_one(&f.pool).await.unwrap(),"Águas São João");
}
#[tokio::test]
async fn supplier_backup_reopens_contacts_and_known_v5_remains_restorable(){
    let f=setup().await;let op=operation("SUPPLIER",supplier_input());let supplier=apply(&f.pool,op.clone()).await.unwrap();
    let copy=f.dir.path().join("suppliers.sqlite");backup::snapshot(&f.pool,&copy).await.unwrap();backup::validate_restore(&copy).await.unwrap();
    let reopened=connect(&copy).await;assert_eq!(apply(&reopened,op).await.unwrap(),supplier);assert_eq!(sqlx::query_scalar::<_,String>("SELECT notes FROM suppliers").fetch_one(&reopened).await.unwrap(),"Entrega terça\nConfirmar pedido");
    reopened.execute("DROP TABLE suppliers; DELETE FROM _sqlx_migrations WHERE version=6").await.unwrap();reopened.close().await;backup::validate_restore(&copy).await.unwrap();
    let broken=f.dir.path().join("broken-suppliers.sqlite");backup::snapshot(&f.pool,&broken).await.unwrap();let damaged=connect(&broken).await;damaged.execute("ALTER TABLE suppliers DROP COLUMN phone").await.unwrap();damaged.close().await;assert!(backup::validate_restore(&broken).await.is_err());
}
async fn receive_id(pool:&SqlitePool,amount:i64,method:&str)->String {
    apply(pool,operation("RECEIVE",json!({"customerId":"customer","amountCents":amount,"method":method}))).await.unwrap();
    sqlx::query_scalar("SELECT id FROM customer_account_entries WHERE type='PAYMENT' AND status<>'CANCELLED' ORDER BY rowid DESC LIMIT 1").fetch_one(pool).await.unwrap()
}
fn refund(payment:&str)->Operation {operation("REFUND_RECEIPT",json!({"paymentId":payment,"customerId":"customer","reason":"Cliente recebeu devolução"}))}
async fn balance(pool:&SqlitePool)->i64 {
    sqlx::query_scalar("SELECT COALESCE(SUM(CASE WHEN status='CANCELLED' THEN 0 WHEN type='PAYMENT' THEN -amount_cents ELSE amount_cents END),0) FROM customer_account_entries").fetch_one(pool).await.unwrap()
}
#[tokio::test]
async fn receipt_refund_preserves_allocations_reopens_credit_and_allows_cancel_once(){
    let f=setup().await;let sale=apply(&f.pool,operation("SALE",input())).await.unwrap();
    let first=receive_id(&f.pool,2000,"PIX").await;let second=receive_id(&f.pool,3000,"CASH").await;
    assert_eq!(balance(&f.pool).await,0);
    apply(&f.pool,refund(&first)).await.unwrap();assert_eq!(balance(&f.pool).await,2000);
    assert_eq!(sqlx::query_scalar::<_,String>("SELECT status FROM customer_account_entries WHERE type='DEBIT'").fetch_one(&f.pool).await.unwrap(),"PARTIAL");
    assert!(apply(&f.pool,operation("CANCEL_SALE",json!({"saleId":sale["saleId"],"reason":"Retorno"}))).await.is_err());
    f.pool.execute("UPDATE customers SET active=0").await.unwrap();
    apply(&f.pool,refund(&second)).await.unwrap();assert_eq!(balance(&f.pool).await,5000);
    assert_eq!(sqlx::query_scalar::<_,String>("SELECT status FROM customer_account_entries WHERE type='DEBIT'").fetch_one(&f.pool).await.unwrap(),"OPEN");
    assert_eq!(count(&f.pool,"account_payment_allocations").await,2);assert_eq!(stock_qty(&f.pool).await,9.0);
    apply(&f.pool,operation("CANCEL_SALE",json!({"saleId":sale["saleId"],"reason":"Retorno"}))).await.unwrap();
    assert_eq!(balance(&f.pool).await,0);assert_eq!(stock_qty(&f.pool).await,10.0);
    assert!(apply(&f.pool,refund(&second)).await.is_err());
}
#[tokio::test]
async fn receipt_refund_spanning_two_debts_keeps_other_receipts_and_new_fifo_valid(){
    let f=setup().await;
    f.pool.execute("INSERT INTO customer_account_entries(id,customer_id,type,amount_cents,status,created_at) VALUES ('older','customer','DEBIT',2000,'OPEN','2026-01-01'),('newer','customer','DEBIT',3000,'OPEN','2026-02-01')").await.unwrap();
    let first=receive_id(&f.pool,4000,"PIX").await;let second=receive_id(&f.pool,1000,"CREDIT_CARD").await;
    apply(&f.pool,refund(&first)).await.unwrap();
    assert_eq!(balance(&f.pool).await,4000);
    let rows:Vec<String>=sqlx::query_scalar("SELECT status FROM customer_account_entries WHERE type='DEBIT' ORDER BY created_at").fetch_all(&f.pool).await.unwrap();assert_eq!(rows,["OPEN","PARTIAL"]);
    assert_eq!(sqlx::query_scalar::<_,String>("SELECT status FROM customer_account_entries WHERE id=?").bind(second).fetch_one(&f.pool).await.unwrap(),"PAID");
    receive_id(&f.pool,4000,"DEBIT_CARD").await;assert_eq!(balance(&f.pool).await,0);
    assert_eq!(count(&f.pool,"account_payment_allocations").await,5);
}
#[tokio::test]
async fn receipt_refund_retry_concurrency_and_payload_reuse_are_safe(){
    let f=setup().await;apply(&f.pool,operation("SALE",input())).await.unwrap();let payment=receive_id(&f.pool,2000,"PIX").await;
    let op=refund(&payment);let (a,b)=tokio::join!(apply(&f.pool,op.clone()),apply(&f.pool,op.clone()));assert_eq!(a.unwrap(),b.unwrap());
    let mut changed=op;changed.data["reason"]=json!("Outro motivo");assert!(apply(&f.pool,changed).await.is_err());
    assert_eq!(count(&f.pool,"account_payment_refunds").await,1);
    let payment=receive_id(&f.pool,2000,"CASH").await;
    let (a,b)=tokio::join!(apply(&f.pool,refund(&payment)),apply(&f.pool,refund(&payment)));assert_eq!(usize::from(a.is_ok())+usize::from(b.is_ok()),1);
    assert_eq!(count(&f.pool,"account_payment_refunds").await,2);assert_eq!(balance(&f.pool).await,5000);
}
#[tokio::test]
async fn receipt_refund_failure_rolls_back_debts_cash_and_history(){
    let f=setup().await;apply(&f.pool,operation("SALE",input())).await.unwrap();let payment=receive_id(&f.pool,2000,"CASH").await;
    f.pool.execute("CREATE TRIGGER fail_refund BEFORE INSERT ON account_payment_refunds BEGIN SELECT RAISE(ABORT,'refund failed'); END").await.unwrap();
    assert!(apply(&f.pool,refund(&payment)).await.unwrap_err().contains("refund failed"));
    assert_eq!(balance(&f.pool).await,3000);assert_eq!(count(&f.pool,"account_payment_refunds").await,0);assert_eq!(count(&f.pool,"cash_transactions").await,3);
    assert_eq!(sqlx::query_scalar::<_,String>("SELECT status FROM customer_account_entries WHERE type='PAYMENT'").fetch_one(&f.pool).await.unwrap(),"PAID");
}
#[tokio::test]
async fn late_receipt_refund_uses_original_method_and_current_cash_without_reopening_old_cash(){
    for method in ["CASH","PIX","DEBIT_CARD","CREDIT_CARD"] {
        let f=setup().await;apply(&f.pool,operation("SALE",input())).await.unwrap();let payment=receive_id(&f.pool,2000,method).await;
        let expected=if method=="CASH"{18000}else{16000};
        apply(&f.pool,operation("CLOSE_CASH",json!({"sessionId":"cash","informedCents":expected}))).await.unwrap();
        assert!(apply(&f.pool,refund(&payment)).await.is_err());
        let current=apply(&f.pool,operation("OPEN_CASH",json!({"amountCents":3000}))).await.unwrap();
        let result=apply(&f.pool,refund(&payment)).await.unwrap();assert_eq!(result["method"],method);assert_eq!(result["cashSessionId"],current);
        assert_eq!(sqlx::query_scalar::<_,i64>("SELECT closing_expected_cents FROM cash_sessions WHERE id='cash'").fetch_one(&f.pool).await.unwrap(),expected);
        assert_eq!(sqlx::query_scalar::<_,i64>("SELECT COUNT(*) FROM cash_transactions WHERE cash_session_id='cash'").fetch_one(&f.pool).await.unwrap(),3);
        let mut tx=f.pool.begin_with("BEGIN IMMEDIATE").await.unwrap();assert_eq!(cash_expected(&mut tx,current.as_str().unwrap()).await.unwrap(),if method=="CASH"{1000}else{3000});tx.commit().await.unwrap();
    }
}
#[tokio::test]
async fn receipt_refund_rejects_insufficient_cash_wrong_customer_missing_reason_and_legacy_links(){
    let f=setup().await;apply(&f.pool,operation("SALE",input())).await.unwrap();let payment=receive_id(&f.pool,2000,"CASH").await;
    apply(&f.pool,operation("CASH_MOVE",json!({"sessionId":"cash","type":"WITHDRAWAL","amountCents":18000}))).await.unwrap();
    assert!(apply(&f.pool,refund(&payment)).await.unwrap_err().contains("insuficiente"));
    apply(&f.pool,operation("CASH_MOVE",json!({"sessionId":"cash","type":"SUPPLY","amountCents":2000}))).await.unwrap();
    let mut bad=refund(&payment);bad.data["reason"]=json!("  ");assert!(apply(&f.pool,bad).await.is_err());
    f.pool.execute("INSERT INTO customers(id,name) VALUES ('other','Outro')").await.unwrap();let mut bad=refund(&payment);bad.data["customerId"]=json!("other");assert!(apply(&f.pool,bad).await.is_err());
    f.pool.execute("DELETE FROM account_payment_receipts").await.unwrap();assert!(apply(&f.pool,refund(&payment)).await.unwrap_err().contains("vínculo"));assert_eq!(balance(&f.pool).await,3000);
}
#[tokio::test]
async fn restoration_accepts_known_v4_and_rejects_incomplete_v5_before_upgrade(){
    let f=setup().await;let source=f.dir.path().join("old.sqlite");backup::snapshot(&f.pool,&source).await.unwrap();
    let old=connect(&source).await;old.execute("DROP TABLE account_payment_refunds; DROP TABLE account_payment_receipts; DROP TABLE suppliers; DELETE FROM _sqlx_migrations WHERE version>4").await.unwrap();old.close().await;
    backup::validate_restore(&source).await.unwrap();
    recovery::prepare(&source,f.dir.path()).await.unwrap();
    let broken=f.dir.path().join("broken.sqlite");backup::snapshot(&f.pool,&broken).await.unwrap();let damaged=connect(&broken).await;damaged.execute("DROP TABLE account_payment_refunds").await.unwrap();damaged.close().await;
    assert!(backup::validate_restore(&broken).await.is_err());
}
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

#[tokio::test]
async fn inactive_customer_can_pay_existing_debt_but_cannot_start_new_credit(){
 let f=setup().await;apply(&f.pool,operation("SALE",input())).await.unwrap();
 f.pool.execute("UPDATE customers SET active=0 WHERE id='customer'").await.unwrap();
 apply(&f.pool,operation("RECEIVE",json!({"customerId":"customer","amountCents":5000,"method":"PIX"}))).await.unwrap();
 assert!(apply(&f.pool,operation("SALE",input())).await.is_err());
 assert_eq!(sqlx::query_scalar::<_,String>("SELECT status FROM customer_account_entries WHERE type='DEBIT'").fetch_one(&f.pool).await.unwrap(),"PAID");
}
#[tokio::test]
async fn automatic_policy_is_persistent_validated_and_runs_only_when_due() {
    let f=setup().await;let dir=f.dir.path().join("backups");
    let policy=backup_policy::Policy{enabled:false,interval_hours:6,retention:3};
    backup_policy::set(&f.pool,&policy).await.unwrap();assert_eq!(backup_policy::get(&f.pool).await.unwrap(),policy);
    assert!(backup_policy::check(&f.pool,&dir,0).await.unwrap().is_none());
    let bad=backup_policy::Policy{enabled:true,interval_hours:2,retention:2};assert!(backup_policy::set(&f.pool,&bad).await.is_err());
    backup_policy::set(&f.pool,&backup_policy::Policy{enabled:true,..policy}).await.unwrap();
    backup_policy::check(&f.pool,&dir,0).await.unwrap().unwrap();
    let first=backup::list(&dir).unwrap().remove(0);
    assert!(backup_policy::check(&f.pool,&dir,first.created_at_ms+6*3_600_000-1).await.unwrap().is_none());
    assert!(backup_policy::check(&f.pool,&dir,first.created_at_ms+6*3_600_000).await.unwrap().is_some());
}
#[tokio::test]
async fn concurrent_schedule_checks_create_only_one_snapshot() {
    let f=setup().await;let dir=f.dir.path().join("backups");
    let now=std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap().as_millis() as u64;
    let (a,b)=tokio::join!(backup_policy::check(&f.pool,&dir,now),backup_policy::check(&f.pool,&dir,now));
    assert!(a.is_ok() && b.is_ok());assert_eq!(backup::list(&dir).unwrap().len(),1);
    let last=backup::list(&dir).unwrap()[0].created_at_ms;
    assert!(backup_policy::check(&f.pool,&dir,last).await.unwrap().is_none());
}
async fn restoration_fixture() -> (Fixture,std::path::PathBuf) {
    let f=setup().await;let source=f.dir.path().join("saved.sqlite");backup::snapshot(&f.pool,&source).await.unwrap();
    f.pool.execute("UPDATE products SET stock_quantity=3").await.unwrap();
    recovery::prepare(&source,f.dir.path()).await.unwrap();
    // Writes made after preparation must be included in the preventive snapshot.
    f.pool.execute("UPDATE products SET stock_quantity=2").await.unwrap();f.pool.close().await;
    std::fs::rename(f.dir.path().join("test.db"),f.dir.path().join("deposito.db")).unwrap();
    (f,source)
}
#[tokio::test]
async fn restoration_applies_at_startup_and_preventive_copy_keeps_latest_writes() {
    let (f,_)=restoration_fixture().await;
    let result=recovery::apply_pending(f.dir.path()).await.unwrap().unwrap();assert!(result.restored);
    let live=connect(&f.dir.path().join("deposito.db")).await;assert_eq!(stock_qty(&live).await,10.0);live.close().await;
    let preventive=connect(&f.dir.path().join("backups").join(result.preventive_backup_id.unwrap())).await;assert_eq!(stock_qty(&preventive).await,2.0);preventive.close().await;
    assert!(recovery::apply_pending(f.dir.path()).await.unwrap().is_none());
}
#[tokio::test]
async fn changed_stage_is_rejected_and_original_database_is_preserved() {
    let (f,_)=restoration_fixture().await;std::fs::write(f.dir.path().join("restore-pending.sqlite"),b"damaged").unwrap();
    assert!(!recovery::apply_pending(f.dir.path()).await.unwrap().unwrap().restored);
    let live=connect(&f.dir.path().join("deposito.db")).await;assert_eq!(stock_qty(&live).await,2.0);live.close().await;
}
#[tokio::test]
async fn interrupted_restore_resumes_after_original_was_moved() {
    let (f,_)=restoration_fixture().await;
    std::fs::rename(f.dir.path().join("deposito.db"),f.dir.path().join("deposito.restore-previous.sqlite")).unwrap();
    assert!(recovery::apply_pending(f.dir.path()).await.unwrap().unwrap().restored);
    let live=connect(&f.dir.path().join("deposito.db")).await;assert_eq!(stock_qty(&live).await,10.0);live.close().await;
}
#[tokio::test]
async fn interrupted_restore_after_install_finishes_cleanup_and_bad_install_rolls_back() {
    for damage in [false,true] {
        let (f,_)=restoration_fixture().await;
        std::fs::rename(f.dir.path().join("deposito.db"),f.dir.path().join("deposito.restore-previous.sqlite")).unwrap();
        std::fs::rename(f.dir.path().join("restore-pending.sqlite"),f.dir.path().join("deposito.db")).unwrap();
        if damage {std::fs::write(f.dir.path().join("deposito.db"),b"incomplete").unwrap();}
        let report=recovery::apply_pending(f.dir.path()).await.unwrap().unwrap();assert_eq!(report.restored,!damage);
        let live=connect(&f.dir.path().join("deposito.db")).await;assert_eq!(stock_qty(&live).await,if damage{2.0}else{10.0});live.close().await;
    }
}
#[tokio::test]
async fn restoration_rejects_unsupported_migrations_without_touching_live_data() {
    let f=setup().await;let source=f.dir.path().join("future.sqlite");backup::snapshot(&f.pool,&source).await.unwrap();
    let future=connect(&source).await;future.execute("UPDATE _sqlx_migrations SET checksum=x'00' WHERE version=4").await.unwrap();future.close().await;
    assert!(recovery::prepare(&source,f.dir.path()).await.is_err());assert_eq!(stock_qty(&f.pool).await,10.0);
    assert!(!f.dir.path().join("restore-pending.json").exists());
}
#[tokio::test]
async fn invalid_preventive_copy_cancels_restore_without_replacing_current_database() {
    let (f,_)=restoration_fixture().await;
    let marker:Value=serde_json::from_slice(&std::fs::read(f.dir.path().join("restore-pending.json")).unwrap()).unwrap();
    let dir=f.dir.path().join("backups");std::fs::create_dir_all(&dir).unwrap();
    std::fs::write(dir.join(marker["preventive_backup_id"].as_str().unwrap()),b"interrupted copy").unwrap();
    let result=recovery::apply_pending(f.dir.path()).await.unwrap().unwrap();assert!(!result.restored);
    let live=connect(&f.dir.path().join("deposito.db")).await;assert_eq!(stock_qty(&live).await,2.0);live.close().await;
    assert!(!f.dir.path().join("restore-pending.json").exists());
}
#[tokio::test]
async fn restoration_preventive_snapshot_recovers_committed_wal_after_process_loss() {
    let f=setup().await;let source=f.dir.path().join("saved.sqlite");backup::snapshot(&f.pool,&source).await.unwrap();
    // Model the disk image left by a killed process: the checkpointed main file
    // and its committed WAL are copied while no transaction is running.
    f.pool.execute("PRAGMA journal_mode=WAL").await.unwrap();
    f.pool.execute("PRAGMA wal_autocheckpoint=0").await.unwrap();
    f.pool.execute("UPDATE products SET stock_quantity=2").await.unwrap();
    let recovery_dir=f.dir.path().join("crashed");std::fs::create_dir(&recovery_dir).unwrap();
    std::fs::copy(f.dir.path().join("test.db"),recovery_dir.join("deposito.db")).unwrap();
    std::fs::copy(f.dir.path().join("test.db-wal"),recovery_dir.join("deposito.db-wal")).unwrap();
    f.pool.close().await;
    recovery::prepare(&source,&recovery_dir).await.unwrap();
    let report=recovery::apply_pending(&recovery_dir).await.unwrap().unwrap();assert!(report.restored);
    let preventive=connect(&recovery_dir.join("backups").join(report.preventive_backup_id.unwrap())).await;assert_eq!(stock_qty(&preventive).await,2.0);preventive.close().await;
    let live=connect(&recovery_dir.join("deposito.db")).await;assert_eq!(stock_qty(&live).await,10.0);live.close().await;
}
