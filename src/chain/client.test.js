import assert from "node:assert/strict";
import test from "node:test";
import { zeroAddress } from "viem";
import { assertAddress, getApprovalTarget, shortAddress } from "./client.js";

const USDC = "0xcebA9300f2b948710d2653dD7B07f33A8B32118C";

test("shortAddress truncates a valid address", () => {
  assert.equal(shortAddress(USDC), "0xcebA...118C");
});

test("shortAddress returns a placeholder for empty or invalid input", () => {
  assert.equal(shortAddress(""), "Not connected");
  assert.equal(shortAddress("not-an-address"), "Not connected");
});

test("assertAddress returns the address when valid", () => {
  assert.equal(assertAddress(USDC, "USDC"), USDC);
});

test("assertAddress throws on the zero address", () => {
  assert.throws(() => assertAddress(zeroAddress, "Recipient"), /Recipient is not a valid Celo address/);
});

test("assertAddress throws on malformed input", () => {
  assert.throws(() => assertAddress("0x123", "Wallet"), /Wallet is not a valid Celo address/);
});

test("getApprovalTarget needs no approval when the source is already cKES", () => {
  // source === destination ("cKES") → nothing to swap, so no spender to approve
  assert.equal(getApprovalTarget({ deliveryMode: "now", intent: { sourceAsset: "cKES" } }), null);
});

test("getApprovalTarget points schedule approvals at the settlement spender", () => {
  const target = getApprovalTarget({ deliveryMode: "schedule", intent: { sourceAsset: "USDC" } });
  assert.equal(target.name, "Choco settlement spender");
  assert.equal(target.asset, "USDC");
});
