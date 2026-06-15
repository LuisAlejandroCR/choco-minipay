const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const solc = require("solc");

function compile() {
  const root = path.resolve(__dirname, "..");
  const sources = {};
  for (const file of fs.readdirSync(path.join(root, "src"))) {
    if (file.endsWith(".sol")) {
      sources[file] = { content: fs.readFileSync(path.join(root, "src", file), "utf8") };
    }
  }
  const input = {
    language: "Solidity",
    sources,
    settings: {
      optimizer: { enabled: true, runs: 200 },
      outputSelection: { "*": { "*": ["abi", "evm.bytecode.object"] } },
    },
  };
  return JSON.parse(solc.compile(JSON.stringify(input)));
}

test("ChocoLedger compiles without errors", () => {
  const output = compile();
  const errors = (output.errors || []).filter((item) => item.severity === "error");
  assert.deepEqual(errors, []);
  const contract = output.contracts["ChocoLedger.sol"].ChocoLedger;
  assert.ok(contract.evm.bytecode.object.length > 500);
});

test("ABI exposes all schedule functions", () => {
  const output = compile();
  const abi = output.contracts["ChocoLedger.sol"].ChocoLedger.abi;
  const names = abi.map((item) => item.name).filter(Boolean);
  assert.ok(names.includes("createMonthlySchedule"));
  assert.ok(names.includes("cancelSchedule"));
  assert.ok(names.includes("recordSettlement"));
  assert.ok(names.includes("getSchedule"));
});

test("ABI exposes all audit functions", () => {
  const output = compile();
  const abi = output.contracts["ChocoLedger.sol"].ChocoLedger.abi;
  const names = abi.map((item) => item.name).filter(Boolean);
  assert.ok(names.includes("logAttempt"));
  assert.ok(names.includes("getAttempt"));
  assert.ok(names.includes("getAttemptsBySender"));
  assert.ok(names.includes("totalTransactions"));
  assert.ok(names.includes("attemptCount"));
});

test("createMonthlySchedule includes receiptLabelHash parameter", () => {
  const output = compile();
  const abi = output.contracts["ChocoLedger.sol"].ChocoLedger.abi;
  const fn = abi.find((item) => item.name === "createMonthlySchedule" && item.type === "function");
  const inputNames = fn.inputs.map((input) => input.name);
  assert.ok(inputNames.includes("receiptLabelHash"));
  const last = fn.inputs.at(-1);
  assert.equal(last.name, "receiptLabelHash");
  assert.equal(last.type, "bytes32");
});

test("logAttempt signature matches ChocoAuditLog for drop-in compatibility", () => {
  const output = compile();
  const abi = output.contracts["ChocoLedger.sol"].ChocoLedger.abi;
  const fn = abi.find((item) => item.name === "logAttempt" && item.type === "function");
  const inputTypes = fn.inputs.map((input) => input.type);
  assert.deepEqual(inputTypes, ["uint8", "bytes32", "address", "uint256", "uint256", "bytes32", "bytes32", "string"]);
});

test("AttemptLogged and schedule events are emitted", () => {
  const output = compile();
  const abi = output.contracts["ChocoLedger.sol"].ChocoLedger.abi;
  const eventNames = abi.filter((item) => item.type === "event").map((item) => item.name);
  assert.ok(eventNames.includes("AttemptLogged"));
  assert.ok(eventNames.includes("MonthlyScheduleCreated"));
  assert.ok(eventNames.includes("SettlementReceipt"));
  assert.ok(eventNames.includes("ScheduleCancelled"));
});
