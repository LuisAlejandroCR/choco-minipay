import assert from "node:assert/strict";
import test from "node:test";
import { getPlanExecutionState } from "../utils/planUtils.js";

const basePlan = {
  deliveryMode: "schedule",
  dayOfMonth: 17,
  firstRunAt: 0,
  lastSettlementAt: 0,
};

test("getPlanExecutionState marks a plan as running today on its day", () => {
  const state = getPlanExecutionState(basePlan, new Date("2026-06-17T12:00:00Z"));
  assert.equal(state.status, "Runs today");
  assert.equal(state.tone, "due");
});

test("getPlanExecutionState marks a past unrecorded run as awaiting auto-run", () => {
  const state = getPlanExecutionState(basePlan, new Date("2026-06-18T12:00:00Z"));
  assert.equal(state.status, "Awaiting auto-run");
  assert.equal(state.tone, "warning");
});

test("getPlanExecutionState keeps future plans authorized", () => {
  const state = getPlanExecutionState(basePlan, new Date("2026-06-10T12:00:00Z"));
  assert.equal(state.status, "Authorized");
});

test("getPlanExecutionState shows this month's settlement as recorded", () => {
  const state = getPlanExecutionState({
    ...basePlan,
    lastSettlementAt: Math.floor(new Date("2026-06-17T09:00:00Z").getTime() / 1000),
  }, new Date("2026-06-18T12:00:00Z"));
  assert.equal(state.status, "Run recorded");
  assert.equal(state.tone, "success");
});

test("getPlanExecutionState shows paused plans as paused", () => {
  const state = getPlanExecutionState({ ...basePlan, status: "Paused", active: false }, new Date("2026-06-17T12:00:00Z"));
  assert.equal(state.status, "Paused");
  assert.equal(state.tone, "paused");
});
