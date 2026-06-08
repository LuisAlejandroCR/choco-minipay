import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import {
  createPublicClient,
  createWalletClient,
  getAddress,
  http,
  parseEventLogs,
  zeroAddress,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { celo, celoSepolia } from "viem/chains";

const REGISTRY = {
  sepolia: "0x8004A818BFB912233c491871b3d84c89A494BD9e",
  mainnet: "0x8004A169FB4a3325136EB29fA0ceB6D2e539a432",
} as const;

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
  const privateKey = process.env.PRIVATE_KEY as `0x${string}` | undefined;
  if (!privateKey) {
    throw new Error("Set PRIVATE_KEY only in the current terminal session.");
  }

  const network = (process.env.NETWORK ?? "sepolia") as keyof typeof REGISTRY;
  if (!(network in REGISTRY)) {
    throw new Error(`NETWORK must be "sepolia" or "mainnet". Received: ${network}`);
  }

  const chain = network === "mainnet" ? celo : celoSepolia;
  const registry = getAddress(REGISTRY[network]);
  const account = privateKeyToAccount(privateKey);
  const appUrl = (process.env.APP_URL ?? "https://choco.vercel.app").replace(/\/$/, "");
  const outputPath = process.env.AGENT_OUTPUT ?? "public/agent.json";

  const agentJson = {
    type: "https://eips.ethereum.org/EIPS/eip-8004#registration-v1",
    name: "Choco",
    description:
      "MiniPay-native remittance concierge. Choco schedules USDC to KESm family transfers on Celo, retries failures, notifies recipients, and files receipts.",
    image: `${appUrl}/icon.svg`,
    services: [
      { name: "web", endpoint: appUrl, version: "1.0" },
      { name: "wallet", endpoint: `eip155:${chain.id}:${account.address}` },
    ],
    supportedTrust: ["reputation"],
  };

  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, JSON.stringify(agentJson, null, 2));
  console.log(`Wrote ${outputPath}`);
  console.log("agent wallet:", account.address);
  console.log("network:", network);
  console.log("chainId:", chain.id);

  const agentUri = process.env.AGENT_URI;
  if (!agentUri) {
    console.log("Phase 1 complete. Deploy metadata, then rerun with AGENT_URI.");
    return;
  }

  const transport = http(process.env.RPC_URL);
  const wallet = createWalletClient({ account, chain, transport });
  const publicClient = createPublicClient({ chain, transport });

  const hash = await wallet.writeContract({
    address: registry,
    abi: IDENTITY_ABI,
    functionName: "register",
    args: [agentUri],
  });
  console.log("tx submitted:", hash);

  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  if (receipt.status !== "success") {
    throw new Error(`Registration transaction reverted: ${hash}`);
  }

  const transfers = parseEventLogs({
    abi: IDENTITY_ABI,
    eventName: "Transfer",
    logs: receipt.logs,
  });
  const mint = transfers.find((log) => String(log.args.from).toLowerCase() === zeroAddress);
  if (!mint) {
    throw new Error(`Mint Transfer event not found in transaction: ${hash}`);
  }

  const agentId = mint.args.tokenId as bigint;
  const [uri, owner] = await Promise.all([
    publicClient.readContract({
      address: registry,
      abi: IDENTITY_ABI,
      functionName: "tokenURI",
      args: [agentId],
    }),
    publicClient.readContract({
      address: registry,
      abi: IDENTITY_ABI,
      functionName: "ownerOf",
      args: [agentId],
    }),
  ]);

  console.log("agentId:", agentId.toString());
  console.log("owner:", owner);
  console.log("agentURI:", uri);
  console.log("agentRegistry:", `eip155:${chain.id}:${registry}`);
  console.log("tx:", hash);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
