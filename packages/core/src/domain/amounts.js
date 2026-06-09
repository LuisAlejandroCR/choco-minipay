export const DEFAULT_TEST_KES_AMOUNT = 10;
export const DEFAULT_KES_PER_USDC = 129.39;

export function parseKesAmount(text, fallbackAmount = DEFAULT_TEST_KES_AMOUNT) {
  const source = String(text || "");
  const kMatch = source.match(/(\d+(?:[.,]\d+)?)\s*k\b/i);
  if (kMatch) return Math.round(Number(kMatch[1].replace(",", ".")) * 1000);

  const kesMatch = source.match(/(\d[\d,]*)\s*(kes|kesm)\b/i);
  if (kesMatch) return Number(kesMatch[1].replace(/,/g, ""));

  return Number(String(fallbackAmount).replace(/,/g, "")) || DEFAULT_TEST_KES_AMOUNT;
}

export function formatKesAmount(amount) {
  return Math.round(Number(amount) || 0).toLocaleString("en-US");
}

export function estimateUsdcForKes(amountKes, rate = DEFAULT_KES_PER_USDC) {
  return Number((Number(amountKes || 0) / rate).toFixed(2));
}

export function formatUsdcAmount(amount) {
  return Number(amount || 0).toFixed(2);
}
