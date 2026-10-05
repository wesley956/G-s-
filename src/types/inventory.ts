export type InventoryMovementType =
  | "PURCHASE_ENTRY"
  | "SALE_EXIT"
  | "MANUAL_ENTRY"
  | "MANUAL_EXIT"
  | "ADJUSTMENT"
  | "LOSS"
  | "RETURN"
  | "CANCELLED_SALE_RETURN";

export type InventoryMovement = {
  id: string;
  product_id: string;
  product_name: string;
  type: InventoryMovementType;
  quantity: number;
  reference_type: string | null;
  reference_id: string | null;
  reason: string | null;
  created_at: string;
};

export type StockAction =
  | "ENTRY"
  | "EXIT"
  | "ADJUSTMENT"
  | "LOSS";

export type StockFormData = {
  productId: string;
  action: StockAction;
  quantity: string;
  targetQuantity: string;
  reason: string;
};
