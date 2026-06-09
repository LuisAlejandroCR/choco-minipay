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
});
