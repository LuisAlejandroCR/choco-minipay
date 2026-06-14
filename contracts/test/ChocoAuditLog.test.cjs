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

test("ChocoAuditLog compiles", () => {
  const output = compile();
  const errors = (output.errors || []).filter((item) => item.severity === "error");
  assert.deepEqual(errors, []);
  const contract = output.contracts["ChocoAuditLog.sol"].ChocoAuditLog;
  assert.ok(contract.evm.bytecode.object.length > 500);
});

test("audit ABI exposes logAttempt + AttemptLogged event + multi-kind enum", () => {
  const output = compile();
  const abi = output.contracts["ChocoAuditLog.sol"].ChocoAuditLog.abi;
  const names = abi.map((item) => item.name).filter(Boolean);
  assert.ok(names.includes("logAttempt"));
  assert.ok(names.includes("AttemptLogged"));
  assert.ok(names.includes("getAttempt"));
  assert.ok(names.includes("getAttemptsBySender"));
  const logAttempt = abi.find((item) => item.name === "logAttempt" && item.type === "function");
  const inputTypes = logAttempt.inputs.map((input) => input.type);
  assert.deepEqual(inputTypes, ["uint8", "bytes32", "address", "uint256", "uint256", "bytes32", "bytes32", "string"]);
});
