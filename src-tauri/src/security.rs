use super::*;
use argon2::{Argon2, PasswordHash, PasswordHasher, PasswordVerifier, password_hash::SaltString};
use rand_core::OsRng;

pub fn hash(password: &str) -> Result<String> {
    if password.chars().count() < 6 || password.len() > 256 {
        return Err("A senha deve ter ao menos 6 caracteres e no máximo 256 bytes.".into());
    }
    Argon2::default().hash_password(password.as_bytes(), &SaltString::generate(&mut OsRng))
        .map(|v|v.to_string()).map_err(|_|"Não foi possível proteger a senha.".into())
}
fn matches(password: &str, encoded: &str) -> bool {
    password.len()<=256 && PasswordHash::new(encoded).is_ok_and(|hash|
        Argon2::default().verify_password(password.as_bytes(), &hash).is_ok())
}
pub async fn authorize(tx:&mut Tx, op:&Operation, replay:bool)->Result<()> {
    if !["CANCEL_SALE","ADMIN_SETUP","ADMIN_CHANGE","ACCRUAL_SETTINGS","ACCRUAL_PLAN"].contains(&op.kind.as_str()) {return Ok(());}
    let stored:Option<String>=sqlx::query_scalar("SELECT password_hash FROM admin_security WHERE singleton=1")
        .fetch_optional(&mut **tx).await.map_err(|e|e.to_string())?;
    if op.kind=="ADMIN_SETUP" && stored.is_none() {return Ok(());}
    let encoded=stored.ok_or("Cadastre a senha de administrador em Configurações antes de continuar.")?;
    let supplied=op.data.get("adminPassword").and_then(Value::as_str).unwrap_or("");
    let new=op.data.get("newPassword").and_then(Value::as_str).unwrap_or("");
    if (op.kind!="ADMIN_SETUP" && matches(supplied,&encoded)) ||
        (replay && ["ADMIN_SETUP","ADMIN_CHANGE"].contains(&op.kind.as_str()) && matches(new,&encoded)) {return Ok(());}
    Err("Senha de administrador incorreta.".into())
}
pub async fn save(tx:&mut Tx,v:&Value,setup:bool)->Result<Value> {
    let encoded=hash(text(v,"newPassword")?)?;
    if setup {
        exec(tx,"INSERT INTO admin_security(singleton,password_hash) VALUES (1,?)",vec![json!(encoded)]).await
            .map_err(|_|"A senha de administrador já foi cadastrada. Use a opção de alterar senha.".to_string())?;
    } else {
        exec(tx,"UPDATE admin_security SET password_hash=?,updated_at=CURRENT_TIMESTAMP WHERE singleton=1",vec![json!(encoded)]).await?;
    }
    Ok(Value::Null)
}
pub async fn status(pool:&SqlitePool)->Result<bool> {
    sqlx::query_scalar::<_,i64>("SELECT COUNT(*) FROM admin_security WHERE singleton=1").fetch_one(pool).await
        .map(|n|n==1).map_err(|e|e.to_string())
}
