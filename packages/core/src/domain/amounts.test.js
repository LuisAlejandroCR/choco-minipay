import assert from "node:assert/strict";
import test from "node:test";
import { parseKesAmount, formatKesAmount, estimateUsdcForKes, DEFAULT_TEST_KES_AMOUNT } from "./amounts.js";

// parseKesAmount — the most risk-critical function in the codebase.
// Wrong output means the user sends the wrong sum.

test("parses thousands shorthand (50k → 50,000)", () => {
  assert.equal(parseKesAmount("50k"), 50000);
  assert.equal(parseKesAmount("50K"), 50000);
  assert.equal(parseKesAmount("1.5k"), 1500);
  assert.equal(parseKesAmount("1,5k"), 1500); // European decimal comma
  assert.equal(parseKesAmount("100k"), 100000);
});

test("parses explicit KES suffix", () => {
  assert.equal(parseKesAmount("5000 KES"), 5000);
  assert.equal(parseKesAmount("5,000 KES"), 5000);
  assert.equal(parseKesAmount("5000 kes"), 5000);
  assert.equal(parseKesAmount("10 KESM"), 10);
});

test("falls back to DEFAULT_TEST_KES_AMOUNT for unrecognized input", () => {
  assert.equal(parseKesAmount(""), DEFAULT_TEST_KES_AMOUNT);
  assert.equal(parseKesAmount("send mom some money"), DEFAULT_TEST_KES_AMOUNT);
  assert.equal(parseKesAmount("KES only no amount"), DEFAULT_TEST_KES_AMOUNT);
});

test("falls back to custom fallback when supplied", () => {
  assert.equal(parseKesAmount("no digits here", 500), 500);
});

test("formats KES amounts with locale separators", () => {
  assert.equal(formatKesAmount(50000), "50,000");
  assert.equal(formatKesAmount(1000), "1,000");
  assert.equal(formatKesAmount(100), "100");
  assert.equal(formatKesAmount(0), "0");
  // non-numeric coerces to 0
  assert.equal(formatKesAmount("abc"), "0");
});

test("estimates USDC cost for KES amount", () => {
  // At default rate 129.39 KES/USDC, 1293.9 KES ≈ 10 USDC
  const usdc = estimateUsdcForKes(1293.9);
  assert.ok(usdc >= 9.99 && usdc <= 10.01, `Expected ~10, got ${usdc}`);
  // Zero amount
  assert.equal(estimateUsdcForKes(0), 0);
});
