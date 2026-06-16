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

test("ChocoGateway compiles without errors", () => {
  const output = compile();
  const errors = (output.errors || []).filter((item) => item.severity === "error");
  assert.deepEqual(errors, []);
  const contract = output.contracts["ChocoGateway.sol"].ChocoGateway;
  assert.ok(contract.evm.bytecode.object.length > 1000);
});

test("ChocoGateway emits LedgerLogFailed when ledger logging is not recorded", () => {
  const output = compile();
  const abi = output.contracts["ChocoGateway.sol"].ChocoGateway.abi;
  const event = abi.find((item) => item.type === "event" && item.name === "LedgerLogFailed");

  assert.ok(event);
  assert.deepEqual(event.inputs.map((input) => input.name), [
    "ledger",
    "payer",
    "recipient",
    "usdcIn",
    "ckesOut",
    "note",
    "reason",
  ]);
});
