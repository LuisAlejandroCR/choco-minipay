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

const broker = process.env.MENTO_BROKER_ADDRESS || process.env.VITE_MENTO_BROKER_ADDRESS || "0x777A8255cA72412f0d706dc03C9D1987306B4CaD";
const provider = process.env.MENTO_BIPOOL_ADDRESS || process.env.VITE_MENTO_BIPOOL_ADDRESS || "0x22d9db95E6Ae61c104A7B6F6C78D7993B94ec901";
const usdcToUsdm = process.env.MENTO_USDC_USDM_ID || process.env.VITE_MENTO_USDC_USDM_ID || "0xacc988382b66ee5456086643dcfd9a5ca43dd8f428f6ef22503d8b8013bcffd7";
const usdmToCkes = process.env.MENTO_USDM_CKES_ID || process.env.VITE_MENTO_USDM_CKES_ID || "0x89de88b8eb790de26f4649f543cb6893d93635c728ac857f0926e842fb0d298b";
const usdc = process.env.USDC_ADDRESS || process.env.VITE_USDC_ADDRESS || "0xcebA9300f2b948710d2653dD7B07f33A8B32118C";
const usdm = process.env.USDM_ADDRESS || process.env.VITE_USDM_ADDRESS || "0x765DE816845861e75A25fCA122bb6898B8B1282a";
const ckes = process.env.KESM_ADDRESS || process.env.VITE_KESM_ADDRESS || "0x456a3D042C0DbD3db53D5489e98dFb038553B0d0";

const artifact = JSON.parse(fs.readFileSync(path.join(root, "artifacts", "ChocoCkesSwap.json"), "utf8"));
const rpc = new ethers.JsonRpcProvider(process.env.CELO_RPC_URL || process.env.VITE_CELO_RPC_URL || "https://forno.celo.org", { chainId: 42220, name: "celo" });
const wallet = new ethers.Wallet(privateKey, rpc);
const factory = new ethers.ContractFactory(artifact.abi, artifact.bytecode, wallet);
const contract = await factory.deploy(broker, provider, usdcToUsdm, usdmToCkes, usdc, usdm, ckes);
await contract.waitForDeployment();
console.log("ChocoCkesSwap", await contract.getAddress());
