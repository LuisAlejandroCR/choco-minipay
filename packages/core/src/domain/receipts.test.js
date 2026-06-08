import test from "node:test";
import assert from "node:assert/strict";
import { buildReceiptUrl, buildShareText } from "./receipts.js";

test("builds Celo Sepolia receipt URL", () => {
  assert.equal(
    buildReceiptUrl({ network: "celoSepolia", txHash: "0xabc" }),
    "https://celo-sepolia.blockscout.com/tx/0xabc",
  );
});

test("builds share text with verification URL", () => {
  const text = buildShareText({
    amountMinor: 50000,
    destinationAsset: "KESm",
    recipientAlias: "Mom",
    deliveryMode: "schedule",
    cadence: "monthly",
    status: "Scheduled",
    txHash: "0xabc",
    network: "celoSepolia",
  });

  assert.match(text, /Choco receipt/);
  assert.match(text, /https:\/\/celo-sepolia.blockscout.com\/tx\/0xabc/);
});
