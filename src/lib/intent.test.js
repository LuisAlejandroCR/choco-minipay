import assert from "node:assert/strict";
import test from "node:test";
import { buildAgentChocoIntent } from "./agent-choco.js";
import { parseTransferIntent } from "./intent.js";

test("Agent Choco extracts the hackathon command with high confidence", () => {
  const intent = parseTransferIntent("send my mum 50k KES every 1st of the month", {
    now: new Date("2026-06-12T12:00:00Z"),
    kesPerUsdc: 125,
  });

  assert.equal(intent.isReady, true);
  assert.equal(intent.recipientAlias, "mum");
  assert.equal(intent.amountKes, 50000);
  assert.equal(intent.dayOfMonth, 1);
  assert.equal(intent.estimatedUsdc, 400);
  assert.equal(intent.destinationAsset, "KESm");
});

test("Agent Choco rejects incomplete commands instead of using static defaults", () => {
  const agent = buildAgentChocoIntent("");

  assert.equal(agent.isReady, false);
  assert.deepEqual(agent.missing, ["recipient", "amount", "currency", "timing"]);
});

test("Agent Choco supports compact amount and schedule language", () => {
  const intent = parseTransferIntent("send mum 5k cKES every 15th");

  assert.equal(intent.isReady, true);
  assert.equal(intent.amountKes, 5000);
  assert.equal(intent.dayOfMonth, 15);
  assert.equal(intent.transferAsset, "KESm");
  assert.equal(intent.sourceAsset, "USDC");
});

test("Agent Choco accepts in-progress cKES shorthand", () => {
  const intent = parseTransferIntent("20k mom cke", { deliveryMode: "now" });

  assert.equal(intent.isReady, true);
  assert.equal(intent.recipientAlias, "mom");
  assert.equal(intent.amountKes, 20000);
  assert.equal(intent.transferAsset, "KESm");
  assert.equal(intent.sourceAsset, "USDC");
});

test("Agent Choco accepts currency before recipient", () => {
  const intent = parseTransferIntent("10k ckes mom", { deliveryMode: "now" });

  assert.equal(intent.isReady, true);
  assert.equal(intent.recipientAlias, "mom");
  assert.equal(intent.amountKes, 10000);
  assert.equal(intent.transferAsset, "KESm");
  assert.equal(intent.sourceAsset, "USDC");
});

test("Agent Choco accepts recipient first without a command verb", () => {
  const intent = parseTransferIntent("Brian 40k ckes", { deliveryMode: "now", kesPerUsdc: 100 });

  assert.equal(intent.isReady, true);
  assert.equal(intent.recipientAlias, "Brian");
  assert.equal(intent.amountKes, 40000);
  assert.equal(intent.estimatedUsdc, 400);
  assert.equal(intent.receiptLabel, "Brian");
  assert.equal(intent.contactResolutionRequired, true);
});

test("Agent Choco accepts recipient-first scheduled commands", () => {
  const intent = parseTransferIntent("Brian 40k ckes every 5", { deliveryMode: "schedule", kesPerUsdc: 100 });

  assert.equal(intent.isReady, true);
  assert.equal(intent.recipientAlias, "Brian");
  assert.equal(intent.dayOfMonth, 5);
  assert.equal(intent.confidence >= 0.9, true);
});

test("Agent Choco accepts amount-first named contacts", () => {
  const intent = parseTransferIntent("26k Brian", { deliveryMode: "now", kesPerUsdc: 100 });

  assert.equal(intent.isReady, true);
  assert.equal(intent.currencyInferred, true);
  assert.equal(intent.recipientAlias, "Brian");
  assert.equal(intent.amountKes, 26000);
  assert.equal(intent.estimatedUsdc, 260);
  assert.equal(intent.contactResolutionRequired, true);
});

test("Agent Choco infers KESm for the fixed Kenya corridor", () => {
  const intent = parseTransferIntent("20k mom every 1st", { deliveryMode: "schedule", kesPerUsdc: 100 });

  assert.equal(intent.isReady, true);
  assert.equal(intent.currencyInferred, true);
  assert.equal(intent.recipientAlias, "mom");
  assert.equal(intent.amountKes, 20000);
  assert.equal(intent.sourceAsset, "USDC");
  assert.equal(intent.destinationAsset, "KESm");
  assert.equal(intent.estimatedUsdc, 200);
});

test("Agent Choco keeps single-letter drafts incomplete", () => {
  const agent = buildAgentChocoIntent("s", { deliveryMode: "now" });

  assert.equal(agent.isReady, false);
  assert.deepEqual(agent.missing, ["recipient", "amount", "currency"]);
});

test("Agent Choco extracts recipient from a to-clause and routes USDC to KESm", () => {
  const intent = parseTransferIntent("Send 20 USDC to Brian", { kesPerUsdc: 100 });

  assert.equal(intent.isReady, true);
  assert.equal(intent.recipientAlias, "Brian");
  assert.equal(intent.amountKes, 2000);
  assert.equal(intent.sourceAmount, 20);
  assert.equal(intent.transferAsset, "KESm");
  assert.equal(intent.sourceAsset, "USDC");
  assert.equal(intent.destinationAsset, "KESm");
});

test("Agent Choco blocks transfers without a currency", () => {
  const agent = buildAgentChocoIntent("10k to mom every 1st at 9am");

  assert.equal(agent.isReady, false);
  assert.deepEqual(agent.missing, ["currency"]);
});
