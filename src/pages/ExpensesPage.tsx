import { Plus } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ExpenseRefundDialog } from "../components/ExpenseRefundDialog";
import { listExpenses } from "../services/expenseService";
import { getOpenCashSession } from "../services/cashService";
import { listSuppliers } from "../services/supplierService";
import { formatCurrency } from "../services/productService";
import { paymentLabels, receiptDate } from "../lib/receipt";
import type { Expense } from "../types/expense";
import type { Supplier } from "../types/supplier";

const normalize = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("pt-BR");
export function ExpensesPage() {
  const [rows, setRows] = useState<Expense[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [start, setStart] = useState(""); const [end, setEnd] = useState(""); const [supplierId, setSupplierId] = useState("");
  const [search, setSearch] = useState(""); const [status, setStatus] = useState("ALL");
  const [loading, setLoading] = useState(true); const [error, setError] = useState<string | null>(null);
  const [reload, setReload] = useState(0); const [selected, setSelected] = useState<Expense | null>(null);
  const invalidPeriod = Boolean(start && end && start > end);
  useEffect(() => {
    let active = true; setLoading(true); setError(null);
    if (invalidPeriod) { setLoading(false); return; }
    void Promise.all([listExpenses({ start, end, supplierId }), listSuppliers(), getOpenCashSession()]).then(([expenses, vendors, cash]) => {
      if (active) { setRows(expenses); setSuppliers(vendors); setSessionId(cash?.id || null); setLoading(false); }
    }).catch(err => { if (active) { setError(String(err)); setLoading(false); } });
    return () => { active = false; };
  }, [start, end, supplierId, reload, invalidPeriod]);
  const visible = useMemo(() => rows.filter(row => (status === "ALL" || (status === "CANCELLED") === Boolean(row.cancelled_at)) && normalize([row.description, row.category, row.supplier_name_snapshot, row.notes, row.cancellation_reason].join(" ")).includes(normalize(search.trim()))), [rows, search, status]);
  const total = visible.reduce((sum, row) => sum + row.amount_cents, 0);
  const cancelled = visible.reduce((sum, row) => sum + (row.cancelled_at ? row.amount_cents : 0), 0);
  return <section>
    <header className="page-header"><div><p className="eyebrow">Financeiro</p><h1>Despesas</h1><p className="muted">Pagamentos realizados, fornecedores e devoluções recebidas.</p></div><Link className="primary-button" to="/expenses/new"><Plus size={18} />Nova despesa</Link></header>
    <div className="expense-filters panel">
      <label className="field"><span>Buscar despesas</span><input value={search} onChange={e => setSearch(e.target.value)} placeholder="Descrição, categoria, fornecedor ou observações" /></label>
      <label className="field"><span>De</span><input type="date" value={start} onChange={e => setStart(e.target.value)} /></label>
      <label className="field"><span>Até</span><input type="date" value={end} onChange={e => setEnd(e.target.value)} /></label>
      <label className="field"><span>Fornecedor</span><select aria-label="Fornecedor" value={supplierId} onChange={e => setSupplierId(e.target.value)}><option value="">Todos os fornecedores</option>{suppliers.map(item => <option key={item.id} value={item.id}>{item.name}{item.active ? "" : " (inativo)"}</option>)}</select></label>
      <label className="field"><span>Situação</span><select aria-label="Situação" value={status} onChange={e => setStatus(e.target.value)}><option value="ALL">Todas</option><option value="PAID">Pagas</option><option value="CANCELLED">Canceladas</option></select></label>
    </div>
    <p className="muted">Período pela data local do pagamento original. A situação considera cancelamentos posteriores; a devolução entra no caixa da data em que foi recebida.</p>
    {invalidPeriod && <div className="feedback error" role="alert">A data inicial deve ser anterior ou igual à data final.</div>}
    {error && <div className="feedback error" role="alert">{error}<button className="ghost-button" onClick={() => setReload(value => value + 1)}>Tentar novamente</button></div>}
    {loading ? <p role="status">Carregando despesas...</p> : !error && !invalidPeriod && <>
      <div className="card-grid expense-metrics"><article className="metric-card"><span>Pagamentos registrados</span><strong>{formatCurrency(total)}</strong><small>{visible.length} despesas nos filtros</small></article><article className="metric-card"><span>Canceladas</span><strong>{formatCurrency(cancelled)}</strong><small>Devoluções integrais recebidas</small></article><article className="metric-card"><span>Despesas líquidas</span><strong>{formatCurrency(total - cancelled)}</strong><small>Pagamentos menos cancelamentos</small></article></div>
      {!sessionId && <p className="feedback">Abra o caixa para registrar pagamentos ou cancelamentos. <Link to="/cash">Ir ao caixa</Link></p>}
      <div className="panel data-table-wrapper">{visible.length === 0 ? <p>Nenhuma despesa encontrada para os filtros.</p> : <table className="data-table"><thead><tr><th>Data e despesa</th><th>Fornecedor</th><th>Forma / valor</th><th>Situação</th><th>Ação</th></tr></thead><tbody>{visible.map(row => <tr key={row.id}>
        <td><strong>{row.description || "Despesa avulsa"}</strong><small className="expense-detail">{receiptDate(row.created_at)} · {row.category}{row.origin === "LEGACY" ? " · Avulsa do caixa" : ""}</small>{row.notes && <small className="expense-detail">{row.notes}</small>}</td>
        <td>{row.supplier_name_snapshot || "—"}</td><td>{paymentLabels[row.payment_method]}<strong className="expense-detail">{formatCurrency(row.amount_cents)}</strong></td>
        <td>{row.cancelled_at ? <><span className="status-badge inactive">Cancelada</span><small className="expense-detail">{receiptDate(row.cancelled_at)} · {row.cancellation_reason}</small></> : <span className="status-badge active">Paga</span>}</td>
        <td>{!row.cancelled_at && <button className="ghost-button danger-text" disabled={!sessionId} onClick={() => setSelected(row)}>Cancelar despesa</button>}</td>
      </tr>)}</tbody></table>}</div>
    </>}
    {selected && sessionId && <ExpenseRefundDialog expense={selected} sessionId={sessionId} onClose={() => { setSelected(null); setReload(value => value + 1); }} onSuccess={() => { setSelected(null); setReload(value => value + 1); }} />}
  </section>;
}
