import type { PaymentMethod, SaleRecord } from "./sale";

export type PaperFormat = "58mm" | "80mm" | "A4";
export type PrintMode = "ASK" | "AUTO_ONE" | "AUTO_TWO" | "NEVER";
export type ReceiptSettings = {
  businessName: string;
  document: string;
  address: string;
  phone: string;
  footer: string;
  paperFormat: PaperFormat;
  printMode: PrintMode;
};
export type ReceiptCustomer = {
  name: string;
  document: string | null;
  address: string | null;
  phone: string | null;
};
export type ReceiptSnapshot = {
  version: 1;
  business: Pick<ReceiptSettings, "businessName" | "document" | "address" | "phone" | "footer">;
  customer: ReceiptCustomer | null;
};
export type ReceiptItem = {
  id: string;
  product_name_snapshot: string;
  quantity: number;
  unit_price_cents: number;
  total_cents: number;
};
export type ReceiptPayment = {
  id: string;
  method: PaymentMethod;
  amount_cents: number;
  received_cents: number | null;
  change_cents: number | null;
};
export type SaleReceipt = ReceiptSnapshot & {
  sale: SaleRecord & { cancelled_at: string | null; cancellation_reason: string | null };
  items: ReceiptItem[];
  payments: ReceiptPayment[];
  legacy: boolean;
};
