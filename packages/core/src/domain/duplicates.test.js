import test from "node:test";
import assert from "node:assert/strict";
import { getDuplicatePlan, hasRecentSimilarSend } from "./duplicates.js";

test("finds duplicate scheduled plan", () => {
  const existing = [{
    id: "plan-1",
    recipientAlias: "Mom",
    amountMinor: 50000,
    destinationAsset: "KESm",
    deliveryMode: "schedule",
    cadence: "monthly",
    dayLabel: "1st",
  }];

  const duplicate = getDuplicatePlan(existing, { ...existing[0], id: "candidate" });
  assert.equal(duplicate.id, "plan-1");
});

test("detects recent similar send-now transfer", () => {
  const transfers = [{
    recipientAlias: "Mom",
    amountMinor: 50000,
    destinationAsset: "KESm",
    deliveryMode: "now",
  }];

  assert.equal(hasRecentSimilarSend(transfers, transfers[0]), true);
});
