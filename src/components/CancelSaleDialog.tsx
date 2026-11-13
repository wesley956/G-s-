import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { cancelSale } from "../services/saleService";
import type { SaleRecord } from "../types/sale";
export function CancelSaleDialog({sale,onClose,onSuccess}:{sale:SaleRecord,onClose:()=>void,onSuccess:()=>void}) {
  const dialog=useRef<HTMLDialogElement>(null);const lock=useRef(false);
  const attempt=useRef<{signature:string,id:string}|null>(null);
  const [reason,setReason]=useState("");const [password,setPassword]=useState("");const [busy,setBusy]=useState(false);const [error,setError]=useState("");
  useEffect(()=>{dialog.current?.showModal();},[]);
  return <dialog ref={dialog} className="operation-dialog" aria-label={`Cancelar venda #${sale.sale_number}`} onCancel={e=>{e.preventDefault();if(!busy)onClose();}}>
    <form onSubmit={async e=>{e.preventDefault();if(lock.current)return;lock.current=true;setBusy(true);setError("");
      const signature=JSON.stringify({reason,password});if(attempt.current?.signature!==signature)attempt.current={signature,id:crypto.randomUUID()};
      try{await cancelSale(sale.id,reason,password,attempt.current!.id);setPassword("");onSuccess();}
      catch(err){setError(err instanceof Error?err.message:String(err));}finally{lock.current=false;setBusy(false);}
    }}><h2>Cancelar venda #{sale.sale_number}</h2><p className="muted">O estoque será devolvido e os pagamentos serão estornados no caixa atual.</p>
      {error&&<p className="feedback error" role="alert">{error}</p>}
      <fieldset disabled={busy}><label className="field"><span>Motivo do cancelamento</span><input autoFocus required maxLength={500} value={reason} onChange={e=>setReason(e.target.value)}/></label>
        <label className="field"><span>Senha de administrador</span><input type="password" required autoComplete="current-password" maxLength={256} value={password} onChange={e=>setPassword(e.target.value)}/></label></fieldset>
      <p className="muted">Primeiro acesso? <Link to="/settings/admin" onClick={()=>{if(!busy)onClose();}}>Cadastrar a senha do responsável</Link>.</p>
      <div className="form-actions"><button type="button" className="secondary-button" disabled={busy} onClick={onClose}>Voltar sem cancelar</button><button className="primary-button" disabled={busy} aria-busy={busy}>{busy?"Cancelando...":"Confirmar cancelamento da venda"}</button></div>
    </form>
  </dialog>;
}
