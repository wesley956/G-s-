import { ArrowLeft, CircleDollarSign, FilePlus2 } from "lucide-react";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { formatCurrency } from "../services/productService";
import { addManualDebit, getCustomer, listAccountEntries, receiveCustomerPayment } from "../services/customerService";
import type { AccountEntry, Customer } from "../types/customer";
import type { PaymentMethod } from "../types/sale";

export function CustomerAccountPage() {
  const { customerId = "" } = useParams();
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [entries, setEntries] = useState<AccountEntry[]>([]);
  const [debitAmount, setDebitAmount] = useState("");
  const [debitDescription, setDebitDescription] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [paymentAmount, setPaymentAmount] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("PIX");
  const [feedback, setFeedback] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    const [customerRow, entryRows] = await Promise.all([getCustomer(customerId), listAccountEntries(customerId)]);
    setCustomer(customerRow);
    setEntries(entryRows);
  }

  useEffect(() => { void load(); }, [customerId]);

  const balance = useMemo(() => entries.reduce((sum, entry) => {
    if (entry.status === "CANCELLED") return sum;
    return entry.type === "PAYMENT" ? sum - entry.amount_cents : sum + entry.amount_cents;
  }, 0), [entries]);

  async function submitDebit(event: FormEvent) {
    event.preventDefault(); setError(null); setFeedback(null);
    try {
      await addManualDebit({ customerId, description: debitDescription, amount: debitAmount, dueDate });
      setDebitAmount(""); setDebitDescription(""); setDueDate(""); setFeedback("Lançamento adicionado."); await load();
    } catch (err) { setError(err instanceof Error ? err.message : "Não foi possível lançar."); }
  }

  async function submitPayment(event: FormEvent) {
    event.preventDefault(); setError(null); setFeedback(null);
    try {
      await receiveCustomerPayment({ customerId, amount: paymentAmount, method: paymentMethod, description: "Pagamento de caderneta" });
      setPaymentAmount(""); setFeedback("Pagamento registrado com sucesso."); await load();
    } catch (err) { setError(err instanceof Error ? err.message : "Não foi possível receber."); }
  }

  if (!customer) return <section><p className="muted">Carregando cliente...</p></section>;

  return (
    <section>
      <header className="page-header">
        <div className="header-with-back">
          <Link className="icon-button" to="/accounts"><ArrowLeft size={19} /></Link>
          <div><p className="eyebrow">Caderneta</p><h1>{customer.name}</h1><p className="muted">{customer.type === "BUSINESS" ? "Comércio" : "Pessoa"} · {customer.phone || "sem telefone"}</p></div>
        </div>
        <div className="account-balance-box"><span>Saldo em aberto</span><strong>{formatCurrency(balance)}</strong></div>
      </header>

      {error && <div className="feedback error">{error}</div>}
      {feedback && <div className="feedback success">{feedback}</div>}

      <div className="account-detail-grid">
        <form className="panel" onSubmit={submitDebit}>
          <div className="panel-heading-row"><div><p className="eyebrow">Cobrança</p><h2>Novo lançamento</h2></div><FilePlus2 size={20} className="muted" /></div>
          <label className="field"><span>Descrição</span><input value={debitDescription} onChange={(e) => setDebitDescription(e.target.value)} placeholder="Ex.: Nota de água - outubro" /></label>
          <label className="field"><span>Valor</span><div className="money-input"><span>R$</span><input value={debitAmount} onChange={(e) => setDebitAmount(e.target.value)} inputMode="decimal" required /></div></label>
          <label className="field"><span>Vencimento</span><input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} /></label>
          <button className="secondary-button cash-main-button">Adicionar débito</button>
        </form>

        <form className="panel" onSubmit={submitPayment}>
          <div className="panel-heading-row"><div><p className="eyebrow">Recebimento</p><h2>Registrar pagamento</h2></div><CircleDollarSign size={20} className="muted" /></div>
          <label className="field"><span>Valor recebido</span><div className="money-input"><span>R$</span><input value={paymentAmount} onChange={(e) => setPaymentAmount(e.target.value)} inputMode="decimal" required /></div></label>
          <label className="field"><span>Forma de pagamento</span><select value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value as PaymentMethod)}>
            <option value="CASH">Dinheiro</option><option value="PIX">PIX</option><option value="DEBIT_CARD">Débito</option><option value="CREDIT_CARD">Crédito</option>
          </select></label>
          <button className="primary-button cash-main-button" disabled={balance <= 0}>Registrar pagamento</button>
        </form>
      </div>

      <div className="panel">
        <div className="panel-heading-row"><div><p className="eyebrow">Histórico</p><h2>Movimentações da caderneta</h2></div></div>
        <div className="data-table-wrapper">
          <table className="data-table">
            <thead><tr><th>Data</th><th>Descrição</th><th>Vencimento</th><th>Tipo</th><th>Valor</th></tr></thead>
            <tbody>{entries.map((entry) => (
              <tr key={entry.id}>
                <td>{new Date(entry.created_at).toLocaleString("pt-BR")}</td>
                <td>{entry.description || "—"}</td>
                <td>{entry.due_date ? new Date(entry.due_date + "T12:00:00").toLocaleDateString("pt-BR") : "—"}</td>
                <td>{entry.type === "PAYMENT" ? "Pagamento" : entry.sale_id ? "Venda fiado" : "Lançamento"}</td>
                <td className={entry.type === "PAYMENT" ? "positive-text" : "warning-text"}>{entry.type === "PAYMENT" ? "- " : "+ "}{formatCurrency(entry.amount_cents)}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
