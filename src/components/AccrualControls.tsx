import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { changeAccrualPlan, localDay } from "../services/accrualService";
import { formatCurrency } from "../services/productService";
import type { AccountEntry } from "../types/customer";
export function AccrualControls({entries,onSuccess}:{entries:AccountEntry[];onSuccess:()=>void}){
  const [selected,setSelected]=useState<AccountEntry|null>(null);const [password,setPassword]=useState("");const [start,setStart]=useState(localDay);const [error,setError]=useState("");const [busy,setBusy]=useState(false);
  const dialog=useRef<HTMLDialogElement>(null);const lock=useRef(false);const attempt=useRef<{signature:string;id:string}|null>(null);
  useEffect(()=>{if(selected)dialog.current?.showModal();},[selected]);
  const debts=entries.filter(e=>e.type==="DEBIT"&&e.status!=="CANCELLED"&&(e.status!=="PAID"||e.accrual_plan));
  return <details className="panel accrual-controls"><summary>Acréscimos por débito</summary><p className="muted">A prévia em aberto atualiza até hoje. O valor é lançado no histórico ao registrar um pagamento ou encerrar a regra. <Link to="/settings/accounts">Configurar novos fiados</Link>.</p>
    {!debts.length?<p className="muted">Nenhum débito em aberto.</p>:<div className="data-table-wrapper"><table className="data-table"><thead><tr><th>Débito</th><th>Regra em vigor</th><th>Ação</th></tr></thead><tbody>{debts.map(e=><tr key={e.id}><td>{e.description||"Débito"}</td><td>{e.accrual_plan?`${formatCurrency(e.accrual_plan.weeklyCents)}/semana · ${e.accrual_plan.mode==="DAILY"?"proporcional por dia":"semanas completas"} · ${e.accrual_plan.weekdaysOnly?"segunda a sexta":"todos os dias"} · início ${e.accrual_plan.startDate}`:"Sem acréscimo ativo"}</td><td><button className="ghost-button" onClick={()=>{setSelected(e);setPassword("");setStart(localDay());setError("");attempt.current=null;}}>{e.accrual_plan?"Encerrar acréscimo":"Ativar acréscimo"}</button></td></tr>)}</tbody></table></div>}
    {selected&&<dialog ref={dialog} className="operation-dialog" aria-label="Alterar acréscimo do débito" onCancel={e=>{e.preventDefault();if(!busy)setSelected(null);}}><form onSubmit={async e=>{e.preventDefault();if(lock.current)return;lock.current=true;setBusy(true);setError("");const enabled=!selected.accrual_plan;const signature=JSON.stringify({id:selected.id,enabled,start,password});if(attempt.current?.signature!==signature)attempt.current={signature,id:crypto.randomUUID()};try{await changeAccrualPlan(selected.id,enabled,start,password,attempt.current!.id);setPassword("");setSelected(null);onSuccess();}catch(err){setError(err instanceof Error?err.message:String(err));}finally{lock.current=false;setBusy(false);}}}>
      <h2>{selected.accrual_plan?"Encerrar acréscimo":"Ativar acréscimo"}</h2><p>{selected.description}</p>{error&&<p className="feedback error" role="alert">{error}</p>}
      <p className="muted">{selected.accrual_plan?"O cálculo encerra hoje e o acréscimo acumulado continua devido.":"Será usada a configuração atual. Uma data anterior a hoje pode gerar acréscimo retroativo, que aparecerá na caderneta."}</p>
      <fieldset disabled={busy}>{!selected.accrual_plan&&<label className="field"><span>Data inicial do acréscimo</span><input type="date" required value={start} onChange={e=>setStart(e.target.value)}/></label>}<label className="field"><span>Senha de administrador</span><input type="password" required autoComplete="current-password" maxLength={256} value={password} onChange={e=>setPassword(e.target.value)}/></label></fieldset>
      <div className="form-actions"><button className="secondary-button" type="button" disabled={busy} onClick={()=>setSelected(null)}>Voltar</button><button className="primary-button" disabled={busy}>Confirmar regra do débito</button></div>
    </form></dialog>}
  </details>;
}
