import { Check, ListChecks, ShieldCheck } from "lucide-react";

export function WalletCheckStatus({ result, status }) {
  const isLoading = status === "loading";
  const checks = result?.checks || [];
  const failedChecks = checks.filter((check) => check.status !== "pass");
  const isReady = result?.ok === true;
  const hasCheckDetails = checks.length > 0;
  const statusTitle = isLoading
    ? "Checking wallet"
    : isReady
      ? "Wallet ready"
      : result
        ? hasCheckDetails
          ? "Wallet check needed"
          : "Check unavailable"
        : "Wallet check starts after quote";
  const statusCopy = isLoading
    ? "Checking network, gas, and recipient before the testnet transfer."
    : result?.summary || "Choco checks network, funds, and recipient before continuing.";

  return (
    <section className={`wallet-check-card ${isReady ? "ready" : result ? "blocked" : ""}`} aria-label="Wallet readiness status">
      <div className="wallet-check-icon">
        {isLoading ? <ShieldCheck size={18} /> : isReady ? <Check size={18} /> : <ListChecks size={18} />}
      </div>
      <div>
        <span>Choco Agent AI</span>
        <b>{statusTitle}</b>
        <small>{statusCopy}</small>
        {failedChecks.length > 0 && (
          <em>{failedChecks.map((check) => check.label).join(", ")}</em>
        )}
      </div>
    </section>
  );
}
