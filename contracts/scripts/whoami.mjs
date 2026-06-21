import "dotenv/config";
import { ethers } from "ethers";
import { createPublicClient, http, formatEther, formatUnits, parseAbi } from "viem";

const privateKey = process.env.DEPLOYER_PRIVATE_KEY || process.env.PRIVATE_KEY;
if (!privateKey) throw new Error("Set DEPLOYER_PRIVATE_KEY before running.");

const wallet = new ethers.Wallet(privateKey);
console.log("Deployer address:", wallet.address);

const celo = {
  id: 42220, name: "Celo",
  nativeCurrency: { name: "CELO", symbol: "CELO", decimals: 18 },
  rpcUrls: { default: { http: ["https://forno.celo.org"] } },
};
const client = createPublicClient({ chain: celo, transport: http() });
const ERC20  = parseAbi(["function balanceOf(address) view returns (uint256)"]);

const USDC = "0xcebA9300f2b948710d2653dD7B07f33A8B32118C";
const [celo_bal, usdc_bal] = await Promise.all([
  client.getBalance({ address: wallet.address }),
  client.readContract({ address: USDC, abi: ERC20, functionName: "balanceOf", args: [wallet.address] }),
]);

console.log("CELO balance:", formatEther(celo_bal), "CELO");
console.log("USDC balance:", formatUnits(usdc_bal, 6), "USDC");

if (celo_bal === 0n) {
  console.log("\nERROR: CELO balance is 0 — this wallet cannot pay gas. Send at least 0.05 CELO before deploying.");
} else if (celo_bal < 50000000000000000n) {
  console.log("\nWARNING: Less than 0.05 CELO — may not cover both deployments + authorize calls.");
} else {
  console.log("\nOK: Balance is sufficient for deployment.");
}
