import { FormEvent, useEffect, useRef, useState } from "react";
import { formatCurrency } from "../services/productService";
import { listReceiptAllocations, refundCustomerPayment } from "../services/customerService";
import type { AccountEntry } from "../types/customer";

export const receiptMethodNames: Record<string, string> = { CASH: "Dinheiro", PIX: "PIX", DEBIT_CARD: "Débito", CREDIT_CARD: "Crédito" };

export function ReceiptRefundDialog({ entry, onClose, onSuccess }: { entry: AccountEntry; onClose: () => void; onSuccess: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const busy = useRef(false);
  const attempt = useRef<{ signature: string; id: string } | null>(null);
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [allocations, setAllocations] = useState<{ description: string | null; amount_cents: number }[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const element = dialog.current;
    element?.showModal();
    let active = true;
    void listReceiptAllocations(entry.id).then(rows => { if (active) setAllocations(rows); }).catch(err => { if (active) setError(String(err)); });
    return () => { active = false; element?.close(); };
  }, [entry.id]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy.current || !allocations) return;
    busy.current = true; setSaving(true); setError(null);
    try {
      const signature = JSON.stringify({ paymentId: entry.id, customerId: entry.customer_id, reason: reason.trim() });
      if (attempt.current?.signature !== signature) attempt.current = { signature, id: crypto.randomUUID() };
      await refundCustomerPayment({ customerId: entry.customer_id, paymentId: entry.id, reason: reason.trim(), operationId: attempt.current.id });
      onSuccess();
    } catch (err) { setError(err instanceof Error ? err.message : String(err)); }
    finally { busy.current = false; setSaving(false); }
  }

  return <dialog ref={dialog} className="receipt-refund-dialog" aria-labelledby="refund-title" onCancel={event => { event.preventDefault(); if (!busy.current) onClose(); }}>
    <form onSubmit={submit}>
      <p className="eyebrow">Devolução ao cliente</p><h2 id="refund-title">Estornar recebimento</h2>
      <p>Devolver <strong>{formatCurrency(entry.amount_cents)}</strong> por <strong>{receiptMethodNames[entry.payment_method || ""] || "forma desconhecida"}</strong>, registrando a saída no caixa aberto.</p>
      {entry.payment_method !== "CASH" && <p>Faça a devolução no banco ou na operadora antes de confirmar. Esta tela registra a devolução na caderneta e no caixa.</p>}
      <p>O estorno devolve o recebimento inteiro e reabre os débitos abaixo. A venda e o estoque só mudam quando você cancelar a venda em Vendas.</p>
      {allocations ? <ul>{allocations.map((item, index) => <li key={index}>{item.description || "Lançamento"}: {formatCurrency(item.amount_cents)}</li>)}</ul> : <p>Carregando débitos afetados...</p>}
      <label className="field"><span>Motivo do estorno</span><textarea autoFocus required value={reason} disabled={saving} onChange={event => setReason(event.target.value)} /></label>
      {error && <p className="feedback error" role="alert">{error}</p>}
      <div className="form-actions"><button type="button" className="secondary-button" disabled={saving} onClick={onClose}>Voltar sem estornar</button><button className="primary-button" disabled={saving || !allocations?.length || !reason.trim()}>{saving ? "Registrando..." : "Confirmar devolução"}</button></div>
    </form>
  </dialog>;
}
