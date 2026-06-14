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
const keeper = process.env.KEEPER_ADDRESS;
if (!privateKey) throw new Error("Set DEPLOYER_PRIVATE_KEY or PRIVATE_KEY before deploying.");
if (!keeper) throw new Error("Set KEEPER_ADDRESS before deploying.");

const rpcUrl = process.env.CELO_RPC_URL || process.env.VITE_CELO_RPC_URL || "https://forno.celo.org";
const provider = new ethers.JsonRpcProvider(rpcUrl, { chainId: 42220, name: "celo" });
const wallet = new ethers.Wallet(privateKey, provider);

console.log("\n🚀 Deploying Choco Contracts to Celo Mainnet");
console.log("=".repeat(60));
console.log("Deployer:", wallet.address);
console.log("Keeper:", keeper);
console.log("RPC:", rpcUrl);
console.log("=".repeat(60) + "\n");

// Deploy ChocoScheduleRegistry
console.log("📝 Deploying ChocoScheduleRegistry...");
const registryArtifact = JSON.parse(fs.readFileSync(path.join(root, "artifacts", "ChocoScheduleRegistry.json"), "utf8"));
const registryFactory = new ethers.ContractFactory(registryArtifact.abi, registryArtifact.bytecode, wallet);
const registry = await registryFactory.deploy(keeper);
await registry.waitForDeployment();
const registryAddress = await registry.getAddress();
console.log("✅ ChocoScheduleRegistry:", registryAddress);

// Deploy ChocoAuditLog
console.log("\n📋 Deploying ChocoAuditLog...");
const auditArtifact = JSON.parse(fs.readFileSync(path.join(root, "artifacts", "ChocoAuditLog.json"), "utf8"));
const auditFactory = new ethers.ContractFactory(auditArtifact.abi, auditArtifact.bytecode, wallet);
const audit = await auditFactory.deploy();
await audit.waitForDeployment();
const auditAddress = await audit.getAddress();
console.log("✅ ChocoAuditLog:", auditAddress);

const currentBlock = await provider.getBlockNumber();

console.log("\n" + "=".repeat(60));
console.log("✨ Deployment Complete!");
console.log("=".repeat(60));
console.log("\n📋 Add these to your frontend .env:\n");
console.log(`VITE_REGISTRY_ADDRESS=${registryAddress}`);
console.log(`VITE_AUDIT_CONTRACT_ADDRESS=${auditAddress}`);
console.log(`VITE_SETTLEMENT_SPENDER_ADDRESS=${registryAddress}`);
console.log(`VITE_REGISTRY_DEPLOY_BLOCK=${currentBlock}`);
console.log("\n💡 Note: ChocoCkesSwap requires Mento configuration");
console.log("   Deploy separately with: npm run deploy:swap\n");