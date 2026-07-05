// Kotani Pay — Africa expanded offramp server-side proxy.
// KOTANI_API_KEY lives only here; never expose it in VITE_ env vars.
// Apply at kotanipay.com. Verify endpoint paths against their docs when the key arrives.
// Docs: https://docs.kotanipay.com

import { allow, clientIp } from "./_ratelimit.js";

const KOTANI_API = "https://api.kotanipay.com";
const API_KEY = process.env.KOTANI_API_KEY || "";

export const config = { maxDuration: 15 };

function kotaniHeaders() {
  return { Authorization: `Bearer ${API_KEY}`, "Content-Type": "application/json" };
}

async function kotaniFetch(path, options = {}) {
  const r = await fetch(`${KOTANI_API}${path}`, {
    ...options,
    headers: { ...kotaniHeaders(), ...(options.headers || {}) },
  });
  const data = await r.json();
  if (!r.ok) throw Object.assign(new Error(data.message || data.error || "Kotani error"), { status: r.status });
  return data;
}

export default async function handler(req, res) {
  if (!API_KEY) {
    res.status(503).json({ ok: false, error: "Africa expanded corridors are not configured yet." });
    return;
  }

  const { action, reference } = req.query || {};
  const ip = clientIp(req);

  if (!await allow(ip, `kotani:${action}`, action === "payout" ? 5 : 20)) {
    res.status(429).json({ ok: false, error: "Too many requests. Try again in a minute." });
    return;
  }

  try {
    // GET /api/kotani?action=quote&currency=ngn&amount=10
    // Returns the local-currency amount for a given USDC amount on Celo.
    // amount — USDC amount (e.g. "10" for $10 USDC)
    // currency — destination currency code: ngn, ghs, zar
    if (action === "quote" && req.method === "GET") {
      const { currency, amount } = req.query;
      if (!currency || !amount) {
        res.status(400).json({ ok: false, error: "currency and amount are required." });
        return;
      }
      const data = await kotaniFetch(`/v1/rates?currency=${currency.toUpperCase()}&amount=${amount}&chain=celo`);
      // Expected response: { rate, local_amount, fee }
      res.json({ ok: true, rate: data.rate, localAmount: data.local_amount, fee: data.fee });
      return;
    }

    // POST /api/kotani?action=payout
    // Initiates an offramp payout. Returns a USDC deposit address on Celo.
    // Body: { currency, amountUsdc, recipient }
    //   currency     — "ngn" | "ghs" | "zar"
    //   amountUsdc   — USDC amount as a string, e.g. "10.00"
    //   recipient    — { phone } for mobile money or { accountNumber, bankCode, name } for bank transfer
    if (action === "payout" && req.method === "POST") {
      const { currency, amountUsdc, recipient } = req.body || {};
      if (!currency || !amountUsdc || !recipient) {
        res.status(400).json({ ok: false, error: "currency, amountUsdc and recipient are required." });
        return;
      }
      const parsed = parseFloat(amountUsdc);
      if (!Number.isFinite(parsed) || parsed <= 0 || parsed > 10000) {
        res.status(400).json({ ok: false, error: "amountUsdc must be a positive number (max 10000)." });
        return;
      }
      const data = await kotaniFetch("/v1/transfers", {
        method: "POST",
        body: JSON.stringify({
          source_currency: "USDC",
          source_chain: "celo",
          destination_currency: currency.toUpperCase(),
          amount: amountUsdc,
          recipient,
        }),
      });
      // Expected response: { id/reference, deposit_address, expires_at }
      res.json({
        ok: true,
        reference: data.id || data.reference,
        depositAddress: data.deposit_address,
        expiresAt: data.expires_at,
      });
      return;
    }

    // GET /api/kotani?action=status&reference=…
    // Polls the status of a payout by reference/id.
    if (action === "status" && req.method === "GET") {
      if (!reference) { res.status(400).json({ ok: false, error: "reference required." }); return; }
      const data = await kotaniFetch(`/v1/transfers/${reference}`);
      // Expected response: { status: "pending" | "processing" | "completed" | "failed", ... }
      res.json({ ok: true, status: data.status, localAmount: data.local_amount });
      return;
    }

    res.status(400).json({ ok: false, error: `Unknown action: ${action}` });
  } catch (e) {
    const status = e.status || 500;
    res.status(status).json({ ok: false, error: e.message || "Internal error." });
  }
}
