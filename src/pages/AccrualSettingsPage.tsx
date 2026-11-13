import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { SettingsLinks } from "../components/SettingsLinks";
import { getAccrualPolicy, localDay, previewAccrual, saveAccrualPolicy, type AccrualPolicy } from "../services/accrualService";
import { toCents } from "../lib/money";
import { formatCurrency } from "../services/productService";
export function AccrualSettingsPage(){
  const [policy,setPolicy]=useState<AccrualPolicy|null>(null);const [amount,setAmount]=useState("5,00");const [password,setPassword]=useState("");
  const [start,setStart]=useState(localDay);const [end,setEnd]=useState(localDay);const [original,setOriginal]=useState("100,00");
  const [result,setResult]=useState<{signature:string;days:number;cents:number;original:number}|null>(null);
  const [error,setError]=useState("");const [feedback,setFeedback]=useState("");const [busy,setBusy]=useState(false);const [calculating,setCalculating]=useState(false);
  const attempt=useRef<{signature:string;id:string}|null>(null);const lock=useRef(false);
  const signature=JSON.stringify({policy,amount,start,end,original});
  useEffect(()=>{let active=true;void getAccrualPolicy().then(p=>{if(active){setPolicy(p);setAmount((p.weeklyCents/100).toFixed(2).replace(".",","));}}).catch(e=>{if(active)setError(String(e));});return()=>{active=false;};},[]);
  return <section><header className="page-header"><div><p className="eyebrow">Configurações</p><h1>Acréscimo da caderneta</h1><p className="muted">Escolha o valor e como contar o período de cada fiado.</p></div></header><SettingsLinks/>
    {error&&<p className="feedback error" role="alert">{error}</p>}{feedback&&<p className="feedback success" role="status">{feedback}</p>}
    {!policy?<p>Carregando regra...</p>:<form className="panel settings-form" onSubmit={async e=>{e.preventDefault();if(lock.current)return;lock.current=true;setBusy(true);setError("");setFeedback("");try{
      const next={...policy,weeklyCents:toCents(amount)};const key=JSON.stringify({next,password});if(attempt.current?.signature!==key)attempt.current={signature:key,id:crypto.randomUUID()};
      await saveAccrualPolicy(next,password,attempt.current!.id);setPolicy(next);setPassword("");attempt.current=null;setFeedback("Regra salva para os próximos fiados. Débitos anteriores conservam a própria regra.");
    }catch(err){setError(err instanceof Error?err.message:String(err));}finally{lock.current=false;setBusy(false);}}}>
      <h2>Regra para novos fiados</h2><fieldset disabled={busy} className="form-grid">
        <label className="field"><span>Acréscimo em novos fiados</span><select value={policy.enabled?"on":"off"} onChange={e=>setPolicy({...policy,enabled:e.target.value==="on"})}><option value="off">Desativado</option><option value="on">Ativado</option></select></label>
        <label className="field"><span>Valor por semana (R$)</span><input inputMode="decimal" required value={amount} onChange={e=>setAmount(e.target.value)}/></label>
        <label className="field"><span>Forma de cálculo</span><select value={policy.mode} onChange={e=>setPolicy({...policy,mode:e.target.value as AccrualPolicy["mode"]})}><option value="FULL_WEEK">Somente semanas completas</option><option value="DAILY">Proporcional por dia</option></select></label>
        <label className="field"><span>Dias considerados</span><select value={policy.weekdaysOnly?"weekdays":"all"} onChange={e=>setPolicy({...policy,weekdaysOnly:e.target.value==="weekdays"})}><option value="weekdays">Segunda a sexta (5 dias por semana)</option><option value="all">Todos os dias (7 dias por semana)</option></select></label>
      </fieldset>
      <p className="muted">Valor fixo por débito, sem juros sobre juros. A contagem exclui a data inicial e inclui a data final; no modo segunda a sexta, feriados nesses dias também contam. A cobrança encerra na quitação. Pagamento parcial mantém a regra ativa.</p>
      <p className="muted">Estas preferências valem para novos fiados e lançamentos. Para ativar ou encerrar o acréscimo de uma dívida existente, abra a caderneta do cliente. Cada débito conserva a regra com que foi criado.</p>
      <h2>Simular antes de salvar</h2><fieldset disabled={busy||calculating} className="form-grid">
        <label className="field"><span>Valor original da prévia (R$)</span><input inputMode="decimal" value={original} onChange={e=>setOriginal(e.target.value)}/></label>
        <label className="field"><span>Data inicial da prévia</span><input type="date" value={start} onChange={e=>setStart(e.target.value)}/></label>
        <label className="field"><span>Data final da prévia</span><input type="date" value={end} onChange={e=>setEnd(e.target.value)}/></label>
      </fieldset><button className="secondary-button" type="button" disabled={busy||calculating} onClick={async()=>{setError("");setCalculating(true);try{const base=toCents(original);const data=await previewAccrual({...policy,weeklyCents:toCents(amount)},start,end);setResult({...data,signature,original:base});}catch(err){setError(err instanceof Error?err.message:String(err));}finally{setCalculating(false);}}}>Calcular prévia</button>
      {result?.signature===signature&&<p className="feedback success" role="status">Prévia: {result.days} dias considerados · {formatCurrency(result.original)} + {formatCurrency(result.cents)} = <strong>{formatCurrency(result.original+result.cents)}</strong>. {policy.enabled?"Regra ativada para os próximos débitos após salvar.":"A cobrança está desativada; esta prévia não lança valores."}</p>}
      <fieldset disabled={busy}><label className="field"><span>Senha de administrador</span><input type="password" autoComplete="current-password" required maxLength={256} value={password} onChange={e=>setPassword(e.target.value)}/></label></fieldset>
      <p className="muted"><Link to="/settings/admin">Cadastrar ou alterar senha do responsável</Link>.</p>
      <button className="primary-button" disabled={busy} aria-busy={busy}>{busy?"Salvando...":"Salvar regra da caderneta"}</button>
    </form>}
  </section>;
}
