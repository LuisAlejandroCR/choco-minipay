export const VERIFIED_WALLET_SCREENS = new Set([
  "plans",
  "planDetail",
  "history",
  "planEditor",
  "deletePlan",
  "processing",
  "checkpoint",
  "duplicateGuard",
  "review",
]);

export function requiresVerifiedWallet(screen) {
  return VERIFIED_WALLET_SCREENS.has(screen);
}

export function resolveVisibleScreen(screen, walletReady) {
  return !walletReady && requiresVerifiedWallet(screen) ? "walletGate" : screen;
}

export function getWalletStatusLabel(walletReady) {
  return walletReady ? "Verified Wallet" : "Verify Wallet";
}
