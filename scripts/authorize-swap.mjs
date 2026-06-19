// Authorize a Choco swap/gateway contract to write send-now audit records into ChocoLedger.
//
// Usage:
//   $env:DEPLOYER_PRIVATE_KEY="0x..."
//   $env:VITE_LEDGER_ADDRESS="0x..."
//   node scripts/authorize-swap.mjs 0xSwapContractAddress
//
// Optional:
//   node scripts/authorize-swap.mjs 0xSwapContractAddress false

import { ethers } from "ethers";

const LEDGER_ABI = [
  "function admin() view returns (address)",
  "function authorizedSwapContracts(address) view returns (bool)",
  "function setSwapContract(address swapContract, bool authorized) external",
];

function requiredEnv(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing ${name}. Set it before running this script.`);
  return value;
}

function normalizePrivateKey(value) {
  return value.startsWith("0x") ? value : `0x${value}`;
}

const swapAddress = process.argv[2];
const authorizedArg = process.argv[3] ?? "true";
const shouldAuthorize = !["false", "0", "no", "revoke"].includes(authorizedArg.toLowerCase());

if (!swapAddress || !ethers.isAddress(swapAddress)) {
  throw new Error("Usage: node scripts/authorize-swap.mjs <swapContractAddress> [true|false]");
}

const rpcUrl = process.env.CELO_RPC_URL || process.env.VITE_CELO_RPC_URL || "https://forno.celo.org";
const ledgerAddress = requiredEnv("VITE_LEDGER_ADDRESS");
const privateKey = normalizePrivateKey(process.env.DEPLOYER_PRIVATE_KEY || process.env.PRIVATE_KEY || "");
if (!privateKey || privateKey === "0x") {
  throw new Error("Missing DEPLOYER_PRIVATE_KEY or PRIVATE_KEY. Use the ChocoLedger admin wallet.");
}
if (!ethers.isAddress(ledgerAddress)) {
  throw new Error(`VITE_LEDGER_ADDRESS is not a valid address: ${ledgerAddress}`);
}

const provider = new ethers.JsonRpcProvider(rpcUrl);
const wallet = new ethers.Wallet(privateKey, provider);
const ledger = new ethers.Contract(ledgerAddress, LEDGER_ABI, wallet);

console.log(`Ledger: ${ledgerAddress}`);
console.log(`Swap contract: ${swapAddress}`);
console.log(`Signer: ${wallet.address}`);
console.log(`RPC: ${rpcUrl}`);

try {
  const admin = await ledger.admin();
  console.log(`Ledger admin: ${admin}`);
  if (admin.toLowerCase() !== wallet.address.toLowerCase()) {
    console.warn("Warning: signer is not the ledger admin. The transaction may revert.");
  }
} catch {
  console.warn("Could not read ledger admin(). Continuing.");
}

try {
  const before = await ledger.authorizedSwapContracts(swapAddress);
  console.log(`Before: authorized=${before}`);
  if (before === shouldAuthorize) {
    console.log("No change needed.");
    process.exit(0);
  }
} catch {
  console.warn("Could not read authorizedSwapContracts(). Continuing with setSwapContract().");
}

const tx = await ledger.setSwapContract(swapAddress, shouldAuthorize);
console.log(`Tx hash: ${tx.hash}`);
const receipt = await tx.wait();
console.log(`Confirmed in block: ${receipt.blockNumber}`);

try {
  const after = await ledger.authorizedSwapContracts(swapAddress);
  console.log(`After: authorized=${after}`);
} catch {
  console.warn("Could not verify authorizedSwapContracts() after transaction.");
}
