export interface ReportPeriod { start: string; end: string }
export interface Report extends ReportPeriod {
  generatedAt: string; generatedAtLocal: string;
  sales: { count: number; grossCents: number; discountCents: number; soldCents: number; cancelledCount: number; cancelledCents: number; netCents: number };
  cash: { inCents: number; outCents: number; netCents: number; openingCents: number; suppliesCents: number; withdrawalsCents: number; unknownRefundCents: number; closingDifferenceCents: number };
  methods: { method: string; salesCents: number; saleRefundCents: number; receiptsCents: number; receiptRefundCents: number; expensesCents: number; expenseRefundCents: number }[];
  products: { id: string; name: string; soldQuantity: number; cancelledQuantity: number; grossCents: number; cancelledGrossCents: number }[];
  expenses: { category: string; supplierId: string | null; supplier: string; paidCents: number; refundedCents: number }[];
  movements: { id: string; sessionId: string; date: string | null; kind: string; method: string; amountCents: number; cashDeltaCents: number; description: string | null; category: string | null; supplier: string | null; saleNumber: number | null }[];
  closings: { id: string; openingCents: number; expectedCents: number | null; informedCents: number | null; openedAt: string | null; closedAt: string | null; notes: string | null }[];
  accounts: { id: string; name: string; active: boolean; balanceCents: number }[];
  stock: { id: string; name: string; quantity: number; minimum: number; active: boolean }[];
}
export interface ReportExport { path: string | null; report: Report }
