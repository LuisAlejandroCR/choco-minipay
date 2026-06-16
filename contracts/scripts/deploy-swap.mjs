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
const broker    = process.env.MENTO_BROKER_ADDRESS   || "0x777A8255cA72412f0d706dc03C9D1987306B4CaD";
const provider  = process.env.MENTO_PROVIDER_ADDRESS  || "0x22d9db95E6Ae61c104A7B6F6C78D7993B94ec901";
const usdcToUsdm = process.env.MENTO_USDC_TO_USDM    || "0xacc988382b66ee5456086643dcfd9a5ca43dd8f428f6ef22503d8b8013bcffd7";
const usdmToCkes = process.env.MENTO_USDM_TO_CKES    || "0x89de88b8eb790de26f4649f543cb6893d93635c728ac857f0926e842fb0d298b";
const usdc      = process.env.USDC_ADDRESS            || "0xcebA9300f2b948710d2653dD7B07f33A8B32118C";
const usdm      = process.env.USDM_ADDRESS            || "0x765DE816845861e75A25fCA122bb6898B8B1282a";
const ckes      = process.env.KESM_ADDRESS            || "0x456a3D042C0DbD3db53D5489e98dFb038553B0d0";
const ledger    = process.env.VITE_LEDGER_ADDRESS     || process.env.LEDGER_ADDRESS || "";

if (!ledger) {
  console.warn("⚠️  VITE_LEDGER_ADDRESS not set — deploying without ledger integration (send-now txs won't appear on ChocoLedger).");
}

console.log("\n🔄 Deploying ChocoCkesSwap to Celo Mainnet");
console.log("=".repeat(60));
console.log("Mento Broker:", broker);
console.log("Mento Provider:", provider);
console.log("ChocoLedger:", ledger || "(none)");
console.log("=".repeat(60) + "\n");

const artifact = JSON.parse(fs.readFileSync(path.join(root, "artifacts", "ChocoCkesSwap.json"), "utf8"));
const rpcUrl = process.env.CELO_RPC_URL || "https://forno.celo.org";
const rpc = new ethers.JsonRpcProvider(rpcUrl, { chainId: 42220, name: "celo" });
const wallet = new ethers.Wallet(privateKey, rpc);
const factory = new ethers.ContractFactory(artifact.abi, artifact.bytecode, wallet);
const contract = await factory.deploy(
  broker, provider, usdcToUsdm, usdmToCkes, usdc, usdm, ckes,
  ledger || ethers.ZeroAddress
);
await contract.waitForDeployment();
const swapAddress = await contract.getAddress();

console.log("✅ ChocoCkesSwap:", swapAddress);

if (ledger) {
  console.log("\n⚡ Next step — authorize the new swap contract on ChocoLedger:");
  console.log(`   Cast: cast send ${ledger} "setSwapContract(address,bool)" ${swapAddress} true --rpc-url ${rpcUrl} --private-key $DEPLOYER_PRIVATE_KEY`);
  console.log(`   Or call setSwapContract(${swapAddress}, true) on Celoscan.`);
}

console.log("\n📋 Add to Vercel env vars:");
console.log(`VITE_CKES_SWAP_CONTRACT_ADDRESS=${swapAddress}\n`);
