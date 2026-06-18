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

import { runDueSchedules } from "./choco-keeper.mjs";

const args = new Set(process.argv.slice(2));

runDueSchedules({
  shouldSend: args.has("--send"),
  recordOnly: args.has("--record-only"),
  logger: console,
}).catch((error) => {
  console.error(error);
  process.exit(1);
});
