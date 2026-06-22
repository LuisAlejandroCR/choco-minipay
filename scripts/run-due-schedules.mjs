// Batch keeper for Choco scheduled plans.
//
// Dry run:
//   node scripts/run-due-schedules.mjs
//
// Execute due plans and record them in ChocoLedger:
//   $env:KEEPER_KEY="0x..."
//   node scripts/run-due-schedules.mjs --send
//
// Choco stays non-custodial: the gateway pulls from the user's prior allowance,
// sends KESm to the recipient, then the keeper records the receipt in ChocoLedger.

import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { runDueSchedules } from "./choco-keeper.mjs";

// Load the project .env for local runs (VITE_LEDGER_ADDRESS, escrow/gateway, RPC, etc.). On Vercel
// these are already real env vars; we only fill values that aren't set, so an inline
// `$env:KEEPER_KEY=...` before the command still takes precedence.
try {
  const envPath = resolve(dirname(fileURLToPath(import.meta.url)), "..", ".env");
  for (const line of readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.*)$/);
    if (m && process.env[m[1]] === undefined) {
      process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
    }
  }
} catch {}

const args = new Set(process.argv.slice(2));

runDueSchedules({
  shouldSend: args.has("--send"),
  recordOnly: args.has("--record-only"),
  logger: console,
}).catch((error) => {
  console.error(error);
  process.exit(1);
});
