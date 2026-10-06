import test from "node:test";
import assert from "node:assert/strict";
import { PDFDocument } from "pdf-lib";
import { receipt } from "./fixtures.mjs";
import { isReceiptSnapshot, normalizeReceiptSettings, receiptLines, receiptDate } from "../src/lib/receipt.ts";
import { buildReceiptPdf } from "../src/lib/receiptPdf.ts";
import { resetDb } from "./sql-mock.mjs";
import { getSaleReceipt, recordReceiptOutput } from "../src/services/receiptService.ts";
import { saveReceiptSettings, getReceiptSettings } from "../src/services/receiptSettingsService.ts";

test("settings normalize defaults and unsupported print modes", () => {
  const value = normalizeReceiptSettings({ paperFormat: "bad", printMode: "silent", businessName: "   " });
  assert.equal(value.paperFormat, "80mm"); assert.equal(value.printMode, "ASK");
  assert.ok(value.businessName.length > 0);
});
test("malformed stored customer or merchant fields are rejected before rendering", () => {
  assert.equal(isReceiptSnapshot(receipt), true);
  assert.equal(isReceiptSnapshot({ ...receipt, business: { ...receipt.business, address: {} } }), false);
  assert.equal(isReceiptSnapshot({ ...receipt, customer: { ...receipt.customer, name: [] } }), false);
});
test("SQLite timestamps are interpreted as UTC", () => {
  assert.equal(receiptDate("2026-10-05 14:00:00"), new Date("2026-10-05T14:00:00Z").toLocaleString("pt-BR"));
});
test("mixed payment receipt shows discount, change, credit warning and copy identity", () => {
  const content = receiptLines(receipt, 1, 2).map((line) => line.text).join("\n");
  for (const text of ["NÃO FISCAL", "Venda #42", "Entrega", "Desconto", "Troco", "Fiado", "Não comprova quitação", "Via 1 de 2 - Cliente"]) assert.ok(content.includes(text), text);
  assert.ok(receiptLines(receipt, 2, 2).some((line) => line.text.includes("Estabelecimento")));
});
test("cancelled and legacy sales show warnings", () => {
  const cancelled = structuredClone(receipt);
  cancelled.sale.status = "CANCELLED"; cancelled.sale.cancellation_reason = "Cliente desistiu"; cancelled.legacy = true;
  const content = receiptLines(cancelled, 1, 1).map((line) => line.text).join("\n");
  assert.ok(content.includes("VENDA CANCELADA - SEM VALIDADE"));
  assert.ok(content.includes("Cliente desistiu")); assert.ok(content.includes("dados cadastrais atuais"));
});
for (const format of ["58mm", "80mm", "A4"]) {
  test(`PDF ${format}: valid pages, correct width and two copies`, async () => {
    const pdf = await PDFDocument.load(await buildReceiptPdf(receipt, format, 2));
    assert.equal(pdf.getPageCount(), 2);
    const expectedWidth = (format === "A4" ? 210 : format === "58mm" ? 58 : 80) * 72 / 25.4;
    assert.ok(Math.abs(pdf.getPage(0).getWidth() - expectedWidth) < 0.01);
    assert.equal(pdf.getTitle(), "Comprovante da venda #42");
  });
}
test("long receipts paginate and unsupported glyphs do not crash PDF", async () => {
  const long = structuredClone(receipt);
  long.customer.name = "José 😊";
  long.items = Array.from({ length: 120 }, (_, i) => ({ ...long.items[0], id: `item-${i}`, product_name_snapshot: "Produto_com_codigo_extremamente_longo_sem_espacos_".repeat(3) }));
  const pdf = await PDFDocument.load(await buildReceiptPdf(long, "A4", 1));
  assert.ok(pdf.getPageCount() > 1);
});

test("settings persist and corrupted settings fail visibly", async () => {
  const db = resetDb();
  await saveReceiptSettings(normalizeReceiptSettings({ businessName: "Loja", paperFormat: "58mm", printMode: "NEVER" }));
  assert.equal((await getReceiptSettings()).printMode, "NEVER"); assert.equal((await getReceiptSettings()).paperFormat, "58mm");
  db.exec("UPDATE app_settings SET value = '{' WHERE key = 'receipt_settings';");
  await assert.rejects(getReceiptSettings(), /inválidas/);
});
