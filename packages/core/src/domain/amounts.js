export function parseKesAmount(text, fallbackAmount = 50000) {
  const source = String(text || "");
  const kMatch = source.match(/(\d+(?:[.,]\d+)?)\s*k\b/i);
  if (kMatch) return Math.round(Number(kMatch[1].replace(",", ".")) * 1000);

  const kesMatch = source.match(/(\d[\d,]*)\s*(kes|kesm)\b/i);
  if (kesMatch) return Number(kesMatch[1].replace(/,/g, ""));

  return Number(fallbackAmount) || 50000;
}

export function formatKesAmount(amount) {
  return Math.round(Number(amount) || 0).toLocaleString("en-US");
}

export function estimateUsdcForKes(amountKes, rate = 129.39) {
  return Number((Number(amountKes || 0) / rate).toFixed(2));
}
