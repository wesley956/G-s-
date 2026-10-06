use super::*;
fn query()->audit::Query {audit::Query{start:"2000-01-01".into(),end:"2099-12-31".into(),kind:None,search:String::new(),page:1,anchor:None}}
fn values(item:&Value)->Vec<&str> {item["fields"].as_array().unwrap().iter().map(|f|f["value"].as_str().unwrap()).collect()}
async fn records(pool:&SqlitePool)->Vec<(String,String,String,String)> {sqlx::query_as("SELECT id,request_json,result_json,created_at FROM operation_results ORDER BY id").fetch_all(pool).await.unwrap()}

#[tokio::test]
async fn audit_replay_and_rollback_are_read_once_without_mutating_source(){
 let f=setup().await;let op=operation("DEBIT",json!({"customerId":"customer","amountCents":1001,"description":"Conta registrada"}));
 apply(&f.pool,op.clone()).await.unwrap();apply(&f.pool,op.clone()).await.unwrap();
 let mut invalid=op.clone();invalid.id=id();invalid.data["amountCents"]=json!(-1);assert!(apply(&f.pool,invalid).await.is_err());
 f.pool.execute("CREATE TRIGGER fail_audit BEFORE INSERT ON operation_results BEGIN SELECT RAISE(ABORT,'forced rollback'); END").await.unwrap();
 assert!(apply(&f.pool,operation("DEBIT",json!({"customerId":"customer","amountCents":2000}))).await.is_err());
 let before=records(&f.pool).await;let page=audit::read(&f.pool,query()).await.unwrap();
 assert_eq!(page.total,1);assert_eq!(page.items[0]["id"],op.id);assert!(values(&page.items[0]).contains(&"R$ 10,01"));assert_eq!(count(&f.pool,"customer_account_entries").await,1);assert_eq!(records(&f.pool).await,before);
}
#[tokio::test]
async fn audit_keeps_sale_and_expense_snapshots_after_renaming_and_deactivation(){
 let f=setup().await;f.pool.execute("UPDATE products SET name='Gás P.13'").await.unwrap();
 let sale=apply(&f.pool,operation("SALE",input())).await.unwrap();let supplier=apply(&f.pool,operation("SUPPLIER",supplier_input())).await.unwrap();
 let mut expense=expense_input("PIX",1001);expense["supplierId"]=supplier.clone();let expense=apply(&f.pool,operation("EXPENSE",expense)).await.unwrap();
 apply(&f.pool,expense_refund(&expense,"cash")).await.unwrap();
 f.pool.execute("UPDATE customers SET name='Outro cliente',active=0; UPDATE products SET name='Outro produto',active=0; UPDATE suppliers SET name='Outra empresa',active=0").await.unwrap();
 let page=audit::read(&f.pool,query()).await.unwrap();let s=page.items.iter().find(|i|i["kind"]=="SALE").unwrap();
 assert!(values(s).contains(&"José"));assert!(values(s).contains(&"Gás P.13 · 1,00"));assert!(values(s).contains(&"R$ 110,00"));assert_eq!(s["references"][0]["id"],sale["saleId"]);assert!(s["references"].as_array().unwrap().iter().any(|r|r["route"]=="/accounts/customer"));
 for kind in ["EXPENSE","REFUND_EXPENSE"] {let item=page.items.iter().find(|i|i["kind"]==kind).unwrap();assert!(values(item).contains(&"Águas São João"));assert!(values(item).contains(&"R$ 10,01"));assert!(values(item).contains(&"PIX"));}
}
#[tokio::test]
async fn audit_pagination_is_deterministic_and_anchor_excludes_new_operations(){
 let f=setup().await;for n in 0..31 {sqlx::query("INSERT INTO operation_results(id,request_json,result_json,created_at) VALUES (?,?, 'null','2026-10-01 12:00:00')").bind(format!("op-{n:02}")).bind(json!({"kind":"DEBIT","data":{"description":if n==0{"literal %_\\ registro"}else{"outro"},"amountCents":101}}).to_string()).execute(&f.pool).await.unwrap();}
 let first=audit::read(&f.pool,query()).await.unwrap();assert_eq!(first.total,31);assert_eq!(first.page_count,2);assert_eq!(first.items[0]["id"],"op-30");assert_eq!(first.items[24]["id"],"op-06");
 apply(&f.pool,operation("CATEGORY",json!({"name":"Nova categoria"}))).await.unwrap();
 let mut next=first.query.clone();next.page=2;let second=audit::read(&f.pool,next).await.unwrap();assert_eq!(second.total,31);assert_eq!(second.items.len(),6);assert_eq!(second.items[0]["id"],"op-05");assert_eq!(second.items[5]["id"],"op-00");
 assert_eq!(audit::read(&f.pool,query()).await.unwrap().total,32);
 let mut literal=query();literal.search="%_\\".into();let found=audit::read(&f.pool,literal).await.unwrap();assert_eq!(found.total,1);assert_eq!(found.items[0]["id"],"op-00");
 let mut kind=query();kind.kind=Some("CATEGORY".into());kind.page=999;let page=audit::read(&f.pool,kind).await.unwrap();assert_eq!(page.total,1);assert_eq!(page.query.page,1);
 let mut bad=query();bad.page=0;assert!(audit::read(&f.pool,bad).await.is_err());
 let mut bad=query();bad.kind=Some("DROP TABLE".into());assert!(audit::read(&f.pool,bad).await.is_err());let mut bad=query();bad.start="2026-02-30".into();assert!(audit::read(&f.pool,bad).await.is_err());let mut bad=query();bad.start="2099-12-31".into();bad.end="2000-01-01".into();assert!(audit::read(&f.pool,bad).await.is_err());let mut bad=query();bad.anchor=Some(i64::MAX);assert!(audit::read(&f.pool,bad).await.is_err());
}
#[tokio::test]
async fn audit_unknown_or_malformed_legacy_records_are_readable_without_raw_payload(){
 let f=setup().await;for (key,request,result) in [("broken","{","null"),("number",r#"{"kind":7,"data":{}}"#,"null"),("future",r#"{"kind":"FUTURE","data":{"secret":"not displayed"}}"#,"{}"),("incomplete",r#"{"kind":"SALE","data":{}}"#,"{")] {sqlx::query("INSERT INTO operation_results(id,request_json,result_json) VALUES (?,?,?)").bind(key).bind(request).bind(result).execute(&f.pool).await.unwrap();}
 let before=records(&f.pool).await;let page=audit::read(&f.pool,query()).await.unwrap();assert_eq!(page.total,4);for item in &page.items {assert!(item["warning"].is_string());assert_eq!(item["fields"],json!([]));}assert!(!serde_json::to_string(&page).unwrap().contains("not displayed"));
 let mut unknown=query();unknown.kind=Some("UNKNOWN".into());assert_eq!(audit::read(&f.pool,unknown).await.unwrap().total,3);assert_eq!(records(&f.pool).await,before);
}
#[tokio::test]
async fn audit_local_period_is_inclusive_and_empty_result_keeps_first_page(){
 let f=setup().await;
 // Convert local fixture times to UTC in SQLite, honoring the platform time zone.
 for (key,local) in [("before","2026-10-01 23:59:59"),("first","2026-10-02 00:00:00"),("last","2026-10-02 23:59:59"),("after","2026-10-03 00:00:00")] {sqlx::query("INSERT INTO operation_results(id,request_json,result_json,created_at) VALUES (?,'{}','null',datetime(?,'utc'))").bind(key).bind(local).execute(&f.pool).await.unwrap();}
 let mut q=query();q.start="2026-10-02".into();q.end=q.start.clone();let page=audit::read(&f.pool,q).await.unwrap();assert_eq!(page.total,2);assert_eq!(page.items[0]["id"],"last");assert_eq!(page.items[1]["date"],"02/10/2026 00:00:00");
 let mut empty=query();empty.search="no such record".into();empty.page=500;let page=audit::read(&f.pool,empty).await.unwrap();assert_eq!(page.total,0);assert_eq!(page.page_count,1);assert_eq!(page.query.page,1);assert!(page.items.is_empty());
}
#[tokio::test]
async fn audit_all_native_kinds_survive_backup_reopen_with_original_values(){
 let f=setup().await;
 let sale=apply(&f.pool,operation("SALE",input())).await.unwrap();let payment=receive_id(&f.pool,5000,"PIX").await;apply(&f.pool,refund(&payment)).await.unwrap();apply(&f.pool,operation("CANCEL_SALE",json!({"saleId":sale["saleId"],"reason":"Retorno confirmado"}))).await.unwrap();
 apply(&f.pool,operation("STOCK",json!({"productId":"product","action":"ENTRY","quantity":2,"reason":"Reposição"}))).await.unwrap();
 apply(&f.pool,operation("DEBIT",json!({"customerId":"customer","amountCents":1001,"description":"Lançamento manual"}))).await.unwrap();
 let supplier=apply(&f.pool,operation("SUPPLIER",supplier_input())).await.unwrap();apply(&f.pool,operation("SUPPLIER_ACTIVE",json!({"id":supplier,"active":false}))).await.unwrap();
 let category=apply(&f.pool,operation("CATEGORY",json!({"name":"Categoria da auditoria"}))).await.unwrap();apply(&f.pool,operation("PRODUCT",json!({"name":"Água nova","categoryId":category,"costPriceCents":101,"counterPriceCents":201,"deliveryPriceCents":301,"stockQuantity":4,"minimumStock":2,"active":true}))).await.unwrap();
 let expense=apply(&f.pool,operation("EXPENSE",expense_input("CASH",101))).await.unwrap();apply(&f.pool,expense_refund(&expense,"cash")).await.unwrap();apply(&f.pool,operation("CASH_MOVE",json!({"sessionId":"cash","type":"SUPPLY","amountCents":1001,"description":"Troco"}))).await.unwrap();
 apply(&f.pool,operation("CLOSE_CASH",json!({"sessionId":"cash","informedCents":10001}))).await.unwrap();apply(&f.pool,operation("OPEN_CASH",json!({"amountCents":1001}))).await.unwrap();
 let page=audit::read(&f.pool,query()).await.unwrap();assert_eq!(page.total,15);
 for kind in audit::KINDS.iter().filter(|&&k|k!="UNKNOWN") {let item=page.items.iter().find(|i|i["kind"]==*kind).unwrap();assert!(item["warning"].is_null(),"{item}");assert!(!item["fields"].as_array().unwrap().is_empty(),"{item}");}
 let close=page.items.iter().find(|i|i["kind"]=="CLOSE_CASH").unwrap();assert!(close["fields"].as_array().unwrap().iter().any(|f|f["label"]=="Diferença no fechamento"));
 let copy=f.dir.path().join("audit.sqlite");backup::snapshot(&f.pool,&copy).await.unwrap();backup::validate_restore(&copy).await.unwrap();let reopened=connect(&copy).await;
 let restored=audit::read(&reopened,query()).await.unwrap();assert_eq!(restored.items,page.items);assert_eq!(restored.total,page.total);assert_eq!(restored.query.anchor,page.query.anchor);assert_eq!(records(&reopened).await,records(&f.pool).await);reopened.close().await;
}

#[tokio::test]
async fn audit_missing_legacy_references_do_not_invent_links_or_names(){
 let f=setup().await;
 for (key,request,result) in [("missing-sale",json!({"kind":"CANCEL_SALE","data":{"saleId":"gone","reason":"Motivo preservado"}}),Value::Null),("missing-cash",json!({"kind":"OPEN_CASH","data":{"amountCents":1001}}),json!("gone")),("missing-product",json!({"kind":"STOCK","data":{"productId":"gone","action":"ENTRY","quantity":1,"reason":"Entrada antiga"}}),json!({"previousQuantity":2,"newQuantity":3,"delta":1}))] {
  sqlx::query("INSERT INTO operation_results(id,request_json,result_json) VALUES (?,?,?)").bind(key).bind(request.to_string()).bind(result.to_string()).execute(&f.pool).await.unwrap();
 }
 let page=audit::read(&f.pool,query()).await.unwrap();assert_eq!(page.total,3);
 for item in &page.items {assert!(item["references"].as_array().unwrap().is_empty(),"{item}");assert!(values(item).contains(&"gone"));}
 let sale=page.items.iter().find(|i|i["id"]=="missing-sale").unwrap();assert!(sale["warning"].is_string());assert!(values(sale).contains(&"Motivo preservado"));
}
