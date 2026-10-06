//! Supplier writes share the domain transaction and operation replay protection.
use super::*;

#[derive(Deserialize)]
#[serde(rename_all="camelCase",deny_unknown_fields)]
struct Input {
    id: Option<String>, name: String, contact_name: Option<String>,
    phone: Option<String>, whatsapp: Option<String>, document: Option<String>,
    email: Option<String>, address: Option<String>, notes: Option<String>, active: bool,
}
fn field(value: Option<String>, label: &str, max: usize)->Result<Option<String>> {
    let Some(value)=value else{return Ok(None);};
    let value=value.trim();
    if value.chars().count()>max || value.chars().any(|c|c.is_control() && !['\n','\r','\t'].contains(&c)) {
        return Err(format!("Campo {label} inválido. Use até {max} caracteres."));
    }
    Ok(if value.is_empty(){None}else{Some(value.to_owned())})
}
pub(super) async fn save(tx:&mut Tx,v:&Value)->Result<Value> {
    let input:Input=serde_json::from_value(v.clone()).map_err(|_|"Dados de fornecedor inválidos.".to_string())?;
    let name=field(Some(input.name),"nome",160)?.ok_or("Informe o nome do fornecedor.")?;
    let contact=field(input.contact_name,"contato",120)?;
    let phone=field(input.phone,"telefone",40)?;let whatsapp=field(input.whatsapp,"WhatsApp",40)?;
    let document=field(input.document,"documento",40)?;let email=field(input.email,"e-mail",254)?;
    if let Some(email)=&email {
        let parts:Vec<&str>=email.split('@').collect();
        if parts.len()!=2 || parts.iter().any(|part|part.is_empty()) || email.chars().any(char::is_whitespace) {return Err("Informe um e-mail válido.".into());}
    }
    let address=field(input.address,"endereço",500)?;let notes=field(input.notes,"observações",4000)?;
    let existing=input.id;let supplier=existing.clone().unwrap_or_else(id);
    let mut values=vec![json!(name),json!(contact),json!(phone),json!(whatsapp),json!(document),json!(email),json!(address),json!(notes),json!(input.active),json!(supplier)];
    if existing.is_some() {
        if exec(tx,"UPDATE suppliers SET name=?,contact_name=?,phone=?,whatsapp=?,document=?,email=?,address=?,notes=?,active=?,updated_at=CURRENT_TIMESTAMP WHERE id=?",values).await?!=1 {return Err("Fornecedor não encontrado. Reabra a lista.".into());}
    } else {
        values.rotate_right(1);
        exec(tx,"INSERT INTO suppliers(id,name,contact_name,phone,whatsapp,document,email,address,notes,active) VALUES (?,?,?,?,?,?,?,?,?,?)",values).await?;
    }
    Ok(json!(supplier))
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct Status { id: String, active: bool }
pub(super) async fn set_active(tx:&mut Tx,v:&Value)->Result<Value> {
    let input:Status=serde_json::from_value(v.clone()).map_err(|_|"Situação do fornecedor inválida.".to_string())?;
    if exec(tx,"UPDATE suppliers SET active=?,updated_at=CURRENT_TIMESTAMP WHERE id=?",vec![json!(input.active),json!(input.id)]).await?!=1 {return Err("Fornecedor não encontrado. Reabra a lista.".into());}
    Ok(Value::Null)
}
