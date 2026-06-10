// Throwaway probe: verify the USDC -> cKES route + liquidity on Celo mainnet.
// Run: node scripts/probe-mento.mjs   (uses the repo's local viem; no new deps)
import { createPublicClient, http, formatUnits, getAddress } from "viem";

const client = createPublicClient({ transport: http("https://forno.celo.org") });

const A = {
  cKES: getAddress("0x456a3D042C0DbD3db53D5489e98dFb038553B0d0"),
  USDC: getAddress("0xcebA9300f2b948710d2653dD7B07f33A8B32118C"),
  USDm: getAddress("0x765DE816845861e75A25fCA122bb6898B8B1282a"),
  BROKER: getAddress("0x777A8255cA72412f0d706dc03C9D1987306B4CaD"),
  BIPOOL: getAddress("0x22d9db95E6Ae61c104A7B6F6C78D7993B94ec901"),
  V3_USDC_USDm: getAddress("0x462fe04b4FD719Cbd04C0310365D421D02AaA19E"),
};

const erc20 = [
  { name: "symbol", type: "function", stateMutability: "view", inputs: [], outputs: [{ type: "string" }] },
  { name: "decimals", type: "function", stateMutability: "view", inputs: [], outputs: [{ type: "uint8" }] },
  { name: "totalSupply", type: "function", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { name: "balanceOf", type: "function", stateMutability: "view", inputs: [{ type: "address" }], outputs: [{ type: "uint256" }] },
];
const brokerAbi = [
  { name: "getExchangeProviders", type: "function", stateMutability: "view", inputs: [], outputs: [{ type: "address[]" }] },
  { name: "getAmountOut", type: "function", stateMutability: "view",
    inputs: [{ type: "address" }, { type: "bytes32" }, { type: "address" }, { type: "address" }, { type: "uint256" }],
    outputs: [{ type: "uint256" }] },
];
const bipoolAbi = [
  { name: "getExchanges", type: "function", stateMutability: "view", inputs: [],
    outputs: [{ type: "tuple[]", components: [{ name: "exchangeId", type: "bytes32" }, { name: "assets", type: "address[]" }] }] },
];

const dec = {};
async function meta(addr) {
  const [symbol, decimals, totalSupply] = await Promise.all([
    client.readContract({ address: addr, abi: erc20, functionName: "symbol" }),
    client.readContract({ address: addr, abi: erc20, functionName: "decimals" }),
    client.readContract({ address: addr, abi: erc20, functionName: "totalSupply" }),
  ]);
  dec[addr] = decimals;
  console.log(`  ${symbol.padEnd(5)} ${addr}  decimals=${decimals}  totalSupply=${Number(formatUnits(totalSupply, decimals)).toLocaleString()}`);
}

try {
  console.log("\n== Token metadata ==");
  await meta(A.USDC); await meta(A.USDm); await meta(A.cKES);

  console.log("\n== Mento V2 exchange providers ==");
  const providers = await client.readContract({ address: A.BROKER, abi: brokerAbi, functionName: "getExchangeProviders" });
  console.log(" ", providers);

  console.log("\n== BiPool exchanges touching cKES or USDC ==");
  const exchanges = await client.readContract({ address: A.BIPOOL, abi: bipoolAbi, functionName: "getExchanges" });
  const want = new Set([A.cKES.toLowerCase(), A.USDC.toLowerCase(), A.USDm.toLowerCase()]);
  const hits = exchanges.filter((e) => e.assets.some((x) => want.has(x.toLowerCase())));
  for (const e of hits) console.log(`  id=${e.exchangeId}  assets=${e.assets}`);

  // Quote the USDm -> cKES hop if a direct exchange exists.
  const usdmCkes = hits.find((e) => {
    const s = e.assets.map((x) => x.toLowerCase());
    return s.includes(A.USDm.toLowerCase()) && s.includes(A.cKES.toLowerCase());
  });
  if (usdmCkes) {
    console.log("\n== Quote USDm -> cKES (hop 2) ==");
    for (const amt of [1, 100, 400]) {
      const out = await client.readContract({ address: A.BROKER, abi: brokerAbi, functionName: "getAmountOut",
        args: [A.BIPOOL, usdmCkes.exchangeId, A.USDm, A.cKES, BigInt(amt) * 10n ** 18n] });
      console.log(`  ${amt} USDm -> ${Number(formatUnits(out, 18)).toLocaleString()} cKES`);
    }
  } else {
    console.log("\n  !! No direct USDm<->cKES BiPool exchange found via V2.");
  }

  console.log("\n== V3 USDC/USDm pool depth ==");
  const [u, m] = await Promise.all([
    client.readContract({ address: A.USDC, abi: erc20, functionName: "balanceOf", args: [A.V3_USDC_USDm] }),
    client.readContract({ address: A.USDm, abi: erc20, functionName: "balanceOf", args: [A.V3_USDC_USDm] }),
  ]);
  console.log(`  pool holds ${Number(formatUnits(u, 6)).toLocaleString()} USDC + ${Number(formatUnits(m, 18)).toLocaleString()} USDm`);
  console.log("\nDONE.\n");
} catch (err) {
  console.error("PROBE ERROR:", err.shortMessage || err.message);
}
