//! Fixed weekly charges. Reads calculate a preview; only a confirmed operation posts ledger entries.
use super::*;
use chrono::{Datelike,Duration,NaiveDate};

#[derive(Deserialize,Serialize,Clone,Debug)]
#[serde(rename_all="camelCase",deny_unknown_fields)]
pub struct Policy {pub enabled:bool,pub weekly_cents:i64,pub mode:String,pub weekdays_only:bool}
impl Default for Policy {fn default()->Self{Self{enabled:false,weekly_cents:500,mode:"FULL_WEEK".into(),weekdays_only:true}}}
impl Policy {fn validate(&self)->Result<()>{
    if self.weekly_cents<=0 || self.weekly_cents>1_000_000 || !["FULL_WEEK","DAILY"].contains(&self.mode.as_str()) {return Err("Regra de acréscimo inválida. Informe valor semanal de até R$ 10.000,00 e uma forma de cálculo válida.".into());}Ok(())
}}
#[derive(Deserialize)]
#[serde(rename_all="camelCase",deny_unknown_fields)]
pub struct PreviewQuery {pub policy:Policy,pub start_date:String,pub end_date:String}
#[derive(Serialize)]
#[serde(rename_all="camelCase")]
pub struct Calculation {pub days:i64,pub cents:i64}
#[derive(Serialize,Clone)]
#[serde(rename_all="camelCase")]
pub struct Preview {pub plan_id:String,pub entry_id:String,pub customer_id:String,pub sale_id:Option<String>,pub description:String,pub start_date:String,pub through_date:String,pub weekly_cents:i64,pub mode:String,pub weekdays_only:bool,pub posted_cents:i64,pub pending_cents:i64}
fn date(s:&str)->Result<NaiveDate>{
    let d=NaiveDate::parse_from_str(s,"%Y-%m-%d").map_err(|_|"Informe uma data válida.".to_string())?;
    if s.len()!=10 || !(2000..=2099).contains(&d.year()) {return Err("Use uma data entre 2000 e 2099.".into());}Ok(d)
}
pub fn calculate(q:PreviewQuery)->Result<Calculation>{
    q.policy.validate()?;let start=date(&q.start_date)?;let end=date(&q.end_date)?;
    if end<start{return Err("A data final deve ser igual ou posterior à inicial.".into());}
    let span=(end-start).num_days();
    // Excludes the start date and includes the end date. At most six remainder checks.
    let mut days=if q.policy.weekdays_only {(span/7)*5}else{span};
    if q.policy.weekdays_only {for n in 1..=(span%7){if (start+Duration::days((span/7)*7+n)).weekday().num_days_from_monday()<5{days+=1;}}}
    let divisor=if q.policy.weekdays_only{5}else{7};
    let cents=if q.policy.mode=="FULL_WEEK"{(days/divisor)*q.policy.weekly_cents}else{(days*q.policy.weekly_cents+divisor/2)/divisor};
    Ok(Calculation{days,cents})
}
pub async fn policy(tx:&mut Tx)->Result<Policy>{
    let raw:Option<String>=sqlx::query_scalar("SELECT value FROM app_settings WHERE key='accrual_policy'").fetch_optional(&mut **tx).await.map_err(|e|e.to_string())?.flatten();
    let p:Policy=match raw{Some(s)=>serde_json::from_str(&s).map_err(|_|"Configuração da caderneta inválida.".to_string())?,None=>Policy::default()};p.validate()?;Ok(p)
}
pub async fn get_policy(pool:&SqlitePool)->Result<Policy>{let mut tx=pool.begin().await.map_err(|e|e.to_string())?;let p=policy(&mut tx).await?;tx.commit().await.map_err(|e|e.to_string())?;Ok(p)}
pub async fn save_policy(tx:&mut Tx,v:&Value)->Result<Value>{
    let p:Policy=serde_json::from_value(v.get("policy").cloned().ok_or("Informe a regra da caderneta.")?).map_err(|_|"Regra inválida.".to_string())?;p.validate()?;
    exec(tx,"INSERT INTO app_settings(key,value) VALUES ('accrual_policy',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=CURRENT_TIMESTAMP",vec![json!(serde_json::to_string(&p).map_err(|e|e.to_string())?)]).await?;Ok(json!(p))
}
async fn today(tx:&mut Tx)->Result<String>{sqlx::query_scalar("SELECT date('now','localtime')").fetch_one(&mut **tx).await.map_err(|e|e.to_string())}
pub async fn attach(tx:&mut Tx,entry:&str,v:&Value)->Result<()> {
    let p=policy(tx).await?;if !p.enabled{return Ok(());}
    let start=optional(v,"accrualStartDate").unwrap_or(today(tx).await?);date(&start)?;
    insert_plan(tx,entry,&start,&p).await
}
async fn insert_plan(tx:&mut Tx,entry:&str,start:&str,p:&Policy)->Result<()> {
    exec(tx,"INSERT INTO account_accrual_plans(id,entry_id,start_date,weekly_cents,mode,weekdays_only) VALUES (?,?,?,?,?,?)",vec![json!(id()),json!(entry),json!(start),json!(p.weekly_cents),json!(p.mode),json!(p.weekdays_only)]).await?;Ok(())
}
async fn remaining(tx:&mut Tx,entry:&str)->Result<i64>{
    sqlx::query_scalar("SELECT COALESCE(SUM(d.amount_cents-COALESCE((SELECT SUM(a.amount_cents) FROM account_payment_allocations a JOIN customer_account_entries p ON p.id=a.payment_id WHERE a.debit_id=d.id AND p.status<>'CANCELLED'),0)),0) FROM customer_account_entries d WHERE d.status<>'CANCELLED' AND (d.id=? OR d.id IN (SELECT post.entry_id FROM account_accrual_posts post JOIN account_accrual_plans plan ON plan.id=post.plan_id WHERE plan.entry_id=?))")
        .bind(entry).bind(entry).fetch_one(&mut **tx).await.map_err(|e|e.to_string())
}
pub(crate) async fn previews_on(tx:&mut Tx,customer:Option<&str>,day:&str)->Result<Vec<Preview>>{
    date(day)?;
    let rows=sqlx::query("SELECT p.*,d.customer_id,d.sale_id,d.description,d.status FROM account_accrual_plans p JOIN customer_account_entries d ON d.id=p.entry_id WHERE p.end_date IS NULL AND (? IS NULL OR d.customer_id=?) ORDER BY p.id")
        .bind(customer).bind(customer).fetch_all(&mut **tx).await.map_err(|e|e.to_string())?;
    let mut result=Vec::new();
    for r in rows {
        let entry:String=r.get("entry_id");if r.get::<String,_>("status")=="CANCELLED" || remaining(tx,&entry).await?<=0 {continue;}
        let p=Policy{enabled:true,weekly_cents:r.get("weekly_cents"),mode:r.get("mode"),weekdays_only:r.get::<i64,_>("weekdays_only")==1};p.validate()?;
        let start:String=r.get("start_date");let through=if day<start.as_str(){start.clone()}else{day.to_owned()};
        let total=calculate(PreviewQuery{policy:p.clone(),start_date:start.clone(),end_date:through.clone()})?.cents;
        let posted:i64=r.get("posted_cents");
        result.push(Preview{plan_id:r.get("id"),entry_id:entry,customer_id:r.get("customer_id"),sale_id:r.get("sale_id"),description:r.get::<Option<String>,_>("description").unwrap_or("Débito".into()),start_date:start,through_date:through,weekly_cents:p.weekly_cents,mode:p.mode,weekdays_only:p.weekdays_only,posted_cents:posted,pending_cents:(total-posted).max(0)});
    }Ok(result)
}
pub async fn previews_tx(tx:&mut Tx,customer:Option<&str>)->Result<Vec<Preview>>{let day=today(tx).await?;previews_on(tx,customer,&day).await}
pub async fn previews(pool:&SqlitePool,customer:Option<&str>)->Result<Vec<Preview>>{let mut tx=pool.begin().await.map_err(|e|e.to_string())?;let result=previews_tx(&mut tx,customer).await?;tx.commit().await.map_err(|e|e.to_string())?;Ok(result)}
pub async fn materialize(tx:&mut Tx,customer:Option<&str>)->Result<()> {
    for p in previews_tx(tx,customer).await? {
        if p.pending_cents==0 {continue;}
        let key=id();
        exec(tx,"INSERT INTO customer_account_entries(id,customer_id,sale_id,type,description,amount_cents,status) VALUES (?,?,?,'ADJUSTMENT',?,?,'OPEN')",vec![json!(key),json!(p.customer_id),json!(p.sale_id),json!(format!("Acréscimo até {} · {}",p.through_date,p.description)),json!(p.pending_cents)]).await?;
        exec(tx,"INSERT INTO account_accrual_posts(entry_id,plan_id,through_date) VALUES (?,?,?)",vec![json!(key),json!(p.plan_id),json!(p.through_date)]).await?;
        exec(tx,"UPDATE account_accrual_plans SET posted_cents=posted_cents+? WHERE id=?",vec![json!(p.pending_cents),json!(p.plan_id)]).await?;
    }Ok(())
}
pub async fn close_paid(tx:&mut Tx)->Result<()> {
    let rows:Vec<String>=sqlx::query_scalar("SELECT entry_id FROM account_accrual_plans WHERE end_date IS NULL").fetch_all(&mut **tx).await.map_err(|e|e.to_string())?;
    let day=today(tx).await?;
    for entry in rows{if remaining(tx,&entry).await?<=0{exec(tx,"UPDATE account_accrual_plans SET end_date=?,end_reason=CASE WHEN (SELECT status FROM customer_account_entries WHERE id=?)='CANCELLED' THEN 'CANCELLED' ELSE 'PAID' END WHERE entry_id=? AND end_date IS NULL",vec![json!(day),json!(entry),json!(entry)]).await?;}}Ok(())
}
pub async fn resume_refunded(tx:&mut Tx,customer:&str)->Result<()> {
    // Never charge the already-paid interval retroactively: a refund starts a new period today.
    let rows=sqlx::query("SELECT p.* FROM account_accrual_plans p JOIN customer_account_entries d ON d.id=p.entry_id WHERE d.customer_id=? AND d.status<>'CANCELLED' AND p.end_date IS NOT NULL AND p.end_reason='PAID' AND NOT EXISTS(SELECT 1 FROM account_accrual_plans a WHERE a.entry_id=p.entry_id AND a.end_date IS NULL) AND p.rowid=(SELECT MAX(a.rowid) FROM account_accrual_plans a WHERE a.entry_id=p.entry_id)").bind(customer).fetch_all(&mut **tx).await.map_err(|e|e.to_string())?;
    let day=today(tx).await?;
    for r in rows{let entry:String=r.get("entry_id");if remaining(tx,&entry).await?>0{
        let p=Policy{enabled:true,weekly_cents:r.get("weekly_cents"),mode:r.get("mode"),weekdays_only:r.get::<i64,_>("weekdays_only")==1};insert_plan(tx,&entry,&day,&p).await?;
    }}Ok(())
}
pub async fn change_plan(tx:&mut Tx,v:&Value)->Result<Value>{
    let entry=text(v,"entryId")?;let enabled=v.get("enabled").and_then(Value::as_bool).ok_or("Situação do acréscimo inválida.")?;
    let row=sqlx::query("SELECT customer_id,type,status FROM customer_account_entries WHERE id=?").bind(entry).fetch_optional(&mut **tx).await.map_err(|e|e.to_string())?.ok_or("Débito não encontrado.")?;
    if row.get::<String,_>("type")!="DEBIT" || row.get::<String,_>("status")=="CANCELLED" || remaining(tx,entry).await?<=0{return Err("Selecione um débito em aberto.".into());}
    let cust:String=row.get("customer_id");materialize(tx,Some(&cust)).await?;
    let active:i64=sqlx::query_scalar("SELECT COUNT(*) FROM account_accrual_plans WHERE entry_id=? AND end_date IS NULL").bind(entry).fetch_one(&mut **tx).await.map_err(|e|e.to_string())?;
    let day=today(tx).await?;
    if enabled{
        if active!=0{return Err("Este débito já tem acréscimo ativo.".into());}
        let p=policy(tx).await?;if !p.enabled{return Err("Ative a regra para novos débitos em Configurações → Caderneta.".into());}
        let start=optional(v,"startDate").unwrap_or(day.clone());date(&start)?;
        let last:Option<String>=sqlx::query_scalar("SELECT MAX(end_date) FROM account_accrual_plans WHERE entry_id=?").bind(entry).fetch_one(&mut **tx).await.map_err(|e|e.to_string())?;
        if last.is_some_and(|last|start<last){return Err("A nova data inicial não pode ser anterior ao encerramento da regra anterior.".into());}
        insert_plan(tx,entry,&start,&p).await?;
    }else{
        if active==0{return Err("Este débito não tem acréscimo ativo.".into());}
        exec(tx,"UPDATE account_accrual_plans SET end_date=?,end_reason='MANUAL' WHERE entry_id=? AND end_date IS NULL",vec![json!(day),json!(entry)]).await?;
    }Ok(Value::Null)
}
