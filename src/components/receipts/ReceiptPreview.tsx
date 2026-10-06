import { receiptLines } from "../../lib/receipt";
import type { PaperFormat, SaleReceipt } from "../../types/receipt";

export function ReceiptPreview({ receipt, format, copies }: { receipt: SaleReceipt; format: PaperFormat; copies: 1 | 2 }) {
  return (
    <div className={`receipt-pages paper-${format}`}>
      {Array.from({ length: copies }, (_, index) => (
        <article className="receipt-paper" key={index} aria-label={`Comprovante, via ${index + 1}`}>
          {receiptLines(receipt, index + 1, copies).map((line, lineIndex) =>
            line.divider ? <hr key={lineIndex} /> :
              <p key={lineIndex} className={line.bold ? "receipt-bold" : ""}>{line.text}</p>,
          )}
        </article>
      ))}
    </div>
  );
}
