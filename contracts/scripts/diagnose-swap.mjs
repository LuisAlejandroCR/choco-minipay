/**
 * Diagnose why swapAndSendExact simulation fails for ChocoUniV3CkesSwap.
 * Run: node scripts/diagnose-swap.mjs
 */
import { ethers } from "ethers";

const CELO_RPC = "https://forno.celo.org";

const SWAP_CONTRACT   = "0xc903894a33d87d49ca10a9c24906f9a50a8d13b9"; // ChocoUniV3CkesSwap
const OPERATOR        = "0xc7203b6f0313ed490e2b68156aeb3380fe274b66"; // MiniPay test wallet
const RECIPIENT       = "0xc7203b6f0313ed490e2b68156aeb3380fe274b66"; // send to self for test
const USDC            = "0xcebA9300f2b948710d2653dD7B07f33A8B32118C";
const USDM            = "0x765DE816845861e75A25fCA122bb6898B8B1282a";
const KESM            = "0x456a3D042C0DbD3db53D5489e98dFb038553B0d0";
const BROKER          = "0x777A8255cA72412f0d706dc03C9D1987306B4CaD";
const EXCHANGE_PROVIDER = "0x22d9db95E6Ae61c104A7B6F6C78D7993B94ec901";
const USDC_USDM_ID    = "0xacc988382b66ee5456086643dcfd9a5ca43dd8f428f6ef22503d8b8013bcffd7";
const UNIV3_ROUTER    = "0x5615CDAb10dc425a742d643d949a7F474C01abc4";
const UNIV3_POOL      = "0x95faa9a91cD6c1C018e4B1a6fC4c89D4F1695e5D";

const rpc = new ethers.JsonRpcProvider(CELO_RPC, { chainId: 42220, name: "celo" });

const ERC20_ABI = [
  "function balanceOf(address) view returns (uint256)",
  "function allowance(address owner, address spender) view returns (uint256)",
];

const SWAP_ABI = [
  "function feeBps() view returns (uint16)",
  "function feeRecipient() view returns (address)",
  "function usdcToUsdmId() view returns (bytes32)",
  "function exchangeProvider() view returns (address)",
  "function broker() view returns (address)",
  "function router() view returns (address)",
  "function pool() view returns (address)",
  "function poolFee() view returns (uint24)",
  "function quote(uint256 usdcAmountIn) view returns (uint256 ckesAmountOut)",
  "function quoteExactOut(uint256 ckesExactOut) view returns (uint256 usdcAmountIn)",
  "function swapAndSendExact(address recipient, uint256 usdcAmountIn, uint256 ckesExactOut) returns (uint256 ckesAmountOut)",
];

const BROKER_ABI = [
  "function getAmountOut(address exchangeProvider, bytes32 exchangeId, address tokenIn, address tokenOut, uint256 amountIn) view returns (uint256)",
  "function swapIn(address exchangeProvider, bytes32 exchangeId, address tokenIn, address tokenOut, uint256 amountIn, uint256 amountOutMin) returns (uint256)",
];

const POOL_ABI = [
  "function slot0() view returns (uint160 sqrtPriceX96, int24 tick, uint16 observationIndex, uint16 observationCardinality, uint16 observationCardinalityNext, uint8 feeProtocol, bool unlocked)",
  "function liquidity() view returns (uint128)",
];

const ROUTER_ABI = [
  "function exactInputSingle((address tokenIn, address tokenOut, uint24 fee, address recipient, uint256 deadline, uint256 amountIn, uint256 amountOutMinimum, uint160 sqrtPriceLimitX96)) returns (uint256 amountOut)",
];

async function main() {
  const swap   = new ethers.Contract(SWAP_CONTRACT, SWAP_ABI, rpc);
  const usdc   = new ethers.Contract(USDC, ERC20_ABI, rpc);
  const usdm   = new ethers.Contract(USDM, ERC20_ABI, rpc);
  const kesm   = new ethers.Contract(KESM, ERC20_ABI, rpc);
  const broker = new ethers.Contract(BROKER, BROKER_ABI, rpc);
  const pool   = new ethers.Contract(UNIV3_POOL, POOL_ABI, rpc);

  console.log("\n=== ChocoUniV3CkesSwap Diagnostic ===\n");

  // 1. Contract config
  const [feeBps, feeRecipient, poolFeeV] = await Promise.all([
    swap.feeBps(),
    swap.feeRecipient(),
    swap.poolFee(),
  ]);
  console.log("Contract config:");
  console.log("  feeBps:", feeBps.toString(), `(${(Number(feeBps)/100).toFixed(2)}%)`);
  console.log("  feeRecipient:", feeRecipient);
  console.log("  poolFee:", poolFeeV.toString());

  // 2. Operator wallet state
  const [usdcBal, usdmBal, kesBal, allowanceToSwap] = await Promise.all([
    usdc.balanceOf(OPERATOR),
    usdm.balanceOf(OPERATOR),
    kesm.balanceOf(OPERATOR),
    usdc.allowance(OPERATOR, SWAP_CONTRACT),
  ]);
  console.log("\nOperator wallet:");
  console.log("  USDC balance:", ethers.formatUnits(usdcBal, 6), "USDC (raw:", usdcBal.toString(), ")");
  console.log("  USDm balance:", ethers.formatUnits(usdmBal, 18), "USDm");
  console.log("  KESm balance:", ethers.formatUnits(kesBal, 18), "KESm");
  console.log("  USDC allowance → swap:", allowanceToSwap.toString(), `(${ethers.formatUnits(allowanceToSwap, 6)} USDC)`);

  // 3. Quote
  const CKES_1 = ethers.parseUnits("1", 18);
  let rawQuote, usdcNeeded;
  try {
    rawQuote = await swap.quoteExactOut(CKES_1);
    // Apply buffer: 500 bps or min 5000 raw USDC, whichever is greater
    const bufferBps = (rawQuote * 500n) / 10000n;
    const minBuffer = 5000n;
    const buffer = bufferBps > minBuffer ? bufferBps : minBuffer;
    usdcNeeded = rawQuote + buffer;
    console.log("\nQuotes (for 1 KESm):");
    console.log("  quoteExactOut(1e18) =", rawQuote.toString(), `(${ethers.formatUnits(rawQuote, 6)} USDC)`);
    console.log("  usdcNeeded (with buffer) =", usdcNeeded.toString(), `(${ethers.formatUnits(usdcNeeded, 6)} USDC)`);
  } catch (e) {
    console.log("\nERROR calling quoteExactOut:", e.message);
    return;
  }

  // 4. Mento USDC->USDm quote (what the contract will get in hop 1)
  const fee = feeBps > 0n ? (usdcNeeded * feeBps) / 10000n : 0n;
  const swapUsdc = usdcNeeded - fee;
  let usdmQuote;
  try {
    usdmQuote = await broker.getAmountOut(EXCHANGE_PROVIDER, USDC_USDM_ID, USDC, USDM, swapUsdc);
    console.log("\nMento USDC→USDm quote:");
    console.log("  swapUsdc (after fee):", swapUsdc.toString(), `(${ethers.formatUnits(swapUsdc, 6)} USDC)`);
    console.log("  usdmQuote:", usdmQuote.toString(), `(${ethers.formatUnits(usdmQuote, 18)} USDm)`);
  } catch (e) {
    console.log("\nERROR calling broker.getAmountOut (USDC→USDm):", e.message);
    return;
  }

  // 5. UniV3 pool state
  const [slot0Data, liquidity] = await Promise.all([pool.slot0(), pool.liquidity()]);
  const sqrtPriceX96 = slot0Data[0];
  const scaledInvSqrt = (2n**96n * 1_000_000_000n) / sqrtPriceX96;
  const ckesPerUsdm18 = scaledInvSqrt * scaledInvSqrt;
  const estKes = (usdmQuote * ckesPerUsdm18) / 10n**18n;
  console.log("\nUniV3 Pool state:");
  console.log("  sqrtPriceX96:", sqrtPriceX96.toString());
  console.log("  tick:", slot0Data[1].toString());
  console.log("  unlocked:", slot0Data[6]);
  console.log("  liquidity:", liquidity.toString());
  console.log("  estimated KESm from", ethers.formatUnits(usdmQuote, 18), "USDm:", ethers.formatUnits(estKes, 18), "KESm");
  if (estKes < CKES_1) {
    console.log("  WARNING: estimated output", ethers.formatUnits(estKes, 18), "< required 1 KESm — swap would revert on ckesMinOut check");
  } else {
    console.log("  OK: estimated output > 1 KESm ✓");
  }

  // 6. Check if pool is locked
  if (!slot0Data[6]) {
    console.log("  WARNING: pool is LOCKED (unlocked=false)!");
  }

  // 7. Simulate swapAndSendExact via eth_call
  console.log("\nSimulating swapAndSendExact(" + RECIPIENT + ", " + usdcNeeded.toString() + ", " + CKES_1.toString() + ")...");
  console.log("  (as operator wallet:", OPERATOR, ")");

  const FULL_SWAP_ABI = [
    "function swapAndSendExact(address recipient, uint256 usdcAmountIn, uint256 ckesExactOut) returns (uint256 ckesAmountOut)",
  ];
  const swapIface = new ethers.Interface(FULL_SWAP_ABI);
  const calldata = swapIface.encodeFunctionData("swapAndSendExact", [RECIPIENT, usdcNeeded, CKES_1]);

  try {
    const result = await rpc.call({
      from: OPERATOR,
      to: SWAP_CONTRACT,
      data: calldata,
    });
    const decoded = swapIface.decodeFunctionResult("swapAndSendExact", result);
    console.log("  SUCCESS! ckesAmountOut:", ethers.formatUnits(decoded[0], 18), "KESm");
  } catch (e) {
    console.log("  FAILED.");
    console.log("  error.code:", e.code);
    console.log("  error.message:", e.message?.slice(0, 300));
    if (e.data) {
      console.log("  error.data (revert):", e.data);
      // Try to decode the revert reason
      try {
        const decoded = ethers.AbiCoder.defaultAbiCoder().decode(["string"], "0x" + e.data.slice(10));
        console.log("  decoded revert reason:", decoded[0]);
      } catch {
        // try Error(string) selector = 0x08c379a0
        if (e.data && e.data.startsWith("0x08c379a0")) {
          try {
            const decoded = ethers.AbiCoder.defaultAbiCoder().decode(["string"], "0x" + e.data.slice(10));
            console.log("  decoded revert string:", decoded[0]);
          } catch (e2) {
            console.log("  could not decode revert data");
          }
        } else {
          console.log("  raw revert data:", e.data.slice(0, 100));
        }
      }
    } else {
      console.log("  (no revert data — empty revert)");
    }
  }

  // 8. Step-by-step: simulate Mento swapIn as the swap contract
  console.log("\nStep-by-step Mento swapIn simulation (from swap contract):");
  const BROKER_IFACE = new ethers.Interface([
    "function swapIn(address exchangeProvider, bytes32 exchangeId, address tokenIn, address tokenOut, uint256 amountIn, uint256 amountOutMin) returns (uint256)",
  ]);
  const amountOutMin = (usdmQuote * 985n) / 1000n;
  const swapInCalldata = BROKER_IFACE.encodeFunctionData("swapIn", [
    EXCHANGE_PROVIDER, USDC_USDM_ID, USDC, USDM, swapUsdc, amountOutMin
  ]);
  try {
    // Try calling broker.swapIn as if we were the swap contract
    const result = await rpc.call({
      from: SWAP_CONTRACT, // simulating as the swap contract
      to: BROKER,
      data: swapInCalldata,
    });
    const decoded = BROKER_IFACE.decodeFunctionResult("swapIn", result);
    console.log("  Mento swapIn success! usdmOut:", ethers.formatUnits(decoded[0], 18));
  } catch (e) {
    console.log("  Mento swapIn FAILED from swap contract.");
    console.log("  error.message:", e.message?.slice(0, 300));
    if (e.data) {
      console.log("  revert data:", e.data.slice(0, 100));
      if (e.data.startsWith("0x08c379a0")) {
        try {
          const decoded = ethers.AbiCoder.defaultAbiCoder().decode(["string"], "0x" + e.data.slice(10));
          console.log("  decoded:", decoded[0]);
        } catch {}
      }
    }
  }

  // 9A. Try simulation with LARGER KESm amount (50 KESm → ~0.38 USDC)
  console.log("\nSimulating swapAndSendExact for 50 KESm (larger test):");
  const CKES_50 = ethers.parseUnits("50", 18);
  let usdcNeeded50;
  try {
    const rawQ50 = await swap.quoteExactOut(CKES_50);
    const bufferBps = (rawQ50 * 500n) / 10000n;
    const minBuf = 5000n;
    const buf = bufferBps > minBuf ? bufferBps : minBuf;
    usdcNeeded50 = rawQ50 + buf;
    const calldata50 = swapIface.encodeFunctionData("swapAndSendExact", [RECIPIENT, usdcNeeded50, CKES_50]);
    const result = await rpc.send("eth_call", [
      { from: OPERATOR, to: SWAP_CONTRACT, data: calldata50, gas: "0x5B8D80" /* 6M */ },
      "latest",
    ]);
    const decoded = swapIface.decodeFunctionResult("swapAndSendExact", result);
    console.log("  SUCCESS for 50 KESm:", ethers.formatUnits(decoded[0], 18), "KESm (usdcIn:", ethers.formatUnits(usdcNeeded50, 6), "USDC)");
    console.log("  This means the issue is SPECIFIC TO TINY AMOUNTS.");
  } catch (e) {
    const truncMsg = e.message?.slice(0, 200);
    const hasData = e.data && e.data !== "0x";
    console.log("  FAILED:", truncMsg);
    if (hasData) console.log("  data:", e.data?.slice(0, 100));
    console.log("  Same failure for large amounts → NOT a tiny-amount rounding issue.");
  }

  // 9B. Check UniV3 pool factory vs router's expected factory
  console.log("\nChecking UniV3 pool factory vs SwapRouter02 factory:");
  const POOL_FACTORY_ABI = ["function factory() view returns (address)"];
  const poolWithFactory = new ethers.Contract(UNIV3_POOL, POOL_FACTORY_ABI, rpc);
  const ROUTER_FACTORY_ABI = ["function factory() view returns (address)", "function WETH9() view returns (address)"];
  const router = new ethers.Contract(UNIV3_ROUTER, ROUTER_FACTORY_ABI, rpc);
  let poolFactory, routerFactory;
  try {
    [poolFactory, routerFactory] = await Promise.all([poolWithFactory.factory(), router.factory()]);
    console.log("  Pool factory:   ", poolFactory);
    console.log("  Router factory: ", routerFactory);
    if (poolFactory.toLowerCase() === routerFactory.toLowerCase()) {
      console.log("  MATCH ✓ — router can find this pool.");
    } else {
      console.log("  MISMATCH ✗ — router cannot find this pool! The router will compute a different pool address.");
      console.log("  This is likely the ROOT CAUSE of the swap failure.");
    }
  } catch (e) {
    console.log("  ERROR:", e.message?.slice(0, 200));
  }

  // 9C. Compute the pool address that SwapRouter02 would derive
  if (poolFactory && routerFactory && poolFactory.toLowerCase() !== routerFactory.toLowerCase()) {
    console.log("\nComputing the pool address SwapRouter02 would derive:");
    // UniV3 pool address = CREATE2(factory, salt=keccak256(abi.encode(token0, token1, fee)), initCodeHash)
    // Uniswap V3 initCodeHash: 0xe34f199b19b2b4f47f68442619d555527d244f78a3297ea89325f843f87b8b54
    const UNISWAP_INIT_CODE_HASH = "0xe34f199b19b2b4f47f68442619d555527d244f78a3297ea89325f843f87b8b54";
    // tokens sorted: token0 < token1
    const [t0, t1] = USDM.toLowerCase() < KESM.toLowerCase() ? [USDM, KESM] : [KESM, USDM];
    const salt = ethers.keccak256(ethers.AbiCoder.defaultAbiCoder().encode(["address", "address", "uint24"], [t0, t1, 100]));
    const computedPool = ethers.getCreate2Address(routerFactory, salt, UNISWAP_INIT_CODE_HASH);
    console.log("  Computed pool address:", computedPool);
    console.log("  Actual pool address:  ", UNIV3_POOL);
    console.log("  These are", computedPool.toLowerCase() === UNIV3_POOL.toLowerCase() ? "THE SAME ✓" : "DIFFERENT ✗ — router uses wrong pool");
  }

  // 9. Simulate swapAndSendExact with explicit high gas limit
  console.log("\nSimulating swapAndSendExact with explicit gas (3_000_000):");
  try {
    const result = await rpc.send("eth_call", [
      { from: OPERATOR, to: SWAP_CONTRACT, data: calldata, gas: "0x2DC6C0" /* 3_000_000 */ },
      "latest",
    ]);
    const decoded = swapIface.decodeFunctionResult("swapAndSendExact", result);
    console.log("  SUCCESS:", ethers.formatUnits(decoded[0], 18), "KESm");
  } catch (e) {
    console.log("  FAILED:", e.message?.slice(0, 300));
    if (e.data && e.data !== "0x") console.log("  data:", e.data?.slice(0, 100));
  }

  // 10. Try broker.swapIn AS OPERATOR directly (bypass our contract)
  console.log("\nBroker swapIn as OPERATOR directly (bypassing swap contract):");
  console.log("  First, simulate: operator approves broker, then calls swapIn...");
  const APPROVALS_ABI = new ethers.Interface([
    "function approve(address spender, uint256 amount) returns (bool)",
    "function transferFrom(address from, address to, uint256 amount) returns (bool)",
    "function allowance(address owner, address spender) view returns (uint256)",
    "function balanceOf(address account) view returns (uint256)",
  ]);
  const operatorAllowanceToBroker = await new ethers.Contract(USDC, ERC20_ABI, rpc).allowance(OPERATOR, BROKER);
  console.log("  Operator→Broker USDC allowance (current):", operatorAllowanceToBroker.toString());

  // The swap contract is the one that calls the broker, not the operator.
  // So let's simulate: swap contract has USDC + approved broker.
  // We can simulate by calling broker.swapIn as OPERATOR with OPERATOR having allowance to broker.
  // This tests whether the Mento USDC→USDm path is broken for tiny amounts.
  console.log("  Simulating broker.swapIn from OPERATOR (with operator's own USDC + operator→broker approval):");
  const swapIn_op_calldata = BROKER_IFACE.encodeFunctionData("swapIn", [
    EXCHANGE_PROVIDER, USDC_USDM_ID, USDC, USDM, swapUsdc, amountOutMin
  ]);
  try {
    const result = await rpc.send("eth_call", [
      { from: OPERATOR, to: BROKER, data: swapIn_op_calldata, gas: "0x2DC6C0" },
      "latest",
    ]);
    const decoded = BROKER_IFACE.decodeFunctionResult("swapIn", result);
    console.log("  SUCCESS! usdmOut:", ethers.formatUnits(decoded[0], 18));
    console.log("  This means the Mento USDC→USDm path WORKS when called directly.");
    console.log("  The issue is specific to the call from the swap contract.");
  } catch (e) {
    console.log("  FAILED:", e.message?.slice(0, 300));
    if (e.data) {
      console.log("  data:", e.data?.slice(0, 100));
      if (e.data.startsWith("0x08c379a0")) {
        try { const d = ethers.AbiCoder.defaultAbiCoder().decode(["string"], "0x" + e.data.slice(10)); console.log("  decoded:", d[0]); } catch {}
      }
    }
  }

  // 11. Try calling broker.swapIn from swap contract WITH explicit USDC override
  // Use Ankr endpoint which may support state overrides
  console.log("\nTrying state-override RPC (Ankr) for broker.swapIn from swap contract:");
  const ANKR_RPC = "https://rpc.ankr.com/celo";
  const rpcAnkr = new ethers.JsonRpcProvider(ANKR_RPC, { chainId: 42220, name: "celo" });
  // State override: give the swap contract 1 USDC of balance and set allowance to broker
  // USDC FiatToken V2 storage layout: _balances at slot 0, _allowed at slot 1
  // For proxy contracts, slot may differ. Let's compute the slot.
  // ERC20 balance: keccak256(address, slot) for mapping
  const balanceSlot = ethers.keccak256(ethers.AbiCoder.defaultAbiCoder().encode(["address", "uint256"], [SWAP_CONTRACT, 9])); // FiatToken uses slot 9 for balances
  const allowanceSlot = ethers.keccak256(ethers.AbiCoder.defaultAbiCoder().encode(
    ["address", "uint256"],
    [BROKER, ethers.keccak256(ethers.AbiCoder.defaultAbiCoder().encode(["address", "uint256"], [SWAP_CONTRACT, 10]))]  // nested mapping slot 10 for allowances
  ));
  try {
    const result = await rpcAnkr.send("eth_call", [
      { from: SWAP_CONTRACT, to: BROKER, data: swapIn_op_calldata, gas: "0x2DC6C0" },
      "latest",
      {
        [USDC]: {
          stateDiff: {
            // Give swap contract 1 USDC at slot 9 (FiatToken V2 balance mapping)
            [balanceSlot]: ethers.toBeHex(BigInt(swapUsdc), 32),
            // Set allowance swap→broker at slot 10
            [allowanceSlot]: ethers.toBeHex(BigInt(swapUsdc), 32),
          }
        }
      }
    ]);
    const decoded = BROKER_IFACE.decodeFunctionResult("swapIn", result);
    console.log("  SUCCESS with state override:", ethers.formatUnits(decoded[0], 18), "USDm");
    console.log("  Mento swapIn works when swap contract has USDC — issue is elsewhere.");
  } catch (e) {
    console.log("  FAILED:", e.message?.slice(0, 300));
    if (e.data && e.data !== "0x") {
      console.log("  data:", e.data?.slice(0, 100));
      if (e.data.startsWith("0x08c379a0")) {
        try { const d = ethers.AbiCoder.defaultAbiCoder().decode(["string"], "0x" + e.data.slice(10)); console.log("  decoded:", d[0]); } catch {}
      }
    } else {
      console.log("  (empty revert — same issue)");
    }
  }

  // 12. Check if the Mento BiPool is paused or has any trading restriction
  console.log("\nChecking Mento BiPool exchange state:");
  const BIPOOL_ABI = [
    "function getPoolExchange(bytes32 exchangeId) view returns (tuple(bytes32 exchangeId, address[] assets, uint256[] buckets, uint256 spread, uint256 referenceRateResetFrequency, uint256 minimumReports, bool isConstantSum) exchange)",
    "function getExchangeIds() view returns (bytes32[])",
  ];
  const bipool = new ethers.Contract(EXCHANGE_PROVIDER, BIPOOL_ABI, rpc);
  try {
    const exchange = await bipool.getPoolExchange(USDC_USDM_ID);
    console.log("  exchange.assets:", exchange.assets);
    console.log("  exchange.buckets:", exchange.buckets.map(b => b.toString()));
    console.log("  exchange.spread:", exchange.spread.toString());
    console.log("  exchange.minimumReports:", exchange.minimumReports.toString());
    const usdcBucket = exchange.buckets[0];
    const usdmBucket = exchange.buckets[1];
    if (usdcBucket === 0n || usdmBucket === 0n) {
      console.log("  WARNING: one or more buckets are ZERO — exchange may be suspended!");
    } else {
      console.log("  Buckets look non-zero ✓");
      console.log("  If swap fails with 0x, check if BiPool is paused or circuit breaker is tripped.");
    }
  } catch (e) {
    console.log("  ERROR reading BiPool exchange:", e.message?.slice(0, 200));
  }

  console.log("\n=== Done ===\n");
}

main().catch(console.error);
