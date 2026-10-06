export type Category = {
  id: string;
  name: string;
  active: number;
};

export type Product = {
  id: string;
  category_id: string | null;
  sku: string | null;
  name: string;
  description: string | null;
  cost_price_cents: number;
  counter_price_cents: number;
  delivery_price_cents: number;
  stock_quantity: number;
  minimum_stock: number;
  active: number;
  created_at: string;
  updated_at: string;
};

export type ProductFormData = {
  name: string;
  categoryId: string;
  sku: string;
  description: string;
  costPrice: string;
  counterPrice: string;
  deliveryPrice: string;
  stockQuantity: string;
  minimumStock: string;
  active: boolean;
};
