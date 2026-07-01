import { test } from "node:test";
import assert from "node:assert/strict";
import { ethers } from "ethers";

// Gated integration test. Runs ONLY when a wallet key is provided via .env.test.local (gitignored),
// which test/load-env.mjs loads into process.env. Without a key it skips cleanly, so CI and a normal
// `npm test` (no secrets) stay green. With a key set locally, it exercises a real wallet read-only —
// it derives the address and reads its on-chain balance; it never moves funds.
const KEY = process.env.TEST_PRIVATE_KEY || process.env.KEEPER_KEY || "";
const RPC = process.env.VITE_CELO_RPC_URL || process.env.RPC_URL || process.env.CELO_RPC_URL || "https://forno.celo.org";

test("wallet from env derives a valid address and can read its on-chain balance", { skip: !KEY }, async () => {
  const wallet = new ethers.Wallet(KEY);
  assert.ok(ethers.isAddress(wallet.address), "derives a valid address");

  const provider = new ethers.JsonRpcProvider(RPC, { chainId: 42220, name: "celo" });
  const balance = await provider.getBalance(wallet.address);
  assert.ok(balance >= 0n, "reads a CELO balance for the wallet");
});
