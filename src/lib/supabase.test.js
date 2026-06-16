import assert from "node:assert/strict";
import test from "node:test";
import {
  buildAuthWalletHeaders,
  buildPersonalSignPayload,
  buildWalletSignInMessage,
  readAuthWalletError,
} from "./supabase.js";

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

test("buildAuthWalletHeaders includes Supabase anon credentials for Edge Functions", () => {
  const headers = buildAuthWalletHeaders("anon-test-key");

  assert.equal(headers["Content-Type"], "application/json");
  assert.equal(headers.apikey, "anon-test-key");
  assert.equal(headers.Authorization, "Bearer anon-test-key");
});

test("readAuthWalletError keeps Supabase JSON error messages", async () => {
  const response = new Response(JSON.stringify({ error: "Missing authorization header" }), {
    status: 401,
    headers: { "content-type": "application/json" },
  });

  assert.equal(await readAuthWalletError(response), "Missing authorization header");
});

test("readAuthWalletError falls back to text responses", async () => {
  const response = new Response("Function not found", { status: 404 });

  assert.equal(await readAuthWalletError(response), "Function not found");
});
