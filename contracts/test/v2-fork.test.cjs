// Forked-mainnet tests for ChocoLedger v2 + ChocoGateway v2.
//
// Requires a local Hardhat fork running against Celo Mainnet:
//
//   npx hardhat node --fork https://forno.celo.org --port 8545
//
// Then in a second terminal:
//
//   CELO_FORK_RPC=http://127.0.0.1:8545 npm run test:fork
//
// Tests:
//   1. Normal settle  — settleScheduledRun swaps USDC→KESm and delivers to recipient
//   2. refundRunFor   — admin rescue sends locked USDC to the OWNER, not the caller
//   3. 27-day guard   — second settle in same period reverts "too soon"
//   4. Time travel    — after evm_increaseTime(27d), re-lock + re-settle succeeds
//   5. ABI: DeliveryFellBack event present in v2 ChocoGateway
//   6. ABI: recordSettlementFor function present in v2 ChocoLedger

"use strict";
const assert = require("node:assert/strict");
const { test, before } = require("node:test");
const { ethers } = require("ethers");
const fs = require("node:fs");
const path = require("node:path");
const solc = require("solc");

const FORK_RPC = process.env.CELO_FORK_RPC;
const SKIP = !FORK_RPC;
if (SKIP) console.log("[v2-fork] CELO_FORK_RPC not set — all fork tests skipped.");

// ─── Celo Mainnet constants ────────────────────────────────────────────────
const USDC_ADDR    = "0xcebA9300f2b948710d2653dD7B07f33A8B32118C";
const USDM_ADDR    = "0x765DE816845861e75A25fCA122bb6898B8B1282a";
const CKES_ADDR    = "0x456a3D042C0DbD3db53D5489e98dFb038553B0d0";
const BROKER       = "0x777A8255cA72412f0d706dc03C9D1987306B4CaD";
const EX_PROVIDER  = "0x22d9db95E6Ae61c104A7B6F6C78D7993B94ec901";
const USDC_USDM_ID = "0xacc988382b66ee5456086643dcfd9a5ca43dd8f428f6ef22503d8b8013bcffd7";
const ROUTER       = "0x5615CDAb10dc425a742d643d949a7F474C01abc4";
const POOL         = "0x95faa9a91cD6c1C018e4B1a6fC4c89D4F1695e5D";
const POOL_FEE     = 100;

const ERC20_ABI = [
  "function balanceOf(address) view returns (uint256)",
  "function approve(address,uint256) returns (bool)",
  "function transfer(address,uint256) returns (bool)",
  "function allowance(address,address) view returns (uint256)",
];

// ─── In-process compilation ────────────────────────────────────────────────
function compileSources() {
  const root = path.resolve(__dirname, "..");
  const sources = {};
  for (const file of fs.readdirSync(path.join(root, "src"))) {
    if (file.endsWith(".sol")) {
      sources[file] = { content: fs.readFileSync(path.join(root, "src", file), "utf8") };
    }
  }
  const out = JSON.parse(solc.compile(JSON.stringify({
    language: "Solidity",
    sources,
    settings: {
      optimizer: { enabled: true, runs: 200 },
      outputSelection: { "*": { "*": ["abi", "evm.bytecode.object"] } },
    },
  })));
  const errors = (out.errors || []).filter(e => e.severity === "error");
  if (errors.length) throw new Error(`v2 compilation failed:\n${errors.map(e => e.formattedMessage).join("\n")}`);
  return out;
}

// ─── USDC storage-slot mint (Circle FiatToken V2, balances at slot 9) ─────
// If balanceOf returns 0 after this, the USDC contract on this fork uses a
// different slot — impersonate a real holder instead.
async function mintUsdc(provider, toAddr, amount) {
  const encodedSlot = ethers.AbiCoder.defaultAbiCoder().encode(
    ["address", "uint256"],
    [toAddr, 9n],
  );
  const slot = ethers.keccak256(encodedSlot);
  await provider.send("hardhat_setStorageAt", [
    USDC_ADDR,
    slot,
    ethers.zeroPadValue(ethers.toBeHex(amount), 32),
  ]);
}

// ─── Shared state (filled in before()) ────────────────────────────────────
let provider, deployer, keeperSigner, sender, recipientSigner;
let ledger, gateway;
let compiled;
let scheduleId1, scheduleId2;

// Test amounts — small enough for real liquidity on the fork
const SOURCE_USDC = ethers.parseUnits("3", 6);    // 3 USDC per run
const DEST_KES    = ethers.parseUnits("400", 18);  // 400 KESm (≈ 3 USD at current rate)

// ─── Before: deploy fresh v2 contracts on the fork ────────────────────────
before(async () => {
  if (SKIP) return;

  provider = new ethers.JsonRpcProvider(FORK_RPC, { chainId: 42220, name: "celo" });

  // Hardhat fork pre-funds accounts [0-9] with 10 000 CELO each
  deployer        = await provider.getSigner(0); // admin of both contracts
  keeperSigner    = await provider.getSigner(1); // keeper role
  sender          = await provider.getSigner(2); // plan owner / USDC holder
  recipientSigner = await provider.getSigner(3); // KESm destination

  // Fund sender with USDC (FiatToken V2 slot 9)
  await mintUsdc(provider, sender.address, ethers.parseUnits("100", 6));

  // Sanity-check the mint worked
  const usdcRO = new ethers.Contract(USDC_ADDR, ERC20_ABI, provider);
  const senderUsdc = await usdcRO.balanceOf(sender.address);
  if (senderUsdc === 0n) {
    throw new Error(
      "USDC mint via slot 9 returned 0 — the Celo USDC contract may use a different storage slot. " +
      "Try impersonating a real USDC holder instead of hardhat_setStorageAt.",
    );
  }

  // Compile v2 source in-process
  compiled = compileSources();
  const la = compiled.contracts["ChocoLedger.sol"].ChocoLedger;
  const ga = compiled.contracts["ChocoGateway.sol"].ChocoGateway;

  // Deploy ChocoLedger v2
  const LF = new ethers.ContractFactory(la.abi, la.evm.bytecode.object, deployer);
  ledger = await LF.deploy(keeperSigner.address);
  await ledger.waitForDeployment();

  // Deploy ChocoGateway v2 (feeBps = 0 for tests to avoid fee math complexity)
  const GF = new ethers.ContractFactory(ga.abi, ga.evm.bytecode.object, deployer);
  gateway = await GF.deploy(
    BROKER, EX_PROVIDER, USDC_USDM_ID,
    ROUTER, POOL, POOL_FEE,
    USDC_ADDR, USDM_ADDR, CKES_ADDR,
    await ledger.getAddress(),
    ethers.ZeroAddress, // feeRecipient (none for tests)
    0,                  // feeBps
  );
  await gateway.waitForDeployment();

  // Gateway keeper = keeperSigner (constructor sets it to deployer — override here)
  if ((await gateway.keeper()).toLowerCase() !== keeperSigner.address.toLowerCase()) {
    await (await gateway.connect(deployer).setKeeper(keeperSigner.address)).wait();
  }

  // Authorize gateway on ledger so it can call logAttemptFor + recordSettlementFor
  await (await ledger.connect(deployer).setSwapContract(await gateway.getAddress(), true)).wait();

  console.log(`  ChocoLedger  v2: ${await ledger.getAddress()}`);
  console.log(`  ChocoGateway v2: ${await gateway.getAddress()}`);
});

// ─── Helper: create a schedule and lock one run's USDC ────────────────────
async function createAndLock(dayOfMonth) {
  const usdc  = new ethers.Contract(USDC_ADDR, ERC20_ABI, sender);
  const gwAddr = await gateway.getAddress();
  const now    = Math.floor(Date.now() / 1000);

  const tx = await ledger.connect(sender).createMonthlySchedule(
    recipientSigner.address,
    USDC_ADDR,
    SOURCE_USDC,
    DEST_KES,
    dayOfMonth,
    now,
    ethers.ZeroHash,
    ethers.ZeroHash,
  );
  const receipt = await tx.wait();
  const evt = receipt.logs
    .map(log => { try { return ledger.interface.parseLog(log); } catch { return null; } })
    .find(e => e?.name === "MonthlyScheduleCreated");
  if (!evt) throw new Error("MonthlyScheduleCreated not emitted");
  const id = evt.args.id;

  // Approve + lock (sender approves the gateway, then locks for themselves)
  await (await usdc.approve(gwAddr, SOURCE_USDC)).wait();
  await (await gateway.connect(sender).lockFor(sender.address, id, SOURCE_USDC)).wait();

  return id;
}

// ─── Test 1: Normal settle ─────────────────────────────────────────────────
test("settle — keeper executes swap, recipient receives KESm, lock cleared", { skip: SKIP }, async () => {
  scheduleId1 = await createAndLock(1);

  const ckesRO  = new ethers.Contract(CKES_ADDR, ERC20_ABI, provider);
  const lockedBefore = await gateway.lockedOf(sender.address, scheduleId1);
  assert.equal(lockedBefore, SOURCE_USDC, "pre-condition: lock not recorded");

  const recipientCkesBefore = await ckesRO.balanceOf(recipientSigner.address);

  // Keeper calls settleScheduledRun — reads recipient + amount from ledger
  const settleTx = await gateway.connect(keeperSigner).settleScheduledRun(scheduleId1);
  const settleReceipt = await settleTx.wait();

  // RunSettled must be emitted (fund-backed settlement event)
  const runSettled = settleReceipt.logs
    .map(log => { try { return gateway.interface.parseLog(log); } catch { return null; } })
    .find(e => e?.name === "RunSettled");
  assert.ok(runSettled, "RunSettled event not emitted");
  assert.equal(String(runSettled.args.scheduleId), String(scheduleId1));

  // SettlementReceipt must be emitted by ledger (v2: recordSettlementFor, atomic with the swap)
  const settReceipt = settleReceipt.logs
    .map(log => { try { return ledger.interface.parseLog(log); } catch { return null; } })
    .find(e => e?.name === "SettlementReceipt");
  assert.ok(settReceipt, "SettlementReceipt not emitted on ledger (v2 recordSettlementFor)");

  // Recipient received KESm
  const recipientCkesAfter = await ckesRO.balanceOf(recipientSigner.address);
  assert.ok(recipientCkesAfter > recipientCkesBefore, "recipient did not receive KESm");

  // Lock was cleared
  const lockedAfter = await gateway.lockedOf(sender.address, scheduleId1);
  assert.equal(lockedAfter, 0n, "lock not cleared after settle");
});

// ─── Test 2: refundRunFor — admin rescue ──────────────────────────────────
test("refundRunFor — locked USDC goes to OWNER, admin receives nothing", { skip: SKIP }, async () => {
  scheduleId2 = await createAndLock(15);

  const usdcRO = new ethers.Contract(USDC_ADDR, ERC20_ABI, provider);
  const senderBefore   = await usdcRO.balanceOf(sender.address);
  const deployerBefore = await usdcRO.balanceOf(deployer.address);

  const locked = await gateway.lockedOf(sender.address, scheduleId2);
  assert.equal(locked, SOURCE_USDC, "pre-condition: lock not recorded");

  // Admin (deployer) calls refundRunFor for the owner (sender) — not for themselves
  const tx = await gateway.connect(deployer).refundRunFor(sender.address, scheduleId2);
  const receipt = await tx.wait();

  // RunRefunded must be emitted
  const evt = receipt.logs
    .map(log => { try { return gateway.interface.parseLog(log); } catch { return null; } })
    .find(e => e?.name === "RunRefunded");
  assert.ok(evt, "RunRefunded event not emitted");
  assert.equal(evt.args.usdcAmount, SOURCE_USDC);

  // Owner (sender) received the USDC
  const senderAfter = await usdcRO.balanceOf(sender.address);
  assert.equal(senderAfter - senderBefore, SOURCE_USDC, "owner did not receive refund");

  // Admin (deployer) received nothing — admin cannot steal
  const deployerAfter = await usdcRO.balanceOf(deployer.address);
  assert.equal(deployerAfter, deployerBefore, "admin must not receive funds from refundRunFor");

  // Lock cleared
  const lockedAfter = await gateway.lockedOf(sender.address, scheduleId2);
  assert.equal(lockedAfter, 0n, "lock not cleared after refundRunFor");
});

// ─── Test 3: 27-day double-settle guard ───────────────────────────────────
test("27-day guard — same-period double-settle reverts 'too soon'", { skip: SKIP }, async () => {
  // scheduleId1 was settled in Test 1. Re-lock it, then try to settle again without advancing time.
  const usdc   = new ethers.Contract(USDC_ADDR, ERC20_ABI, sender);
  const gwAddr = await gateway.getAddress();
  await (await usdc.approve(gwAddr, SOURCE_USDC)).wait();
  await (await gateway.connect(sender).lockFor(sender.address, scheduleId1, SOURCE_USDC)).wait();

  // Attempt second settle in the same 27-day period — ledger.recordSettlementFor reverts
  await assert.rejects(
    () => gateway.connect(keeperSigner).settleScheduledRun(scheduleId1),
    (err) => {
      const msg = err?.shortMessage || err?.message || String(err);
      assert.match(msg, /too soon/i, `Expected "too soon" revert, got: ${msg}`);
      return true;
    },
    'double-settle should revert "too soon"',
  );

  // Lock must still be present (entire tx reverted — swap + record rolled back)
  const lockedAfter = await gateway.lockedOf(sender.address, scheduleId1);
  assert.equal(lockedAfter, SOURCE_USDC, "lock must survive a reverted settle attempt");
});

// ─── Test 4: Time travel — settle succeeds after 27 days ──────────────────
test("time travel — after 27d + 1h, same schedule can be settled again", { skip: SKIP }, async () => {
  const ckesRO  = new ethers.Contract(CKES_ADDR, ERC20_ABI, provider);

  // Advance the fork clock past MIN_SETTLE_INTERVAL (27 days = 2 332 800 s)
  const TWENTY_SEVEN_DAYS = 27 * 24 * 60 * 60 + 3600; // 27d + 1h
  await provider.send("evm_increaseTime", [TWENTY_SEVEN_DAYS]);
  await provider.send("evm_mine", []);

  const recipientCkesBefore = await ckesRO.balanceOf(recipientSigner.address);

  // scheduleId1 still has the lock from Test 3 (the reverted tx left it intact)
  const settleTx = await gateway.connect(keeperSigner).settleScheduledRun(scheduleId1);
  const settleReceipt = await settleTx.wait();

  const runSettled = settleReceipt.logs
    .map(log => { try { return gateway.interface.parseLog(log); } catch { return null; } })
    .find(e => e?.name === "RunSettled");
  assert.ok(runSettled, "RunSettled not emitted on second-period settle");

  const recipientCkesAfter = await ckesRO.balanceOf(recipientSigner.address);
  assert.ok(recipientCkesAfter > recipientCkesBefore, "recipient did not receive KESm on second settle");
});

// ─── Test 5: DeliveryFellBack event in v2 ABI ────────────────────────────
// Live trigger requires the KESm token to be paused or a recipient blacklisted —
// not testable without token-admin access. This test verifies the audit mitigation
// exists in the compiled bytecode.
test("ABI: DeliveryFellBack event present in v2 ChocoGateway", { skip: SKIP }, async () => {
  const abi = compiled.contracts["ChocoGateway.sol"].ChocoGateway.abi;
  const evt = abi.find(item => item.type === "event" && item.name === "DeliveryFellBack");
  assert.ok(evt, "DeliveryFellBack missing from compiled ABI");

  const names = evt.inputs.map(i => i.name);
  assert.ok(names.includes("intendedRecipient"), "missing intendedRecipient");
  assert.ok(names.includes("creditedTo"),         "missing creditedTo");
  assert.ok(names.includes("ckesAmount"),          "missing ckesAmount");
});

// ─── Test 6: recordSettlementFor in v2 ChocoLedger ABI ───────────────────
test("ABI: recordSettlementFor present in v2 ChocoLedger with correct signature", { skip: SKIP }, async () => {
  const abi = compiled.contracts["ChocoLedger.sol"].ChocoLedger.abi;
  const fn  = abi.find(item => item.type === "function" && item.name === "recordSettlementFor");
  assert.ok(fn, "recordSettlementFor missing from compiled ChocoLedger ABI");

  const types = fn.inputs.map(i => i.type);
  assert.deepEqual(types, ["uint256", "uint256", "bytes32", "string"],
    "recordSettlementFor signature mismatch");

  // Must not be callable by just anyone — only authorizedSwapContracts
  // (verified by the "not authorized" revert test below)
  const unauthSigner = await provider.getSigner(9);
  const ledgerUnauth = new ethers.Contract(
    await ledger.getAddress(),
    compiled.contracts["ChocoLedger.sol"].ChocoLedger.abi,
    unauthSigner,
  );
  await assert.rejects(
    () => ledgerUnauth.recordSettlementFor(1n, 0n, ethers.ZeroHash, "hack"),
    /not authorized/i,
    "recordSettlementFor must reject unauthorized callers",
  );
});
