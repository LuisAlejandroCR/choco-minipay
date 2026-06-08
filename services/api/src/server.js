import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { parseTransferIntent } from "../../../packages/core/src/domain/intent.js";

const port = Number(process.env.PORT || 8787);

function sendJson(response, statusCode, body) {
  response.writeHead(statusCode, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
  });
  response.end(JSON.stringify(body));
}

async function readRequestJson(request) {
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  if (chunks.length === 0) return {};
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

const server = createServer(async (request, response) => {
  const url = new URL(request.url || "/", `http://${request.headers.host || "127.0.0.1"}`);

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

  sendJson(response, 404, { error: "not_found" });
});

server.listen(port, "127.0.0.1", () => {
  console.log(`choco-api listening on http://127.0.0.1:${port}`);
});
