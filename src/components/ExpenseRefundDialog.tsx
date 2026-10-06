import { FormEvent, useEffect, useRef, useState } from "react";
import { refundExpense } from "../services/expenseService";
import { formatCurrency } from "../services/productService";
import { paymentLabels } from "../lib/receipt";
import type { Expense } from "../types/expense";

export function ExpenseRefundDialog({ expense, sessionId, onClose, onSuccess }: { expense: Expense; sessionId: string; onClose: () => void; onSuccess: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const busy = useRef(false);
  const attempt = useRef<string | null>(null);
  const [reason, setReason] = useState("");
  const [received, setReceived] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { const element = dialog.current; element?.showModal(); return () => element?.close(); }, []);
  async function submit(event: FormEvent) {
    event.preventDefault(); if (busy.current || !received) return;
    busy.current = true; setSaving(true); setError(null);
    try {
      attempt.current ??= crypto.randomUUID();
      await refundExpense(expense.id, sessionId, reason, attempt.current); onSuccess();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setError(message === "A operação já foi usada com outros dados." ? "O cancelamento já foi registrado. Volte à lista para conferir o histórico." : message);
    } finally { busy.current = false; setSaving(false); }
  }
  return <dialog ref={dialog} className="receipt-refund-dialog" aria-labelledby="expense-refund-title" onCancel={e => { e.preventDefault(); if (!busy.current) onClose(); }}>
    <form onSubmit={submit}><p className="eyebrow">Devolução recebida</p><h2 id="expense-refund-title">Cancelar despesa</h2>
      <p><strong>{expense.description || "Despesa avulsa"}</strong>: {formatCurrency(expense.amount_cents)} por {paymentLabels[expense.payment_method]}.</p>
      <p>O cancelamento registra a devolução integral no caixa atual. O pagamento original e os fechamentos anteriores permanecem no histórico.</p>
      <p>{expense.payment_method === "CASH" ? "Confirme somente após receber o dinheiro de volta." : "Confirme somente após a devolução no banco ou na operadora. Esta tela registra o retorno, sem executar transferência."}</p>
      <label className="field"><span>Motivo do cancelamento</span><textarea autoFocus required maxLength={1000} disabled={saving} value={reason} onChange={e => setReason(e.target.value)} /></label>
      <label className="toggle-field"><input type="checkbox" checked={received} disabled={saving} onChange={e => setReceived(e.target.checked)} /><span>Já recebi a devolução integral</span></label>
      {error && <div className="feedback error" role="alert">{error}</div>}
      <div className="form-actions"><button type="button" className="secondary-button" disabled={saving} onClick={onClose}>Voltar sem cancelar</button><button className="primary-button" disabled={saving || !received || !reason.trim()}>{saving ? "Registrando..." : "Confirmar cancelamento"}</button></div>
    </form>
  </dialog>;
}
