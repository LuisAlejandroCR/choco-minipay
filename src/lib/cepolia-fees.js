// Gas/fee estimation for one Choco gateway transfer, using CIP-64 fee abstraction (USDC pays gas).
// The gateway settles the whole route (USDC → USDm via Mento, USDm → KESm via Uniswap V3, deliver
// KESm, refund USDm surplus) in ONE swapAndSendExact tx, so the cost is just:
//   1. approve USDC → gateway   (first send only; the allowance stays warm afterwards)
//   2. swapAndSendExact         (everything else, in a single tx)
//
// CIP-64 rules (builder-guide.md):
//   • Pass feeCurrency to estimateContractGas — the node prices gas in the fee token.
//   • eth_gasPrice with the feeCurrency adapter returns the price already in fee-token units
//     (18-dec USDC), so formatUnits(totalGas × gasPrice, 18) is the USDC cost directly.
import { formatUnits, isAddress } from "viem";
import { ADDRESSES, ERC20_ABI, getApprovalTarget, makePublicClient } from "./celo.js";
import { APP_CONFIG } from "./app-config.js";

// Settle gas calibrated from a verified mainnet tx (618,573 gas), rounded up for headroom. The old
// 5-op Mento model (~844k) over-stated the fee by ~70%.
const GATEWAY_SETTLE_GAS = 650000n;

export async function estimateTransferFeeUsdc(account, usdcAmountRaw) {
  const publicClient = makePublicClient();
  const feeCurrency = ADDRESSES.feeCurrency;

  // approve USDC → gateway is the only approval; the gateway runs both hops internally. Count it in the
  // fee ONLY when the wallet must actually approve first — on repeat sends the allowance is already warm,
  // so the displayed fee is just the single settle tx (and matches the wallet's own simulation, instead
  // of over-stating it by ~46k gas every time).
  let approveGas = 0n;
  const approvalTarget = getApprovalTarget({
    deliveryMode: "now",
    intent: { sourceAsset: APP_CONFIG.assets.source },
  });
  const spender = approvalTarget?.address || ADDRESSES.mentoBroker;
  if (account && isAddress(account) && usdcAmountRaw > 0n) {
    let allowance = 0n;
    try {
      allowance = await publicClient.readContract({
        address: ADDRESSES.usdc,
        abi: ERC20_ABI,
        functionName: "allowance",
        args: [account, spender],
      });
    } catch {}
    if (allowance < usdcAmountRaw) {
      approveGas = 46000n;
      try {
        approveGas = await publicClient.estimateContractGas({
          address: ADDRESSES.usdc,
          abi: ERC20_ABI,
          functionName: "approve",
          args: [spender, usdcAmountRaw],
          account,
          feeCurrency,
        });
      } catch {}
    }
  }

  const totalGas = approveGas + GATEWAY_SETTLE_GAS;

  // eth_gasPrice with feeCurrency returns the price denominated in the fee adapter
  // (18-dec USDC), so formatUnits(total, 18) gives the USDC cost directly.
  try {
    const gasPriceHex = await publicClient.request({
      method: "eth_gasPrice",
      params: [feeCurrency],
    });
    return Number(formatUnits(totalGas * BigInt(gasPriceHex), 18));
  } catch {
    return 0.004; // fallback: one approve + one gateway settle at a typical gas price
  }
}
