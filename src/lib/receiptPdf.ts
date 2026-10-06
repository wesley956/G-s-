import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { receiptLines } from "./receipt";
import type { PaperFormat, SaleReceipt } from "../types/receipt";

const mm = (value: number) => value * 72 / 25.4;

export async function buildReceiptPdf(receipt: SaleReceipt, format: PaperFormat, copies: 1 | 2): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const supported = new Set(regular.getCharacterSet());
  const sanitize = (value: string) => Array.from(value.normalize("NFC").replace(/\s+/g, " "))
    .map((char) => supported.has(char.codePointAt(0)!) ? char : "?").join("");
  const width = mm(format === "A4" ? 210 : format === "58mm" ? 58 : 80);
  const margin = mm(format === "A4" ? 12 : 3);
  const size = format === "A4" ? 11 : 9;
  const lineHeight = size * 1.4;
  const contentWidth = width - margin * 2;
  pdf.setTitle(`Comprovante da venda #${receipt.sale.sale_number}`);
  pdf.setAuthor(sanitize(receipt.business.businessName));
  pdf.setSubject("Comprovante interno não fiscal");

  for (let copy = 1; copy <= copies; copy++) {
    const lines = receiptLines(receipt, copy, copies).flatMap((line) => {
      if (line.divider) return [{ ...line, text: "" }];
      const font = line.bold ? bold : regular;
      const words = sanitize(line.text).split(" ");
      const wrapped: string[] = [];
      let current = "";
      for (const word of words) {
        const candidate = current ? `${current} ${word}` : word;
        if (font.widthOfTextAtSize(candidate, size) <= contentWidth) { current = candidate; continue; }
        if (current) { wrapped.push(current); current = ""; }
        // A single long name/code must not overflow narrow thermal paper.
        for (const char of word) {
          if (current && font.widthOfTextAtSize(current + char, size) > contentWidth) {
            wrapped.push(current); current = "";
          }
          current += char;
        }
      }
      if (current) wrapped.push(current);
      return (wrapped.length ? wrapped : [""]).map((text) => ({ ...line, text }));
    });
    // Continuous thermal paper uses only the content height. Very long receipts paginate.
    const height = format === "A4" ? mm(297)
      : Math.min(14400, Math.max(mm(60), lines.length * lineHeight + margin * 2));
    let page = pdf.addPage([width, height]);
    let y = height - margin - size;
    for (const line of lines) {
      if (y < margin) {
        page = pdf.addPage([width, height]);
        y = height - margin - size;
      }
      if (line.divider) {
        page.drawLine({ start: { x: margin, y: y + size / 2 }, end: { x: width - margin, y: y + size / 2 }, thickness: 0.4, color: rgb(0, 0, 0) });
      } else {
        page.drawText(line.text, { x: margin, y, size, font: line.bold ? bold : regular, color: rgb(0, 0, 0) });
      }
      y -= lineHeight;
    }
  }
  return pdf.save();
}
