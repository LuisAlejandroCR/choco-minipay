import assert from "node:assert/strict";
import test from "node:test";
import { composeMovementHistory, uniqueAddresses } from "./history.js";

test("uniqueAddresses keeps valid gateway addresses once", () => {
  const addresses = uniqueAddresses([
    "0xB555CC778c50e02f8b56358B153c0BEBBfA45563",
    "0xb555cc778c50e02f8b56358b153c0bebbfa45563",
    "not-an-address",
    "",
    "0x6567e9e2AdDf00C964DD74C4FBe9A8917A04abD3",
  ]);

  assert.deepEqual(addresses, [
    "0xB555CC778c50e02f8b56358B153c0BEBBfA45563",
    "0x6567e9e2AdDf00C964DD74C4FBe9A8917A04abD3",
  ]);
});

test("composeMovementHistory keeps future plans out of movements", () => {
  const history = composeMovementHistory({
    sendNowHistory: [],
    settlements: [],
    scheduleById: new Map([
      ["1", {
        id: 1n,
        owner: "0x1111111111111111111111111111111111111111",
        recipient: "0x2222222222222222222222222222222222222222",
        sourceAsset: "0x3333333333333333333333333333333333333333",
        destinationAmount: 7_000_000_000_000_000_000n,
        dayOfMonth: 17,
      }],
    ]),
    timeByBlock: new Map(),
  });

  assert.deepEqual(history, []);
});

test("composeMovementHistory prefers ledger attempts over reconstructed fallback", () => {
  const hash = `0x${"b".repeat(64)}`;
  const history = composeMovementHistory({
    sendNowAttempts: [{
      id: "attempt-1",
      hash,
      type: "USDC swap + cKES send",
      sortKey: 20,
    }],
    sendNowHistory: [{
      id: "fallback-1",
      hash,
      type: "cKES send",
      sortKey: 10,
    }],
    settlements: [],
  });

  assert.equal(history.length, 1);
  assert.equal(history[0].id, "attempt-1");
  assert.equal(history[0].type, "USDC swap + cKES send");
});

test("composeMovementHistory adds executed schedule receipts to movements", () => {
  const history = composeMovementHistory({
    sendNowHistory: [],
    settlements: [{
      args: {
        id: 1n,
        success: true,
        sourceAsset: "0x3333333333333333333333333333333333333333",
        sourceAmount: 1n,
        destinationAmount: 7_000_000_000_000_000_000n,
        settlementRef: `0x${"0".repeat(64)}`,
        note: "keeper-run",
      },
      blockNumber: 123n,
      transactionHash: `0x${"a".repeat(64)}`,
      logIndex: 0,
    }],
    scheduleById: new Map([
      ["1", {
        id: 1n,
        owner: "0x1111111111111111111111111111111111111111",
        recipient: "0x2222222222222222222222222222222222222222",
        sourceAsset: "0x3333333333333333333333333333333333333333",
        dayOfMonth: 17,
      }],
    ]),
    timeByBlock: new Map([[123n, 1_781_600_000]]),
  });

  assert.equal(history.length, 1);
  assert.equal(history[0].type, "Settlement sent");
  assert.equal(history[0].recipient, "x2222");
  assert.equal(history[0].amount, "7");
});
