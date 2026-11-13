export type SaleType = "COUNTER" | "DELIVERY";
export type SaleStatus = "OPEN" | "COMPLETED" | "CANCELLED";
export type PaymentMethod = "CASH" | "PIX" | "DEBIT_CARD" | "CREDIT_CARD" | "CREDIT_CUSTOMER";

export type SaleProduct = {
  id: string;
  name: string;
  sku: string | null;
  counter_price_cents: number;
  delivery_price_cents: number;
  stock_quantity: number;
  active: number;
};

export type SaleCartItem = {
  product: SaleProduct;
  quantity: number;
};

export type PaymentInput = {
  method: PaymentMethod;
  amountCents: number;
  receivedCents?: number | null;
};

export type SaleRecord = {
  delivery_status?: "OUT"|"DELIVERED"|"CANCELLED"|null;
  delivery_driver?:string|null; delivery_address?:string|null; delivery_number?:string|null;
  id: string;
  sale_number: number;
  sale_type: SaleType;
  status: SaleStatus;
  subtotal_cents: number;
  discount_cents: number;
  total_cents: number;
  created_at: string;
  completed_at: string | null;
};
