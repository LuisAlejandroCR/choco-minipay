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

// Mainnet Mento configuration
const broker = process.env.MENTO_BROKER_ADDRESS || "0x777ACaD0f60F00911E6c54f98a72b4f3D48CaD0d";
const provider = process.env.MENTO_PROVIDER_ADDRESS || "0x0e8D2059c7c45c0e01ec8C00Aef5fDb3Cd31BD9e";
const usdcToUsdm = process.env.MENTO_USDC_TO_USDM || "0x0e8d2059c7c45c0e01ec8c00aef5fdb3cd31bd9e000000000000000000000004";
const usdmToCkes = process.env.MENTO_USDM_TO_CKES || "0x0e8d2059c7c45c0e01ec8c00aef5fdb3cd31bd9e000000000000000000000009";
const usdc = process.env.USDC_ADDRESS || "0xcebA9300f2b948710d2653dD7B07f33A8B32118C";
const usdm = process.env.USDM_ADDRESS || "0x8c9F4B2F2ab0E0e58e63c2Bd1Be4b1e93c06e09B";
const ckes = process.env.KESM_ADDRESS || "0x456a3D042C0DbD3db53D5489e98dFb038553B0d0";

console.log("\n🔄 Deploying ChocoCkesSwap to Celo Mainnet");
console.log("=".repeat(60));
console.log("Mento Broker:", broker);
console.log("Mento Provider:", provider);
console.log("=".repeat(60) + "\n");

const artifact = JSON.parse(fs.readFileSync(path.join(root, "artifacts", "ChocoCkesSwap.json"), "utf8"));
const rpcUrl = process.env.CELO_RPC_URL || "https://forno.celo.org";
const rpc = new ethers.JsonRpcProvider(rpcUrl, { chainId: 42220, name: "celo" });
const wallet = new ethers.Wallet(privateKey, rpc);
const factory = new ethers.ContractFactory(artifact.abi, artifact.bytecode, wallet);
const contract = await factory.deploy(broker, provider, usdcToUsdm, usdmToCkes, usdc, usdm, ckes);
await contract.waitForDeployment();
const swapAddress = await contract.getAddress();

console.log("✅ ChocoCkesSwap:", swapAddress);
console.log("\n📋 Add to frontend .env:");
console.log(`VITE_CKES_SWAP_CONTRACT_ADDRESS=${swapAddress}\n`);
