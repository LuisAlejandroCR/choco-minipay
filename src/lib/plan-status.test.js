import assert from "node:assert/strict";
import test from "node:test";
import { getPlanExecutionState } from "../utils/planUtils.js";

const basePlan = {
  deliveryMode: "schedule",
  dayOfMonth: 17,
  firstRunAt: 0,
  lastSettlementAt: 0,
};

test("getPlanExecutionState marks a plan as running today before the local schedule window", () => {
  const state = getPlanExecutionState(basePlan, new Date(2026, 5, 17, 2, 0));
  assert.equal(state.status, "Runs today");
  assert.equal(state.tone, "due");
});

test("getPlanExecutionState marks an unrecorded run as awaiting auto-run after the local schedule window", () => {
  const state = getPlanExecutionState(basePlan, new Date(2026, 5, 17, 12, 0));
  assert.equal(state.status, "Awaiting auto-run");
  assert.equal(state.tone, "warning");
});

test("getPlanExecutionState keeps future plans authorized", () => {
  const state = getPlanExecutionState(basePlan, new Date(2026, 5, 10, 12, 0));
  assert.equal(state.status, "Authorized");
});

test("getPlanExecutionState shows this month's settlement as recorded", () => {
  const state = getPlanExecutionState({
    ...basePlan,
    lastSettlementAt: Math.floor(new Date(2026, 5, 17, 4, 0).getTime() / 1000),
  }, new Date(2026, 5, 18, 12, 0));
  assert.equal(state.status, "Run recorded");
  assert.equal(state.tone, "success");
});

test("getPlanExecutionState shows paused plans as paused", () => {
  const state = getPlanExecutionState({ ...basePlan, status: "Paused", active: false }, new Date(2026, 5, 17, 12, 0));
  assert.equal(state.status, "Paused");
  assert.equal(state.tone, "paused");
});
