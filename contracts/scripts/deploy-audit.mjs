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

const artifact = JSON.parse(fs.readFileSync(path.join(root, "artifacts", "ChocoAuditLog.json"), "utf8"));
const provider = new ethers.JsonRpcProvider(process.env.CELO_RPC_URL || process.env.VITE_CELO_RPC_URL || "https://forno.celo.org", { chainId: 42220, name: "celo" });
const wallet = new ethers.Wallet(privateKey, provider);
const factory = new ethers.ContractFactory(artifact.abi, artifact.bytecode, wallet);
const contract = await factory.deploy();
await contract.waitForDeployment();
console.log("ChocoAuditLog", await contract.getAddress());
