import type { ReceiptSettings, ReceiptSnapshot, ReceiptCustomer, SaleReceipt } from "../types/receipt";
import type { PaymentMethod } from "../types/sale";

export const defaultReceiptSettings: ReceiptSettings = {
  businessName: "G-s- Gestão de Depósito",
  document: "",
  address: "",
  phone: "",
  footer: "Obrigado pela preferência!",
  paperFormat: "80mm",
  printMode: "ASK",
};
export const paymentLabels: Record<PaymentMethod, string> = {
  CASH: "Dinheiro", PIX: "PIX", DEBIT_CARD: "Débito",
  CREDIT_CARD: "Crédito", CREDIT_CUSTOMER: "Fiado / caderneta",
};

export function normalizeReceiptSettings(value: Partial<ReceiptSettings>): ReceiptSettings {
  const text = (key: keyof ReceiptSettings, limit: number) => {
    const input = value[key];
    return typeof input === "string" ? input.trim().slice(0, limit) : defaultReceiptSettings[key];
  };
  return {
    businessName: text("businessName", 120) || defaultReceiptSettings.businessName,
    document: text("document", 30), address: text("address", 240),
    phone: text("phone", 40), footer: text("footer", 240),
    paperFormat: ["58mm", "80mm", "A4"].includes(value.paperFormat ?? "")
      ? value.paperFormat! : defaultReceiptSettings.paperFormat,
    printMode: ["ASK", "AUTO_ONE", "AUTO_TWO", "NEVER"].includes(value.printMode ?? "")
      ? value.printMode! : defaultReceiptSettings.printMode,
  };
}

export function makeReceiptSnapshot(settings: ReceiptSettings, customer: ReceiptCustomer | null): ReceiptSnapshot {
  const { businessName, document, address, phone, footer } = settings;
  return { version: 1, business: { businessName, document, address, phone, footer }, customer };
}

export function isReceiptSnapshot(value: unknown): value is ReceiptSnapshot {
  if (!value || typeof value !== "object") return false;
  const input = value as Partial<ReceiptSnapshot>;
  if (input.version !== 1 || !input.business || typeof input.business !== "object") return false;
  if (!["businessName", "document", "address", "phone", "footer"].every((key) =>
    typeof (input.business as Record<string, unknown>)[key] === "string")) return false;
  if (input.customer === null) return true;
  if (!input.customer || typeof input.customer !== "object" || typeof input.customer.name !== "string") return false;
  return ["document", "address", "phone"].every((key) => {
    const field = (input.customer as Record<string, unknown>)[key];
    return field === null || typeof field === "string";
  });
}

export function receiptDate(value: string) {
  // SQLite CURRENT_TIMESTAMP is UTC, even without a timezone suffix.
  const normalized = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(value)
    ? `${value.replace(" ", "T")}Z` : value;
  const date = new Date(normalized);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString("pt-BR");
}

export function receiptMoney(cents: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(cents / 100);
}

export type ReceiptLine = { text: string; bold?: boolean; divider?: boolean };

// Shared content for the screen, physical print and PDF.
export function receiptLines(receipt: SaleReceipt, copy: number, copies: number): ReceiptLine[] {
  const { sale, business, customer } = receipt;
  const lines: ReceiptLine[] = [];
  const add = (text: string, bold = false) => lines.push({ text, bold });
  const rule = () => lines.push({ text: "", divider: true });
  add(business.businessName, true);
  if (business.document) add(`CPF/CNPJ: ${business.document}`);
  if (business.address) add(business.address);
  if (business.phone) add(`Telefone: ${business.phone}`);
  rule();
  add("COMPROVANTE DE VENDA - NÃO FISCAL", true);
  add(`Venda #${sale.sale_number} - ${sale.sale_type === "COUNTER" ? "Portaria" : "Entrega"}`, true);
  add(`Data: ${receiptDate(sale.completed_at ?? sale.created_at)}`);
  add(copies === 2 ? `Via ${copy} de 2 - ${copy === 1 ? "Cliente" : "Estabelecimento"}` : "Via única");
  if (sale.status === "CANCELLED") {
    add("VENDA CANCELADA - SEM VALIDADE", true);
    if (sale.cancelled_at) add(`Cancelada em: ${receiptDate(sale.cancelled_at)}`);
    if (sale.cancellation_reason) add(`Motivo: ${sale.cancellation_reason}`);
  }
  rule();
  add(customer ? `Cliente: ${customer.name}` : "Cliente: Consumidor não identificado");
  if (customer?.document) add(`CPF/CNPJ: ${customer.document}`);
  if (customer?.phone) add(`Telefone: ${customer.phone}`);
  if (customer?.address) add(`Endereço: ${customer.address}`);
  rule();
  for (const item of receipt.items) {
    add(item.product_name_snapshot, true);
    add(`${item.quantity.toLocaleString("pt-BR")} x ${receiptMoney(item.unit_price_cents)} = ${receiptMoney(item.total_cents)}`);
  }
  rule();
  add(`Subtotal: ${receiptMoney(sale.subtotal_cents)}`);
  add(`Desconto: ${receiptMoney(sale.discount_cents)}`);
  add(`TOTAL: ${receiptMoney(sale.total_cents)}`, true);
  rule();
  add("Pagamentos", true);
  for (const payment of receipt.payments) {
    add(`${paymentLabels[payment.method]}: ${receiptMoney(payment.amount_cents)}`);
    if (payment.method === "CASH") {
      add(`Recebido: ${receiptMoney(payment.received_cents ?? payment.amount_cents)}`);
      add(`Troco: ${receiptMoney(payment.change_cents ?? 0)}`);
    }
  }
  if (receipt.payments.some((payment) => payment.method === "CREDIT_CUSTOMER")) {
    add("Fiado registrado na caderneta. Não comprova quitação.");
  }
  rule();
  if (business.footer) add(business.footer);
  add("Documento interno. Não substitui documento fiscal.");
  if (receipt.legacy) add("Venda anterior ao módulo de impressão: dados cadastrais atuais.");
  return lines;
}
