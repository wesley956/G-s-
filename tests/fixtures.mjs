export const receipt = {
  version: 1,
  business: { businessName: "Depósito São João", document: "12.345.678/0001-99", address: "Rua do Comércio, 100 - Nova Odessa/SP", phone: "(19) 99999-0000", footer: "Obrigado pela preferência!" },
  customer: { name: "José da Conceição", document: null, phone: "(19) 98888-0000", address: "Rua das Águas, 20" },
  sale: { id: "sale-1", sale_number: 42, sale_type: "DELIVERY", status: "COMPLETED", subtotal_cents: 14000, discount_cents: 1000, total_cents: 13000, created_at: "2026-10-05 14:00:00", completed_at: "2026-10-05 14:00:00", cancelled_at: null, cancellation_reason: null },
  items: [
    { id: "i1", product_name_snapshot: "Gás de cozinha P13", quantity: 1, unit_price_cents: 12000, total_cents: 12000 },
    { id: "i2", product_name_snapshot: "Água mineral - galão de 20 litros", quantity: 2, unit_price_cents: 1000, total_cents: 2000 },
  ],
  payments: [
    { id: "p1", method: "CASH", amount_cents: 8000, received_cents: 10000, change_cents: 2000 },
    { id: "p2", method: "CREDIT_CUSTOMER", amount_cents: 5000, received_cents: null, change_cents: 0 },
  ],
  legacy: false,
};
