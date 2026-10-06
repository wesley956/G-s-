//! Paid expenses and their incoming refunds share the operation transaction.
use super::*;

#[derive(Deserialize)]
#[serde(rename_all="camelCase",deny_unknown_fields)]
struct Input {
    session_id:String, description:String, category:String, amount_cents:i64,
    method:String, supplier_id:Option<String>, notes:Option<String>,
}
fn field(value:&str,label:&str,max:usize,required:bool)->Result<String> {
    let value=value.trim();
    if (required && value.is_empty()) || value.chars().count()>max || value.chars().any(|c|c.is_control() && !['\n','\r','\t'].contains(&c)) {
        return Err(format!("Informe {label} válido, com até {max} caracteres."));
    }
    Ok(value.to_owned())
}
async fn insert(tx:&mut Tx,session:&str,description:&str,category:&str,amount:i64,payment:&str,supplier:Option<String>,supplier_name:Option<String>,notes:Option<String>,origin:&str)->Result<Value> {
    let expense=id();let movement=id();
    exec(tx,"INSERT INTO cash_transactions(id,cash_session_id,type,payment_method,amount_cents,description) VALUES (?,?,'EXPENSE',?,?,?)",vec![json!(movement),json!(session),json!(payment),json!(amount),json!(description)]).await?;
    exec(tx,"INSERT INTO expenses(id,cash_transaction_id,category,supplier_id,supplier_name_snapshot,notes,origin) VALUES (?,?,?,?,?,?,?)",vec![json!(expense),json!(movement),json!(category),json!(supplier),json!(supplier_name),json!(notes),json!(origin)]).await?;
    Ok(json!(expense))
}
pub(super) async fn save(tx:&mut Tx,v:&Value)->Result<Value> {
    let input:Input=serde_json::from_value(v.clone()).map_err(|_|"Dados da despesa inválidos.".to_string())?;
    require_cash(tx,&input.session_id).await?;
    let description=field(&input.description,"uma descrição",240,true)?;
    let category=field(&input.category,"uma categoria",80,true)?;
    let amount=money(v,"amountCents",false)?;let payment=method(v,false)?;
    // The deserialized amount is intentionally checked through the shared money rules.
    debug_assert_eq!(amount,input.amount_cents);debug_assert_eq!(payment,input.method);
    let notes=field(input.notes.as_deref().unwrap_or(""),"observações",4000,false)?;
    let supplier=input.supplier_id.filter(|s|!s.is_empty());
    let supplier_name=if let Some(supplier)=&supplier {
        Some(sqlx::query_scalar::<_,String>("SELECT name FROM suppliers WHERE id=? AND active=1").bind(supplier).fetch_optional(&mut **tx).await.map_err(|e|e.to_string())?.ok_or("Fornecedor não encontrado ou inativo. Escolha um fornecedor ativo.")?)
    } else {None};
    if payment=="CASH" && amount>cash_expected(tx,&input.session_id).await? {return Err("Saldo em dinheiro insuficiente.".into());}
    insert(tx,&input.session_id,&description,&category,amount,&payment,supplier,supplier_name,if notes.is_empty(){None}else{Some(notes)},"MODULE").await
}
pub(super) async fn legacy(tx:&mut Tx,session:&str,amount:i64,description:Option<String>)->Result<Value> {
    insert(tx,session,description.as_deref().unwrap_or("Despesa avulsa"),"Outras",amount,"CASH",None,None,None,"LEGACY").await?;
    Ok(Value::Null)
}
#[derive(Deserialize)]
#[serde(rename_all="camelCase",deny_unknown_fields)]
struct Refund { expense_id:String, session_id:String, reason:String }
pub(super) async fn refund(tx:&mut Tx,v:&Value)->Result<Value> {
    let input:Refund=serde_json::from_value(v.clone()).map_err(|_|"Dados do cancelamento inválidos.".to_string())?;
    let reason=field(&input.reason,"um motivo",1000,true)?;
    require_cash(tx,&input.session_id).await?;
    let row=sqlx::query("SELECT t.amount_cents,COALESCE(t.payment_method,'CASH') method,t.type,t.description FROM expenses e JOIN cash_transactions t ON t.id=e.cash_transaction_id WHERE e.id=?").bind(&input.expense_id).fetch_optional(&mut **tx).await.map_err(|e|e.to_string())?.ok_or("Despesa não encontrada.")?;
    if sqlx::query_scalar::<_,i64>("SELECT COUNT(*) FROM expense_refunds WHERE expense_id=?").bind(&input.expense_id).fetch_one(&mut **tx).await.map_err(|e|e.to_string())?>0 {return Err("Esta despesa já foi cancelada. Recarregue a lista.".into());}
    let amount=row.get::<i64,_>("amount_cents");let payment=row.get::<String,_>("method");
    if row.get::<String,_>("type")!="EXPENSE" || amount<=0 || amount>1_000_000_000_000 || !["CASH","PIX","DEBIT_CARD","CREDIT_CARD"].contains(&payment.as_str()) {return Err("O histórico desta despesa precisa de revisão antes do cancelamento.".into());}
    let movement=id();
    // SUPPLY is an incoming movement. Its link distinguishes expense refunds from supplies.
    exec(tx,"INSERT INTO cash_transactions(id,cash_session_id,type,payment_method,amount_cents,description) VALUES (?,?,'SUPPLY',?,?,?)",vec![json!(movement),json!(input.session_id),json!(payment),json!(amount),json!(format!("Devolução de despesa: {} — {reason}",row.get::<Option<String>,_>("description").unwrap_or_default()))]).await?;
    exec(tx,"INSERT INTO expense_refunds(expense_id,cash_transaction_id,reason) VALUES (?,?,?)",vec![json!(input.expense_id),json!(movement),json!(reason)]).await?;
    Ok(Value::Null)
}
