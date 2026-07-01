// Test env loader — preloaded via `node --import ./test/load-env.mjs` (see package.json "test").
// Lets tests read wallet keys + addresses from local env files WITHOUT committing secrets (all real
// env files are gitignored; only .env.example is tracked).
//
// Precedence (later overrides earlier), mirroring Vite's convention — but a value already present in
// the real process.env / CI always wins, so secrets injected by CI aren't clobbered by a stale file:
//   .env  ->  .env.local  ->  .env.test.local  ->  .env.production.local
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const fromRealEnv = new Set(Object.keys(process.env)); // real/CI env wins over any file
const files = [".env", ".env.local", ".env.test.local", ".env.production.local"];

for (const file of files) {
  let text;
  try {
    text = readFileSync(resolve(root, file), "utf8");
  } catch {
    continue; // file absent → skip
  }
  for (const line of text.split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.*)$/);
    if (!match) continue; // blank / comment / malformed
    const [, key, rawValue] = match;
    if (fromRealEnv.has(key)) continue; // don't override real/CI env
    process.env[key] = rawValue.trim().replace(/^["']|["']$/g, ""); // later file overrides earlier
  }
}
