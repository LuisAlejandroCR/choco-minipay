import test from "node:test";
import assert from "node:assert/strict";
import { parseTransferIntent } from "./intent.js";

test("parses monthly KES schedule from low-value test command", () => {
  const intent = parseTransferIntent("send my mum 10 KES every 1st");
  assert.equal(intent.recipientAlias, "Mom");
  assert.equal(intent.amountMinor, 10);
  assert.equal(intent.deliveryMode, "schedule");
  assert.equal(intent.cadence, "monthly");
  assert.equal(intent.dayLabel, "1st");
  assert.equal(intent.sourceAsset, "USDC");
  assert.equal(intent.destinationAsset, "KESm");
});

test("parses send-now intent", () => {
  const intent = parseTransferIntent("send my sister 75000 KES now");
  assert.equal(intent.recipientAlias, "Sister");
  assert.equal(intent.amountMinor, 75000);
  assert.equal(intent.deliveryMode, "now");
  assert.equal(intent.cadence, "once");
});
