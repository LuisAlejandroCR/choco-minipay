const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const solc = require("solc");

function compile() {
  const root = path.resolve(__dirname, "..");
  const source = fs.readFileSync(path.join(root, "src", "ChocoScheduleRegistry.sol"), "utf8");
  const input = {
    language: "Solidity",
    sources: { "ChocoScheduleRegistry.sol": { content: source } },
    settings: {
      optimizer: { enabled: true, runs: 200 },
      outputSelection: { "*": { "*": ["abi", "evm.bytecode.object"] } },
    },
  };
  return JSON.parse(solc.compile(JSON.stringify(input)));
}

test("ChocoScheduleRegistry compiles with solc-js", () => {
  const output = compile();
  const errors = (output.errors || []).filter((item) => item.severity === "error");
  assert.deepEqual(errors, []);
  const contract = output.contracts["ChocoScheduleRegistry.sol"].ChocoScheduleRegistry;
  assert.ok(contract.evm.bytecode.object.length > 1000);
});

test("registry ABI exposes schedule and receipt functions", () => {
  const output = compile();
  const abi = output.contracts["ChocoScheduleRegistry.sol"].ChocoScheduleRegistry.abi;
  const names = abi.map((item) => item.name).filter(Boolean);
  assert.ok(names.includes("createMonthlySchedule"));
  assert.ok(names.includes("recordSettlement"));
  assert.ok(names.includes("MonthlyScheduleCreated"));
  assert.ok(names.includes("SettlementReceipt"));
});