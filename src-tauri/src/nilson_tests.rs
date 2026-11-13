use super::*;
use crate::tests::{setup,operation,input,count,balance,stock_qty,expected};
use sqlx::Executor;
fn policy(mode:&str,weekdays:bool,amount:i64)->accrual::Policy{accrual::Policy{enabled:true,weekly_cents:amount,mode:mode.into(),weekdays_only:weekdays}}
fn calc(mode:&str,weekdays:bool,start:&str,end:&str)->accrual::Calculation{accrual::calculate(accrual::PreviewQuery{policy:policy(mode,weekdays,500),start_date:start.into(),end_date:end.into()}).unwrap()}
async fn enable(pool:&SqlitePool){apply(pool,operation("ACCRUAL_SETTINGS",json!({"policy":policy("DAILY",true,500),"adminPassword":"teste-admin"}))).await.unwrap();}
async fn past(pool:&SqlitePool,days:i64)->String {sqlx::query_scalar("SELECT date('now','localtime',?)").bind(format!("-{days} days")).fetch_one(pool).await.unwrap()}
#[test]
fn accrual_dates_weekends_proportional_rounding_and_full_weeks(){
    assert_eq!(calc("DAILY",true,"2026-11-06","2026-11-09").cents,100);
    assert_eq!(calc("DAILY",true,"2026-11-06","2026-11-09").days,1);
    assert_eq!(calc("FULL_WEEK",true,"2026-11-06","2026-11-09").cents,0);
    assert_eq!(calc("FULL_WEEK",true,"2026-11-06","2026-11-13").cents,500);
    assert_eq!(calc("FULL_WEEK",false,"2026-11-06","2026-11-12").cents,0);
    assert_eq!(calc("FULL_WEEK",false,"2026-11-06","2026-11-13").cents,500);
    assert_eq!(calc("DAILY",false,"2026-11-06","2026-11-09").cents,214);
    assert_eq!(calc("DAILY",true,"2026-11-07","2026-11-08").cents,0);
    assert_eq!(calc("DAILY",false,"2024-02-28","2024-03-01").days,2);
    assert_eq!(calc("DAILY",false,"2026-11-06","2026-11-06").cents,0);
    for (start,end) in [("2026-02-30","2026-03-01"),("2026-11-13","2026-11-06"),("1999-01-01","2026-01-01")] {
        assert!(accrual::calculate(accrual::PreviewQuery{policy:policy("DAILY",false,500),start_date:start.into(),end_date:end.into()}).is_err());
    }
}
#[tokio::test]
async fn admin_password_required_even_on_replay_and_never_stored_in_history(){
    let f=setup().await;let sale=apply(&f.pool,operation("SALE",input())).await.unwrap();
    for password in [Value::Null,json!("errada")] {
        let op=Operation{id:id(),kind:"CANCEL_SALE".into(),data:json!({"saleId":sale["saleId"],"reason":"Teste","adminPassword":password})};
        assert!(apply(&f.pool,op).await.is_err());assert_eq!(stock_qty(&f.pool).await,9.0);
    }
    let cancel=operation("CANCEL_SALE",json!({"saleId":sale["saleId"],"reason":"Teste"}));
    apply(&f.pool,cancel.clone()).await.unwrap();apply(&f.pool,cancel.clone()).await.unwrap();
    let mut wrong=cancel;wrong.data["adminPassword"]=json!("errada");assert!(apply(&f.pool,wrong).await.is_err());
    let records:Vec<String>=sqlx::query_scalar("SELECT request_json FROM operation_results").fetch_all(&f.pool).await.unwrap();
    assert!(records.iter().all(|r|!r.contains("teste-admin")&&!r.contains("adminPassword")));
    assert_eq!(stock_qty(&f.pool).await,10.0);
}
#[tokio::test]
async fn admin_setup_change_and_lost_response_retry_preserve_secure_hash(){
    let f=setup().await;f.pool.execute("DELETE FROM admin_security").await.unwrap();assert!(!security::status(&f.pool).await.unwrap());
    let setup=operation("ADMIN_SETUP",json!({"newPassword":"senha-inicial"}));apply(&f.pool,setup.clone()).await.unwrap();apply(&f.pool,setup).await.unwrap();
    assert!(apply(&f.pool,operation("ADMIN_SETUP",json!({"newPassword":"qualquer-outra"}))).await.is_err());
    assert!(apply(&f.pool,operation("ADMIN_CHANGE",json!({"adminPassword":"errada","newPassword":"senha-nova"}))).await.is_err());
    let change=operation("ADMIN_CHANGE",json!({"adminPassword":"senha-inicial","newPassword":"senha-nova"}));apply(&f.pool,change.clone()).await.unwrap();apply(&f.pool,change).await.unwrap();
    let hash:String=sqlx::query_scalar("SELECT password_hash FROM admin_security").fetch_one(&f.pool).await.unwrap();assert!(hash.starts_with("$argon2id$"));assert!(!hash.contains("senha-"));
    let records:Vec<String>=sqlx::query_scalar("SELECT request_json FROM operation_results").fetch_all(&f.pool).await.unwrap();assert!(records.iter().all(|r|!r.contains("senha-")&&!r.contains("newPassword")));
}
#[tokio::test]
async fn delivery_assignment_snapshot_completion_cancel_and_inactive_driver(){
    let f=setup().await;let driver=apply(&f.pool,operation("DRIVER",json!({"name":"João","phone":"19999990000","active":true}))).await.unwrap();
    let mut data=input();data["delivery"]=json!({"driverId":driver,"address":"Rua das Águas","number":"48"});
    let sale=apply(&f.pool,operation("SALE",data.clone())).await.unwrap();
    apply(&f.pool,operation("DRIVER",json!({"id":driver,"name":"Outro nome","phone":"123","active":false}))).await.unwrap();
    let snapshot:String=sqlx::query_scalar("SELECT snapshot_json FROM sale_receipt_snapshots").fetch_one(&f.pool).await.unwrap();let snapshot:Value=serde_json::from_str(&snapshot).unwrap();assert_eq!(snapshot["delivery"]["driverName"],"João");assert_eq!(snapshot["delivery"]["number"],"48");
    assert!(apply(&f.pool,operation("SALE",data)).await.is_err());assert_eq!(count(&f.pool,"sales").await,1);
    let delivery=operation("DELIVER",json!({"saleId":sale["saleId"]}));apply(&f.pool,delivery.clone()).await.unwrap();apply(&f.pool,delivery).await.unwrap();
    assert_eq!(sqlx::query_scalar::<_,String>("SELECT status FROM sale_deliveries").fetch_one(&f.pool).await.unwrap(),"DELIVERED");assert_eq!(expected(&f.pool,"cash").await,16000);
    apply(&f.pool,operation("CANCEL_SALE",json!({"saleId":sale["saleId"],"reason":"Retorno"}))).await.unwrap();
    assert_eq!(sqlx::query_scalar::<_,String>("SELECT status FROM sale_deliveries").fetch_one(&f.pool).await.unwrap(),"CANCELLED");
}
#[tokio::test]
async fn accrual_preview_is_read_only_payment_posts_once_and_closes_then_refund_restarts_today(){
    let f=setup().await;enable(&f.pool).await;let start=past(&f.pool,14).await;
    apply(&f.pool,operation("DEBIT",json!({"customerId":"customer","amountCents":10000,"accrualStartDate":start}))).await.unwrap();
    assert_eq!(balance(&f.pool).await,10000);let before=count(&f.pool,"operation_results").await;
    let preview=accrual::previews(&f.pool,Some("customer")).await.unwrap();assert_eq!(preview.len(),1);assert_eq!(preview[0].pending_cents,1000);
    let dashboard=dashboard::read(&f.pool).await.unwrap();assert_eq!(dashboard.balance_cents,11000);assert_eq!(balance(&f.pool).await,10000);assert_eq!(count(&f.pool,"operation_results").await,before);
    let payment=operation("RECEIVE",json!({"customerId":"customer","amountCents":11000,"method":"CASH"}));apply(&f.pool,payment.clone()).await.unwrap();apply(&f.pool,payment).await.unwrap();assert_eq!(balance(&f.pool).await,0);assert_eq!(count(&f.pool,"account_accrual_posts").await,1);
    assert!(accrual::previews(&f.pool,Some("customer")).await.unwrap().is_empty());assert_eq!(expected(&f.pool,"cash").await,21000);
    let payment:String=sqlx::query_scalar("SELECT id FROM customer_account_entries WHERE type='PAYMENT'").fetch_one(&f.pool).await.unwrap();
    apply(&f.pool,operation("REFUND_RECEIPT",json!({"customerId":"customer","paymentId":payment,"reason":"Devolvido"}))).await.unwrap();assert_eq!(balance(&f.pool).await,11000);
    let reopened=accrual::previews(&f.pool,Some("customer")).await.unwrap();assert_eq!(reopened.len(),1);assert_eq!(reopened[0].pending_cents,0);assert_ne!(reopened[0].plan_id,preview[0].plan_id);
}
#[tokio::test]
async fn policy_change_preserves_old_rule_and_existing_debts_require_explicit_activation(){
    let f=setup().await;let start=past(&f.pool,14).await;
    apply(&f.pool,operation("DEBIT",json!({"customerId":"customer","amountCents":5000}))).await.unwrap();assert_eq!(count(&f.pool,"account_accrual_plans").await,0);
    enable(&f.pool).await;
    let entry:String=sqlx::query_scalar("SELECT id FROM customer_account_entries").fetch_one(&f.pool).await.unwrap();
    assert!(apply(&f.pool,operation("ACCRUAL_PLAN",json!({"entryId":entry,"enabled":true,"startDate":start,"adminPassword":"errada"}))).await.is_err());
    apply(&f.pool,operation("ACCRUAL_PLAN",json!({"entryId":entry,"enabled":true,"startDate":start,"adminPassword":"teste-admin"}))).await.unwrap();
    apply(&f.pool,operation("ACCRUAL_SETTINGS",json!({"policy":policy("FULL_WEEK",false,2000),"adminPassword":"teste-admin"}))).await.unwrap();
    assert_eq!(accrual::previews(&f.pool,None).await.unwrap()[0].weekly_cents,500);
    apply(&f.pool,operation("ACCRUAL_PLAN",json!({"entryId":entry,"enabled":false,"adminPassword":"teste-admin"}))).await.unwrap();assert_eq!(balance(&f.pool).await,6000);
    assert_eq!(sqlx::query_scalar::<_,String>("SELECT end_reason FROM account_accrual_plans").fetch_one(&f.pool).await.unwrap(),"MANUAL");assert!(accrual::previews(&f.pool,None).await.unwrap().is_empty());
}
#[tokio::test]
async fn accrual_partial_payment_cancel_guard_and_transaction_failure_keep_history_consistent(){
    let f=setup().await;enable(&f.pool).await;let mut data=input();data["accrualStartDate"]=json!(past(&f.pool,14).await);
    let sale=apply(&f.pool,operation("SALE",data)).await.unwrap();
    f.pool.execute("CREATE TRIGGER fail_receive BEFORE INSERT ON account_payment_receipts BEGIN SELECT RAISE(ABORT,'forced receipt failure'); END").await.unwrap();
    assert!(apply(&f.pool,operation("RECEIVE",json!({"customerId":"customer","amountCents":1000,"method":"PIX"}))).await.is_err());assert_eq!(count(&f.pool,"account_accrual_posts").await,0);assert_eq!(balance(&f.pool).await,5000);
    f.pool.execute("DROP TRIGGER fail_receive").await.unwrap();apply(&f.pool,operation("RECEIVE",json!({"customerId":"customer","amountCents":1000,"method":"PIX"}))).await.unwrap();assert_eq!(balance(&f.pool).await,5000);assert_eq!(accrual::previews(&f.pool,None).await.unwrap().len(),1);
    assert!(apply(&f.pool,operation("CANCEL_SALE",json!({"saleId":sale["saleId"],"reason":"Retorno"}))).await.is_err());
    let payment:String=sqlx::query_scalar("SELECT id FROM customer_account_entries WHERE type='PAYMENT'").fetch_one(&f.pool).await.unwrap();apply(&f.pool,operation("REFUND_RECEIPT",json!({"customerId":"customer","paymentId":payment,"reason":"Retorno"}))).await.unwrap();
    apply(&f.pool,operation("CANCEL_SALE",json!({"saleId":sale["saleId"],"reason":"Retorno"}))).await.unwrap();assert_eq!(balance(&f.pool).await,0);assert!(accrual::previews(&f.pool,None).await.unwrap().is_empty());
}
