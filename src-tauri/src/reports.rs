//! Read-only reporting uses one SQLite transaction so sections share a snapshot.
use super::*;
use std::path::Path;

#[derive(Deserialize,Serialize,Clone)]
#[serde(rename_all="camelCase",deny_unknown_fields)]
pub struct Period {pub start:String,pub end:String}
impl Period {
    pub fn validate(&self)->Result<()> {
        for date in [&self.start,&self.end] {if date.len()!=10 || !chrono::NaiveDate::parse_from_str(date,"%Y-%m-%d").is_ok_and(|parsed|parsed.format("%Y-%m-%d").to_string()==date.as_str()){return Err("Informe datas válidas para o relatório.".into());}}
        if self.start>self.end {return Err("A data inicial deve ser anterior ou igual à data final.".into());}Ok(())
    }
}
#[derive(Serialize,Clone)]
#[serde(rename_all="camelCase")]
pub struct Report {
    pub start:String,pub end:String,pub generated_at:String,pub generated_at_local:String,pub sales:Value,pub cash:Value,
    pub methods:Vec<Value>,pub products:Vec<Value>,pub expenses:Vec<Value>,pub movements:Vec<Value>,
    pub closings:Vec<Value>,pub accounts:Vec<Value>,pub stock:Vec<Value>,
}
async fn rows(tx:&mut Tx,sql:&str,p:&Period)->Result<Vec<sqlx::sqlite::SqliteRow>> {
    sqlx::query(sql).bind(&p.start).bind(&p.end).fetch_all(&mut **tx).await.map_err(|e|e.to_string())
}
fn string(r:&sqlx::sqlite::SqliteRow,key:&str)->Option<String>{r.get::<Option<String>,_>(key)}

pub async fn read(pool:&SqlitePool,p:Period)->Result<Report> {
    p.validate()?;
    let mut tx=pool.begin().await.map_err(|e|e.to_string())?;
    // Read a database row first, establishing the snapshot before all other sections.
    let clock=sqlx::query("SELECT strftime('%Y-%m-%dT%H:%M:%SZ','now') utc,strftime('%d/%m/%Y %H:%M:%S','now','localtime') local FROM (SELECT COUNT(*) FROM sales)").fetch_one(&mut *tx).await.map_err(|e|e.to_string())?;
    let generated:String=clock.get("utc");let generated_local:String=clock.get("local");
    let r=rows(&mut tx,"SELECT COUNT(*) count,COALESCE(SUM(subtotal_cents),0) gross,COALESCE(SUM(discount_cents),0) discounts,COALESCE(SUM(total_cents),0) sold FROM sales WHERE completed_at IS NOT NULL AND date(completed_at,'localtime') BETWEEN ? AND ?",&p).await?.remove(0);
    let c=rows(&mut tx,"SELECT COUNT(*) count,COALESCE(SUM(total_cents),0) cancelled FROM sales WHERE status='CANCELLED' AND date(cancelled_at,'localtime') BETWEEN ? AND ?",&p).await?.remove(0);
    let sold=r.get::<i64,_>("sold");let cancelled=c.get::<i64,_>("cancelled");
    let sales=json!({"count":r.get::<i64,_>("count"),"grossCents":r.get::<i64,_>("gross"),"discountCents":r.get::<i64,_>("discounts"),"soldCents":sold,"cancelledCount":c.get::<i64,_>("count"),"cancelledCents":cancelled,"netCents":sold-cancelled});
    // Sale/payment sections use the canonical sale completion/cancellation dates.
    // Receipt/expense returns use their actual incoming/outgoing cash event dates.
    let methods=rows(&mut tx,r#"WITH range(start,end) AS (VALUES (?,?)), events AS (
        SELECT method,amount_cents sale,0 sale_refund,0 receipt,0 receipt_refund,0 expense,0 expense_refund FROM payments p JOIN sales s ON s.id=p.sale_id,range WHERE date(s.completed_at,'localtime') BETWEEN start AND end
        UNION ALL SELECT method,0,amount_cents,0,0,0,0 FROM payments p JOIN sales s ON s.id=p.sale_id,range WHERE s.status='CANCELLED' AND date(s.cancelled_at,'localtime') BETWEEN start AND end
        UNION ALL SELECT COALESCE(payment_method,'UNKNOWN'),0,0,amount_cents,0,0,0 FROM cash_transactions,range WHERE type='RECEIPT' AND date(created_at,'localtime') BETWEEN start AND end
        UNION ALL SELECT COALESCE(t.payment_method,'UNKNOWN'),0,0,0,t.amount_cents,0,0 FROM cash_transactions t JOIN account_payment_refunds r ON r.cash_transaction_id=t.id,range WHERE date(t.created_at,'localtime') BETWEEN start AND end
        UNION ALL SELECT COALESCE(payment_method,'CASH'),0,0,0,0,amount_cents,0 FROM cash_transactions,range WHERE type='EXPENSE' AND date(created_at,'localtime') BETWEEN start AND end
        UNION ALL SELECT COALESCE(t.payment_method,'CASH'),0,0,0,0,0,t.amount_cents FROM cash_transactions t JOIN expense_refunds r ON r.cash_transaction_id=t.id,range WHERE date(t.created_at,'localtime') BETWEEN start AND end
    ) SELECT method,SUM(sale) sale,SUM(sale_refund) sale_refund,SUM(receipt) receipt,SUM(receipt_refund) receipt_refund,SUM(expense) expense,SUM(expense_refund) expense_refund FROM events GROUP BY method ORDER BY method"#,&p).await?.into_iter().map(|r|json!({"method":r.get::<String,_>("method"),"salesCents":r.get::<i64,_>("sale"),"saleRefundCents":r.get::<i64,_>("sale_refund"),"receiptsCents":r.get::<i64,_>("receipt"),"receiptRefundCents":r.get::<i64,_>("receipt_refund"),"expensesCents":r.get::<i64,_>("expense"),"expenseRefundCents":r.get::<i64,_>("expense_refund")})).collect();
    let products=rows(&mut tx,r#"WITH range(start,end) AS (VALUES (?,?)), events AS (
        SELECT i.product_id id,i.product_name_snapshot name,i.quantity sold_quantity,0.0 cancelled_quantity,i.total_cents sold,0 cancelled FROM sale_items i JOIN sales s ON s.id=i.sale_id,range WHERE date(s.completed_at,'localtime') BETWEEN start AND end
        UNION ALL SELECT i.product_id,i.product_name_snapshot,0.0,i.quantity,0,i.total_cents FROM sale_items i JOIN sales s ON s.id=i.sale_id,range WHERE s.status='CANCELLED' AND date(s.cancelled_at,'localtime') BETWEEN start AND end
    ) SELECT id,name,ROUND(SUM(sold_quantity),2) sold_quantity,ROUND(SUM(cancelled_quantity),2) cancelled_quantity,SUM(sold) sold,SUM(cancelled) cancelled FROM events GROUP BY id,name ORDER BY name,id"#,&p).await?.into_iter().map(|r|json!({"id":r.get::<String,_>("id"),"name":r.get::<String,_>("name"),"soldQuantity":r.get::<f64,_>("sold_quantity"),"cancelledQuantity":r.get::<f64,_>("cancelled_quantity"),"grossCents":r.get::<i64,_>("sold"),"cancelledGrossCents":r.get::<i64,_>("cancelled")})).collect();
    let expenses=rows(&mut tx,r#"WITH range(start,end) AS (VALUES (?,?)), events AS (
        SELECT e.category,e.supplier_id,COALESCE(e.supplier_name_snapshot,'Sem fornecedor') supplier,t.amount_cents paid,0 refunded FROM expenses e JOIN cash_transactions t ON t.id=e.cash_transaction_id,range WHERE date(t.created_at,'localtime') BETWEEN start AND end
        UNION ALL SELECT e.category,e.supplier_id,COALESCE(e.supplier_name_snapshot,'Sem fornecedor'),0,t.amount_cents FROM expense_refunds r JOIN expenses e ON e.id=r.expense_id JOIN cash_transactions t ON t.id=r.cash_transaction_id,range WHERE date(t.created_at,'localtime') BETWEEN start AND end
    ) SELECT category,supplier_id,supplier,SUM(paid) paid,SUM(refunded) refunded FROM events GROUP BY category,supplier_id,supplier ORDER BY category,supplier,supplier_id"#,&p).await?.into_iter().map(|r|json!({"category":r.get::<String,_>("category"),"supplierId":string(&r,"supplier_id"),"supplier":r.get::<String,_>("supplier"),"paidCents":r.get::<i64,_>("paid"),"refundedCents":r.get::<i64,_>("refunded")})).collect();
    let movements:Vec<Value>=rows(&mut tx,r#"SELECT t.id,t.cash_session_id,t.amount_cents,t.description,strftime('%d/%m/%Y %H:%M:%S',t.created_at,'localtime') date,
        COALESCE(t.payment_method,CASE WHEN t.type IN ('SUPPLY','WITHDRAWAL','EXPENSE') THEN 'CASH' ELSE 'UNKNOWN' END) method,
        CASE WHEN er.expense_id IS NOT NULL THEN 'EXPENSE_REFUND' WHEN ar.payment_id IS NOT NULL THEN 'RECEIPT_REFUND' WHEN t.type='REVERSAL' AND t.sale_id IS NOT NULL THEN 'SALE_REFUND' WHEN t.type='REVERSAL' THEN 'UNKNOWN_REFUND' ELSE t.type END kind,
        CASE WHEN t.type IN ('SALE','RECEIPT') AND t.payment_method='CASH' THEN t.amount_cents WHEN t.type='SUPPLY' AND (t.payment_method IS NULL OR t.payment_method='CASH') THEN t.amount_cents WHEN t.type='WITHDRAWAL' THEN -t.amount_cents WHEN t.type='EXPENSE' AND (t.payment_method IS NULL OR t.payment_method='CASH') THEN -t.amount_cents WHEN t.type='REVERSAL' AND t.payment_method='CASH' THEN -t.amount_cents ELSE 0 END cash_delta,
        COALESCE(e.category,re.category) category,COALESCE(e.supplier_name_snapshot,re.supplier_name_snapshot) supplier,s.sale_number
        FROM cash_transactions t LEFT JOIN expense_refunds er ON er.cash_transaction_id=t.id LEFT JOIN account_payment_refunds ar ON ar.cash_transaction_id=t.id
        LEFT JOIN expenses e ON e.cash_transaction_id=t.id LEFT JOIN expenses re ON re.id=er.expense_id LEFT JOIN sales s ON s.id=t.sale_id
        WHERE date(t.created_at,'localtime') BETWEEN ? AND ? ORDER BY t.created_at,t.id"#,&p).await?.into_iter().map(|r|json!({"id":r.get::<String,_>("id"),"sessionId":r.get::<String,_>("cash_session_id"),"date":string(&r,"date"),"kind":r.get::<String,_>("kind"),"method":r.get::<String,_>("method"),"amountCents":r.get::<i64,_>("amount_cents"),"cashDeltaCents":r.get::<i64,_>("cash_delta"),"description":string(&r,"description"),"category":string(&r,"category"),"supplier":string(&r,"supplier"),"saleNumber":r.get::<Option<i64>,_>("sale_number")})).collect();
    let closings:Vec<Value>=rows(&mut tx,"SELECT id,opening_balance_cents,closing_expected_cents,closing_informed_cents,notes,strftime('%d/%m/%Y %H:%M:%S',opened_at,'localtime') opened,strftime('%d/%m/%Y %H:%M:%S',closed_at,'localtime') closed FROM cash_sessions WHERE status='CLOSED' AND date(closed_at,'localtime') BETWEEN ? AND ? ORDER BY closed_at,id",&p).await?.into_iter().map(|r|json!({"id":r.get::<String,_>("id"),"openingCents":r.get::<i64,_>("opening_balance_cents"),"expectedCents":r.get::<Option<i64>,_>("closing_expected_cents"),"informedCents":r.get::<Option<i64>,_>("closing_informed_cents"),"openedAt":string(&r,"opened"),"closedAt":string(&r,"closed"),"notes":string(&r,"notes")})).collect();
    let opening=rows(&mut tx,"SELECT COALESCE(SUM(opening_balance_cents),0) total FROM cash_sessions WHERE date(opened_at,'localtime') BETWEEN ? AND ?",&p).await?.remove(0).get::<i64,_>("total");
    let mut incoming=0i64;let mut outgoing=0i64;let mut supplies=0i64;let mut withdrawals=0i64;let mut unknown=0i64;
    for m in &movements {let delta=m["cashDeltaCents"].as_i64().ok_or("Movimento inválido no relatório.")?;if delta>0{incoming+=delta;}else{outgoing-=delta;}
        let amount=m["amountCents"].as_i64().ok_or("Valor inválido no relatório.")?;match m["kind"].as_str(){Some("SUPPLY")=>supplies+=amount,Some("WITHDRAWAL")=>withdrawals+=amount,Some("UNKNOWN_REFUND")=>unknown+=amount,_=>{}}
    }
    let difference=closings.iter().filter_map(|c|Some(c["informedCents"].as_i64()? - c["expectedCents"].as_i64()?)).sum::<i64>();
    let cash=json!({"inCents":incoming,"outCents":outgoing,"netCents":incoming-outgoing,"openingCents":opening,"suppliesCents":supplies,"withdrawalsCents":withdrawals,"unknownRefundCents":unknown,"closingDifferenceCents":difference});
    let accounts=sqlx::query("SELECT c.id,c.name,c.active,COALESCE(SUM(CASE WHEN a.status='CANCELLED' THEN 0 WHEN a.type='PAYMENT' THEN -a.amount_cents ELSE a.amount_cents END),0) balance FROM customers c LEFT JOIN customer_account_entries a ON a.customer_id=c.id GROUP BY c.id,c.name,c.active HAVING balance<>0 ORDER BY c.name,c.id").fetch_all(&mut *tx).await.map_err(|e|e.to_string())?.into_iter().map(|r|json!({"id":r.get::<String,_>("id"),"name":r.get::<String,_>("name"),"active":r.get::<i64,_>("active")==1,"balanceCents":r.get::<i64,_>("balance")})).collect();
    let stock=sqlx::query("SELECT id,name,stock_quantity,minimum_stock,active FROM products ORDER BY name,id").fetch_all(&mut *tx).await.map_err(|e|e.to_string())?.into_iter().map(|r|json!({"id":r.get::<String,_>("id"),"name":r.get::<String,_>("name"),"quantity":r.get::<f64,_>("stock_quantity"),"minimum":r.get::<f64,_>("minimum_stock"),"active":r.get::<i64,_>("active")==1})).collect();
    tx.commit().await.map_err(|e|e.to_string())?;
    Ok(Report{start:p.start,end:p.end,generated_at:generated,generated_at_local:generated_local,sales,cash,methods,products,expenses,movements,closings,accounts,stock})
}

pub fn money(cents:i64)->String {let value=cents.unsigned_abs();format!("{}{},{:02}",if cents<0{"-"}else{""},value/100,value%100)}
fn numeric(row:&Value,key:&str)->Result<i64>{row[key].as_i64().ok_or_else(||format!("Campo inválido no relatório: {key}"))}
fn text_value(row:&Value,key:&str)->String{row[key].as_str().unwrap_or("").to_owned()}
fn qty(value:f64)->String{format!("{value:.2}").replace('.',",")}
fn quote(value:&str,number:bool)->String {
    let first=value.trim_start_matches(|c:char|c.is_whitespace()||c.is_control()).chars().next();
    let dangerous=!number && (first.is_some_and(|c|['=','+','-','@'].contains(&c)) || value.chars().next().is_some_and(|c|['\t','\r','\n'].contains(&c)));
    format!("\"{}{}\"",if dangerous{"'"}else{""},value.replace('"',"\"\""))
}
fn record(out:&mut String,section:&str,date:&str,id:&str,description:&str,group:&str,metric:&str,amount:Option<i64>,quantity:Option<f64>,status:&str) {
    let fields=[section.to_owned(),date.to_owned(),id.to_owned(),description.to_owned(),group.to_owned(),metric.to_owned(),amount.map(money).unwrap_or_default(),quantity.map(qty).unwrap_or_default(),status.to_owned()];
    out.push_str(&fields.iter().enumerate().map(|(i,f)|quote(f,i==6||i==7)).collect::<Vec<_>>().join(";"));out.push_str("\r\n");
}
pub fn csv(r:&Report)->Result<String> {
    let mut out="\u{feff}\"Seção\";\"Data local\";\"Identificador\";\"Descrição\";\"Forma / categoria\";\"Indicador\";\"Valor (R$)\";\"Quantidade\";\"Situação\"\r\n".to_owned();
    let period=format!("{} a {}",chrono::NaiveDate::parse_from_str(&r.start,"%Y-%m-%d").map_err(|e|e.to_string())?.format("%d/%m/%Y"),chrono::NaiveDate::parse_from_str(&r.end,"%Y-%m-%d").map_err(|e|e.to_string())?.format("%d/%m/%Y"));record(&mut out,"Consulta","", "",&format!("Gerado em {} (UTC)",r.generated_at),"",&period,None,None,"");
    for (key,label) in [("grossCents","Vendas brutas"),("discountCents","Descontos"),("soldCents","Vendas após descontos"),("cancelledCents","Cancelamentos no período"),("netCents","Vendas líquidas no período")] {record(&mut out,"Vendas",&period,"","","",label,Some(numeric(&r.sales,key)?),None,"");}
    record(&mut out,"Vendas",&period,"","","","Vendas finalizadas",None,Some(numeric(&r.sales,"count")? as f64),"");record(&mut out,"Vendas",&period,"","","","Vendas canceladas",None,Some(numeric(&r.sales,"cancelledCount")? as f64),"");
    for m in &r.methods {for (key,label) in [("salesCents","Vendas"),("saleRefundCents","Estornos de vendas"),("receiptsCents","Recebimentos de caderneta"),("receiptRefundCents","Devoluções de caderneta"),("expensesCents","Despesas"),("expenseRefundCents","Devoluções de despesas")] {record(&mut out,"Formas",&period,"","",&text_value(m,"method"),label,Some(numeric(m,key)?),None,"");}}
    for p in &r.products {for (key,quantity,label) in [("grossCents","soldQuantity","Itens vendidos antes dos descontos"),("cancelledGrossCents","cancelledQuantity","Itens de vendas canceladas")] {record(&mut out,"Produtos",&period,&text_value(p,"id"),&text_value(p,"name"),"",label,Some(numeric(p,key)?),Some(p[quantity].as_f64().ok_or("Quantidade inválida no relatório.")?),"");}}
    for e in &r.expenses {for (key,label) in [("paidCents","Pagamentos"),("refundedCents","Devoluções")] {record(&mut out,"Despesas",&period,e["supplierId"].as_str().unwrap_or(""),&text_value(e,"supplier"),&text_value(e,"category"),label,Some(numeric(e,key)?),None,"");}record(&mut out,"Despesas",&period,e["supplierId"].as_str().unwrap_or(""),&text_value(e,"supplier"),&text_value(e,"category"),"Líquido",Some(numeric(e,"paidCents")?-numeric(e,"refundedCents")?),None,"");}
    for (key,label) in [("inCents","Entradas em dinheiro"),("outCents","Saídas em dinheiro"),("netCents","Movimento líquido em dinheiro"),("openingCents","Fundos de abertura"),("suppliesCents","Suprimentos"),("withdrawalsCents","Sangrias"),("unknownRefundCents","Estornos sem vínculo"),("closingDifferenceCents","Diferenças de fechamento")] {record(&mut out,"Caixa",&period,"","","",label,Some(numeric(&r.cash,key)?),None,"");}
    for m in &r.movements {record(&mut out,"Movimentos",&text_value(m,"date"),&text_value(m,"id"),&text_value(m,"description"),&text_value(m,"method"),&text_value(m,"kind"),Some(numeric(m,"amountCents")?),None,"");record(&mut out,"Movimentos",&text_value(m,"date"),&text_value(m,"id"),&text_value(m,"description"),&text_value(m,"method"),"Variação física em dinheiro",Some(numeric(m,"cashDeltaCents")?),None,"");}
    for c in &r.closings {for (key,label) in [("expectedCents","Esperado"),("informedCents","Informado")] {record(&mut out,"Fechamentos",&text_value(c,"closedAt"),&text_value(c,"id"),&text_value(c,"notes"),"",label,c[key].as_i64(),None,"Fechado");}if let (Some(informed),Some(expected))=(c["informedCents"].as_i64(),c["expectedCents"].as_i64()){record(&mut out,"Fechamentos",&text_value(c,"closedAt"),&text_value(c,"id"),&text_value(c,"notes"),"","Diferença",Some(informed-expected),None,"Fechado");}}
    for a in &r.accounts {record(&mut out,"Caderneta atual",&r.generated_at_local,&text_value(a,"id"),&text_value(a,"name"),"","Saldo atual",Some(numeric(a,"balanceCents")?),None,if a["active"]==true{"Ativo"}else{"Inativo"});}
    for p in &r.stock {record(&mut out,"Estoque atual",&r.generated_at_local,&text_value(p,"id"),&text_value(p,"name"),"","Quantidade atual",None,Some(p["quantity"].as_f64().ok_or("Estoque inválido no relatório.")?),if p["active"]==true{"Ativo"}else{"Inativo"});record(&mut out,"Estoque atual",&r.generated_at_local,&text_value(p,"id"),&text_value(p,"name"),"","Estoque mínimo",None,Some(p["minimum"].as_f64().ok_or("Estoque mínimo inválido.")?),"");}
    Ok(out)
}
/// Never truncate an existing export; clean only a file created by this attempt.
pub fn save_csv_new(path:&Path,contents:&str)->Result<()> {
    use std::io::Write;
    let mut file=std::fs::OpenOptions::new().write(true).create_new(true).open(path).map_err(|e|format!("Não foi possível criar o CSV. Escolha um arquivo novo: {e}"))?;
    let result=file.write_all(contents.as_bytes()).and_then(|_|file.sync_all());drop(file);
    if let Err(e)=result {let _=std::fs::remove_file(path);return Err(format!("Não foi possível salvar o CSV: {e}"));}Ok(())
}
