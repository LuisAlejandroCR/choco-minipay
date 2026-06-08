import assert from "node:assert/strict";
import test from "node:test";
import {
  isCeloSepoliaTestnet,
  normalizeChainId,
  TESTNET_WALLET_NETWORK,
} from "./useMiniPayWallet.js";

test("normalizes Celo Sepolia testnet chain id", () => {
  assert.equal(TESTNET_WALLET_NETWORK.chainId, 11142220);
  assert.equal(TESTNET_WALLET_NETWORK.chainIdHex, "0xaa044c");
  assert.equal(normalizeChainId("0xaa044c"), 11142220);
  assert.equal(normalizeChainId("0xAA044C"), 11142220);
  assert.equal(normalizeChainId("11142220"), 11142220);
  assert.equal(isCeloSepoliaTestnet("0xaa044c"), true);
  assert.equal(isCeloSepoliaTestnet(42220), false);
});
