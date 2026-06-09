/**
 * ODIS / SocialConnect integration — Block 15.
 *
 * This file is a stub that defines the export interface for Block 15.
 * ODIS (On-chain Data Identity Service) on Celo maps phone numbers to
 * wallet addresses via a privacy-preserving oblivious PRF.
 *
 * When implemented, this lets recipients use a phone number instead of
 * a `0x` wallet address — critical for non-crypto-native recipients
 * receiving money from a diaspora sender.
 *
 * Reference: https://docs.celo.org/protocol/identity/odis
 * SocialConnect SDK: https://github.com/celo-org/social-connect
 *
 * Prerequisites (Block 15):
 *   - ODIS_SIGNER_PRIVATE_KEY and ODIS_DEK_PRIVATE_KEY in .env
 *   - Phone number E.164 format (+254700000000)
 *   - Celo Mainnet only — ODIS is not available on Celo Sepolia
 *   - KYC/AML review before enabling for real recipients
 *
 * For testnet (blocks 11–14): contacts use wallet addresses directly.
 * `lookupWalletByPhone` will throw below — do not call it before Block 15.
 *
 * TODO Block 15:
 *   - Implement using @celo/identity or the SocialConnect SDK
 *   - Add E.164 phone number validation
 *   - Cache lookups — ODIS charges a small gas fee per query
 *   - Integrate with ContactCapture UI: show phone option alongside 0x address
 */

/**
 * Look up the registered wallet address for a phone number via ODIS.
 * @param {string} phoneNumber  E.164 format, e.g. "+254700000000"
 * @param {{ signerPrivateKey: string, dekPrivateKey: string, chainId: number }} odisConfig
 * @returns {Promise<string | null>}  The wallet address, or null if not registered.
 */
export async function lookupWalletByPhone(_phoneNumber, _odisConfig) {
  throw new Error("lookupWalletByPhone is not implemented — start with Block 15.");
}

/**
 * Register (or update) the wallet address for a phone number via ODIS.
 * Used by recipients who want to receive money by phone number.
 * @param {string} phoneNumber  E.164 format
 * @param {string} walletAddress  0x address to register
 * @param {{ signerPrivateKey: string, dekPrivateKey: string, chainId: number }} odisConfig
 * @returns {Promise<{ txHash: string }>}
 */
export async function registerPhoneWallet(_phoneNumber, _walletAddress, _odisConfig) {
  throw new Error("registerPhoneWallet is not implemented — start with Block 15.");
}
