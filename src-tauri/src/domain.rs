//! Domain writes run on one SQLx transaction. SQL and prices never come from the UI.
pub mod backup;
pub mod backup_policy;
pub mod recovery;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use sqlx::{Row, Sqlite, Transaction};
pub use sqlx::SqlitePool;
use std::collections::HashSet;

type Tx = Transaction<'static, Sqlite>;
type Result<T> = std::result::Result<T, String>;
#[derive(Deserialize, Serialize, Clone)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Operation { pub id: String, pub kind: String, pub data: Value }
fn id() -> String { uuid::Uuid::new_v4().to_string() }
fn text<'a>(v: &'a Value, key: &str) -> Result<&'a str> {
    v.get(key).and_then(Value::as_str).ok_or_else(|| format!("Campo inválido: {key}"))
}
fn optional(v: &Value, key: &str) -> Option<String> {
    v.get(key).and_then(Value::as_str).map(str::trim).filter(|s| !s.is_empty()).map(str::to_owned)
}
fn money(v: &Value, key: &str, zero: bool) -> Result<i64> {
    let n = v.get(key).and_then(Value::as_i64).ok_or_else(|| format!("Valor inválido: {key}"))?;
    if n < (if zero { 0 } else { 1 }) || n > 1_000_000_000_000 { return Err("Valor fora do limite permitido.".into()); }
    Ok(n)
}
fn quantity(v: &Value, key: &str, zero: bool) -> Result<f64> {
    let n = v.get(key).and_then(Value::as_f64).ok_or("Quantidade inválida.")?;
    if !n.is_finite() || n < (if zero { 0.0 } else { 0.01 }) || n > 1_000_000.0 || (n*100.0-(n*100.0).round()).abs()>0.000001 {
        return Err("Informe uma quantidade válida com até duas casas decimais.".into());
    }
    Ok(n)
}
fn method(v: &Value, credit: bool) -> Result<String> {
    let m = text(v, "method")?;
    if !["CASH","PIX","DEBIT_CARD","CREDIT_CARD"].contains(&m) && !(credit && m=="CREDIT_CUSTOMER") { return Err("Forma de pagamento inválida.".into()); }
    Ok(m.to_owned())
}
fn due_date(v: &Value) -> Result<Option<String>> {
    let date = optional(v,"dueDate");
    if let Some(ref d)=date { if d.len()!=10 || chrono::NaiveDate::parse_from_str(d,"%Y-%m-%d").is_err() { return Err("Vencimento inválido.".into()); } }
    Ok(date)
}
async fn exec(tx: &mut Tx, sql: &str, values: Vec<Value>) -> Result<u64> {
    let mut q = sqlx::query(sql);
    for v in values { q = match v {
        Value::Null => q.bind(None::<String>), Value::String(s)=>q.bind(s),
        Value::Number(n)=>if let Some(i)=n.as_i64(){q.bind(i)}else{q.bind(n.as_f64().ok_or("Número inválido.")?)},
        Value::Bool(b)=>q.bind(b), _=>return Err("Parâmetro inválido.".into()),
    }; }
    q.execute(&mut **tx).await.map(|r| r.rows_affected()).map_err(|e| e.to_string())
}
async fn open_cash(tx: &mut Tx) -> Result<String> {
    sqlx::query_scalar("SELECT id FROM cash_sessions WHERE status='OPEN'").fetch_optional(&mut **tx).await.map_err(|e|e.to_string())?.ok_or_else(||"Abra o caixa antes de continuar.".into())
}
async fn require_cash(tx: &mut Tx, expected: &str) -> Result<()> {
    if open_cash(tx).await? != expected { return Err("O caixa foi fechado ou alterado. Reabra a tela.".into()); } Ok(())
}
async fn customer(tx: &mut Tx, customer_id: &str, active: bool) -> Result<Value> {
    let r = sqlx::query("SELECT name,document,address,phone FROM customers WHERE id=? AND (?=0 OR active=1)").bind(customer_id).bind(active).fetch_optional(&mut **tx).await.map_err(|e|e.to_string())?.ok_or("Cliente não encontrado ou inativo.")?;
    Ok(json!({"name":r.get::<String,_>("name"),"document":r.get::<Option<String>,_>("document"),"address":r.get::<Option<String>,_>("address"),"phone":r.get::<Option<String>,_>("phone")}))
}
fn settings_text(settings: &Value, key: &str, default: &str, limit: usize) -> String {
    settings.get(key).and_then(Value::as_str).unwrap_or(default).trim().chars().take(limit).collect()
}
async fn cash_expected(tx: &mut Tx, session: &str) -> Result<i64> {
    sqlx::query_scalar("SELECT opening_balance_cents + COALESCE((SELECT SUM(CASE WHEN type IN ('SALE','RECEIPT') AND payment_method='CASH' THEN amount_cents WHEN type='SUPPLY' THEN amount_cents WHEN type IN ('WITHDRAWAL','EXPENSE') THEN -amount_cents WHEN type='REVERSAL' AND payment_method='CASH' THEN -amount_cents ELSE 0 END) FROM cash_transactions WHERE cash_session_id=cash_sessions.id),0) FROM cash_sessions WHERE id=?")
    .bind(session).fetch_one(&mut **tx).await.map_err(|e|e.to_string())
}

pub async fn apply(pool: &SqlitePool, op: Operation) -> Result<Value> {
    uuid::Uuid::parse_str(&op.id).map_err(|_|"Identificador da operação inválido.")?;
    let request = serde_json::to_string(&op).map_err(|e|e.to_string())?;
    // BEGIN IMMEDIATE serializes stock checks, sequence allocation and cash closing.
    // Dropping Transaction schedules rollback even on error or cancellation.
    let mut tx = pool.begin_with("BEGIN IMMEDIATE").await.map_err(|e|e.to_string())?;
    if let Some(r)=sqlx::query("SELECT request_json,result_json FROM operation_results WHERE id=?").bind(&op.id).fetch_optional(&mut *tx).await.map_err(|e|e.to_string())? {
        if r.get::<String,_>("request_json")!=request { return Err("A operação já foi usada com outros dados.".into()); }
        let result=serde_json::from_str(&r.get::<String,_>("result_json")).map_err(|e|e.to_string())?;
        tx.commit().await.map_err(|e|e.to_string())?; return Ok(result);
    }
    let result=dispatch(&mut tx,&op.kind,&op.data).await?;
    exec(&mut tx,"INSERT INTO operation_results(id,request_json,result_json) VALUES (?,?,?)",vec![json!(op.id),json!(request),json!(result.to_string())]).await?;
    tx.commit().await.map_err(|e|e.to_string())?;
    Ok(result)
}
async fn dispatch(tx: &mut Tx, kind: &str, v: &Value) -> Result<Value> {
    match kind {
        "SALE"=>sale(tx,v).await, "CANCEL_SALE"=>cancel_sale(tx,v).await,
        "STOCK"=>stock(tx,v).await, "RECEIVE"=>receive(tx,v).await,
        "REFUND_RECEIPT"=>refund_receipt(tx,v).await,
        "OPEN_CASH"=>{
            let amount=money(v,"amountCents",true)?;
            if sqlx::query_scalar::<_,i64>("SELECT COUNT(*) FROM cash_sessions WHERE status='OPEN'").fetch_one(&mut **tx).await.map_err(|e|e.to_string())?>0 {return Err("Já existe um caixa aberto.".into());}
            let session=id(); exec(tx,"INSERT INTO cash_sessions(id,status,opening_balance_cents,notes) VALUES (?,'OPEN',?,?)",vec![json!(session),json!(amount),json!(optional(v,"notes"))]).await?; Ok(json!(session))
        },
        "CASH_MOVE"=>{
            let session=text(v,"sessionId")?;require_cash(tx,session).await?;
            let typ=text(v,"type")?;if !["SUPPLY","WITHDRAWAL","EXPENSE"].contains(&typ){return Err("Movimento inválido.".into());}
            let amount=money(v,"amountCents",false)?;
            if typ!="SUPPLY" && amount>cash_expected(tx,session).await? {return Err("Saldo em dinheiro insuficiente.".into());}
            exec(tx,"INSERT INTO cash_transactions(id,cash_session_id,type,amount_cents,description) VALUES (?,?,?,?,?)",vec![json!(id()),json!(session),json!(typ),json!(amount),json!(optional(v,"description"))]).await?;Ok(Value::Null)
        },
        "CLOSE_CASH"=>{
            let session=text(v,"sessionId")?;require_cash(tx,session).await?;
            let informed=money(v,"informedCents",true)?;let expected=cash_expected(tx,session).await?;
            exec(tx,"UPDATE cash_sessions SET status='CLOSED',closing_expected_cents=?,closing_informed_cents=?,closed_at=CURRENT_TIMESTAMP,notes=CASE WHEN ? IS NULL THEN notes WHEN notes IS NULL THEN ? ELSE notes || char(10) || ? END WHERE id=? AND status='OPEN'",vec![json!(expected),json!(informed),json!(optional(v,"notes")),json!(optional(v,"notes")),json!(optional(v,"notes")),json!(session)]).await?;
            Ok(json!({"expectedCents":expected,"informedCents":informed,"differenceCents":informed-expected}))
        },
        "DEBIT"=>{
            let cust=text(v,"customerId")?; customer(tx,cust,true).await?;let amount=money(v,"amountCents",false)?;let due=due_date(v)?;
            exec(tx,"INSERT INTO customer_account_entries(id,customer_id,type,description,amount_cents,due_date,status) VALUES (?,?,'DEBIT',?,?,?,'OPEN')",vec![json!(id()),json!(cust),json!(optional(v,"description").unwrap_or("Lançamento manual".into())),json!(amount),json!(due)]).await?; Ok(Value::Null)
        },
        "PRODUCT"=>product(tx,v).await,
        "CATEGORY"=>{
            let name=text(v,"name")?.trim();if name.is_empty(){return Err("Informe o nome da categoria.".into());}
            if sqlx::query_scalar::<_,i64>("SELECT COUNT(*) FROM categories WHERE LOWER(name)=LOWER(?)").bind(name).fetch_one(&mut **tx).await.map_err(|e|e.to_string())?>0 {return Err("Categoria já cadastrada.".into());}
            let category=id();exec(tx,"INSERT INTO categories(id,name) VALUES (?,?)",vec![json!(category),json!(name)]).await?;Ok(json!(category))
        },
        _=>Err("Operação desconhecida.".into()),
    }
}
async fn sale(tx: &mut Tx,v: &Value)->Result<Value> {
    let cash=open_cash(tx).await?;
    let typ=text(v,"saleType")?;if !["COUNTER","DELIVERY"].contains(&typ){return Err("Tipo de venda inválido.".into());}
    let items=v.get("items").and_then(Value::as_array).filter(|a| !a.is_empty() && a.len()<=500).ok_or("Adicione produtos à venda.")?;
    let payments=v.get("payments").and_then(Value::as_array).filter(|a|!a.is_empty() && a.len()<=20).ok_or("Informe os pagamentos.")?;
    let cust=optional(v,"customerId");let snapshot_customer=if let Some(ref c)=cust{customer(tx,c,true).await?}else{Value::Null};
    let mut seen=HashSet::new();let mut prepared=Vec::new();let mut subtotal=0i64;
    for item in items {
        let product_id=text(item,"productId")?;if !seen.insert(product_id){return Err("Produto duplicado no carrinho.".into());}
        let qty=quantity(item,"quantity",false)?;
        let p=sqlx::query("SELECT name,counter_price_cents,delivery_price_cents,stock_quantity FROM products WHERE id=? AND active=1").bind(product_id).fetch_optional(&mut **tx).await.map_err(|e|e.to_string())?.ok_or("Produto não encontrado ou inativo.")?;
        let name=p.get::<String,_>("name");let available=p.get::<f64,_>("stock_quantity");
        if available+0.000001<qty{return Err(format!("Estoque insuficiente para {name}."));}
        let unit=p.get::<i64,_>(if typ=="COUNTER"{"counter_price_cents"}else{"delivery_price_cents"});
        if unit<0 {return Err("Preço inválido no cadastro.".into());}
        let total=(unit as f64*qty).round();if total>1_000_000_000_000.0{return Err("Total fora do limite.".into());}
        subtotal=subtotal.checked_add(total as i64).ok_or("Total fora do limite.")?;
        prepared.push((product_id,name,qty,unit,total as i64));
    }
    let discount=money(v,"discountCents",true)?;if discount>subtotal{return Err("Desconto maior que o subtotal.".into());}
    let total=subtotal-discount;if total<=0{return Err("Total da venda deve ser positivo.".into());}
    // Reject stale prices rather than silently charge a different amount.
    let mut paid=0i64;let mut prepared_payments=Vec::new();let mut payment_methods=HashSet::new();
    for p in payments {
        let m=method(p,true)?;if !payment_methods.insert(m.clone()){return Err("Agrupe pagamentos da mesma forma.".into());}
        let amount=money(p,"amountCents",false)?;paid=paid.checked_add(amount).ok_or("Pagamento fora do limite.")?;
        if m=="CREDIT_CUSTOMER" && cust.is_none(){return Err("Venda fiado exige um cliente.".into());}
        let received=if m=="CASH"{let n=if p.get("receivedCents").is_none_or(Value::is_null){amount}else{money(p,"receivedCents",false)?};if n<amount{return Err("Dinheiro recebido insuficiente.".into());}Some(n)}else{None};
        prepared_payments.push((m,amount,received));
    }
    if paid!=total{return Err("A soma dos pagamentos deve ser igual ao total. Confira preços e valores.".into());}
    let due=due_date(v)?;
    let stored:Option<String>=sqlx::query_scalar("SELECT value FROM app_settings WHERE key='receipt_settings'").fetch_optional(&mut **tx).await.map_err(|e|e.to_string())?.flatten();
    let settings:Value=if let Some(s)=stored{serde_json::from_str(&s).map_err(|_|"As configurações de impressão estão inválidas.")?}else{json!({})};
    if !settings.is_object(){return Err("As configurações de impressão estão inválidas.".into());}
    let business_name=settings_text(&settings,"businessName","G-s- Gestão de Depósito",120);
    let snapshot=json!({"version":1,"business":{"businessName":if business_name.is_empty(){"G-s- Gestão de Depósito"}else{&business_name},"document":settings_text(&settings,"document","",30),"address":settings_text(&settings,"address","",240),"phone":settings_text(&settings,"phone","",40),"footer":settings_text(&settings,"footer","Obrigado pela preferência!",240)},"customer":snapshot_customer});
    let mode=settings.get("printMode").and_then(Value::as_str).filter(|m|["ASK","AUTO_ONE","AUTO_TWO","NEVER"].contains(m)).unwrap_or("ASK");
    let number:i64=sqlx::query_scalar("SELECT COALESCE(MAX(sale_number),0)+1 FROM sales").fetch_one(&mut **tx).await.map_err(|e|e.to_string())?;let sale_id=id();
    exec(tx,"INSERT INTO sales(id,sale_number,cash_session_id,customer_id,sale_type,status,subtotal_cents,discount_cents,total_cents,completed_at) VALUES (?,?,?,?,?,'COMPLETED',?,?,?,CURRENT_TIMESTAMP)",vec![json!(sale_id),json!(number),json!(cash),json!(cust),json!(typ),json!(subtotal),json!(discount),json!(total)]).await?;
    for (p,name,qty,unit,item_total) in prepared {
        exec(tx,"INSERT INTO sale_items(id,sale_id,product_id,product_name_snapshot,quantity,unit_price_cents,total_cents) VALUES (?,?,?,?,?,?,?)",vec![json!(id()),json!(sale_id),json!(p),json!(name),json!(qty),json!(unit),json!(item_total)]).await?;
        exec(tx,"UPDATE products SET stock_quantity=ROUND(stock_quantity-?,2),updated_at=CURRENT_TIMESTAMP WHERE id=?",vec![json!(qty),json!(p)]).await?;
        exec(tx,"INSERT INTO inventory_movements(id,product_id,type,quantity,reference_type,reference_id,reason) VALUES (?,?,'SALE_EXIT',?,'SALE',?,?)",vec![json!(id()),json!(p),json!(-qty),json!(sale_id),json!(format!("Venda #{number}"))]).await?;
    }
    for (m,amount,received) in prepared_payments {
        exec(tx,"INSERT INTO payments(id,sale_id,method,amount_cents,received_cents,change_cents) VALUES (?,?,?,?,?,?)",vec![json!(id()),json!(sale_id),json!(m),json!(amount),json!(received),json!(received.map(|r|r-amount).unwrap_or(0))]).await?;
        exec(tx,"INSERT INTO cash_transactions(id,cash_session_id,sale_id,type,payment_method,amount_cents,description) VALUES (?,?,?,'SALE',?,?,?)",vec![json!(id()),json!(cash),json!(sale_id),json!(m),json!(amount),json!(format!("Venda #{number}"))]).await?;
        if m=="CREDIT_CUSTOMER" {exec(tx,"INSERT INTO customer_account_entries(id,customer_id,sale_id,type,description,amount_cents,due_date,status) VALUES (?,?,?,'DEBIT',?,?,?,'OPEN')",vec![json!(id()),json!(cust),json!(sale_id),json!(format!("Venda #{number}")),json!(amount),json!(due)]).await?;}
    }
    exec(tx,"INSERT INTO sale_receipt_snapshots(sale_id,snapshot_json) VALUES (?,?)",vec![json!(sale_id),json!(snapshot.to_string())]).await?;
    Ok(json!({"saleId":sale_id,"saleNumber":number,"totalCents":total,"printMode":mode}))
}
async fn cancel_sale(tx:&mut Tx,v:&Value)->Result<Value>{
    let sale_id=text(v,"saleId")?;let reason=text(v,"reason")?.trim();if reason.is_empty(){return Err("Informe o motivo do cancelamento.".into());}
    let s=sqlx::query("SELECT sale_number,cash_session_id,status FROM sales WHERE id=?").bind(sale_id).fetch_optional(&mut **tx).await.map_err(|e|e.to_string())?.ok_or("Venda não encontrada.")?;
    if s.get::<String,_>("status")!="COMPLETED"{return Err("Venda já cancelada ou não finalizada.".into());}
    // A paid credit sale needs an explicit refund flow; do not erase a paid debt.
    let allocated:i64=sqlx::query_scalar("SELECT COALESCE(SUM(a.amount_cents),0) FROM account_payment_allocations a JOIN customer_account_entries d ON d.id=a.debit_id JOIN customer_account_entries p ON p.id=a.payment_id WHERE d.sale_id=? AND p.status<>'CANCELLED'").bind(sale_id).fetch_one(&mut **tx).await.map_err(|e|e.to_string())?;
    if allocated>0{return Err("Esta venda fiado já recebeu pagamento. Estorne os recebimentos na caderneta do cliente antes de cancelar.".into());}
    let cash=open_cash(tx).await?;let number=s.get::<i64,_>("sale_number");
    let rows=sqlx::query("SELECT product_id,quantity FROM sale_items WHERE sale_id=?").bind(sale_id).fetch_all(&mut **tx).await.map_err(|e|e.to_string())?;
    for item in rows{let p=item.get::<String,_>("product_id");let qty=item.get::<f64,_>("quantity");
        exec(tx,"UPDATE products SET stock_quantity=ROUND(stock_quantity+?,2),updated_at=CURRENT_TIMESTAMP WHERE id=?",vec![json!(qty),json!(p)]).await?;
        exec(tx,"INSERT INTO inventory_movements(id,product_id,type,quantity,reference_type,reference_id,reason) VALUES (?,?,'CANCELLED_SALE_RETURN',?,'SALE',?,?)",vec![json!(id()),json!(p),json!(qty),json!(sale_id),json!(format!("Cancelamento venda #{number}: {reason}"))]).await?;
    }
    let payments=sqlx::query("SELECT method,amount_cents FROM payments WHERE sale_id=?").bind(sale_id).fetch_all(&mut **tx).await.map_err(|e|e.to_string())?;
    for p in payments{exec(tx,"INSERT INTO cash_transactions(id,cash_session_id,sale_id,type,payment_method,amount_cents,description) VALUES (?,?,?,'REVERSAL',?,?,?)",vec![json!(id()),json!(cash),json!(sale_id),json!(p.get::<String,_>("method")),json!(p.get::<i64,_>("amount_cents")),json!(format!("Estorno venda #{number}: {reason}"))]).await?;}
    exec(tx,"UPDATE customer_account_entries SET status='CANCELLED' WHERE sale_id=? AND type='DEBIT'",vec![json!(sale_id)]).await?;
    exec(tx,"UPDATE sales SET status='CANCELLED',cancelled_at=CURRENT_TIMESTAMP,cancellation_reason=? WHERE id=? AND status='COMPLETED'",vec![json!(reason),json!(sale_id)]).await?;Ok(Value::Null)
}
async fn stock(tx:&mut Tx,v:&Value)->Result<Value>{
    let p=text(v,"productId")?;let action=text(v,"action")?;let reason=text(v,"reason")?.trim();if reason.is_empty(){return Err("Informe o motivo da movimentação.".into());}
    let current:f64=sqlx::query_scalar("SELECT stock_quantity FROM products WHERE id=? AND active=1").bind(p).fetch_optional(&mut **tx).await.map_err(|e|e.to_string())?.ok_or("Produto não encontrado ou inativo.")?;
    let (typ,delta)=match action{"ENTRY"=>("MANUAL_ENTRY",quantity(v,"quantity",false)?),"RETURN"=>("RETURN",quantity(v,"quantity",false)?),"EXIT"=>("MANUAL_EXIT",-quantity(v,"quantity",false)?),"LOSS"=>("LOSS",-quantity(v,"quantity",false)?),"ADJUSTMENT"=>("ADJUSTMENT",quantity(v,"targetQuantity",true)?-current),_=>return Err("Movimento inválido.".into())};
    let next=((current+delta)*100.0).round()/100.0;if next<0.0{return Err("A movimentação deixaria o estoque negativo.".into());}if delta.abs()<0.000001{return Err("A quantidade informada é igual ao estoque atual.".into());}
    exec(tx,"UPDATE products SET stock_quantity=?,updated_at=CURRENT_TIMESTAMP WHERE id=?",vec![json!(next),json!(p)]).await?;
    exec(tx,"INSERT INTO inventory_movements(id,product_id,type,quantity,reason) VALUES (?,?,?,?,?)",vec![json!(id()),json!(p),json!(typ),json!(delta),json!(reason)]).await?;
    Ok(json!({"previousQuantity":current,"newQuantity":next,"delta":delta}))
}
async fn receive(tx:&mut Tx,v:&Value)->Result<Value>{
    let cust=text(v,"customerId")?;customer(tx,cust,false).await?;let amount=money(v,"amountCents",false)?;let m=method(v,false)?;let cash=open_cash(tx).await?;
    let balance:i64=sqlx::query_scalar("SELECT COALESCE(SUM(CASE WHEN status='CANCELLED' THEN 0 WHEN type='PAYMENT' THEN -amount_cents ELSE amount_cents END),0) FROM customer_account_entries WHERE customer_id=?").bind(cust).fetch_one(&mut **tx).await.map_err(|e|e.to_string())?;
    if amount>balance{return Err("O pagamento não pode ser maior que o saldo em aberto.".into());}
    let payment=id();let desc=optional(v,"description").unwrap_or("Pagamento de caderneta".into());
    exec(tx,"INSERT INTO customer_account_entries(id,customer_id,type,description,amount_cents,status) VALUES (?,?,'PAYMENT',?,?,'PAID')",vec![json!(payment),json!(cust),json!(desc),json!(amount)]).await?;
    let debts=sqlx::query("SELECT d.id,d.amount_cents-COALESCE((SELECT SUM(a.amount_cents) FROM account_payment_allocations a JOIN customer_account_entries p ON p.id=a.payment_id WHERE a.debit_id=d.id AND p.status<>'CANCELLED'),0) remaining FROM customer_account_entries d WHERE d.customer_id=? AND d.type IN ('DEBIT','ADJUSTMENT') AND d.status<>'CANCELLED' ORDER BY d.created_at,d.id").bind(cust).fetch_all(&mut **tx).await.map_err(|e|e.to_string())?;
    let mut left=amount;for d in debts{if left==0{break;}let rem=d.get::<i64,_>("remaining");if rem<=0{continue;}let applied=left.min(rem);let debit=d.get::<String,_>("id");
        exec(tx,"INSERT INTO account_payment_allocations(payment_id,debit_id,amount_cents) VALUES (?,?,?)",vec![json!(payment),json!(debit),json!(applied)]).await?;
        exec(tx,"UPDATE customer_account_entries SET status=? WHERE id=?",vec![json!(if applied==rem{"PAID"}else{"PARTIAL"}),json!(debit)]).await?;left-=applied;
    }
    if left!=0{return Err("Saldo da caderneta inconsistente. Revise os lançamentos.".into());}
    let receipt=id();
    exec(tx,"INSERT INTO cash_transactions(id,cash_session_id,type,payment_method,amount_cents,description) VALUES (?,?,'RECEIPT',?,?,?)",vec![json!(receipt),json!(cash),json!(m),json!(amount),json!(desc)]).await?;
    exec(tx,"INSERT INTO account_payment_receipts(payment_id,receipt_transaction_id) VALUES (?,?)",vec![json!(payment),json!(receipt)]).await?;Ok(Value::Null)
}
async fn refund_receipt(tx:&mut Tx,v:&Value)->Result<Value>{
    let payment=text(v,"paymentId")?;let cust=text(v,"customerId")?;
    let reason=text(v,"reason")?.trim();if reason.is_empty(){return Err("Informe o motivo do estorno.".into());}
    customer(tx,cust,false).await?;
    let row=sqlx::query("SELECT p.amount_cents,p.status,c.type,c.payment_method,c.amount_cents AS receipt_amount FROM customer_account_entries p JOIN account_payment_receipts l ON l.payment_id=p.id JOIN cash_transactions c ON c.id=l.receipt_transaction_id WHERE p.id=? AND p.customer_id=? AND p.type='PAYMENT'")
        .bind(payment).bind(cust).fetch_optional(&mut **tx).await.map_err(|e|e.to_string())?.ok_or("Recebimento sem vínculo financeiro seguro. Revise o histórico antes de corrigir.")?;
    if row.get::<String,_>("status")=="CANCELLED" {return Err("Este recebimento já foi estornado.".into());}
    let amount=row.get::<i64,_>("amount_cents");let m=row.get::<Option<String>,_>("payment_method").ok_or("Forma original ausente.")?;
    if amount<=0 || amount!=row.get::<i64,_>("receipt_amount") || row.get::<String,_>("type")!="RECEIPT" || !["CASH","PIX","DEBIT_CARD","CREDIT_CARD"].contains(&m.as_str()) {return Err("Recebimento inconsistente. Revise o histórico antes de corrigir.".into());}
    let debts=sqlx::query("SELECT d.id,d.customer_id,d.type,d.status,a.amount_cents FROM account_payment_allocations a JOIN customer_account_entries d ON d.id=a.debit_id WHERE a.payment_id=?").bind(payment).fetch_all(&mut **tx).await.map_err(|e|e.to_string())?;
    let mut allocated=0i64;
    for debt in &debts {
        let part=debt.get::<i64,_>("amount_cents");
        if part<=0 || debt.get::<String,_>("customer_id")!=cust || !["DEBIT","ADJUSTMENT"].contains(&debt.get::<String,_>("type").as_str()) || debt.get::<String,_>("status")=="CANCELLED" {return Err("Alocações inconsistentes. Revise a caderneta.".into());}
        allocated=allocated.checked_add(part).ok_or("Alocações fora do limite.")?;
    }
    if allocated!=amount {return Err("Alocações inconsistentes. Revise a caderneta.".into());}
    let cash=open_cash(tx).await?;
    if m=="CASH" && amount>cash_expected(tx,&cash).await? {return Err("Saldo em dinheiro insuficiente para devolver o recebimento. Registre um suprimento no caixa.".into());}
    exec(tx,"UPDATE customer_account_entries SET status='CANCELLED' WHERE id=?",vec![json!(payment)]).await?;
    for debt in debts {
        exec(tx,"UPDATE customer_account_entries SET status=CASE WHEN COALESCE((SELECT SUM(a.amount_cents) FROM account_payment_allocations a JOIN customer_account_entries p ON p.id=a.payment_id WHERE a.debit_id=customer_account_entries.id AND p.status<>'CANCELLED'),0)>=amount_cents THEN 'PAID' WHEN EXISTS(SELECT 1 FROM account_payment_allocations a JOIN customer_account_entries p ON p.id=a.payment_id WHERE a.debit_id=customer_account_entries.id AND p.status<>'CANCELLED') THEN 'PARTIAL' ELSE 'OPEN' END WHERE id=?",vec![json!(debt.get::<String,_>("id"))]).await?;
    }
    let reversal=id();
    exec(tx,"INSERT INTO cash_transactions(id,cash_session_id,type,payment_method,amount_cents,description) VALUES (?,?,'REVERSAL',?,?,?)",vec![json!(reversal),json!(cash),json!(m),json!(amount),json!(format!("Estorno de recebimento {payment}: {reason}"))]).await?;
    exec(tx,"INSERT INTO account_payment_refunds(payment_id,cash_transaction_id,reason) VALUES (?,?,?)",vec![json!(payment),json!(reversal),json!(reason)]).await?;
    Ok(json!({"amountCents":amount,"method":m,"cashSessionId":cash}))
}
async fn product(tx:&mut Tx,v:&Value)->Result<Value>{
    let name=text(v,"name")?.trim();if name.is_empty(){return Err("Informe o nome do produto.".into());}
    let cost=money(v,"costPriceCents",true)?;let counter=money(v,"counterPriceCents",true)?;let delivery=money(v,"deliveryPriceCents",true)?;let minimum=quantity(v,"minimumStock",true)?;
    let existing=optional(v,"id");let p=existing.clone().unwrap_or_else(id);let cat=optional(v,"categoryId");let active=v.get("active").and_then(Value::as_bool).ok_or("Status inválido.")?;
    if existing.is_some(){
        let affected=exec(tx,"UPDATE products SET category_id=?,sku=?,name=?,description=?,cost_price_cents=?,counter_price_cents=?,delivery_price_cents=?,minimum_stock=?,active=?,updated_at=CURRENT_TIMESTAMP WHERE id=?",vec![json!(cat),json!(optional(v,"sku")),json!(name),json!(optional(v,"description")),json!(cost),json!(counter),json!(delivery),json!(minimum),json!(active),json!(p)]).await?;
        if affected!=1{return Err("Produto não encontrado.".into());}
    }else{
        let qty=quantity(v,"stockQuantity",true)?;
        exec(tx,"INSERT INTO products(id,category_id,sku,name,description,cost_price_cents,counter_price_cents,delivery_price_cents,stock_quantity,minimum_stock,active) VALUES (?,?,?,?,?,?,?,?,?,?,?)",vec![json!(p),json!(cat),json!(optional(v,"sku")),json!(name),json!(optional(v,"description")),json!(cost),json!(counter),json!(delivery),json!(qty),json!(minimum),json!(active)]).await?;
        if qty>0.0 {exec(tx,"INSERT INTO inventory_movements(id,product_id,type,quantity,reason) VALUES (?,?,'MANUAL_ENTRY',?,'Estoque inicial do cadastro')",vec![json!(id()),json!(p),json!(qty)]).await?;}
    }Ok(json!(p))
}

#[cfg(test)]
#[path = "domain_tests.rs"]
mod tests;
