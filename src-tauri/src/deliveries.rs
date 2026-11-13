use super::*;
fn field(v:&Value,key:&str,max:usize,required:bool)->Result<String>{
    let value=v.get(key).and_then(Value::as_str).unwrap_or("").trim();
    if (required && value.is_empty()) || value.chars().count()>max || value.chars().any(char::is_control) {
        return Err(format!("Informe {key} válido (até {max} caracteres)."));
    } Ok(value.to_owned())
}
pub async fn driver(tx:&mut Tx,v:&Value)->Result<Value>{
    let name=field(v,"name",120,true)?;let phone=field(v,"phone",40,false)?;
    let active=v.get("active").and_then(Value::as_bool).ok_or("Situação do entregador inválida.")?;
    let existing=optional(v,"id");let key=existing.clone().unwrap_or_else(id);
    if existing.is_some(){
        if exec(tx,"UPDATE delivery_drivers SET name=?,phone=?,active=?,updated_at=CURRENT_TIMESTAMP WHERE id=?",vec![json!(name),json!(phone),json!(active),json!(key)]).await?!=1{return Err("Entregador não encontrado.".into());}
    }else{exec(tx,"INSERT INTO delivery_drivers(id,name,phone,active) VALUES (?,?,?,?)",vec![json!(key),json!(name),json!(phone),json!(active)]).await?;}
    Ok(json!(key))
}
pub async fn prepare(tx:&mut Tx,v:Option<&Value>)->Result<Value>{
    let Some(v)=v.filter(|v|!v.is_null()) else{return Ok(Value::Null);};
    let address=field(v,"address",240,true)?;let number=field(v,"number",30,true)?;
    let driver=text(v,"driverId")?;
    let row=sqlx::query("SELECT name,phone FROM delivery_drivers WHERE id=? AND active=1").bind(driver)
        .fetch_optional(&mut **tx).await.map_err(|e|e.to_string())?.ok_or("Selecione um entregador ativo.")?;
    Ok(json!({"address":address,"number":number,"driverId":driver,
        "driverName":row.get::<String,_>("name"),"driverPhone":row.get::<String,_>("phone")}))
}
pub async fn record(tx:&mut Tx,sale:&str,v:&Value)->Result<()> {
    if v.is_null(){return Ok(());}
    exec(tx,"INSERT INTO sale_deliveries(sale_id,driver_id,address,number,driver_name,driver_phone) VALUES (?,?,?,?,?,?)",
        vec![json!(sale),v["driverId"].clone(),v["address"].clone(),v["number"].clone(),v["driverName"].clone(),v["driverPhone"].clone()]).await?;Ok(())
}
pub async fn complete(tx:&mut Tx,v:&Value)->Result<Value>{
    let sale=text(v,"saleId")?;
    let n=exec(tx,"UPDATE sale_deliveries SET status='DELIVERED',delivered_at=CURRENT_TIMESTAMP WHERE sale_id=? AND status='OUT' AND EXISTS(SELECT 1 FROM sales WHERE id=? AND status='COMPLETED')",vec![json!(sale),json!(sale)]).await?;
    if n!=1{return Err("Entrega já finalizada, cancelada ou não encontrada.".into());}Ok(Value::Null)
}
