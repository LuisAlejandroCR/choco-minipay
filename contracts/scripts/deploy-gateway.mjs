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

const broker     = process.env.MENTO_BROKER_ADDRESS   || "0x777A8255cA72412f0d706dc03C9D1987306B4CaD";
const provider   = process.env.MENTO_PROVIDER_ADDRESS || "0x22d9db95E6Ae61c104A7B6F6C78D7993B94ec901";
const usdcToUsdm = process.env.MENTO_USDC_TO_USDM     || "0xacc988382b66ee5456086643dcfd9a5ca43dd8f428f6ef22503d8b8013bcffd7";
const router     = process.env.UNIV3_ROUTER_ADDRESS   || "0x5615CDAb10dc425a742d643d949a7F474C01abc4";
const pool       = process.env.UNIV3_POOL_ADDRESS     || "0x95faa9a91cD6c1C018e4B1a6fC4c89D4F1695e5D";
const poolFee    = Number(process.env.UNIV3_POOL_FEE  || "100");
const usdc       = process.env.USDC_ADDRESS           || "0xcebA9300f2b948710d2653dD7B07f33A8B32118C";
const usdm       = process.env.USDM_ADDRESS           || "0x765DE816845861e75A25fCA122bb6898B8B1282a";
const ckes       = process.env.KESM_ADDRESS           || "0x456a3D042C0DbD3db53D5489e98dFb038553B0d0";
const ledger     = process.env.VITE_LEDGER_ADDRESS    || "";
const feeRecip   = process.env.FEE_RECIPIENT_ADDRESS  || "";
const feeBps     = Number(process.env.FEE_BPS         || "0");
const keeper     = process.env.KEEPER_ADDRESS         || "";

if (!ethers.isAddress(ledger)) throw new Error("Set VITE_LEDGER_ADDRESS (ChocoLedger).");
if (feeBps > 0 && !ethers.isAddress(feeRecip)) throw new Error("FEE_BPS set but FEE_RECIPIENT_ADDRESS missing.");
if (feeBps > 1000) throw new Error("FEE_BPS cannot exceed 1000 (10%).");

const rpcUrl = process.env.CELO_RPC_URL || "https://forno.celo.org";

console.log("\n Deploying ChocoGateway (consolidated) to Celo Mainnet");
console.log("=".repeat(60));
console.log("Mento broker/provider:", broker, provider);
console.log("UniV3 router/pool/fee:", router, pool, poolFee);
console.log("ChocoLedger:          ", ledger);
console.log("Fee recipient / bps:  ", feeRecip || "(none)", feeBps);
console.log("Keeper to set:        ", keeper || "(set manually after deploy)");
console.log("=".repeat(60) + "\n");

const artifact = JSON.parse(fs.readFileSync(path.join(root, "artifacts", "ChocoGateway.json"), "utf8"));
const rpc = new ethers.JsonRpcProvider(rpcUrl, { chainId: 42220, name: "celo" });
const wallet = new ethers.Wallet(privateKey, rpc);
const factory = new ethers.ContractFactory(artifact.abi, artifact.bytecode, wallet);

const gateway = await factory.deploy(
  broker, provider, usdcToUsdm, router, pool, poolFee,
  usdc, usdm, ckes, ledger, feeRecip || ethers.ZeroAddress, feeBps,
);
await gateway.waitForDeployment();
const addr = await gateway.getAddress();
const block = await rpc.getBlockNumber();

console.log(" ChocoGateway:", addr);
console.log("   Deploy block:", block, "\n");

// Optional: set the keeper now if KEEPER_ADDRESS is provided.
if (ethers.isAddress(keeper)) {
  const tx = await gateway.setKeeper(keeper);
  await tx.wait();
  console.log(" Keeper set to", keeper, "(tx", tx.hash + ")\n");
}

console.log(" REQUIRED next steps:");
console.log("  1. Authorize the gateway to log on the ledger:");
console.log(`     ChocoLedger(${ledger}).setSwapContract("${addr}", true)`);
if (!ethers.isAddress(keeper)) console.log(`  2. Set the keeper: ChocoGateway.setKeeper(<keeper 0xCAA3...>)`);
console.log("\n Set ALL of these (.env + Vercel) to the one gateway address:");
console.log(`   VITE_CKES_SWAP_CONTRACT_ADDRESS=${addr}`);
console.log(`   VITE_CKES_SWAP_UNIV3_ADDRESS=${addr}`);
console.log(`   VITE_SCHEDULE_ESCROW_ADDRESS=${addr}`);
console.log(`   VITE_SETTLEMENT_SPENDER_ADDRESS=${addr}\n`);
