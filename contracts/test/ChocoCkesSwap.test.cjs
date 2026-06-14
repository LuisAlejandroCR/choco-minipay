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

test("ChocoCkesSwap compiles", () => {
  const output = compile();
  const errors = (output.errors || []).filter((item) => item.severity === "error");
  assert.deepEqual(errors, []);
  const contract = output.contracts["ChocoCkesSwap.sol"].ChocoCkesSwap;
  assert.ok(contract.evm.bytecode.object.length > 1000);
});

test("swap ABI exposes swap, quote, and UsdcToCkesSwap event", () => {
  const output = compile();
  const abi = output.contracts["ChocoCkesSwap.sol"].ChocoCkesSwap.abi;
  const names = abi.map((item) => item.name).filter(Boolean);
  assert.ok(names.includes("swap"));
  assert.ok(names.includes("quote"));
  assert.ok(names.includes("UsdcToCkesSwap"));
});
