export type CustomerType = "PERSON" | "BUSINESS";

export type Customer = {
  id: string;
  type: CustomerType;
  name: string;
  phone: string | null;
  whatsapp: string | null;
  document: string | null;
  address: string | null;
  notes: string | null;
  active: number;
  created_at: string;
  updated_at: string;
  balance_cents?: number;
};

export type CustomerFormData = {
  type: CustomerType;
  name: string;
  phone: string;
  whatsapp: string;
  document: string;
  address: string;
  notes: string;
  active: boolean;
};

export type AccountEntry = {
  id: string;
  customer_id: string;
  customer_name?: string;
  sale_id: string | null;
  type: "DEBIT" | "PAYMENT" | "ADJUSTMENT";
  description: string | null;
  amount_cents: number;
  paid_cents: number;
  payment_method: import("./sale").PaymentMethod | null;
  receipt_transaction_id: string | null;
  refund_reason: string | null;
  refunded_at: string | null;
  due_date: string | null;
  status: string;
  attachment_path: string | null;
  created_at: string;
};
