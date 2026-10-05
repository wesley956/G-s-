import { invoke } from "@tauri-apps/api/core";
import { Printer, FileDown, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { createPortal, flushSync } from "react-dom";
import { Link } from "react-router-dom";
import { getSaleReceipt, recordReceiptOutput } from "../../services/receiptService";
import { getReceiptSettings } from "../../services/receiptSettingsService";
import type { PaperFormat, SaleReceipt } from "../../types/receipt";
import { ReceiptPreview } from "./ReceiptPreview";

type Props = { saleId: string; autoCopies?: 1 | 2; onClose: () => void };

export function ReceiptDialog({ saleId, autoCopies, onClose }: Props) {
  const [receipt, setReceipt] = useState<SaleReceipt | null>(null);
  const [format, setFormat] = useState<PaperFormat>("80mm");
  const [copies, setCopies] = useState<1 | 2>(autoCopies ?? 1);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [printing, setPrinting] = useState(false);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const autoStarted = useRef(false);
  const operationStarted = useRef(false);

  useEffect(() => {
    const dialog = dialogRef.current;
    const previousFocus = document.activeElement as HTMLElement | null;
    dialog?.showModal();
    return () => { dialog?.close(); previousFocus?.focus(); };
  }, []);

  useEffect(() => {
    let active = true;
    void Promise.all([getSaleReceipt(saleId), getReceiptSettings()])
      .then(([data, settings]) => { if (active) { setReceipt(data); setFormat(settings.paperFormat); } })
      .catch((err) => { if (active) setError(err instanceof Error ? err.message : "Não foi possível carregar o comprovante."); });
    return () => { active = false; };
  }, [saleId]);

  async function audit(kind: "PRINT_DIALOG" | "PDF_SAVED") {
    try { await recordReceiptOutput(saleId, kind, format, copies); }
    catch { setError("A operação foi concluída, mas não foi possível registrar seu histórico. Não é preciso repetir a venda."); }
  }

  async function print() {
    if (!receipt || operationStarted.current) return;
    operationStarted.current = true;
    setBusy(true); setError(null); setMessage(null);
    const pageStyle = document.createElement("style");
    // Thermal length is controlled by the Windows printer driver's roll settings.
    pageStyle.textContent = format === "A4" ? "@page { size: A4; margin: 12mm; }" : "@page { size: auto; margin: 0; }";
    document.head.append(pageStyle);
    try {
      flushSync(() => setPrinting(true));
      // Let the committed receipt layout reach the compositor before WebView2 printing.
      await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
      window.print();
      setMessage("Impressão solicitada. Confirme a impressora e o papel na janela do Windows. Se cancelou, você pode tentar novamente.");
      await audit("PRINT_DIALOG");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível abrir a impressão. A venda está salva.");
    } finally {
      setPrinting(false); pageStyle.remove(); setBusy(false); operationStarted.current = false;
    }
  }

  useEffect(() => {
    if (receipt && autoCopies && !autoStarted.current) {
      autoStarted.current = true;
      void print();
    }
  }, [receipt, autoCopies]);

  async function savePdf() {
    if (!receipt || operationStarted.current) return;
    operationStarted.current = true;
    setBusy(true); setError(null); setMessage(null);
    try {
      const { buildReceiptPdf } = await import("../../lib/receiptPdf");
      const bytes = await buildReceiptPdf(receipt, format, copies);
      const path = await invoke<string | null>("save_receipt_pdf", {
        saleNumber: receipt.sale.sale_number, pdfBytes: Array.from(bytes),
      });
      if (path) { setMessage(`PDF salvo em: ${path}`); await audit("PDF_SAVED"); }
      else { setMessage("Salvamento cancelado. A venda continua registrada."); }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally { setBusy(false); operationStarted.current = false; }
  }

  return createPortal(
    <>
      <dialog ref={dialogRef} className="receipt-dialog" aria-labelledby="receipt-title"
        onCancel={(event) => { event.preventDefault(); if (!busy) onClose(); }}>
        <header className="receipt-dialog-header">
          <div><p className="eyebrow">Venda registrada</p><h2 id="receipt-title">Comprovante {receipt ? `#${receipt.sale.sale_number}` : ""}</h2></div>
          <button className="ghost-button" aria-label="Fechar comprovante" disabled={busy} onClick={onClose}><X size={20} /></button>
        </header>
        <div className="receipt-toolbar">
          <label className="field"><span>Papel</span><select value={format} disabled={busy} onChange={(e) => setFormat(e.target.value as PaperFormat)}>
            <option value="58mm">Térmica 58 mm</option><option value="80mm">Térmica 80 mm</option><option value="A4">A4</option>
          </select></label>
          <label className="field"><span>Vias</span><select value={copies} disabled={busy} onChange={(e) => setCopies(Number(e.target.value) as 1 | 2)}>
            <option value={1}>1 via</option><option value={2}>2 vias: cliente e estabelecimento</option>
          </select></label>
          <Link className="ghost-button" to="/settings/printer" aria-disabled={busy}
            onClick={(event) => { if (busy) event.preventDefault(); else onClose(); }}>Configurar impressão</Link>
        </div>
        {error && <div role="alert" className="feedback error">{error}</div>}
        {message && <div role="status" className="feedback success">{message}</div>}
        <div className="receipt-preview-area">
          {receipt ? <ReceiptPreview receipt={receipt} format={format} copies={copies} /> :
            <p className="muted">{error ? "O comprovante pode ser aberto novamente pelo histórico de vendas." : "Carregando comprovante..."}</p>}
        </div>
        <footer className="receipt-dialog-actions">
          <button className="ghost-button" disabled={busy} onClick={onClose}>Não imprimir / fechar</button>
          <button className="secondary-button" disabled={busy || !receipt} onClick={savePdf}><FileDown size={18} /> Salvar PDF</button>
          <button className="primary-button" disabled={busy || !receipt} onClick={print}><Printer size={18} /> {busy ? "Aguarde..." : `Imprimir ${copies} ${copies === 1 ? "via" : "vias"}`}</button>
        </footer>
      </dialog>
      {printing && receipt && <div id="receipt-print-root"><ReceiptPreview receipt={receipt} format={format} copies={copies} /></div>}
    </>, document.body,
  );
}
