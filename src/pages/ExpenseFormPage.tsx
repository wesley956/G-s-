import { ArrowLeft, Save } from "lucide-react";
import { FormEvent, useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { getOpenCashSession } from "../services/cashService";
import { saveExpense } from "../services/expenseService";
import { listSuppliers } from "../services/supplierService";
import { paymentLabels } from "../lib/receipt";
import type { CashSession } from "../types/cash";
import type { ExpenseMethod } from "../types/expense";
import type { Supplier } from "../types/supplier";

export function ExpenseFormPage() {
  const navigate = useNavigate();
  const [session, setSession] = useState<CashSession | null>(null);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [ready, setReady] = useState(false);
  const [reload, setReload] = useState(0);
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("Outras");
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState<ExpenseMethod>("CASH");
  const [supplierId, setSupplierId] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const busy = useRef(false);
  const attempt = useRef<string | null>(null);
  useEffect(() => {
    let active = true; setReady(false); setError(null);
    void Promise.all([getOpenCashSession(), listSuppliers()]).then(([cash, rows]) => {
      if (active) { setSession(cash); setSuppliers(rows.filter(row => Boolean(row.active))); setReady(true); }
    }).catch(err => { if (active) setError(String(err)); });
    return () => { active = false; };
  }, [reload]);
  async function submit(event: FormEvent) {
    event.preventDefault(); if (!ready || !session || busy.current) return;
    busy.current = true; setSaving(true); setError(null);
    try {
      attempt.current ??= crypto.randomUUID();
      await saveExpense({ sessionId: session.id, description, category, amount, method, supplierId: supplierId || null, notes }, attempt.current);
      navigate("/expenses");
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setError(message === "A operação já foi usada com outros dados." ? "Esta despesa já foi registrada. Volte à lista para conferir; para corrigir, cancele e faça um novo lançamento." : message);
    } finally { busy.current = false; setSaving(false); }
  }
  return <section className="form-page">
    <header className="page-header"><div className="header-with-back"><Link className="icon-button" to="/expenses" aria-label="Voltar para despesas"><ArrowLeft size={19} /></Link><div><p className="eyebrow">Financeiro</p><h1>Nova despesa</h1><p className="muted">Registre um pagamento já realizado no caixa aberto.</p></div></div></header>
    {error && <div className="feedback error" role="alert">{error}{!ready && <button className="ghost-button" onClick={() => setReload(value => value + 1)}>Tentar carregar novamente</button>}</div>}
    {!ready && !error && <p role="status">Carregando caixa e fornecedores...</p>}
    {ready && !session ? <div className="panel"><p>Abra o caixa antes de registrar despesas.</p><Link className="primary-button" to="/cash">Abrir caixa</Link></div> : <form onSubmit={submit}>
      <fieldset className="supplier-fields" disabled={!ready || saving}>
        <div className="form-section"><div className="form-section-heading"><strong>Pagamento da despesa</strong><span>O valor e a forma ficam no histórico. Correções exigem cancelamento e novo lançamento.</span></div><div className="form-grid">
          <label className="field span-2"><span>Descrição *</span><input autoFocus required maxLength={240} value={description} onChange={e => setDescription(e.target.value)} placeholder="Ex.: entrega de botijões ou conta de energia" /></label>
          <label className="field"><span>Categoria *</span><input required maxLength={80} list="expense-categories" value={category} onChange={e => setCategory(e.target.value)} /><datalist id="expense-categories">{["Mercadorias", "Transporte", "Energia", "Água", "Aluguel", "Manutenção", "Outras"].map(item => <option key={item} value={item} />)}</datalist></label>
          <label className="field"><span>Valor pago *</span><div className="money-input"><span>R$</span><input required inputMode="decimal" value={amount} onChange={e => setAmount(e.target.value)} placeholder="0,00" /></div></label>
          <label className="field"><span>Forma de pagamento</span><select aria-label="Forma de pagamento" value={method} onChange={e => setMethod(e.target.value as ExpenseMethod)}>{(["CASH", "PIX", "DEBIT_CARD", "CREDIT_CARD"] as const).map(item => <option key={item} value={item}>{paymentLabels[item]}</option>)}</select></label>
          <label className="field"><span>Fornecedor</span><select aria-label="Fornecedor" value={supplierId} onChange={e => setSupplierId(e.target.value)}><option value="">Sem fornecedor</option>{suppliers.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
          <label className="field span-2"><span>Observações</span><textarea rows={4} maxLength={4000} value={notes} onChange={e => setNotes(e.target.value)} /></label>
        </div></div>
        <p className="muted">{method === "CASH" ? "O pagamento reduz o dinheiro disponível neste caixa." : "Faça o pagamento no banco ou na operadora antes de registrar. Este lançamento não reduz o dinheiro físico."} Não há entrada automática no estoque.</p>
      </fieldset>
      <div className="form-actions"><Link className="secondary-button" to="/expenses">Voltar</Link><button className="primary-button" disabled={!ready || !session || saving}><Save size={18} />{saving ? "Registrando..." : "Registrar despesa"}</button></div>
    </form>}
  </section>;
}
