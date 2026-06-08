import { useMemo, useState } from "react";
import {
  ArrowRight,
  CalendarDays,
  CheckCircle2,
  CircleDollarSign,
  ClipboardList,
  ExternalLink,
  ReceiptText,
  ShieldCheck,
  Wallet,
} from "lucide-react";
import { parseTransferIntent } from "@core/domain/intent.js";
import { getDuplicatePlan } from "@core/domain/duplicates.js";
import { buildReceiptUrl } from "@core/domain/receipts.js";
import { CELO_NETWORKS, MINIPAY_DEEPLINKS } from "@core/config/celo.js";
import { useMiniPayWallet } from "./modules/wallet/useMiniPayWallet.js";

const seedPlans = [
  {
    id: "mom-monthly",
    recipientAlias: "Mom",
    amountMinor: 50000,
    destinationAsset: "KESm",
    deliveryMode: "schedule",
    cadence: "monthly",
    dayLabel: "1st",
  },
];

export function App() {
  const wallet = useMiniPayWallet();
  const [deliveryMode, setDeliveryMode] = useState("schedule");
  const [command, setCommand] = useState("send my mum 50k KES every 1st");

  const intent = useMemo(
    () => parseTransferIntent(command, { deliveryMode }),
    [command, deliveryMode],
  );
  const duplicate = useMemo(
    () => getDuplicatePlan(seedPlans, intent),
    [intent],
  );
  const receiptUrl = buildReceiptUrl({
    network: "celoSepolia",
    txHash: "0x8f34celo309",
  });

  return (
    <main className="app-shell">
      <section className="phone-frame" aria-label="Choco production MiniPay app">
        <header className="topbar">
          <div className="brand-mark">C</div>
          <div>
            <b>Choco</b>
            <span>Production scaffold</span>
          </div>
          <a href="/agent.json" aria-label="Agent metadata">
            <ShieldCheck size={21} />
          </a>
        </header>

        <section className="hero">
          <span className="stage-chip">Testnet first</span>
          <h1>Family transfers, scheduled with proof.</h1>
          <p>
            MiniPay-native USDC to KESm remittance flow with wallet checks, duplicate guards,
            receipts, and ERC-8004 agent provenance.
          </p>
        </section>

        <section className="wallet-panel">
          <Wallet size={20} />
          <div>
            <b>{wallet.isMiniPay ? "MiniPay detected" : "Browser preview"}</b>
            <span>
              {wallet.address
                ? `${wallet.address.slice(0, 6)}...${wallet.address.slice(-4)}`
                : wallet.status === "loading"
                  ? "Loading wallet"
                  : "Wallet will auto-load inside MiniPay"}
            </span>
          </div>
        </section>

        <section className="composer" aria-label="Transfer command">
          <div className="mode-toggle">
            <button
              className={deliveryMode === "now" ? "active" : ""}
              type="button"
              onClick={() => setDeliveryMode("now")}
            >
              <CircleDollarSign size={18} />
              Send now
            </button>
            <button
              className={deliveryMode === "schedule" ? "active" : ""}
              type="button"
              onClick={() => setDeliveryMode("schedule")}
            >
              <CalendarDays size={18} />
              Schedule
            </button>
          </div>

          <label htmlFor="command">Instruction</label>
          <div className="command-row">
            <input
              id="command"
              value={command}
              onChange={(event) => setCommand(event.target.value)}
              placeholder="send my mum 50k KES every 1st"
            />
            <button type="button" aria-label="Review transfer">
              <ArrowRight size={22} />
            </button>
          </div>
        </section>

        <section className="quote-card">
          <div className="section-title">
            <ClipboardList size={18} />
            <b>Review payload</b>
          </div>
          <dl>
            <div><dt>Recipient</dt><dd>{intent.recipientAlias}</dd></div>
            <div><dt>Amount</dt><dd>{intent.amountMinor.toLocaleString("en-US")} {intent.destinationAsset}</dd></div>
            <div><dt>Route</dt><dd>{intent.sourceAsset} to {intent.destinationAsset}</dd></div>
            <div><dt>Timing</dt><dd>{intent.deliveryMode === "now" ? "Send once now" : `${intent.cadence} on ${intent.dayLabel}`}</dd></div>
            <div><dt>Network</dt><dd>{CELO_NETWORKS.celoSepolia.name}</dd></div>
          </dl>
          {duplicate && (
            <div className="notice">
              <CheckCircle2 size={17} />
              Similar schedule exists for {duplicate.recipientAlias}. Open it before creating a duplicate.
            </div>
          )}
        </section>

        <section className="ops-grid">
          <a href={receiptUrl} target="_blank" rel="noreferrer">
            <ReceiptText size={18} />
            Test receipt
            <ExternalLink size={14} />
          </a>
          <a href={MINIPAY_DEEPLINKS.deposit}>
            <CircleDollarSign size={18} />
            Deposit
            <ExternalLink size={14} />
          </a>
        </section>

        <footer>
          <a href="/terms.html">Terms</a>
          <a href="/privacy.html">Privacy</a>
          <a href="/support.html">Support</a>
          <a href="/stats.html">Stats</a>
        </footer>
      </section>
    </main>
  );
}
