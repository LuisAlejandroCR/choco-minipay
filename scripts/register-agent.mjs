// Register Choco as an ERC-8004 agent on the Celo Mainnet Identity Registry.
//
// This is a one-shot ops script (like contracts/scripts/deploy.mjs). It is NOT a backend the app
// depends on and it deploys NO new contract: it calls the existing public ERC-8004 registry.
//
// Run with a funded Celo Mainnet key:
//   node --env-file=.env scripts/register-agent.mjs       (Node 20+, reads VITE_/AGENT_ vars from .env)
//   $env:AGENT_URI="https://choco-azure.vercel.app/agent.json"; $env:AGENT_PRIVATE_KEY="0x..."; npm run register:agent
//
// Before running, confirm the registry's live ABI on https://8004scan.io — the registration-v1
// entrypoint below (`register(string)`) matches the public spec, but verify it for your registry.

import { ethers } from "ethers";
import fs from "node:fs";
import path from "node:path";

const rpcUrl = process.env.CELO_RPC_URL || process.env.VITE_CELO_RPC_URL || "https://forno.celo.org";
const registryAddress = process.env.AGENT_REGISTRY_ADDRESS
  || process.env.VITE_AGENT_REGISTRY_ADDRESS
  || "0x8004A169FB4a3325136EB29fA0ceB6D2e539a432";
const agentUri = process.env.AGENT_URI || process.env.VITE_AGENT_URI;
const privateKey = process.env.AGENT_PRIVATE_KEY || process.env.PRIVATE_KEY;

if (!agentUri) throw new Error("Set AGENT_URI (the public https/ipfs URL serving agent.json).");
if (!privateKey) throw new Error("Set AGENT_PRIVATE_KEY (a funded Celo Mainnet wallet).");

const REGISTRY_ABI = [
  "function register(string agentURI) returns (uint256 agentId)",
  "function setAgentURI(uint256 agentId, string agentURI)",
  "function tokenURI(uint256 tokenId) view returns (string)",
  "event Transfer(address indexed from, address indexed to, uint256 indexed tokenId)",
];

const provider = new ethers.JsonRpcProvider(rpcUrl, { chainId: 42220, name: "celo" });
const wallet = new ethers.Wallet(privateKey, provider);
const registry = new ethers.Contract(registryAddress, REGISTRY_ABI, wallet);

console.log("Registering Choco on ERC-8004 (Celo Mainnet)");
console.log("  registry:", registryAddress);
console.log("  owner:   ", wallet.address);
console.log("  agentURI:", agentUri);

const tx = await registry.register(agentUri);
console.log("  tx sent: ", tx.hash);
const receipt = await tx.wait();

let agentId;
for (const log of receipt.logs) {
  try {
    const parsed = registry.interface.parseLog(log);
    if (parsed?.name === "Transfer" && parsed.args.from === ethers.ZeroAddress) {
      agentId = parsed.args.tokenId;
      break;
    }
  } catch {
    // Not a registry log we can decode; skip.
  }
}
if (agentId === undefined) {
  throw new Error("Could not read the minted agentId from logs. Inspect the tx on 8004scan and set VITE_AGENT_ID manually.");
}

const tokenUri = await registry.tokenURI(agentId);
console.log("agentId: ", agentId.toString());
console.log("agentURI:", tokenUri);

const record = {
  network: "celoMainnet",
  chainId: 42220,
  agentId: Number(agentId),
  owner: wallet.address,
  registry: registryAddress,
  agentUri: tokenUri,
  agentScanUrl: `https://8004scan.io/agents/celo/${agentId}`,
  txHash: tx.hash,
  blockNumber: receipt.blockNumber,
  registeredAt: new Date().toISOString(),
  flags: {
    contentAddressed: tokenUri.startsWith("ipfs://"),
    note: tokenUri.startsWith("ipfs://")
      ? "Content-addressed agentURI."
      : "https:// agentURI. Pin public/agent.json to IPFS and call setAgentURI(agentId, 'ipfs://...') for full compliance.",
  },
};

const outDir = path.resolve(process.cwd(), "ops");
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, "agent.mainnet.json"), `${JSON.stringify(record, null, 2)}\n`);
console.log("Saved ops/agent.mainnet.json");
console.log("Next: set VITE_AGENT_ID and VITE_AGENT_OWNER_ADDRESS in your deploy env, then redeploy.");
