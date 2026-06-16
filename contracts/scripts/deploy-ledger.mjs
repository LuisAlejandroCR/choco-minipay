import "dotenv/config";
import { ethers } from "ethers";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");

require("./compile.cjs");

const privateKey = process.env.DEPLOYER_PRIVATE_KEY || process.env.PRIVATE_KEY;
if (!privateKey) throw new Error("Set DEPLOYER_PRIVATE_KEY or PRIVATE_KEY before deploying.");

// Keeper defaults to deployer — change later via setKeeper() once you have a dedicated keeper wallet.
const keeper = process.env.KEEPER_ADDRESS || new ethers.Wallet(privateKey).address;
const rpcUrl = process.env.CELO_RPC_URL || "https://rpc.ankr.com/celo";
const provider = new ethers.JsonRpcProvider(rpcUrl, { chainId: 42220, name: "celo" });
const wallet = new ethers.Wallet(privateKey, provider);

console.log("\nDeploying ChocoLedger to Celo Mainnet");
console.log("=".repeat(50));
console.log("Deployer:", wallet.address);
console.log("Keeper:", keeper);
console.log("RPC:", rpcUrl);
console.log("=".repeat(50) + "\n");

const artifact = JSON.parse(fs.readFileSync(path.join(root, "artifacts", "ChocoLedger.json"), "utf8"));
const factory = new ethers.ContractFactory(artifact.abi, artifact.bytecode, wallet);
const contract = await factory.deploy(keeper);
await contract.waitForDeployment();
const address = await contract.getAddress();
const currentBlock = await provider.getBlockNumber();

console.log("ChocoLedger deployed:", address);
console.log("Deploy block:", currentBlock);
console.log("\nAdd to Vercel environment variables:\n");
console.log(`VITE_LEDGER_ADDRESS=${address}`);
console.log(`VITE_LEDGER_DEPLOY_BLOCK=${currentBlock}`);
console.log(`VITE_SETTLEMENT_SPENDER_ADDRESS=${keeper}`);
console.log("\nThe new ChocoLedger replaces both VITE_REGISTRY_ADDRESS and VITE_AUDIT_CONTRACT_ADDRESS.");
console.log("Remove or leave those old vars — the app falls back to them if VITE_LEDGER_ADDRESS is unset.\n");
