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

const usdc = process.env.USDC_ADDRESS || "0xcebA9300f2b948710d2653dD7B07f33A8B32118C";

// The escrow settles through the exact-out UniV3 swap. Deploy that first and point this at it.
const swap = process.env.VITE_CKES_SWAP_UNIV3_ADDRESS || process.env.VITE_CKES_SWAP_CONTRACT_ADDRESS || "";
if (!ethers.isAddress(swap)) {
  throw new Error("Set VITE_CKES_SWAP_UNIV3_ADDRESS to the deployed exact-out ChocoUniV3CkesSwap address.");
}

// Must equal the ChocoLedger keeper so settleRun/lockFor authorize the same wallet that records
// settlements (the keeper that runs scripts/choco-keeper.mjs).
const keeper = process.env.KEEPER_ADDRESS || "";
if (!ethers.isAddress(keeper)) {
  throw new Error("Set KEEPER_ADDRESS to the keeper wallet (must match ChocoLedger.keeper()).");
}

const rpcUrl = process.env.CELO_RPC_URL || "https://forno.celo.org";

console.log("\n Deploying ChocoScheduleEscrow to Celo Mainnet");
console.log("=".repeat(60));
console.log("USDC:        ", usdc);
console.log("Swap (UniV3):", swap);
console.log("Keeper:      ", keeper);
console.log("=".repeat(60) + "\n");

const artifact = JSON.parse(fs.readFileSync(path.join(root, "artifacts", "ChocoScheduleEscrow.json"), "utf8"));
const rpc = new ethers.JsonRpcProvider(rpcUrl, { chainId: 42220, name: "celo" });
const wallet = new ethers.Wallet(privateKey, rpc);
const factory = new ethers.ContractFactory(artifact.abi, artifact.bytecode, wallet);

const contract = await factory.deploy(usdc, swap, keeper);
await contract.waitForDeployment();
const escrowAddress = await contract.getAddress();
const currentBlock = await rpc.getBlockNumber();

console.log(" ChocoScheduleEscrow:", escrowAddress);
console.log("   Deploy block:", currentBlock);
console.log("\n Add to Vercel / .env:");
console.log(`VITE_SCHEDULE_ESCROW_ADDRESS=${escrowAddress}`);
console.log("\n Reminder: the keeper wallet (KEEPER_KEY) must be", keeper);
console.log(" and the same wallet must be ChocoLedger.keeper() for recordSettlement.\n");
