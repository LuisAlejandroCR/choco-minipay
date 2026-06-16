import "dotenv/config";
import { ethers } from "ethers";

const privateKey    = process.env.DEPLOYER_PRIVATE_KEY || process.env.PRIVATE_KEY;
const ledgerAddress = process.env.VITE_LEDGER_ADDRESS  || process.env.LEDGER_ADDRESS;
const swapAddress   = process.env.VITE_CKES_SWAP_CONTRACT_ADDRESS;
const rpcUrl        = process.env.CELO_RPC_URL || "https://rpc.ankr.com/celo";

if (!privateKey)    throw new Error("Set DEPLOYER_PRIVATE_KEY");
if (!ledgerAddress) throw new Error("Set VITE_LEDGER_ADDRESS to the NEW ChocoLedger address (from deploy-ledger.mjs)");
if (!swapAddress)   throw new Error("Set VITE_CKES_SWAP_CONTRACT_ADDRESS to the NEW swap address (from deploy-swap.mjs)");

const rpc    = new ethers.JsonRpcProvider(rpcUrl, { chainId: 42220, name: "celo" });
const wallet = new ethers.Wallet(privateKey, rpc);

const ledger = new ethers.Contract(
  ledgerAddress,
  ["function setSwapContract(address swapContract, bool authorized) external"],
  wallet,
);

console.log(`\nAuthorizing ${swapAddress}`);
console.log(`on ChocoLedger ${ledgerAddress} …`);
const tx = await ledger.setSwapContract(swapAddress, true);
console.log("Tx sent:", tx.hash);
await tx.wait();
console.log("✅ Done — swap contract is authorized to call logAttemptFor on ChocoLedger.\n");
