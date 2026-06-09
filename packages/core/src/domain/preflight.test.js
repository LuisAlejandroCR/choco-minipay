import assert from "node:assert/strict";
import test from "node:test";
import {
  evaluateAgentPreflight,
  formatCeloBalance,
  hasPositiveWeiBalance,
  normalizeChainId,
} from "./preflight.js";

test("normalizes Celo Sepolia testnet chain ids", () => {
  assert.equal(normalizeChainId("0xaa044c"), 11142220);
  assert.equal(normalizeChainId("0xAA044C"), 11142220);
  assert.equal(normalizeChainId("11142220"), 11142220);
});

test("formats native gas balance", () => {
  assert.equal(hasPositiveWeiBalance("0x0"), false);
  assert.equal(hasPositiveWeiBalance("0x1"), true);
  assert.equal(formatCeloBalance("0x0"), "0 CELO");
  assert.equal(formatCeloBalance("0xde0b6b3a7640000"), "1 CELO");
});

test("blocks preflight without gas funds", () => {
  const result = evaluateAgentPreflight({
    walletAddress: "0x0000000000000000000000000000000000000001",
    chainId: "0xaa044c",
    gasBalanceWei: "0x0",
    recipientContact: "0x0000000000000000000000000000000000000002",
  });

  assert.equal(result.ok, false);
  assert.equal(result.status, "blocked");
  assert.equal(result.checks.find((check) => check.id === "gas").status, "block");
  assert.equal(result.checks.find((check) => check.id === "contact").status, "pass");
});

test("blocks preflight when recipient has no resolved wallet address", () => {
  const result = evaluateAgentPreflight({
    walletAddress: "0x0000000000000000000000000000000000000001",
    chainId: "11142220",
    gasBalanceWei: "0x1",
    recipientContact: "Mom",
  });

  assert.equal(result.ok, false);
  assert.equal(result.checks.find((check) => check.id === "contact").status, "block");
});

test("passes preflight with testnet network, wallet, gas, and resolved wallet address", () => {
  const result = evaluateAgentPreflight({
    walletAddress: "0x0000000000000000000000000000000000000001",
    chainId: "11142220",
    gasBalanceWei: "0x1",
    recipientContact: "0x0000000000000000000000000000000000000002",
  });

  assert.equal(result.ok, true);
  assert.equal(result.status, "ready");
  assert.equal(result.checks.find((check) => check.id === "contact").status, "pass");
  // Without balance params, only 4 checks — backward-compatible
  assert.equal(result.checks.length, 4);
});

// ── Block 12: USDC balance check (5th check) ─────────────────────────────────

test("blocks preflight when USDC balance is insufficient", () => {
  const result = evaluateAgentPreflight({
    walletAddress: "0x0000000000000000000000000000000000000001",
    chainId: "11142220",
    gasBalanceWei: "0x1",
    recipientContact: "0x0000000000000000000000000000000000000002",
    usdcBalanceMinor: "1000000",   // 1.00 USDC
    requiredUsdcMinor: "2307692",  // 2.31 USDC needed for 300 cKES at 130 rate
  });

  assert.equal(result.ok, false);
  assert.equal(result.status, "blocked");
  assert.equal(result.checks.length, 5);
  const balanceCheck = result.checks.find((check) => check.id === "balance");
  assert.ok(balanceCheck, "balance check must be present");
  assert.equal(balanceCheck.status, "block");
  assert.ok(balanceCheck.detail.includes("Insufficient USDC"));
});

test("passes preflight when USDC balance is sufficient", () => {
  const result = evaluateAgentPreflight({
    walletAddress: "0x0000000000000000000000000000000000000001",
    chainId: "11142220",
    gasBalanceWei: "0x1",
    recipientContact: "0x0000000000000000000000000000000000000002",
    usdcBalanceMinor: "5000000",   // 5.00 USDC
    requiredUsdcMinor: "2307692",  // 2.31 USDC needed
  });

  assert.equal(result.ok, true);
  assert.equal(result.checks.length, 5);
  assert.equal(result.checks.find((check) => check.id === "balance").status, "pass");
});

test("passes preflight when USDC balance exactly equals required", () => {
  const result = evaluateAgentPreflight({
    walletAddress: "0x0000000000000000000000000000000000000001",
    chainId: "11142220",
    gasBalanceWei: "0x1",
    recipientContact: "0x0000000000000000000000000000000000000002",
    usdcBalanceMinor: "2307692",
    requiredUsdcMinor: "2307692",
  });

  assert.equal(result.ok, true);
  assert.equal(result.checks.find((check) => check.id === "balance").status, "pass");
});

test("omits balance check when usdcBalanceMinor is not provided (backward-compatible)", () => {
  const result = evaluateAgentPreflight({
    walletAddress: "0x0000000000000000000000000000000000000001",
    chainId: "11142220",
    gasBalanceWei: "0x1",
    recipientContact: "0x0000000000000000000000000000000000000002",
    // no usdcBalanceMinor / requiredUsdcMinor
  });

  assert.equal(result.ok, true);
  assert.equal(result.checks.length, 4);
  assert.equal(result.checks.find((check) => check.id === "balance"), undefined);
});
