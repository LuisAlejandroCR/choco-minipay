import assert from "node:assert/strict";
import test from "node:test";
import { assertQuoteAddresses, buildQuote, formatUsdc, readUsdcBalance } from "./quote.js";

// ── formatUsdc ────────────────────────────────────────────────────────────────

test("formatUsdc formats whole USDC", () => {
  assert.equal(formatUsdc(1_000_000n), "1 USDC");
  assert.equal(formatUsdc(5_000_000n), "5 USDC");
});

test("formatUsdc formats fractional USDC", () => {
  assert.equal(formatUsdc(2_100_000n), "2.1 USDC");
  assert.equal(formatUsdc(2_307_692n), "2.307692 USDC");
});

test("formatUsdc accepts string input", () => {
  assert.equal(formatUsdc("1000000"), "1 USDC");
  assert.equal(formatUsdc("0"), "0 USDC");
});

// ── assertQuoteAddresses ──────────────────────────────────────────────────────

test("assertQuoteAddresses passes for celoSepolia (addresses now filled)", () => {
  // Both addresses are filled in Block 12 — should not throw.
  assert.doesNotThrow(() => assertQuoteAddresses("celoSepolia"));
});

// ── readUsdcBalance ───────────────────────────────────────────────────────────

test("readUsdcBalance decodes eth_call response correctly", async () => {
  // 1 USDC = 1_000_000 minor units = 0xF4240
  const hexBalance = "0x" + "0".repeat(57) + "f4240"; // 32 bytes, right-padded
  const mockCallRpc = async () => hexBalance;

  const result = await readUsdcBalance(
    "0x0000000000000000000000000000000000000001",
    "celoSepolia",
    mockCallRpc,
  );

  assert.equal(result.wei, "1000000");
  assert.equal(result.formatted, "1 USDC");
  assert.equal(result.usdcMinor, 1_000_000n);
});

test("readUsdcBalance returns zero for empty wallet", async () => {
  const mockCallRpc = async () => "0x";

  const result = await readUsdcBalance(
    "0x0000000000000000000000000000000000000002",
    "celoSepolia",
    mockCallRpc,
  );

  assert.equal(result.wei, "0");
  assert.equal(result.formatted, "0 USDC");
  assert.equal(result.usdcMinor, 0n);
});

// ── buildQuote ────────────────────────────────────────────────────────────────

test("buildQuote falls back to mock rate when oracle call fails", async () => {
  // Balance: 5 USDC = 5_000_000 minor units
  const hexBalance = "0x" + "0".repeat(56) + "4c4b40";

  // Oracle call returns empty — triggers mock fallback
  const mockCallRpc = async (method, params) => {
    const to = (params?.[0]?.to ?? "").toLowerCase();
    // USDC balanceOf call (match case-insensitively — celo.js stores checksummed addresses)
    if (to === "0x01c5c0122039549ad1493b8220cabedd739bc44e") return hexBalance;
    // SortedOracles calls — return empty so mock fallback is used
    return "0x";
  };

  const result = await buildQuote({
    walletAddress: "0x0000000000000000000000000000000000000001",
    amountMinor: 300,
    networkKey: "celoSepolia",
    callRpc: mockCallRpc,
  });

  assert.equal(result.destinationAsset, "cKES");
  assert.equal(result.destinationAmount, 300);
  assert.equal(result.sourceAsset, "USDC");
  assert.equal(result.rateSource, "mock-until-provider-connected");
  assert.equal(result.rate, 130); // mock rate
  assert.ok(result.hasEnoughUsdc); // 5 USDC >= 300/130 ≈ 2.31 USDC
  assert.equal(result.expiresInSeconds, 45);
});

test("buildQuote sets hasEnoughUsdc false when balance is insufficient", async () => {
  // Balance: 1 USDC = 1_000_000 minor units
  const hexBalance = "0x" + "0".repeat(57) + "f4240";

  const mockCallRpc = async () => hexBalance; // same for balance and oracle

  const result = await buildQuote({
    walletAddress: "0x0000000000000000000000000000000000000001",
    amountMinor: 300, // needs ~2.31 USDC
    networkKey: "celoSepolia",
    callRpc: mockCallRpc,
  });

  assert.equal(result.hasEnoughUsdc, false);
  assert.equal(result.balanceUsdc, "1 USDC");
});
