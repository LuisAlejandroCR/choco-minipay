/**
 * Contact schema and helpers for Block 11: Recipient Contact.
 *
 * A contact maps a human alias ("Mom") to a real on-chain wallet address.
 * On testnet, contacts are stored in localStorage by the web app and mirrored
 * to the API so the worker can read them without calling the browser.
 *
 * Schema: { alias, walletAddress, network, createdAt }
 *
 * ODIS / SocialConnect phone-number lookup is a Block 15 concern.
 * For Celo Sepolia testnet, a 0x wallet address is sufficient.
 */

/**
 * Returns true when the string looks like a 20-byte EVM address (0x + 40 hex chars).
 * Case-insensitive. Does NOT verify the EIP-55 checksum — that would fail on pure
 * lowercase inputs from copy-paste.
 */
export function isValidWalletAddress(address) {
  return /^0x[a-fA-F0-9]{40}$/.test(String(address || "").trim());
}

/**
 * Builds a validated contact record.
 * Returns null if alias is empty or walletAddress fails the regex check.
 */
export function buildContact(alias, walletAddress, network = "celoSepolia") {
  const trimmedAlias = String(alias || "").trim();
  const lowerAddress = String(walletAddress || "").toLowerCase();
  if (!trimmedAlias || !isValidWalletAddress(lowerAddress)) return null;
  return {
    alias: trimmedAlias,
    walletAddress: lowerAddress,
    network,
    createdAt: new Date().toISOString(),
  };
}

/**
 * Returns a short display string for a contact's address — first 6 and last 4 chars.
 * Example: "0xAbCd...ef12"
 * Returns "" if the contact has no walletAddress.
 */
export function formatContactShort(contact) {
  if (!contact?.walletAddress) return "";
  const addr = contact.walletAddress;
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}
