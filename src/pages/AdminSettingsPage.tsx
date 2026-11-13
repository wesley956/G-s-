import { useEffect, useRef, useState } from "react";
import { SettingsLinks } from "../components/SettingsLinks";
import { getAdminStatus, saveAdminPassword } from "../services/adminService";
export function AdminSettingsPage() {
  const [configured,setConfigured]=useState<boolean|null>(null);
  const [current,setCurrent]=useState(""); const [password,setPassword]=useState(""); const [confirm,setConfirm]=useState("");
  const [error,setError]=useState(""); const [feedback,setFeedback]=useState(""); const [busy,setBusy]=useState(false);
  const attempt=useRef<{signature:string,id:string}|null>(null);
  useEffect(()=>{void getAdminStatus().then(setConfigured).catch(e=>setError(String(e)));},[]);
  return <section><header className="page-header"><div><p className="eyebrow">Configurações</p><h1>Administrador</h1><p className="muted">Proteja cancelamentos e alterações da regra da caderneta.</p></div></header><SettingsLinks />
    {error && <div role="alert" className="feedback error">{error}</div>}{feedback && <div role="status" className="feedback success">{feedback}</div>}
    {configured===null ? <p>Carregando proteção...</p> : <form className="panel settings-form" onSubmit={async e=>{
      e.preventDefault();if(busy)return;setError("");setFeedback("");
      if(password!==confirm){setError("A confirmação da nova senha não confere.");return;}
      const signature=JSON.stringify({configured,current,password});
      if(attempt.current?.signature!==signature)attempt.current={signature,id:crypto.randomUUID()};
      setBusy(true);
      try {await saveAdminPassword(configured,current,password,attempt.current!.id);setConfigured(true);setCurrent("");setPassword("");setConfirm("");attempt.current=null;setFeedback("Senha de administrador salva.");}
      catch(err){setError(err instanceof Error?err.message:String(err));}finally{setBusy(false);}
    }}><h2>{configured?"Alterar senha":"Cadastrar senha do responsável"}</h2>
      <p className="muted">Guarde esta senha com os responsáveis pelo depósito. A troca exige a senha atual.</p>
      <fieldset disabled={busy} className="form-grid">
        {configured && <label className="field"><span>Senha atual do administrador</span><input type="password" autoComplete="current-password" value={current} onChange={e=>setCurrent(e.target.value)} required maxLength={256}/></label>}
        <label className="field"><span>Nova senha</span><input type="password" autoComplete="new-password" minLength={6} maxLength={256} required value={password} onChange={e=>setPassword(e.target.value)}/></label>
        <label className="field"><span>Confirmar nova senha</span><input type="password" autoComplete="new-password" minLength={6} maxLength={256} required value={confirm} onChange={e=>setConfirm(e.target.value)}/></label>
      </fieldset><button className="primary-button" disabled={busy} aria-busy={busy}>{busy?"Salvando...":"Salvar senha"}</button>
    </form>}
  </section>;
}
