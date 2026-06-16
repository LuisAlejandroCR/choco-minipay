import assert from "node:assert/strict";
import test from "node:test";
import { buildPersonalSignPayload, buildWalletSignInMessage } from "./supabase.js";

const WALLET = "0x1234567890abcdef1234567890abcdef12345678";

test("buildWalletSignInMessage binds the signature to wallet and time", () => {
  const message = buildWalletSignInMessage(WALLET, 1710000000000);

  assert.match(message, /Sign in to Choco/);
  assert.match(message, new RegExp(`Wallet: ${WALLET}`));
  assert.match(message, /Time: 1710000000000/);
});

test("buildPersonalSignPayload encodes the sign-in message as hex for MiniPay", () => {
  const payload = buildPersonalSignPayload(buildWalletSignInMessage(WALLET, 1710000000000));

  assert.match(payload, /^0x[0-9a-f]+$/);
  assert.notEqual(payload[2], "S");
});
