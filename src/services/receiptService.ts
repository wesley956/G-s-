import { getDb } from "../lib/db";
import { isReceiptSnapshot, makeReceiptSnapshot } from "../lib/receipt";
import { getReceiptSettings } from "./receiptSettingsService";
import type { PaperFormat, ReceiptCustomer, ReceiptItem, ReceiptPayment, ReceiptSnapshot, SaleReceipt } from "../types/receipt";

export async function getSaleReceipt(saleId: string): Promise<SaleReceipt> {
  const db = await getDb();
  const sales = await db.select<(SaleReceipt["sale"] & { customer_id: string | null })[]>(
    "SELECT * FROM sales WHERE id = ?", [saleId],
  );
  const sale = sales[0];
  if (!sale) throw new Error("Venda não encontrada.");
  if (sale.status === "OPEN") throw new Error("Finalize a venda antes de gerar o comprovante.");
  const [items, payments, snapshots] = await Promise.all([
    db.select<ReceiptItem[]>("SELECT * FROM sale_items WHERE sale_id = ? ORDER BY rowid", [saleId]),
    db.select<ReceiptPayment[]>("SELECT * FROM payments WHERE sale_id = ? ORDER BY rowid", [saleId]),
    db.select<{ snapshot_json: string }[]>("SELECT snapshot_json FROM sale_receipt_snapshots WHERE sale_id = ?", [saleId]),
  ]);
  let snapshot: ReceiptSnapshot;
  if (snapshots[0]) {
    try {
      const value: unknown = JSON.parse(snapshots[0].snapshot_json);
      if (!isReceiptSnapshot(value)) throw new Error("invalid snapshot");
      snapshot = value;
    } catch { throw new Error("Os dados do comprovante estão inválidos. A venda continua registrada."); }
  } else {
    const [settings, customers] = await Promise.all([
      getReceiptSettings(),
      sale.customer_id
        ? db.select<ReceiptCustomer[]>("SELECT name, document, address, phone FROM customers WHERE id = ?", [sale.customer_id])
        : Promise.resolve([]),
    ]);
    snapshot = makeReceiptSnapshot(settings, customers[0] ?? null);
  }
  return { ...snapshot, sale, items, payments, legacy: !snapshots[0] };
}

export async function recordReceiptOutput(saleId: string, kind: "PRINT_DIALOG" | "PDF_SAVED", format: PaperFormat, copies: 1 | 2) {
  const db = await getDb();
  await db.execute(
    "INSERT INTO receipt_output_events (id, sale_id, kind, paper_format, copies) VALUES (?, ?, ?, ?, ?)",
    [crypto.randomUUID(), saleId, kind, format, copies],
  );
}
