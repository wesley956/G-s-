import {
  ArrowDownToLine,
  ArrowUpFromLine,
  CircleDollarSign,
  LockKeyhole,
  ReceiptText,
  WalletCards,
} from "lucide-react";
import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { paymentLabels } from "../lib/receipt";
import { previewCents } from "../lib/money";
import { receiptDate } from "../lib/receipt";
import { formatCurrency } from "../services/productService";
import {
  addCashTransaction,
  closeCashRegister,
  getCashSummary,
  getOpenCashSession,
  listCashTransactions,
  listClosedCashSessions,
  openCashRegister,
} from "../services/cashService";
import type { CashSession, CashSummary, CashTransaction } from "../types/cash";

const emptySummary: CashSummary = {
  openingBalanceCents: 0,
  cashSalesCents: 0,
  pixSalesCents: 0,
  debitSalesCents: 0,
  creditSalesCents: 0,
  customerCreditCents: 0,
  receiptCashCents: 0,
  receiptPixCents: 0,
  receiptDebitCents: 0,
  receiptCreditCents: 0,
  suppliesCents: 0,
  withdrawalsCents: 0,
  expensesCents: 0,
  cashExpensesCents: 0, pixExpensesCents: 0, debitExpensesCents: 0, creditExpensesCents: 0,
  reversalsCents: 0,
  expectedCashCents: 0,
  totalSalesCents: 0,
};

const typeLabels: Record<string, string> = {
  SALE: "Venda",
  RECEIPT: "Recebimento de caderneta",
  SUPPLY: "Suprimento",
  WITHDRAWAL: "Sangria",
  EXPENSE: "Despesa",
  REVERSAL: "Estorno",
};

export function CashRegisterPage() {
  const [session, setSession] = useState<CashSession | null>(null);
  const [summary, setSummary] = useState<CashSummary>(emptySummary);
  const [transactions, setTransactions] = useState<CashTransaction[]>([]);
  const [history, setHistory] = useState<CashSession[]>([]);
  const [openingBalance, setOpeningBalance] = useState("");
  const [openingNotes, setOpeningNotes] = useState("");
  const [movementType, setMovementType] = useState<"SUPPLY" | "WITHDRAWAL">("SUPPLY");
  const [movementAmount, setMovementAmount] = useState("");
  const [movementDescription, setMovementDescription] = useState("");
  const [closingAmount, setClosingAmount] = useState("");
  const [closingNotes, setClosingNotes] = useState("");
  const busy = useRef(false);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    const current = await getOpenCashSession();
    setSession(current);
    setHistory(await listClosedCashSessions());

    if (current) {
      const [summaryRows, transactionRows] = await Promise.all([
        getCashSummary(current),
        listCashTransactions(current.id),
      ]);
      setSummary(summaryRows);
      setTransactions(transactionRows);
    } else {
      setSummary(emptySummary);
      setTransactions([]);
    }
  }

  useEffect(() => {
    void load().catch(err => setError(String(err)));
  }, []);

  const difference = useMemo(() => {
    const normalized = previewCents(closingAmount);
    return Math.round(normalized) - summary.expectedCashCents;
  }, [closingAmount, summary.expectedCashCents]);

  async function handleOpen(event: FormEvent) {
    event.preventDefault();
    if (busy.current) return; busy.current = true; setSaving(true);
    setError(null);
    setFeedback(null);
    try {
      await openCashRegister(openingBalance, openingNotes);
      setOpeningBalance("");
      setOpeningNotes("");
      setFeedback("Caixa aberto com sucesso.");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível abrir o caixa.");
    } finally { busy.current=false; setSaving(false); }
  }

  async function handleMovement(event: FormEvent) {
    event.preventDefault();
    if (!session) return;
    if (busy.current) return; busy.current = true; setSaving(true);
    setError(null);
    setFeedback(null);

    try {
      await addCashTransaction({
        sessionId: session.id,
        type: movementType,
        amount: movementAmount,
        description: movementDescription,
      });
      setMovementAmount("");
      setMovementDescription("");
      setFeedback("Movimentação registrada.");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível registrar.");
    } finally { busy.current=false; setSaving(false); }
  }

  async function handleClose(event: FormEvent) {
    event.preventDefault();
    if (!session) return;
    if (busy.current) return; busy.current = true; setSaving(true);
    setError(null);
    setFeedback(null);

    try {
      const result = await closeCashRegister({
        session,
        informedAmount: closingAmount,
        notes: closingNotes,
      });
      const sign = result.differenceCents > 0 ? "+" : "";
      setFeedback(
        `Caixa fechado. Diferença: ${sign}${formatCurrency(result.differenceCents)}`,
      );
      setClosingAmount("");
      setClosingNotes("");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível fechar o caixa.");
    } finally { busy.current=false; setSaving(false); }
  }

  if (!session) {
    return (
      <section className="cash-page">
        <header className="page-header">
          <div>
            <p className="eyebrow">Controle financeiro diário</p>
            <h1>Caixa</h1>
            <p className="muted">Abra o caixa antes de iniciar as vendas do dia.</p>
          </div>
        </header>

        <div className="cash-closed-layout">
          <form className="panel cash-open-card" onSubmit={handleOpen}>
            <div className="cash-icon"><LockKeyhole size={28} /></div>
            <h2>Caixa fechado</h2>
            <p className="muted">Informe o dinheiro inicial disponível para troco.</p>

            <label className="field">
              <span>Valor inicial</span>
              <div className="money-input">
                <span>R$</span>
                <input
                  value={openingBalance}
                  onChange={(event) => setOpeningBalance(event.target.value)}
                  inputMode="decimal"
                  placeholder="0,00"
                />
              </div>
            </label>

            <label className="field">
              <span>Observação</span>
              <textarea
                rows={3}
                value={openingNotes}
                onChange={(event) => setOpeningNotes(event.target.value)}
                placeholder="Ex.: fundo de troco do início do turno"
              />
            </label>

            {error && <div className="feedback error">{error}</div>}
            {feedback && <div className="feedback success">{feedback}</div>}

            <button disabled={saving} className="primary-button cash-main-button">
              Abrir caixa
            </button>
          </form>

          <div className="panel">
            <p className="eyebrow">Histórico</p>
            <h2>Últimos fechamentos</h2>
            {history.length === 0 ? (
              <p className="muted">Nenhum caixa fechado ainda.</p>
            ) : (
              <div className="cash-history">
                {history.map((item) => (
                  <div key={item.id} className="cash-history-row">
                    <div>
                      <strong>{new Date(item.opened_at).toLocaleDateString("pt-BR")}</strong>
                      <span>
                        {new Date(item.opened_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                        {" → "}
                        {item.closed_at
                          ? new Date(item.closed_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })
                          : "—"}
                      </span>
                    </div>
                    <div>
                      <span>Esperado</span>
                      <strong>{formatCurrency(item.closing_expected_cents ?? 0)}</strong>
                    </div>
                    <div>
                      <span>Informado</span>
                      <strong>{formatCurrency(item.closing_informed_cents ?? 0)}</strong>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="cash-page">
      <header className="page-header">
        <div>
          <p className="eyebrow">Controle financeiro diário</p>
          <h1>Caixa aberto</h1>
          <p className="muted">
            Aberto em {receiptDate(session.opened_at)}.
          </p>
        </div>
        <span className="cash-open-pill">● ABERTO</span>
      </header>

      <div className="cash-metrics">
        <article>
          <span>Vendas menos estornos</span>
          <strong>{formatCurrency(summary.totalSalesCents)}</strong>
        </article>
        <article>
          <span>Dinheiro em caixa</span>
          <strong>{formatCurrency(summary.expectedCashCents)}</strong>
        </article>
        <article>
          <span>PIX</span>
          <strong>{formatCurrency(summary.pixSalesCents)}</strong>
        </article>
        <article>
          <span>Cartões</span>
          <strong>{formatCurrency(summary.debitSalesCents + summary.creditSalesCents)}</strong>
        </article>
      </div>

      <div className="cash-grid">
        <div>
          <div className="panel">
            <div className="panel-heading-row">
              <div>
                <p className="eyebrow">Resumo</p>
                <h2>Movimento do caixa</h2>
              </div>
              <WalletCards className="muted" size={20} />
            </div>

            <div className="cash-breakdown">
              <div><span>Abertura</span><strong>{formatCurrency(summary.openingBalanceCents)}</strong></div>
              <div><span>Vendas em dinheiro</span><strong>{formatCurrency(summary.cashSalesCents)}</strong></div>
              <div><span>PIX</span><strong>{formatCurrency(summary.pixSalesCents)}</strong></div>
              <div><span>Débito</span><strong>{formatCurrency(summary.debitSalesCents)}</strong></div>
              <div><span>Crédito</span><strong>{formatCurrency(summary.creditSalesCents)}</strong></div>
              <div><span>Fiado</span><strong>{formatCurrency(summary.customerCreditCents)}</strong></div>
              <div><span>Caderneta — dinheiro</span><strong>{formatCurrency(summary.receiptCashCents)}</strong></div>
              <div><span>Caderneta — PIX</span><strong>{formatCurrency(summary.receiptPixCents)}</strong></div>
              <div><span>Caderneta — débito</span><strong>{formatCurrency(summary.receiptDebitCents)}</strong></div>
              <div><span>Caderneta — crédito</span><strong>{formatCurrency(summary.receiptCreditCents)}</strong></div>
              <div><span>Suprimentos</span><strong className="positive-text">+ {formatCurrency(summary.suppliesCents)}</strong></div>
              <div><span>Sangrias</span><strong className="danger-text">- {formatCurrency(summary.withdrawalsCents)}</strong></div>
              <div><span>Despesas — dinheiro</span><strong>{formatCurrency(summary.cashExpensesCents)}</strong></div>
              <div><span>Despesas — PIX</span><strong>{formatCurrency(summary.pixExpensesCents)}</strong></div>
              <div><span>Despesas — débito</span><strong>{formatCurrency(summary.debitExpensesCents)}</strong></div>
              <div><span>Despesas — crédito</span><strong>{formatCurrency(summary.creditExpensesCents)}</strong></div>
              <p className="muted">Despesas líquidas das devoluções neste caixa. Valores negativos indicam devoluções recebidas.</p>
              <div className="cash-total-row"><span>Esperado em dinheiro</span><strong>{formatCurrency(summary.expectedCashCents)}</strong></div>
            </div>
          </div>

          <div className="panel">
            <div className="panel-heading-row">
              <div>
                <p className="eyebrow">Histórico</p>
                <h2>Movimentações</h2>
              </div>
              <ReceiptText className="muted" size={20} />
            </div>

            {transactions.length === 0 ? (
              <p className="muted">Nenhuma movimentação registrada neste caixa.</p>
            ) : (
              <div className="data-table-wrapper">
                <table className="data-table">
                  <thead>
                    <tr><th>Hora</th><th>Tipo</th><th>Descrição</th><th>Forma</th><th>Valor</th></tr>
                  </thead>
                  <tbody>
                    {transactions.map((item) => (
                      <tr key={item.id}>
                        <td>{receiptDate(item.created_at)}</td>
                        <td>{item.expense_refund ? "Devolução de despesa" : typeLabels[item.type] ?? item.type}</td>
                        <td>{item.description || "—"}</td>
                        <td>{item.payment_method ? paymentLabels[item.payment_method] : "Dinheiro"}</td>
                        <td className={item.type === "SUPPLY" || item.type === "SALE" || item.type === "RECEIPT" ? "positive-text" : "danger-text"}>
                          {item.type === "SUPPLY" || item.type === "SALE" || item.type === "RECEIPT" ? "+" : "-"}{formatCurrency(item.amount_cents)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        <div>
          <form className="panel" onSubmit={handleMovement}>
            <div className="panel-heading-row">
              <div>
                <p className="eyebrow">Movimentar</p>
                <h2>Entrada ou saída</h2>
              </div>
              <CircleDollarSign className="muted" size={20} />
            </div>

            <div className="cash-action-selector">
              <button type="button" className={movementType === "SUPPLY" ? "selected" : ""} onClick={() => setMovementType("SUPPLY")}>
                <ArrowDownToLine size={17} /> Suprimento
              </button>
              <button type="button" className={movementType === "WITHDRAWAL" ? "selected" : ""} onClick={() => setMovementType("WITHDRAWAL")}>
                <ArrowUpFromLine size={17} /> Sangria
              </button>
              <Link className="secondary-button" to="/expenses/new"><ReceiptText size={17} /> Despesa</Link>
            </div>

            <label className="field">
              <span>Valor</span>
              <div className="money-input">
                <span>R$</span>
                <input value={movementAmount} onChange={(e) => setMovementAmount(e.target.value)} inputMode="decimal" required />
              </div>
            </label>

            <label className="field">
              <span>Descrição</span>
              <textarea rows={3} value={movementDescription} onChange={(e) => setMovementDescription(e.target.value)} placeholder="Motivo da movimentação" />
            </label>

            <button disabled={saving} className="secondary-button cash-main-button">Registrar</button>
          </form>

          <form className="panel close-cash-panel" onSubmit={handleClose}>
            <div className="panel-heading-row">
              <div>
                <p className="eyebrow">Fechamento</p>
                <h2>Conferir caixa</h2>
              </div>
              <LockKeyhole className="muted" size={20} />
            </div>

            <div className="expected-box">
              <span>Valor esperado em dinheiro</span>
              <strong>{formatCurrency(summary.expectedCashCents)}</strong>
            </div>

            <label className="field">
              <span>Valor contado</span>
              <div className="money-input">
                <span>R$</span>
                <input value={closingAmount} onChange={(e) => setClosingAmount(e.target.value)} inputMode="decimal" required />
              </div>
            </label>

            <div className="difference-preview">
              <span>Diferença</span>
              <strong className={difference === 0 ? "" : difference > 0 ? "positive-text" : "danger-text"}>
                {difference > 0 ? "+" : ""}{formatCurrency(difference)}
              </strong>
            </div>

            <label className="field">
              <span>Observação do fechamento</span>
              <textarea rows={3} value={closingNotes} onChange={(e) => setClosingNotes(e.target.value)} />
            </label>

            {error && <div className="feedback error">{error}</div>}
            {feedback && <div className="feedback success">{feedback}</div>}

            <button disabled={saving} className="primary-button danger-button cash-main-button">
              Fechar caixa
            </button>
          </form>
        </div>
      </div>
    </section>
  );
}
