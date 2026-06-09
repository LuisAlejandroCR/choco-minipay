import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { getCeloNetworkConfig } from "../../../packages/core/src/config/celo.js";

const AGENT_JSON_PATH = join(dirname(fileURLToPath(import.meta.url)), "../../../public/agent.json");
import { parseTransferIntent } from "../../../packages/core/src/domain/intent.js";
import { evaluateAgentPreflight } from "../../../packages/core/src/domain/preflight.js";

const port = Number(process.env.PORT || 8787);
const testnetNetwork = getCeloNetworkConfig("celoSepolia");
const rpcUrl = process.env.RPC_URL || testnetNetwork.rpcUrl;

// In-memory contact store — testnet only.
// Populated when the web app saves a contact (POST /v1/contacts).
// The worker reads this to resolve recipient addresses without hitting the browser.
// Persisted to disk or a DB in Block 14 when recurring transfers need durability.
const contactStore = new Map();

function sendJson(response, statusCode, body) {
  response.writeHead(statusCode, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    "access-control-allow-origin": "*",
    "access-control-allow-methods": "GET,POST,OPTIONS",
    "access-control-allow-headers": "content-type",
  });
  response.end(JSON.stringify(body));
}

const MAX_BODY_BYTES = 4096;

async function readRequestJson(request) {
  const chunks = [];
  let totalBytes = 0;
  for await (const chunk of request) {
    totalBytes += chunk.length;
    if (totalBytes > MAX_BODY_BYTES) throw Object.assign(new Error("Request body too large"), { code: "PAYLOAD_TOO_LARGE" });
    chunks.push(chunk);
  }
  if (chunks.length === 0) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw Object.assign(new Error("Request body is not valid JSON"), { code: "INVALID_JSON" });
  }
}

async function callRpc(method, params = []) {
  const response = await fetch(rpcUrl, {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({
      id: 1,
      jsonrpc: "2.0",
      method,
      params,
    }),
  });

  if (!response.ok) {
    throw new Error(`RPC request failed with ${response.status}`);
  }

  const payload = await response.json();
  if (payload.error) {
    throw new Error(payload.error.message || "RPC request failed");
  }

  return payload.result;
}

const server = createServer(async (request, response) => {
  const url = new URL(request.url || "/", `http://${request.headers.host || "127.0.0.1"}`);

  if (request.method === "OPTIONS") {
    sendJson(response, 204, {});
    return;
  }

  if (request.method === "GET" && url.pathname === "/health") {
    sendJson(response, 200, {
      ok: true,
      service: "choco-api",
      environment: process.env.APP_ENV || "local",
    });
    return;
  }

  if (request.method === "GET" && url.pathname === "/v1/agent") {
    try {
      const content = await readFile(AGENT_JSON_PATH, "utf8");
      sendJson(response, 200, JSON.parse(content));
    } catch {
      sendJson(response, 503, { error: "agent_metadata_unavailable", message: "agent.json could not be read." });
    }
    return;
  }

  if (request.method === "POST" && url.pathname === "/v1/intent/preview") {
    let body;
    try { body = await readRequestJson(request); } catch (err) { sendJson(response, err.code === "PAYLOAD_TOO_LARGE" ? 413 : 400, { error: err.code?.toLowerCase() || "bad_request" }); return; }
    const intent = parseTransferIntent(body.command || "", {
      deliveryMode: body.deliveryMode || "schedule",
    });
    sendJson(response, 200, {
      intent,
      quote: {
        sourceAsset: intent.sourceAsset,
        sourceAmount: intent.estimatedSourceAmount,
        destinationAsset: intent.destinationAsset,
        destinationAmount: intent.amountMinor,
        expiresInSeconds: 45,
        mode: "mock-until-provider-connected",
      },
    });
    return;
  }

  if (request.method === "POST" && url.pathname === "/v1/agent/preflight") {
    let body;
    try { body = await readRequestJson(request); } catch (err) { sendJson(response, err.code === "PAYLOAD_TOO_LARGE" ? 413 : 400, { error: err.code?.toLowerCase() || "bad_request" }); return; }
    let gasBalanceWei = "0x0";

    try {
      if (body.walletAddress) {
        gasBalanceWei = await callRpc("eth_getBalance", [body.walletAddress, "latest"]);
      }
    } catch (error) {
      sendJson(response, 502, {
        agent: "Choco Agent AI",
        status: "blocked",
        ok: false,
        summary: `Agent preflight could not reach ${testnetNetwork.name} RPC.`,
        error: error instanceof Error ? error.message : "RPC unavailable",
      });
      return;
    }

    sendJson(response, 200, evaluateAgentPreflight({
      walletAddress: body.walletAddress || "",
      chainId: body.chainId || "",
      gasBalanceWei,
      recipientContact: body.recipientContact || "",
    }));
    return;
  }

  // GET /v1/contacts — return all stored contacts (worker reads this)
  if (request.method === "GET" && url.pathname === "/v1/contacts") {
    sendJson(response, 200, { contacts: [...contactStore.values()] });
    return;
  }

  // POST /v1/contacts — save a contact from the web app
  if (request.method === "POST" && url.pathname === "/v1/contacts") {
    let body;
    try { body = await readRequestJson(request); } catch (err) { sendJson(response, err.code === "PAYLOAD_TOO_LARGE" ? 413 : 400, { error: err.code?.toLowerCase() || "bad_request" }); return; }
    const { alias, walletAddress, network = "celoSepolia" } = body;
    // Type and length guards prevent junk keys in the in-memory store.
    const aliasStr = typeof alias === "string" ? alias.trim() : "";
    if (!aliasStr || aliasStr.length > 64 || !/^0x[a-fA-F0-9]{40}$/.test(String(walletAddress || ""))) {
      sendJson(response, 400, {
        error: "invalid_contact",
        message: "alias (string, max 64 chars) and a valid walletAddress (0x + 40 hex chars) are required.",
      });
      return;
    }
    const contact = {
      alias: aliasStr,
      walletAddress: String(walletAddress).toLowerCase(),
      network: String(network),
      createdAt: new Date().toISOString(),
    };
    contactStore.set(contact.alias.toLowerCase(), contact);
    sendJson(response, 200, { contact });
    return;
  }

  sendJson(response, 404, { error: "not_found" });
});

const host = process.env.NODE_ENV === "production" ? "0.0.0.0" : "127.0.0.1";
server.listen(port, host, () => {
  console.log(`choco-api listening on http://${host}:${port}`);
});
