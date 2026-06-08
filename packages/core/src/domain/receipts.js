import { CELO_NETWORKS } from "../config/celo.js";

export function buildReceiptUrl({ network = "celoSepolia", txHash }) {
  const activeNetwork = CELO_NETWORKS[network];
  if (!activeNetwork) throw new Error(`Unsupported Celo network: ${network}`);
  if (!txHash) return activeNetwork.explorerTxUrl;
  return `${activeNetwork.explorerTxUrl}/${encodeURIComponent(txHash)}`;
}

export function buildShareText(receipt) {
  return [
    `Choco receipt: ${receipt.amountMinor} ${receipt.destinationAsset} to ${receipt.recipientAlias}`,
    `Timing: ${receipt.deliveryMode === "now" ? "Send once now" : receipt.cadence}`,
    `Status: ${receipt.status}`,
    `Hash: ${receipt.txHash}`,
    `Verify: ${buildReceiptUrl({ network: receipt.network, txHash: receipt.txHash })}`,
  ].join("\n");
}
