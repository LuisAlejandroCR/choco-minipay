// Build the Etherscan/Blockscout standard-json verification payload for the deployed ChocoLedger +
// ChocoGateway, matching compile.cjs's compiler settings EXACTLY (optimizer 200, default evmVersion
// = cancun, default metadata = ipfs). Writes payload files to contracts/verify/ for the PowerShell
// POST step. Pure file IO + ABI encoding — no network, so it runs fine inside the sandbox.
//
// Run from contracts/:  node scripts/verify-prep.cjs
// Optional env: LEDGER_ADDRESS, GATEWAY_ADDRESS (default to the 2026-06-23 one-sig pair).
const fs = require("node:fs");
const path = require("node:path");
const { AbiCoder } = require("ethers");

const root = path.resolve(__dirname, "..");
const srcDir = path.join(root, "src");
const outDir = path.join(root, "verify");
fs.mkdirSync(outDir, { recursive: true });

require("./compile.cjs"); // refresh artifacts from current source so the ABIs match the deployed bytecode

// 1) Standard-json input — identical settings to compile.cjs (no evmVersion/metadata overrides).
const sources = {};
for (const file of fs.readdirSync(srcDir)) {
  if (file.endsWith(".sol")) sources[file] = { content: fs.readFileSync(path.join(srcDir, file), "utf8") };
}
const standardInput = {
  language: "Solidity",
  sources,
  settings: {
    optimizer: { enabled: true, runs: 200 },
    outputSelection: { "*": { "*": ["abi", "evm.bytecode", "evm.deployedBytecode", "metadata"], "": ["ast"] } },
  },
};
fs.writeFileSync(path.join(outDir, "standard-input.json"), JSON.stringify(standardInput));

// 2) Constructor args, ABI-encoded using each artifact's own constructor input types.
const coder = AbiCoder.defaultAbiCoder();
function encodeCtor(artifactName, values) {
  const art = JSON.parse(fs.readFileSync(path.join(root, "artifacts", `${artifactName}.json`), "utf8"));
  const ctor = (art.abi || []).find((f) => f.type === "constructor");
  const types = (ctor?.inputs || []).map((i) => i.type);
  return coder.encode(types, values).slice(2); // strip 0x for Etherscan/Blockscout
}

const LEDGER  = process.env.LEDGER_ADDRESS  || "0x15659C181f31e5A463BcaB7E2cc706B0b336967C";
const GATEWAY = process.env.GATEWAY_ADDRESS || "0x900F0c07b08483e860B4055892528dAE08eE56b3";
const keeper  = "0xCAA38B341d421E1D3e6F5a9F011130B7cB0AA80F";

const ledgerArgs = encodeCtor("ChocoLedger", [keeper]);
const gatewayArgs = encodeCtor("ChocoGateway", [
  "0x777A8255cA72412f0d706dc03C9D1987306B4CaD", // broker
  "0x22d9db95E6Ae61c104A7B6F6C78D7993B94ec901", // exchangeProvider
  "0xacc988382b66ee5456086643dcfd9a5ca43dd8f428f6ef22503d8b8013bcffd7", // usdcToUsdmId
  "0x5615CDAb10dc425a742d643d949a7F474C01abc4", // router
  "0x95faa9a91cD6c1C018e4B1a6fC4c89D4F1695e5D", // pool
  100,                                          // poolFee
  "0xcebA9300f2b948710d2653dD7B07f33A8B32118C", // usdc
  "0x765DE816845861e75A25fCA122bb6898B8B1282a", // usdm
  "0x456a3D042C0DbD3db53D5489e98dFb038553B0d0", // ckes
  LEDGER,                                       // ledger
  "0xC7203b6F0313Ed490e2B68156aeb3380fe274B66", // feeRecipient
  25,                                           // feeBps
]);

const manifest = {
  compilerversion: "v0.8.26+commit.8a97fa7a",
  contracts: [
    { name: "ChocoLedger",  address: LEDGER,  contractname: "ChocoLedger.sol:ChocoLedger",  constructorArgs: ledgerArgs },
    { name: "ChocoGateway", address: GATEWAY, contractname: "ChocoGateway.sol:ChocoGateway", constructorArgs: gatewayArgs },
  ],
};
fs.writeFileSync(path.join(outDir, "manifest.json"), JSON.stringify(manifest, null, 2));
console.log("Wrote verify/standard-input.json (" + JSON.stringify(standardInput).length + " bytes) + verify/manifest.json");
console.log("ChocoLedger  @", LEDGER, "ctorArgs:", ledgerArgs || "(none)");
console.log("ChocoGateway @", GATEWAY, "ctorArgs[0..80]:", gatewayArgs.slice(0, 80) + "…");
