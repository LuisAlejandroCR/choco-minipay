import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { getCeloNetworkConfig } from "../../../packages/core/src/config/celo.js";
import { parseTransferIntent } from "../../../packages/core/src/domain/intent.js";
import { evaluateAgentPreflight } from "../../../packages/core/src/domain/preflight.js";

const port = Number(process.env.PORT || 8787);
const testnetNetwork = getCeloNetworkConfig("celoSepolia");
const rpcUrl = process.env.RPC_URL || testnetNetwork.rpcUrl;

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

async function readRequestJson(request) {
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  if (chunks.length === 0) return {};
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
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
    const content = await readFile("public/agent.json", "utf8");
    sendJson(response, 200, JSON.parse(content));
    return;
  }

  if (request.method === "POST" && url.pathname === "/v1/intent/preview") {
    const body = await readRequestJson(request);
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
    const body = await readRequestJson(request);
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

  sendJson(response, 404, { error: "not_found" });
});

server.listen(port, "127.0.0.1", () => {
  console.log(`choco-api listening on http://127.0.0.1:${port}`);
});
