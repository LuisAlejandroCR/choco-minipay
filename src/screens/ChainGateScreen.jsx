// Shows when a browser wallet is connected but on the wrong network.
// MiniPay is always on Celo — this screen is never shown inside MiniPay.

const CHAIN_NAMES = {
  1: "Ethereum",
  8453: "Base",
  42161: "Arbitrum One",
  137: "Polygon",
  10: "Optimism",
  56: "BNB Chain",
  43114: "Avalanche",
  100: "Gnosis",
  250: "Fantom",
  324: "zkSync Era",
  1101: "Polygon zkEVM",
};

function chainName(chainId) {
  return CHAIN_NAMES[chainId] || (chainId ? `Chain ${chainId}` : "another network");
}

export function ChainGateScreen({ chainId = 0, onSwitch, switching = false, error = "" }) {
  return (
    <div className="screen wtb-screen">
      <div className="wtb-inner" style={{ justifyContent: "center", gap: 24 }}>

        <div style={{ textAlign: "center", fontSize: 48, lineHeight: 1 }}>🔗</div>

        <div className="wtb-header" style={{ textAlign: "center" }}>
          <span className="wtb-kicker">Wrong network</span>
          <h2>Switch to Celo Mainnet</h2>
          <p className="wtb-sub">
            Your wallet is on <strong>{chainName(chainId)}</strong>.
            Choco runs on <strong>Celo Mainnet</strong> — a fast,
            low-cost chain built for stablecoin payments.
          </p>
        </div>

        {error && <p className="wtb-error" style={{ textAlign: "center" }}>{error}</p>}

        <button
          className="wtb-cta"
          type="button"
          disabled={switching}
          onClick={onSwitch}
        >
          {switching ? "Switching…" : "Switch to Celo →"}
        </button>

        <p className="wtb-hint" style={{ textAlign: "center" }}>
          Celo will be added to your wallet if it is not already there.
        </p>
      </div>
    </div>
  );
}
