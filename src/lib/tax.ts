// Single source of truth for VAT in the app.
// Backend re-validates using the same constant.
export const VAT_RATE = 0.10;

const round2 = (n: number) => Math.round(n * 100) / 100;

export function computeTotals(subtotal: number, vatRate = VAT_RATE) {
  const sub = round2(subtotal);
  const vat = round2(sub * vatRate);
  const total = round2(sub + vat);
  return { subtotal: sub, vat, total };
}
