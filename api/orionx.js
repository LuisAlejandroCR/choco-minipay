// Orionx Business Payments — server-side proxy for Chile (CLP) and Peru (PEN) offramp.
// ORIONX_API_KEY lives only here; never expose it in VITE_ env vars.
// Apply at orionx.com/business. Verify endpoint paths against their API docs when the key arrives.

import { allow, clientIp } from "./_ratelimit.js";

const ORIONX_API = "https://api.orionx.com/payments";
const API_KEY = process.env.ORIONX_API_KEY || "";

export const config = { maxDuration: 15 };

function orionxHeaders() {
  return { Authorization: `Bearer ${API_KEY}`, "Content-Type": "application/json" };
}

async function orionxFetch(path, options = {}) {
  const r = await fetch(`${ORIONX_API}${path}`, {
    ...options,
    headers: { ...orionxHeaders(), ...(options.headers || {}) },
  });
  const data = await r.json();
  if (!r.ok) throw Object.assign(new Error(data.message || data.error || "Orionx error"), { status: r.status });
  return data;
}

export default async function handler(req, res) {
  if (!API_KEY) {
    res.status(503).json({ ok: false, error: "Chile and Peru corridors are not configured yet." });
    return;
  }

  const { action, reference } = req.query || {};
  const ip = clientIp(req);

  if (!allow(ip, `orionx:${action}`, action === "payout" ? 5 : 20)) {
    res.status(429).json({ ok: false, error: "Too many requests. Try again in a minute." });
    return;
  }

  try {
    // GET /api/orionx?action=quote&currency=clp&amount=10
    // Returns the local-currency amount for a given USDC amount.
    // currency — "clp" | "pen"   amount — USDC amount (e.g. "10")
    if (action === "quote" && req.method === "GET") {
      const { currency, amount } = req.query;
      if (!currency || !amount) {
        res.status(400).json({ ok: false, error: "currency and amount are required." });
        return;
      }
      // TODO: verify exact path against Orionx Business Payments API docs.
      const data = await orionxFetch(`/v1/rates?currency=${currency.toUpperCase()}&amount=${amount}&source=USDC&chain=celo`);
      res.json({ ok: true, rate: data.rate, localAmount: data.local_amount, fee: data.fee });
      return;
    }

    // POST /api/orionx?action=payout
    // Initiates an offramp payout. Returns a USDC deposit address on Celo.
    // Body: { currency, amountUsdc, recipient: { bankAccount, rut|dni } }
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
      // TODO: verify exact path and body shape against Orionx Business Payments API docs.
      const data = await orionxFetch("/v1/transfers", {
        method: "POST",
        body: JSON.stringify({
          source_currency: "USDC",
          source_chain: "celo",
          destination_currency: currency.toUpperCase(),
          amount: amountUsdc,
          recipient,
        }),
      });
      res.json({
        ok: true,
        reference: data.id || data.reference,
        depositAddress: data.deposit_address,
        expiresAt: data.expires_at,
      });
      return;
    }

    // GET /api/orionx?action=status&reference=…
    // Polls the status of a payout by reference/id.
    if (action === "status" && req.method === "GET") {
      if (!reference) { res.status(400).json({ ok: false, error: "reference required." }); return; }
      // TODO: verify exact path against Orionx Business Payments API docs.
      const data = await orionxFetch(`/v1/transfers/${reference}`);
      res.json({ ok: true, status: data.status, localAmount: data.local_amount });
      return;
    }

    res.status(400).json({ ok: false, error: `Unknown action: ${action}` });
  } catch (e) {
    const status = e.status || 500;
    res.status(status).json({ ok: false, error: e.message || "Internal error." });
  }
}
