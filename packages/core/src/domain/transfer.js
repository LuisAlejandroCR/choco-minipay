/**
 * Transfer domain — Block 13.
 *
 * This file is a stub that defines the export interface for Block 13.
 * Implement here; the API (`POST /v1/transfer/prepare`) and wallet layer
 * (`useMiniPayWallet.signAndSend`) depend on these exports.
 *
 * Responsibilities:
 *   - Build Mento swap calldata (USDC → cKES via Mento broker)
 *   - Assemble a CIP-64 transaction with feeCurrency set to the USDC adapter
 *   - Fall back to native CELO gas if the USDC fee-currency adapter is not
 *     whitelisted on Celo Sepolia (see feeCurrencyAddress null in celo.js)
 *
 * The API prepares and validates the transaction; the wallet signs it.
 * Private keys never leave the wallet — the API returns an unsigned tx object.
 *
 * TODO Block 13:
 *   - Confirm Mento broker address on Celo Sepolia (see celo.js mentoBrokerAddress)
 *   - Confirm cKES or USDm as destinationAsset for testnet
 *   - Implement buildTransferCalldata using viem ABI encoding
 *   - Implement prepareCip64Transaction
 */

/**
 * Build Mento swap + transfer calldata.
 * @param {{ sourceAsset: string, sourceAmount: string, destinationAsset: string, recipientAddress: string, mentoBrokerAddress: string }} params
 * @returns {{ to: string, data: string, value: string }}
 */
export function buildTransferCalldata(_params) {
  throw new Error("buildTransferCalldata is not implemented — start with Block 13.");
}

/**
 * Assemble an unsigned CIP-64 transaction for wallet signing.
 * @param {{ calldata: object, senderAddress: string, feeCurrencyAddress: string | null, chainId: number }} params
 * @returns {{ to: string, data: string, value: string, gas: string, feeCurrency?: string, chainId: number }}
 */
export function prepareCip64Transaction(_params) {
  throw new Error("prepareCip64Transaction is not implemented — start with Block 13.");
}
