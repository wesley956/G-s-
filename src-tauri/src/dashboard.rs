//! One read statement: clock, daily events and current balances share a snapshot.
use super::*;

#[derive(Serialize)]
#[serde(rename_all="camelCase")]
pub struct Dashboard {
    pub day:String, pub generated_at_local:String, pub cash_open:bool,
    pub sales_count:i64, pub sold_cents:i64, pub cancelled_count:i64, pub cancelled_cents:i64,
    pub credit_sales_cents:i64, pub balance_cents:i64, pub debtors_count:i64, pub low_stock_count:i64,
    pub methods:Vec<Value>,
}

pub async fn read(pool:&SqlitePool)->Result<Dashboard> { read_on(pool,None).await }

// The date override is internal, for deterministic domain tests. Desktop uses SQLite's local clock.
pub(crate) async fn read_on(pool:&SqlitePool,day:Option<&str>)->Result<Dashboard> {
    let r=sqlx::query(r#"WITH clock AS (
        SELECT COALESCE(?,date('now','localtime')) day,strftime('%d/%m/%Y %H:%M:%S','now','localtime') generated
    ), balances AS (
        SELECT c.id,COALESCE(SUM(CASE WHEN a.status='CANCELLED' THEN 0 WHEN a.type='PAYMENT' THEN -a.amount_cents ELSE a.amount_cents END),0) balance
        FROM customers c LEFT JOIN customer_account_entries a ON a.customer_id=c.id GROUP BY c.id
    ), events AS (
        SELECT p.method,p.amount_cents sold,0 cancelled,0 receipt,0 receipt_refund
        FROM payments p JOIN sales s ON s.id=p.sale_id,clock WHERE date(s.completed_at,'localtime')=day
        UNION ALL SELECT p.method,0,p.amount_cents,0,0 FROM payments p JOIN sales s ON s.id=p.sale_id,clock WHERE s.status='CANCELLED' AND date(s.cancelled_at,'localtime')=day
        UNION ALL SELECT COALESCE(payment_method,'UNKNOWN'),0,0,amount_cents,0 FROM cash_transactions,clock WHERE type='RECEIPT' AND date(created_at,'localtime')=day
        UNION ALL SELECT COALESCE(t.payment_method,'UNKNOWN'),0,0,0,t.amount_cents FROM account_payment_refunds r JOIN cash_transactions t ON t.id=r.cash_transaction_id,clock WHERE date(t.created_at,'localtime')=day
    ), methods AS (
        SELECT method,SUM(sold) sold,SUM(cancelled) cancelled,SUM(receipt) receipt,SUM(receipt_refund) receipt_refund FROM events GROUP BY method ORDER BY method
    ) SELECT day,generated,
        (SELECT COUNT(*) FROM cash_sessions WHERE status='OPEN') cash_open,
        (SELECT COUNT(*) FROM sales WHERE completed_at IS NOT NULL AND date(completed_at,'localtime')=day) sales_count,
        (SELECT COALESCE(SUM(total_cents),0) FROM sales WHERE completed_at IS NOT NULL AND date(completed_at,'localtime')=day) sold,
        (SELECT COUNT(*) FROM sales WHERE status='CANCELLED' AND date(cancelled_at,'localtime')=day) cancelled_count,
        (SELECT COALESCE(SUM(total_cents),0) FROM sales WHERE status='CANCELLED' AND date(cancelled_at,'localtime')=day) cancelled,
        (SELECT COALESCE(SUM(sold),0) FROM methods WHERE method='CREDIT_CUSTOMER') credit_sales,
        (SELECT COALESCE(SUM(balance),0) FROM balances WHERE balance>0) balance,
        (SELECT COUNT(*) FROM balances WHERE balance>0) debtors,
        (SELECT COUNT(*) FROM products WHERE active=1 AND stock_quantity<=minimum_stock) low_stock,
        (SELECT json_group_array(json_object('method',method,'salesCents',sold,'saleRefundCents',cancelled,'receiptsCents',receipt,'receiptRefundCents',receipt_refund)) FROM methods) methods
        FROM clock"#).bind(day).fetch_one(pool).await.map_err(|e|e.to_string())?;
    Ok(Dashboard {
        day:r.get("day"),generated_at_local:r.get("generated"),cash_open:r.get::<i64,_>("cash_open")>0,
        sales_count:r.get("sales_count"),sold_cents:r.get("sold"),cancelled_count:r.get("cancelled_count"),cancelled_cents:r.get("cancelled"),
        credit_sales_cents:r.get("credit_sales"),balance_cents:r.get("balance"),debtors_count:r.get("debtors"),low_stock_count:r.get("low_stock"),
        methods:serde_json::from_str(&r.get::<String,_>("methods")).map_err(|e|e.to_string())?,
    })
}
