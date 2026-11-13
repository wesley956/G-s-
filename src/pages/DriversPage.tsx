import { useEffect, useRef, useState } from "react";
import { listDrivers, saveDriver, type Driver } from "../services/driverService";
export function DriversPage(){
  const [rows,setRows]=useState<Driver[]>([]);const [id,setId]=useState<string|undefined>();const [name,setName]=useState("");const [phone,setPhone]=useState("");const [active,setActive]=useState(true);
  const [error,setError]=useState("");const [busy,setBusy]=useState(false);const [feedback,setFeedback]=useState("");const attempt=useRef<{signature:string,id:string}|null>(null);
  useEffect(()=>{void listDrivers().then(setRows).catch(e=>setError(String(e)));},[]);
  function clear(){setId(undefined);setName("");setPhone("");setActive(true);attempt.current=null;}
  return <section><header className="page-header"><div><p className="eyebrow">Entregas</p><h1>Entregadores</h1><p className="muted">Cadastre quem faz as entregas e vincule o responsável em cada venda.</p></div></header>
    {error&&<p className="feedback error" role="alert">{error}</p>}{feedback&&<p className="feedback success" role="status">{feedback}</p>}
    <form className="panel settings-form" onSubmit={async e=>{e.preventDefault();if(busy)return;setBusy(true);setError("");setFeedback("");
      const data={id,name,phone,active};const signature=JSON.stringify(data);if(attempt.current?.signature!==signature)attempt.current={signature,id:crypto.randomUUID()};
      try{await saveDriver(data,attempt.current!.id);clear();setRows(await listDrivers());setFeedback("Entregador salvo.");}catch(err){setError(err instanceof Error?err.message:String(err));}finally{setBusy(false);}
    }}><h2>{id?"Editar entregador":"Novo entregador"}</h2><fieldset disabled={busy} className="form-grid">
      <label className="field"><span>Nome do entregador</span><input required maxLength={120} value={name} onChange={e=>setName(e.target.value)}/></label>
      <label className="field"><span>Telefone do entregador</span><input type="tel" maxLength={40} value={phone} onChange={e=>setPhone(e.target.value)}/></label>
      <label className="field"><span>Situação do entregador</span><select value={active?"yes":"no"} onChange={e=>setActive(e.target.value==="yes")}><option value="yes">Ativo</option><option value="no">Inativo</option></select></label>
    </fieldset><div className="action-buttons"><button className="primary-button" disabled={busy}>Salvar entregador</button>{id&&<button className="secondary-button" type="button" disabled={busy} onClick={clear}>Novo cadastro</button>}</div></form>
    <div className="panel data-table-wrapper"><table className="data-table"><thead><tr><th>Nome</th><th>Telefone</th><th>Situação</th><th>Ação</th></tr></thead><tbody>{rows.map(r=><tr key={r.id}><td>{r.name}</td><td>{r.phone||"—"}</td><td>{r.active?"Ativo":"Inativo"}</td><td><button className="ghost-button" disabled={busy} onClick={()=>{setId(r.id);setName(r.name);setPhone(r.phone);setActive(Boolean(r.active));}}>Editar</button></td></tr>)}</tbody></table>{!rows.length&&<p className="muted">Nenhum entregador cadastrado.</p>}</div>
  </section>;
}
