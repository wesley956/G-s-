// Accept Brazilian amounts and decimal-dot input; reject ambiguous thousand-only input.
export function parseDecimal(value: string, emptyIsZero = true): number {
  const input = value.trim();
  if (!input && emptyIsZero) return 0;
  const normalized = input.includes(",") ? input.replace(/\./g, "").replace(",", ".") : input;
  if (!/^\d+(\.\d{1,2})?$/.test(normalized)) throw new Error("Informe um valor válido com até duas casas decimais.");
  const number = Number(normalized);
  if (!Number.isFinite(number) || number > 10_000_000_000) throw new Error("Valor fora do limite permitido.");
  return number;
}
export function toCents(value: string): number { return Math.round(parseDecimal(value) * 100); }
export function previewCents(value: string): number { try { return toCents(value); } catch { return 0; } }
