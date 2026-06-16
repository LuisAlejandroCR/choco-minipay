import assert from "node:assert/strict";
import test from "node:test";
import { parseUnits } from "viem";
import {
  destinationAmountForIntent,
  sourceAmountForIntent,
  sourceAssetAddressForIntent,
  usdcAmountForIntent,
} from "./tokens.js";
import { ADDRESSES } from "./client.js";

// These run under `node --test` with no Vite env, so APP_CONFIG falls back to its mainnet
// defaults: source === "USDC", destination === "cKES", usdc/kesm = the mainnet token addresses.

test("usdcAmountForIntent converts a USD source amount to 6-decimal USDC", () => {
  assert.equal(usdcAmountForIntent({ sourceAmount: 5 }), parseUnits("5.000000", 6));
  assert.equal(usdcAmountForIntent({ sourceAmount: 0.5 }), 500000n);
});

test("usdcAmountForIntent falls back to estimatedUsdc when sourceAmount is absent", () => {
  assert.equal(usdcAmountForIntent({ estimatedUsdc: 400 }), parseUnits("400.000000", 6));
});

test("destinationAmountForIntent floors to whole cKES at 18 decimals", () => {
  assert.equal(destinationAmountForIntent({ amountKes: 5000 }), parseUnits("5000", 18));
  assert.equal(destinationAmountForIntent({ destinationAmount: 1234 }), parseUnits("1234", 18));
});

test("destinationAmountForIntent guards a minimum of 1 cKES", () => {
  assert.equal(destinationAmountForIntent({ amountKes: 0 }), parseUnits("1", 18));
});

test("sourceAmountForIntent uses 6 decimals for a USDC source", () => {
  assert.equal(sourceAmountForIntent({ sourceAsset: "USDC", sourceAmount: 5 }), parseUnits("5.000000", 6));
});

test("sourceAmountForIntent uses 18 decimals for a cKES source", () => {
  assert.equal(sourceAmountForIntent({ sourceAsset: "cKES", amountKes: 5000 }), parseUnits("5000", 18));
});

test("sourceAssetAddressForIntent maps the source symbol to a token address", () => {
  assert.equal(sourceAssetAddressForIntent({ sourceAsset: "USDC" }), ADDRESSES.usdc);
  assert.equal(sourceAssetAddressForIntent({ sourceAsset: "cKES" }), ADDRESSES.kesm);
});
