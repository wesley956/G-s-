import test from "node:test";
import assert from "node:assert/strict";
import { PDFDocument } from "pdf-lib";
import { receipt } from "./fixtures.mjs";
import { isReceiptSnapshot, normalizeReceiptSettings, receiptLines, receiptDate } from "../src/lib/receipt.ts";
import { buildReceiptPdf } from "../src/lib/receiptPdf.ts";
import { resetDb } from "./sql-mock.mjs";
import { completeSale, cancelSale } from "../src/services/saleService.ts";
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

function seed() {
  const db = resetDb();
  db.exec(`INSERT INTO cash_sessions (id,status) VALUES ('cash','OPEN');
    INSERT INTO products (id,name,counter_price_cents,delivery_price_cents,stock_quantity) VALUES ('product','Gás P13',11000,12000,10);
    INSERT INTO customers (id,name,phone) VALUES ('customer','José','123');`);
  return db;
}
function saleInput() {
  return { saleType: "DELIVERY", customerId: "customer", discountCents: 1000,
    items: [{ product: { id: "product", name: "Gás P13", counter_price_cents: 11000, delivery_price_cents: 12000, stock_quantity: 10, active: 1 }, quantity: 1 }],
    payments: [{ method: "CASH", amountCents: 6000, receivedCents: 10000 }, { method: "CREDIT_CUSTOMER", amountCents: 5000 }],
  };
}
test("sale snapshot survives later merchant, customer and product edits", async () => {
  const db = seed();
  await saveReceiptSettings(normalizeReceiptSettings({ businessName: "Depósito original", footer: "Volte sempre", printMode: "AUTO_TWO" }));
  const result = await completeSale(saleInput());
  assert.equal(result.printMode, "AUTO_TWO");
  await saveReceiptSettings(normalizeReceiptSettings({ businessName: "Novo nome" }));
  db.exec("UPDATE customers SET name = 'Outro nome'; UPDATE products SET name = 'Outro produto', delivery_price_cents = 99999;");
  const saved = await getSaleReceipt(result.saleId);
  assert.equal(saved.business.businessName, "Depósito original"); assert.equal(saved.customer.name, "José");
  assert.equal(saved.items[0].product_name_snapshot, "Gás P13"); assert.equal(saved.items[0].unit_price_cents, 12000);
  assert.equal(saved.payments[0].change_cents, 4000); assert.equal(saved.legacy, false);
});
test("snapshot failure rolls back sale, inventory and cash on one SQLite connection", async () => {
  const db = seed();
  db.exec("CREATE TRIGGER fail_snapshot BEFORE INSERT ON sale_receipt_snapshots BEGIN SELECT RAISE(ABORT,'forced failure'); END;");
  await assert.rejects(completeSale(saleInput()), /forced failure/);
  assert.equal(db.prepare("SELECT COUNT(*) AS count FROM sales").get().count, 0);
  assert.equal(db.prepare("SELECT stock_quantity FROM products").get().stock_quantity, 10);
  assert.equal(db.prepare("SELECT COUNT(*) AS count FROM cash_transactions").get().count, 0);
});
test("view and reprint do not duplicate sale, inventory or cash", async () => {
  const db = seed(); const result = await completeSale(saleInput());
  for (let i = 0; i < 2; i++) { await getSaleReceipt(result.saleId); await recordReceiptOutput(result.saleId, "PRINT_DIALOG", "80mm", 2); }
  assert.equal(db.prepare("SELECT COUNT(*) AS count FROM sales").get().count, 1);
  assert.equal(db.prepare("SELECT stock_quantity FROM products").get().stock_quantity, 9);
  assert.equal(db.prepare("SELECT COUNT(*) AS count FROM cash_transactions").get().count, 2);
  assert.equal(db.prepare("SELECT COUNT(*) AS count FROM receipt_output_events").get().count, 2);
  await cancelSale(result.saleId, "Cancelamento teste");
  const cancelled = await getSaleReceipt(result.saleId);
  assert.equal(cancelled.sale.status, "CANCELLED"); assert.equal(cancelled.sale.cancellation_reason, "Cancelamento teste");
});
test("legacy, corrupt, missing and unfinished sale receipts", async () => {
  const db = seed(); const result = await completeSale(saleInput());
  db.prepare("DELETE FROM sale_receipt_snapshots WHERE sale_id = ?").run(result.saleId);
  assert.equal((await getSaleReceipt(result.saleId)).legacy, true);
  db.prepare("INSERT INTO sale_receipt_snapshots (sale_id,snapshot_json) VALUES (?,?)").run(result.saleId, "bad json");
  await assert.rejects(getSaleReceipt(result.saleId), /inválidos/);
  await assert.rejects(getSaleReceipt("missing"), /não encontrada/);
  db.exec("INSERT INTO sales (id,sale_number,sale_type,status) VALUES ('open',999,'COUNTER','OPEN');");
  await assert.rejects(getSaleReceipt("open"), /Finalize/);
});
test("settings persist and corrupted settings fail visibly", async () => {
  const db = seed();
  await saveReceiptSettings(normalizeReceiptSettings({ businessName: "Loja", paperFormat: "58mm", printMode: "NEVER" }));
  assert.equal((await getReceiptSettings()).printMode, "NEVER"); assert.equal((await getReceiptSettings()).paperFormat, "58mm");
  db.exec("UPDATE app_settings SET value = '{' WHERE key = 'receipt_settings';");
  await assert.rejects(getReceiptSettings(), /inválidas/);
});
