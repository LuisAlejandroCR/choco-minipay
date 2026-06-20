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

// Mento - only the USDC->USDm hop (KESm oracle not needed for this route)
const broker      = process.env.MENTO_BROKER_ADDRESS   || "0x777A8255cA72412f0d706dc03C9D1987306B4CaD";
const provider    = process.env.MENTO_PROVIDER_ADDRESS  || "0x22d9db95E6Ae61c104A7B6F6C78D7993B94ec901";
const usdcToUsdm  = process.env.MENTO_USDC_TO_USDM     || "0xacc988382b66ee5456086643dcfd9a5ca43dd8f428f6ef22503d8b8013bcffd7";

// Uniswap V3 - USDm/KESm pool (token0=KESm, token1=USDm, fee=0.01%)
const uniV3Router = process.env.UNIV3_ROUTER_ADDRESS   || "0x5615CDAb10dc425a742d643d949a7F474C01abc4";
const uniV3Pool   = process.env.UNIV3_POOL_ADDRESS     || "0x95faa9a91cD6c1C018e4B1a6fC4c89D4F1695e5D";
const uniV3Fee    = Number(process.env.UNIV3_POOL_FEE   || "100"); // 100 = 0.01%

// Tokens
const usdc        = process.env.USDC_ADDRESS            || "0xcebA9300f2b948710d2653dD7B07f33A8B32118C";
const usdm        = process.env.USDM_ADDRESS            || "0x765DE816845861e75A25fCA122bb6898B8B1282a";
const ckes        = process.env.KESM_ADDRESS            || "0x456a3D042C0DbD3db53D5489e98dFb038553B0d0";

// Admin
const ledger       = process.env.VITE_LEDGER_ADDRESS    || process.env.LEDGER_ADDRESS || "";
const feeRecipient = process.env.FEE_RECIPIENT_ADDRESS  || "";
const feeBps       = Number(process.env.FEE_BPS         || "0");

if (!ledger) {
  console.warn("  VITE_LEDGER_ADDRESS not set - deploying without ledger integration.");
}
if (!feeRecipient && feeBps > 0) {
  throw new Error("FEE_BPS is set but FEE_RECIPIENT_ADDRESS is missing.");
}
if (feeBps > 1000) {
  throw new Error("FEE_BPS cannot exceed 1000 (10%).");
}

const rpcUrl = process.env.CELO_RPC_URL || "https://rpc.ankr.com/celo";

console.log("\n Deploying ChocoUniV3CkesSwap to Celo Mainnet");
console.log("=".repeat(60));
console.log("Mento Broker:   ", broker);
console.log("Mento Provider: ", provider);
console.log("Uniswap Router: ", uniV3Router);
console.log("Uniswap Pool:   ", uniV3Pool, `(fee ${uniV3Fee} = ${(uniV3Fee / 10000).toFixed(4)}%)`);
console.log("ChocoLedger:    ", ledger || "(none - logging disabled)");
console.log("Fee recipient:  ", feeRecipient || "(none - no fee)");
console.log("Fee bps:        ", feeBps, feeBps > 0 ? `(${(feeBps / 100).toFixed(2)}%)` : "(no fee)");
console.log("=".repeat(60) + "\n");

const artifact = JSON.parse(fs.readFileSync(path.join(root, "artifacts", "ChocoUniV3CkesSwap.json"), "utf8"));
const rpc = new ethers.JsonRpcProvider(rpcUrl, { chainId: 42220, name: "celo" });
const wallet = new ethers.Wallet(privateKey, rpc);
const factory = new ethers.ContractFactory(artifact.abi, artifact.bytecode, wallet);

const contract = await factory.deploy(
  broker, provider, usdcToUsdm,
  uniV3Router, uniV3Pool, uniV3Fee,
  usdc, usdm, ckes,
  ledger       || ethers.ZeroAddress,
  feeRecipient || ethers.ZeroAddress,
  feeBps,
);
await contract.waitForDeployment();
const swapAddress = await contract.getAddress();
const currentBlock = await rpc.getBlockNumber();

console.log(" ChocoUniV3CkesSwap:", swapAddress);
console.log("   Deploy block:", currentBlock);

if (ledger) {
  console.log("\n REQUIRED - authorize the new swap on ChocoLedger:");
  console.log(`   $env:VITE_CKES_SWAP_CONTRACT_ADDRESS = "${swapAddress}"`);
  console.log(`   node scripts/authorize-swap.mjs`);
}

console.log("\n Add to Vercel / .env:");
console.log(`VITE_CKES_SWAP_UNIV3_ADDRESS=${swapAddress}`);
console.log("");
console.log("   (Primary swap address stays as VITE_CKES_SWAP_CONTRACT_ADDRESS)");
console.log("   (No VITE_CKES_SWAP_DEPLOY_BLOCK needed - UniV3 swap is not indexed for history)\n");
