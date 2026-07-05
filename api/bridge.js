// Bridge (Stripe) LATAM offramp — server-side proxy.
// BRIDGE_API_KEY lives only here; never expose it in VITE_ env vars.
// Docs: https://apidocs.bridge.xyz

import { allow, clientIp } from "./_ratelimit.js";

const BRIDGE_API = "https://api.bridge.xyz";
const API_KEY = process.env.BRIDGE_API_KEY || "";
const FEE_PERCENT = process.env.BRIDGE_FEE_PERCENT || "0.5";

export const config = { maxDuration: 15 };

function bridgeHeaders() {
  return { "Api-Key": API_KEY, "Content-Type": "application/json" };
}

async function bridgeFetch(path, options = {}) {
  const r = await fetch(`${BRIDGE_API}${path}`, {
    ...options,
    headers: { ...bridgeHeaders(), ...(options.headers || {}) },
  });
  const data = await r.json();
  if (!r.ok) throw Object.assign(new Error(data.message || data.error || "Bridge error"), { status: r.status });
  return data;
}

export default async function handler(req, res) {
  if (!API_KEY) {
    res.status(503).json({ ok: false, error: "Bridge offramp is not configured yet." });
    return;
  }

  const { action, customerId } = req.query || {};
  const ip = clientIp(req);

  // Tight limits on write actions; relaxed on reads.
  const writeLimit = action === "kyc_link" ? 3 : 5;
  const isWrite = req.method === "POST";
  if (!await allow(ip, `bridge:${action}`, isWrite ? writeLimit : 20)) {
    res.status(429).json({ ok: false, error: "Too many requests. Try again in a minute." });
    return;
  }

  try {
    // POST /api/bridge?action=kyc_link
    // Creates a Bridge-hosted KYC URL for the user. Returns customerId + kycUrl.
    if (action === "kyc_link" && req.method === "POST") {
      const { email, fullName } = req.body || {};
      if (!email) { res.status(400).json({ ok: false, error: "Email is required." }); return; }
      const data = await bridgeFetch("/v0/kyc_links", {
        method: "POST",
        body: JSON.stringify({ email, full_name: fullName || email, type: "individual" }),
      });
      res.json({ ok: true, kycUrl: data.url, customerId: data.customer_id || data.id });
      return;
    }

    // GET /api/bridge?action=kyc_status&customerId=…
    // Returns the user's KYC approval status.
    if (action === "kyc_status" && req.method === "GET") {
      if (!customerId) { res.status(400).json({ ok: false, error: "customerId required." }); return; }
      const data = await bridgeFetch(`/v0/customers/${customerId}/kyc`);
      res.json({ ok: true, status: data.kyc_status });
      return;
    }

    // POST /api/bridge?action=liquidation_address&customerId=…
    // Creates a Celo→fiat liquidation address for the customer's bank account.
    if (action === "liquidation_address" && req.method === "POST") {
      if (!customerId) { res.status(400).json({ ok: false, error: "customerId required." }); return; }
      const { rail, currency, bankAccount } = req.body || {};
      if (!rail || !currency || !bankAccount) {
        res.status(400).json({ ok: false, error: "rail, currency and bankAccount are required." });
        return;
      }
      const data = await bridgeFetch(`/v0/customers/${customerId}/liquidation_addresses`, {
        method: "POST",
        body: JSON.stringify({
          source: { payment_rail: "celo", currency: "usdc" },
          destination: { payment_rail: rail, currency, bank_account: bankAccount },
          developer_fee_percent: FEE_PERCENT,
        }),
      });
      res.json({ ok: true, address: data.address, id: data.id });
      return;
    }

    // GET /api/bridge?action=liquidation_addresses&customerId=…
    // Returns all existing liquidation addresses for the customer (to reuse across sessions).
    if (action === "liquidation_addresses" && req.method === "GET") {
      if (!customerId) { res.status(400).json({ ok: false, error: "customerId required." }); return; }
      const data = await bridgeFetch(`/v0/customers/${customerId}/liquidation_addresses`);
      res.json({ ok: true, addresses: data.data || [] });
      return;
    }

    res.status(400).json({ ok: false, error: `Unknown action: ${action}` });
  } catch (e) {
    const status = e.status || 500;
    res.status(status).json({ ok: false, error: e.message || "Internal error." });
  }
}
