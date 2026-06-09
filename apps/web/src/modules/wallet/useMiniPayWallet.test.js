import assert from "node:assert/strict";
import test from "node:test";
import {
  getMetaMaskMobileDappUrl,
  isCeloSepoliaTestnet,
  isMobileRuntime,
  isMobileUserAgent,
  METAMASK_DOWNLOAD_URL,
  normalizeChainId,
  TESTNET_WALLET_NETWORK,
} from "./useMiniPayWallet.js";

test("normalizes Celo Sepolia testnet chain id", () => {
  assert.equal(TESTNET_WALLET_NETWORK.chainId, 11142220);
  assert.equal(TESTNET_WALLET_NETWORK.chainIdHex, "0xaa044c");
  assert.equal(TESTNET_WALLET_NETWORK.rpcUrl, "https://forno.celo-sepolia.celo-testnet.org");
  assert.equal(TESTNET_WALLET_NETWORK.explorerUrl, "https://celo-sepolia.blockscout.com");
  assert.equal(normalizeChainId("0xaa044c"), 11142220);
  assert.equal(normalizeChainId("0xAA044C"), 11142220);
  assert.equal(normalizeChainId("11142220"), 11142220);
  assert.equal(normalizeChainId("not-a-chain"), 0);
  assert.equal(isCeloSepoliaTestnet("0xaa044c"), true);
  assert.equal(isCeloSepoliaTestnet(42220), false);
});

test("builds mobile wallet fallback links", () => {
  assert.equal(isMobileUserAgent("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)"), true);
  assert.equal(isMobileUserAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64)"), false);
  assert.equal(isMobileRuntime("Mozilla/5.0 (X11; Linux x86_64)", 5), true);
  assert.equal(isMobileRuntime("Mozilla/5.0 (Windows NT 10.0; Win64; x64)", 5), false);
  assert.equal(METAMASK_DOWNLOAD_URL, "https://metamask.io/download/");
  assert.equal(
    getMetaMaskMobileDappUrl("https://choco-minipay.vercel.app/path"),
    "https://metamask.app.link/dapp/choco-minipay.vercel.app/path",
  );
});
