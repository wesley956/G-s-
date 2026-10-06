export interface Dashboard {
  day: string; generatedAtLocal: string; cashOpen: boolean;
  salesCount: number; soldCents: number; cancelledCount: number; cancelledCents: number;
  creditSalesCents: number; balanceCents: number; debtorsCount: number; lowStockCount: number;
  methods: { method: string; salesCents: number; saleRefundCents: number; receiptsCents: number; receiptRefundCents: number }[];
}
