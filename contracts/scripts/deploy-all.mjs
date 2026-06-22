// One-shot redeploy of the matching pair: ChocoLedger + ChocoGateway from the CURRENT source, then
// authorize the gateway on the ledger. Both compile from the same 13-field Schedule, so
// settleScheduledRun decodes getSchedule correctly (fixes the 12-vs-13-field mismatch) and both are
// Blockscout-verifiable. Non-custodial: deploys + prints the env block; it writes nothing itself.
//
// Run from contracts/:
//   $env:DEPLOYER_PRIVATE_KEY="0x<deployer key>"
//   node scripts/deploy-all.mjs
//
// Optional env (sensible defaults): KEEPER_ADDRESS, FEE_RECIPIENT_ADDRESS, FEE_BPS, CELO_RPC_URL.
import { ethers } from "ethers";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { config as dotenvConfig } from "dotenv";

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
dotenvConfig({ path: path.resolve(root, "..", ".env") }); // repo root .env (fee config)
dotenvConfig(); // contracts/.env if present (deployer/keeper)

require("./compile.cjs"); // rebuild artifacts from the current source

const pk = process.env.DEPLOYER_PRIVATE_KEY || process.env.PRIVATE_KEY;
if (!pk) throw new Error("Set DEPLOYER_PRIVATE_KEY before deploying.");

const rpcUrl   = process.env.CELO_RPC_URL || "https://forno.celo.org";
const rpc      = new ethers.JsonRpcProvider(rpcUrl, { chainId: 42220, name: "celo" });
const wallet   = new ethers.Wallet(pk, rpc);
const keeper   = process.env.KEEPER_ADDRESS        || "0xCAA38B341d421E1D3e6F5a9F011130B7cB0AA80F";
const feeRecip = process.env.FEE_RECIPIENT_ADDRESS || ethers.ZeroAddress;
const feeBps   = Number(process.env.FEE_BPS || "0");

// Mainnet route constants (USDC -> USDm via Mento, USDm -> KESm via Uniswap V3).
const broker     = "0x777A8255cA72412f0d706dc03C9D1987306B4CaD";
const provider   = "0x22d9db95E6Ae61c104A7B6F6C78D7993B94ec901";
const usdcToUsdm = "0xacc988382b66ee5456086643dcfd9a5ca43dd8f428f6ef22503d8b8013bcffd7";
const router     = "0x5615CDAb10dc425a742d643d949a7F474C01abc4";
const pool       = "0x95faa9a91cD6c1C018e4B1a6fC4c89D4F1695e5D";
const poolFee    = 100;
const usdc       = "0xcebA9300f2b948710d2653dD7B07f33A8B32118C";
const usdm       = "0x765DE816845861e75A25fCA122bb6898B8B1282a";
const ckes       = "0x456a3D042C0DbD3db53D5489e98dFb038553B0d0";

if (feeBps > 0 && !ethers.isAddress(feeRecip)) throw new Error("FEE_BPS set but FEE_RECIPIENT_ADDRESS missing.");
if (feeBps > 1000) throw new Error("FEE_BPS cannot exceed 1000 (10%).");

const load = (name) => JSON.parse(fs.readFileSync(path.join(root, "artifacts", `${name}.json`), "utf8"));

console.log("\nRedeploying ChocoLedger + ChocoGateway (matching pair) to Celo Mainnet");
console.log("=".repeat(62));
console.log("Deployer:", wallet.address);
console.log("Keeper:  ", keeper);
console.log("Fee:     ", feeRecip, feeBps, "bps");
console.log("=".repeat(62) + "\n");

// 1) ChocoLedger(initialKeeper)
const la = load("ChocoLedger");
const ledger = await new ethers.ContractFactory(la.abi, la.bytecode, wallet).deploy(keeper);
await ledger.waitForDeployment();
const ledgerAddr = await ledger.getAddress();
const ledgerBlock = await rpc.getBlockNumber();
console.log(" ChocoLedger:", ledgerAddr, "(block", ledgerBlock + ")");

// 2) ChocoGateway(... ledgerAddr ...)
const ga = load("ChocoGateway");
const gw = await new ethers.ContractFactory(ga.abi, ga.bytecode, wallet).deploy(
  broker, provider, usdcToUsdm, router, pool, poolFee, usdc, usdm, ckes, ledgerAddr, feeRecip, feeBps,
);
await gw.waitForDeployment();
const gwAddr = await gw.getAddress();
const gwBlock = await rpc.getBlockNumber();
console.log(" ChocoGateway:", gwAddr, "(block", gwBlock + ")");

// 3) Point the gateway keeper at the dedicated keeper EOA (constructor set it to the deployer).
if (ethers.isAddress(keeper) && keeper.toLowerCase() !== wallet.address.toLowerCase()) {
  await (await gw.setKeeper(keeper)).wait();
  console.log(" Gateway keeper set to", keeper);
}

// 4) Authorize the gateway to log on the ledger (deployer is the ledger admin).
const ledgerWrite = new ethers.Contract(ledgerAddr, ["function setSwapContract(address,bool) external"], wallet);
await (await ledgerWrite.setSwapContract(gwAddr, true)).wait();
console.log(" Authorized gateway on ledger.\n");

console.log("=== Set these in .env AND Vercel, then redeploy the frontend ===");
console.log(`VITE_LEDGER_ADDRESS=${ledgerAddr}`);
console.log(`VITE_LEDGER_DEPLOY_BLOCK=${ledgerBlock}`);
console.log(`VITE_CKES_SWAP_CONTRACT_ADDRESS=${gwAddr}`);
console.log(`VITE_CKES_SWAP_UNIV3_ADDRESS=${gwAddr}`);
console.log(`VITE_SCHEDULE_ESCROW_ADDRESS=${gwAddr}`);
console.log(`VITE_SETTLEMENT_SPENDER_ADDRESS=${gwAddr}`);
console.log(`VITE_CKES_SWAP_CONTRACT_ADDRESSES=${gwAddr}`);
console.log(`VITE_CKES_SWAP_DEPLOY_BLOCK=${gwBlock}`);
console.log("\nThen share both addresses and I'll verify them on Blockscout + confirm settleScheduledRun decodes.\n");
