/**
 * register-agent.ts — register Choco on the ERC-8004 Identity Registry (Celo)
 *
 * This is the ONLY file that touches the agent's on-chain identity. It runs ONCE.
 * Your worker and Mini App never import this — they only need the printed agentId.
 *
 * It talks to the registry directly with viem (not @chaoschain/sdk) so it can't
 * break on an SDK version mismatch. The registry is a standard ERC-721 (URIStorage);
 * register(tokenURI) mints the agent NFT and returns the agentId (the tokenId).
 *
 * ─── Two phases ───────────────────────────────────────────────────────────────
 *   Phase 1 (generate):  writes ./agent.json with the correct chainId + your wallet.
 *                        Host that file at a public URL.
 *   Phase 2 (register):  set AGENT_URI to the hosted URL and re-run → mints the NFT.
 *
 * ─── Usage ──────────────────────────────────────────────────────────────────────
 *   # Phase 1 — generate the file to host
 *   PRIVATE_KEY=0x... APP_URL=https://choco.vercel.app \
 *     npx tsx scripts/register-agent.ts
 *
 *   # Phase 2 — after hosting agent.json, register on-chain
 *   PRIVATE_KEY=0x... APP_URL=https://choco.vercel.app \
 *     AGENT_URI=https://choco.vercel.app/agent.json \
 *     npx tsx scripts/register-agent.ts
 *
 * ─── Env ──────────────────────────────────────────────────────────────────────
 *   PRIVATE_KEY  (required)  the wallet that will OWN the agent NFT (and sign sends)
 *   NETWORK      (optional)  "sepolia" (default) | "mainnet"
 *   APP_URL      (optional)  base URL of your Mini App; used for image + endpoints
 *   AGENT_URI    (optional)  hosted registration-file URL (or ipfs://) — set to register
 *   RPC_URL      (optional)  override the default RPC for the chosen network
 *
 * ─── Install ────────────────────────────────────────────────────────────────────
 *   npm i viem
 *   npm i -D tsx
 *
 * Note: the deployer wallet needs a little testnet CELO for gas on Sepolia
 * (grab some from the Celo faucet) — or wire fee-abstraction later to pay in USDm.
 */

import { writeFileSync } from "node:fs";
import {
  createWalletClient,
  createPublicClient,
  http,
  parseEventLogs,
  getAddress,
  zeroAddress,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { celo, celoSepolia } from "viem/chains";

// ERC-8004 Identity Registry — addresses from
// https://docs.celo.org/build-on-celo/build-with-ai/8004
const REGISTRY = {
  sepolia: "0x8004A818BFB912233c491871b3d84c89A494BD9e",
  mainnet: "0x8004A169FB4a3325136EB29fA0ceB6D2e539a432",
} as const;

// Minimal ABI: register + the reads we use to confirm + ERC-721 Transfer (mint) event.
// We read the agentId from the mint event (from == 0x0) — reliable for any ERC721URIStorage.
const IDENTITY_ABI = [
  {
    type: "function",
    name: "register",
    stateMutability: "nonpayable",
    inputs: [{ name: "tokenURI", type: "string" }],
    outputs: [{ name: "agentId", type: "uint256" }],
  },
  {
    type: "function",
    name: "tokenURI",
    stateMutability: "view",
    inputs: [{ name: "agentId", type: "uint256" }],
    outputs: [{ type: "string" }],
  },
  {
    type: "function",
    name: "ownerOf",
    stateMutability: "view",
    inputs: [{ name: "agentId", type: "uint256" }],
    outputs: [{ type: "address" }],
  },
  {
    type: "event",
    name: "Transfer",
    inputs: [
      { name: "from", type: "address", indexed: true },
      { name: "to", type: "address", indexed: true },
      { name: "tokenId", type: "uint256", indexed: true },
    ],
  },
] as const;

async function main() {
  const pk = process.env.PRIVATE_KEY as `0x${string}` | undefined;
  if (!pk) {
    throw new Error(
      "Set PRIVATE_KEY — the wallet that will own the Choco agent NFT and sign its sends."
    );
  }

  const network = (process.env.NETWORK ?? "sepolia") as keyof typeof REGISTRY;
  if (!(network in REGISTRY)) {
    throw new Error(`NETWORK must be "sepolia" or "mainnet" (got "${network}").`);
  }

  const chain = network === "mainnet" ? celo : celoSepolia;
  const registry = getAddress(REGISTRY[network]);
  const account = privateKeyToAccount(pk);
  const appUrl = (process.env.APP_URL ?? "https://choco.vercel.app").replace(/\/$/, "");

  // ─── Phase 1: build the registration file (chainId always correct for this network) ───
  const agentJson = {
    type: "Agent",
    name: "Choco",
    description:
      'Remittance concierge agent on Celo. A diaspora user says "send my mum 50k KES on the 1st of every month" in the wallet chat; Choco escrows USDC, swaps to cKES via Mento, off-ramps to M-Pesa via a local partner, retries on failure, notifies the recipient, and files an on-chain receipt. Three trigger types: schedule, low-balance top-up, and FX target.",
    image: `${appUrl}/icon.png`,
    endpoints: [
      { type: "wallet", address: account.address, chainId: chain.id },
      { type: "https", url: appUrl },
    ],
    supportedTrust: ["reputation"],
  };

  writeFileSync("agent.json", JSON.stringify(agentJson, null, 2));
  console.log("📝 Wrote agent.json");
  console.log("   agent wallet (NFT owner):", account.address);
  console.log("   network:", network, "| chainId:", chain.id);

  const agentUri = process.env.AGENT_URI;
  if (!agentUri) {
    console.log("\n→ Phase 1 done. Now host agent.json at a public URL:");
    console.log(`   drop it in app/public/agent.json, deploy, → ${appUrl}/agent.json`);
    console.log("\n→ Then run Phase 2 to register on-chain:");
    console.log(
      `   PRIVATE_KEY=… APP_URL=${appUrl} AGENT_URI=${appUrl}/agent.json npx tsx scripts/register-agent.ts`
    );
    return;
  }

  // ─── Phase 2: register on-chain ───
  const transport = http(process.env.RPC_URL); // undefined → viem uses the chain's default RPC
  const wallet = createWalletClient({ account, chain, transport });
  const pub = createPublicClient({ chain, transport });

  console.log(`\n⛓  Registering Choco on ${chain.name} with URI: ${agentUri}`);
  const hash = await wallet.writeContract({
    address: registry,
    abi: IDENTITY_ABI,
    functionName: "register",
    args: [agentUri],
  });
  console.log("   tx submitted:", hash);

  const receipt = await pub.waitForTransactionReceipt({ hash });
  if (receipt.status !== "success") {
    throw new Error(`Registration tx reverted: ${hash}`);
  }

  // agentId = tokenId from the mint Transfer (from == zero address)
  const transfers = parseEventLogs({
    abi: IDENTITY_ABI,
    eventName: "Transfer",
    logs: receipt.logs,
  });
  const mint = transfers.find(
    (l) => (l.args.from as string).toLowerCase() === zeroAddress
  );
  if (!mint) {
    throw new Error(
      `Mint event not found in tx ${hash}. Inspect it on the explorer to read the agentId.`
    );
  }
  const agentId = mint.args.tokenId as bigint;

  // confirm what's on-chain
  const [uri, owner] = await Promise.all([
    pub.readContract({ address: registry, abi: IDENTITY_ABI, functionName: "tokenURI", args: [agentId] }),
    pub.readContract({ address: registry, abi: IDENTITY_ABI, functionName: "ownerOf", args: [agentId] }),
  ]);

  const agentRegistry = `eip155:${chain.id}:${registry}`;
  console.log("\n✅ Choco is registered on-chain.");
  console.log("   agentId:      ", agentId.toString());
  console.log("   owner:        ", owner);
  console.log("   agentURI:     ", uri);
  console.log("   agentRegistry:", agentRegistry);
  console.log("   tx:           ", hash);
  console.log(
    "\n🔎 Find Choco on 8004scan.io (search by agentId or your wallet address), then"
  );
  console.log("   paste that page's URL into your #CeloAgents tweet.");
}

main().catch((err) => {
  console.error("\n❌", err instanceof Error ? err.message : err);
  process.exit(1);
});
