import { test } from "node:test";
import assert from "node:assert/strict";
import { deriveScheduleNotices, planCreationReminder, CANCEL_HINT } from "./scheduleNotices.js";

test("funded plan shows a locked-run notice", () => {
  const [notice] = deriveScheduleNotices({
    plans: [{ id: 1, recipient: "mom", amountUsdc: 5, lockedUsdc: 5, hasWalletFunds: true, nextRunLabel: "the 18th", active: true }],
  });
  assert.equal(notice.kind, "run-funded");
  assert.match(notice.body, /5\.00 USDC is locked/);
  assert.match(notice.body, new RegExp(CANCEL_HINT));
});

test("unfunded plan with wallet funds prompts to lock", () => {
  const [notice] = deriveScheduleNotices({
    plans: [{ id: 2, recipient: "dad", amountUsdc: 3, lockedUsdc: 0, hasWalletFunds: true, nextRunLabel: "the 1st", active: true }],
  });
  assert.equal(notice.kind, "needs-lock");
  assert.match(notice.body, /Reserve 3\.00 USDC/);
});

test("unfunded plan without wallet funds warns to top up", () => {
  const [notice] = deriveScheduleNotices({
    plans: [{ id: 3, recipient: "sister", amountUsdc: 4, lockedUsdc: 0, hasWalletFunds: false, nextRunLabel: "the 5th", active: true }],
  });
  assert.equal(notice.kind, "needs-topup");
  assert.equal(notice.tone, "warning");
});

test("paused/inactive plans produce no notice", () => {
  const notices = deriveScheduleNotices({
    plans: [{ id: 4, recipient: "x", amountUsdc: 1, lockedUsdc: 0, hasWalletFunds: true, active: false }],
  });
  assert.equal(notices.length, 0);
});

test("plan creation reminder explains funding + cancel", () => {
  const reminder = planCreationReminder();
  assert.equal(reminder.kind, "explainer");
  assert.match(reminder.body, /locked/);
  assert.match(reminder.body, new RegExp(CANCEL_HINT));
});
