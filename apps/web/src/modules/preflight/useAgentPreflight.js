// useAgentPreflight — encapsulates the three tightly-coupled pieces of preflight state:
//   agentPreflight, agentPreflightStatus, transferBlockMessage
//
// These always change together through a single async lifecycle:
//   idle → loading → idle (with result) or blocked
//
// Returning { result, status, blockMessage, run, reset, block } reduces App.jsx from
// 14 useState calls to 11 and makes the loading/error/ready cycle easier to follow.
import { useState } from "react";

export function useAgentPreflight({ wallet, getContact, apiBaseUrl }) {
  const [result, setResult] = useState(null);
  const [status, setStatus] = useState("idle");
  const [blockMessage, setBlockMessage] = useState("");

  function reset() {
    setResult(null);
    setStatus("idle");
    setBlockMessage("");
  }

  // recipientAddressOverride: pass a wallet address when the user has just typed
  // one into ContactCapture but it hasn't been saved to localStorage yet (avoids
  // the React state delay between save and re-render).
  async function run(plan, recipientAddressOverride = null) {
    if (!wallet.address) {
      setResult({
        agent: "Choco Agent AI",
        status: "blocked",
        ok: false,
        summary: `Connect a ${wallet.network.name} testnet wallet before checking readiness.`,
        checks: [],
      });
      return;
    }

    setStatus("loading");
    setBlockMessage("");

    // Prefer override → stored contact wallet address → empty (preflight will block).
    const recipientContact =
      recipientAddressOverride ?? getContact(plan.recipient)?.walletAddress ?? "";

    try {
      const response = await fetch(`${apiBaseUrl}/v1/agent/preflight`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          walletAddress: wallet.address,
          chainId: wallet.chainId,
          recipientContact,
          payAsset: plan.payAsset,
          amount: plan.routeEstimate,
        }),
      });
      const preflightResult = await response.json();
      setResult(preflightResult);
      setStatus("idle");
    } catch {
      setResult({
        agent: "Choco Agent AI",
        status: "blocked",
        ok: false,
        summary: "Wallet check is unavailable right now. Try again before sending.",
        checks: [],
      });
      setStatus("idle");
    }
  }

  return {
    result,
    status,
    blockMessage,
    run,
    reset,
    block: setBlockMessage,
  };
}
