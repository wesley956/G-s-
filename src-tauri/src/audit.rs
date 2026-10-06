//! Read-only confirmed-operation history; never replays or rewrites the replay source.
use super::*;

pub const KINDS:&[&str]=&["SALE","CANCEL_SALE","STOCK","RECEIVE","REFUND_RECEIPT","EXPENSE","REFUND_EXPENSE","OPEN_CASH","CASH_MOVE","CLOSE_CASH","DEBIT","PRODUCT","SUPPLIER","SUPPLIER_ACTIVE","CATEGORY","UNKNOWN"];
#[derive(Deserialize,Serialize,Clone)]
#[serde(rename_all="camelCase",deny_unknown_fields)]
pub struct Query {pub start:String,pub end:String,pub kind:Option<String>,pub search:String,pub page:u32,pub anchor:Option<i64>}
#[derive(Serialize)]
#[serde(rename_all="camelCase")]
pub struct Page {pub query:Query,pub generated_at_local:String,pub total:i64,pub page_count:i64,pub items:Vec<Value>}
const KIND_SQL:&str="CASE WHEN json_valid(request_json) THEN CASE WHEN json_type(request_json,'$.kind')='text' THEN json_extract(request_json,'$.kind') ELSE 'UNKNOWN' END ELSE 'UNKNOWN' END";
// Percent-encode IDs from legacy databases before using them as route segments.
fn route_id(value:&str)->String {value.bytes().map(|b|if b.is_ascii_alphanumeric() || b"-._~".contains(&b){(b as char).to_string()}else{format!("%{b:02X}")}).collect()}
fn display_method(value:&str)->&str {match value {"CASH"=>"Dinheiro","PIX"=>"PIX","DEBIT_CARD"=>"Débito","CREDIT_CARD"=>"Crédito","CREDIT_CUSTOMER"=>"Fiado / caderneta",_=>"Não identificada"}}
fn label(kind:&str)->&str {match kind {
 "SALE"=>"Venda confirmada","CANCEL_SALE"=>"Cancelamento de venda","STOCK"=>"Movimento de estoque","RECEIVE"=>"Recebimento de caderneta","REFUND_RECEIPT"=>"Devolução de caderneta","EXPENSE"=>"Despesa paga","REFUND_EXPENSE"=>"Devolução de despesa","OPEN_CASH"=>"Abertura de caixa","CASH_MOVE"=>"Movimento de caixa","CLOSE_CASH"=>"Fechamento de caixa","DEBIT"=>"Débito manual","PRODUCT"=>"Cadastro / edição de produto","SUPPLIER"=>"Cadastro / edição de fornecedor","SUPPLIER_ACTIVE"=>"Situação do fornecedor","CATEGORY"=>"Cadastro de categoria",_=>"Operação antiga ou desconhecida"}}
fn field(fields:&mut Vec<Value>,name:&str,value:String) {if !value.trim().is_empty(){fields.push(json!({"label":name,"value":value}));}}
fn named(fields:&mut Vec<Value>,data:&Value,key:&str,name:&str) {if let Some(value)=data[key].as_str(){field(fields,name,value.trim().to_owned());}}
fn amount(fields:&mut Vec<Value>,data:&Value,key:&str,name:&str) {if let Some(value)=data[key].as_i64(){field(fields,name,format!("R$ {}",reports::money(value)));}}
fn numeric(fields:&mut Vec<Value>,data:&Value,key:&str,name:&str) {if let Some(value)=data[key].as_f64(){field(fields,name,format!("{value:.2}").replace('.',","));}}

async fn detail(tx:&mut Tx,row:sqlx::sqlite::SqliteRow)->Result<Value> {
 let id:String=row.get("id");let kind:String=row.get("kind");
 let request=serde_json::from_str::<Value>(&row.get::<String,_>("request_json"));
 let result=serde_json::from_str::<Value>(&row.get::<String,_>("result_json"));
 let valid=request.as_ref().is_ok_and(|v|v["data"].is_object()) && result.is_ok() && KINDS.contains(&kind.as_str()) && kind!="UNKNOWN";
 let request=request.unwrap_or(Value::Null);let data=&request["data"];let result=result.unwrap_or(Value::Null);
 let mut fields=vec![];let mut references=vec![];let mut warning=if valid{None}else{Some("Registro antigo, desconhecido ou incompleto. Os dados disponíveis são mostrados sem reconstruir valores ausentes.".to_owned())};
 if valid {
  for (key,name) in [("name","Nome informado"),("description","Descrição"),("reason","Motivo"),("notes","Observações"),("category","Categoria"),("dueDate","Vencimento informado"),("contactName","Contato"),("sku","Código"),("phone","Telefone"),("document","Documento"),("email","E-mail"),("address","Endereço"),("whatsapp","WhatsApp")] {named(&mut fields,data,key,name);}
  for (key,name) in [("amountCents","Valor"),("informedCents","Valor contado"),("discountCents","Desconto informado"),("costPriceCents","Preço de custo informado"),("counterPriceCents","Preço de portaria informado"),("deliveryPriceCents","Preço de entrega informado")] {amount(&mut fields,data,key,name);}
  for (key,name) in [("quantity","Quantidade informada"),("targetQuantity","Quantidade alvo"),("stockQuantity","Estoque inicial informado"),("minimumStock","Estoque mínimo informado")] {numeric(&mut fields,data,key,name);}
  for (key,name) in [("previousQuantity","Quantidade anterior"),("newQuantity","Quantidade após operação"),("delta","Variação")] {numeric(&mut fields,&result,key,name);}
  for (key,name) in [("totalCents","Total confirmado"),("expectedCents","Esperado no fechamento"),("differenceCents","Diferença no fechamento")] {amount(&mut fields,&result,key,name);}
  if data["amountCents"].is_null(){amount(&mut fields,&result,"amountCents","Valor confirmado");}
  if let Some(m)=data["method"].as_str().or_else(||result["method"].as_str()){field(&mut fields,"Forma original",display_method(m).into());}
  if let Some(active)=data["active"].as_bool(){field(&mut fields,"Situação informada",if active{"Ativo"}else{"Inativo"}.into());}
  if let Some(action)=data["action"].as_str(){field(&mut fields,"Movimento",match action{"ENTRY"=>"Entrada","EXIT"=>"Saída","RETURN"=>"Devolução física","LOSS"=>"Perda","ADJUSTMENT"=>"Ajuste",_=>action}.into());}
  if let Some(typ)=data["type"].as_str(){field(&mut fields,"Movimento",match typ{"SUPPLY"=>"Suprimento","WITHDRAWAL"=>"Sangria","EXPENSE"=>"Despesa avulsa",_=>typ}.into());}
  if let Some(typ)=data["saleType"].as_str(){field(&mut fields,"Tipo de venda",if typ=="DELIVERY"{"Entrega"}else{"Portaria"}.into());}
  if let Some(payments)=data["payments"].as_array(){for p in payments {if let (Some(m),Some(value))=(p["method"].as_str(),p["amountCents"].as_i64()){field(&mut fields,"Parcela",format!("{} · R$ {}",display_method(m),reports::money(value)));}}}
  let sale_id=data["saleId"].as_str().or_else(||result["saleId"].as_str());
  if let Some(sale_id)=sale_id {
   if let Some(s)=sqlx::query("SELECT s.sale_number,s.total_cents,r.snapshot_json receipt_snapshot_json FROM sales s LEFT JOIN sale_receipt_snapshots r ON r.sale_id=s.id WHERE s.id=?").bind(sale_id).fetch_optional(&mut **tx).await.map_err(|e|e.to_string())? {
    let number=s.get::<i64,_>("sale_number");references.push(json!({"id":sale_id,"label":format!("Venda #{number}"),"route":"/sales","linkLabel":"Histórico de vendas"}));
    if kind=="CANCEL_SALE"{field(&mut fields,"Valor da venda",format!("R$ {}",reports::money(s.get("total_cents"))));}
    if let Some(snapshot)=s.get::<Option<String>,_>("receipt_snapshot_json").and_then(|s|serde_json::from_str::<Value>(&s).ok()){named(&mut fields,&snapshot["customer"],"name","Cliente registrado na venda");}
    let items=sqlx::query("SELECT product_name_snapshot,quantity FROM sale_items WHERE sale_id=? ORDER BY rowid").bind(sale_id).fetch_all(&mut **tx).await.map_err(|e|e.to_string())?;
    for item in items {field(&mut fields,"Item registrado na venda",format!("{} · {}",item.get::<String,_>("product_name_snapshot"),format!("{:.2}",item.get::<f64,_>("quantity")).replace('.',",")));}
   } else {field(&mut fields,"Venda referenciada",sale_id.into());warning=Some("A venda referenciada não está disponível neste banco.".into());}
  }
  for (key,table,route,name) in [("customerId","customers","/accounts/","Caderneta atual"),("productId","products","/products/","Produto atual"),("supplierId","suppliers","/suppliers/","Fornecedor atual")] {
   if let Some(value)=data[key].as_str(){field(&mut fields,"Identificador relacionado",value.into());
    let exists=sqlx::query_scalar::<_,i64>(&format!("SELECT COUNT(*) FROM {table} WHERE id=?")).bind(value).fetch_one(&mut **tx).await.map_err(|e|e.to_string())?>0;
    if exists {let suffix=if table=="customers"{""}else{"/edit"};references.push(json!({"id":value,"label":value,"route":format!("{route}{}{suffix}",route_id(value)),"linkLabel":name}));}
   }
  }
  if ["PRODUCT","SUPPLIER","SUPPLIER_ACTIVE"].contains(&kind.as_str()) {
   if let Some(value)=result.as_str().or_else(||data["id"].as_str()) {
    let (table,route,name)=if kind=="PRODUCT"{("products","products","Produto atual")}else{("suppliers","suppliers","Fornecedor atual")};
    field(&mut fields,"Identificador relacionado",value.into());
    if sqlx::query_scalar::<_,i64>(&format!("SELECT COUNT(*) FROM {table} WHERE id=?")).bind(value).fetch_one(&mut **tx).await.map_err(|e|e.to_string())?>0 {references.push(json!({"id":value,"label":value,"route":format!("/{route}/{}/edit",route_id(value)),"linkLabel":name}));}
   }
  }
  if kind=="OPEN_CASH" {if let Some(value)=result.as_str(){field(&mut fields,"Caixa aberto",value.into());references.push(json!({"id":value,"label":"Caixa relacionado","route":"/cash","linkLabel":"Histórico de caixa"}));}}
  if kind=="CATEGORY" {if let Some(value)=result.as_str(){field(&mut fields,"Categoria criada",value.into());}}
  if let Some(value)=data["categoryId"].as_str(){field(&mut fields,"Categoria informada (ID)",value.into());}
  for (key,name) in [("sessionId","Caixa referenciado"),("paymentId","Recebimento referenciado"),("expenseId","Despesa referenciada")] {named(&mut fields,data,key,name);}
  if ["EXPENSE","REFUND_EXPENSE"].contains(&kind.as_str()) {
   if let Some(expense)=data["expenseId"].as_str().or_else(||result.as_str()) {
    let e=sqlx::query("SELECT e.supplier_name_snapshot,t.amount_cents,t.payment_method FROM expenses e JOIN cash_transactions t ON t.id=e.cash_transaction_id WHERE e.id=?").bind(expense).fetch_optional(&mut **tx).await.map_err(|e|e.to_string())?;
    if let Some(e)=e {if let Some(name)=e.get::<Option<String>,_>("supplier_name_snapshot"){field(&mut fields,"Fornecedor registrado no pagamento",name);}
     if kind=="REFUND_EXPENSE"{field(&mut fields,"Valor devolvido",format!("R$ {}",reports::money(e.get("amount_cents"))));field(&mut fields,"Forma original",display_method(e.get::<Option<String>,_>("payment_method").as_deref().unwrap_or("CASH")).into());}
     references.push(json!({"id":expense,"label":"Despesa relacionada","route":"/expenses","linkLabel":"Histórico de despesas"}));
    }else{field(&mut fields,"Despesa referenciada",expense.into());warning=Some("A despesa referenciada não está disponível neste banco.".into());}
   }
  }
 }
 Ok(json!({"id":id,"kind":kind,"label":label(&kind),"date":row.get::<Option<String>,_>("local_date"),"fields":fields,"references":references,"warning":warning}))
}

pub async fn read(pool:&SqlitePool,mut query:Query)->Result<Page> {
 reports::Period{start:query.start.clone(),end:query.end.clone()}.validate()?;
 query.search=query.search.trim().to_owned();
 if query.search.chars().count()>120 || query.page==0 || query.page>100000 || query.anchor.is_some_and(|a|a<0) || query.kind.as_deref().is_some_and(|kind|!KINDS.contains(&kind)) {return Err("Filtros do histórico inválidos.".into());}
 let mut tx=pool.begin().await.map_err(|e|e.to_string())?;
 let clock=sqlx::query("SELECT COALESCE(MAX(rowid),0) anchor,strftime('%d/%m/%Y %H:%M:%S','now','localtime') generated FROM operation_results").fetch_one(&mut *tx).await.map_err(|e|e.to_string())?;
 let max=clock.get::<i64,_>("anchor");let anchor=query.anchor.unwrap_or(max);
 if anchor>max {return Err("O histórico mudou. Atualize a consulta para começar novamente.".into());}query.anchor=Some(anchor);
 let unknown="'SALE','CANCEL_SALE','STOCK','RECEIVE','REFUND_RECEIPT','EXPENSE','REFUND_EXPENSE','OPEN_CASH','CASH_MOVE','CLOSE_CASH','DEBIT','PRODUCT','SUPPLIER','SUPPLIER_ACTIVE','CATEGORY'";
 let filter=format!("rowid<=? AND date(created_at,'localtime') BETWEEN ? AND ? AND (? IS NULL OR ({KIND_SQL})=? OR (?='UNKNOWN' AND ({KIND_SQL}) NOT IN ({unknown}))) AND (id LIKE ? ESCAPE '\\' OR request_json LIKE ? ESCAPE '\\')");
 let search=format!("%{}%",query.search.replace('\\',"\\\\").replace('%',"\\%").replace('_',"\\_"));
 let count=sqlx::query_scalar::<_,i64>(&format!("SELECT COUNT(*) FROM operation_results WHERE {filter}")).bind(anchor).bind(&query.start).bind(&query.end).bind(&query.kind).bind(&query.kind).bind(&query.kind).bind(&search).bind(&search).fetch_one(&mut *tx).await.map_err(|e|e.to_string())?;
 let pages=((count+24)/25).max(1);query.page=query.page.min(pages as u32);
 let sql=format!("SELECT id,request_json,result_json,({KIND_SQL}) kind,strftime('%d/%m/%Y %H:%M:%S',created_at,'localtime') local_date FROM operation_results WHERE {filter} ORDER BY created_at DESC,id DESC LIMIT 25 OFFSET ?");
 let rows=sqlx::query(&sql).bind(anchor).bind(&query.start).bind(&query.end).bind(&query.kind).bind(&query.kind).bind(&query.kind).bind(&search).bind(&search).bind(i64::from(query.page-1)*25).fetch_all(&mut *tx).await.map_err(|e|e.to_string())?;
 let mut items=vec![];for row in rows {items.push(detail(&mut tx,row).await?);}
 tx.commit().await.map_err(|e|e.to_string())?;
 Ok(Page{query,generated_at_local:clock.get("generated"),total:count,page_count:pages,items})
}
