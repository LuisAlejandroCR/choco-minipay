import { useCallback, useEffect, useRef, useState } from "react";
import { clearLedgerCache, labelWithAddress, readOwnerLedger } from "../../lib/celo.js";
import { SUPABASE_READY, listContacts } from "../../lib/contacts.js";
import { humaniseReadError } from "../../utils/appHelpers.js";

// Plans and history are derived from on-chain events (registry + swap + cKES transfers).
// Contact labels ("dad", "mum") come from Supabase and are joined in at render time so the
// chain stays the source of truth for amounts/hashes/dates and Supabase is contacts-only.
function attachContactLabels(items, contactsByAddress) {
  if (!contactsByAddress.size) return items;
  return items.map((item) => {
    const address = item.recipientAddress || item.toAddress;
    if (!address) return item;
    const contact = contactsByAddress.get(String(address).toLowerCase());
    if (!contact) return item;
    return {
      ...item,
      recipientLabel: contact.label,
      recipient: contact.label,
      to: labelWithAddress(contact.label, address),
    };
  });
}

export function useChocoLedger(address) {
  const [plans, setPlans] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // Coalesce overlapping refreshes. Right after a send, the post-tx refresh + window focus +
  // visibilitychange all fire within milliseconds; running them in parallel floods forno (receipt poll +
  // balance + history getLogs) and makes the NEXT transfer's route quote fail ("temporarily
  // unavailable"). If a read is already in flight, flag a single rerun instead of starting a parallel one.
  const refreshStateRef = useRef({ running: false, queued: false });

  const refresh = useCallback(async () => {
    if (!address) {
      setPlans([]);
      setTransactions([]);
      setError("");
      return;
    }
    const state = refreshStateRef.current;
    if (state.running) { state.queued = true; return; }
    state.running = true;
    setLoading(true);
    setError("");
    // Safety valve: if forno hangs with no response (not an error, just silence),
    // readOwnerLedger never settles and loading stays true forever. This timer stops
    // the spinner after 20 s so the user sees the empty state rather than an infinite load.
    const safetyTimer = window.setTimeout(() => setLoading(false), 20000);
    try {
      const ledger = await readOwnerLedger(address);
      const contacts = SUPABASE_READY ? await listContacts(address).catch(() => []) : [];
      const contactsByAddress = new Map(contacts.map((contact) => [String(contact.wallet_address).toLowerCase(), contact]));

      // Merge locally-cached address→label entries (set in useContactResolution on every resolve).
      // These survive page reloads, require no sign, and fill gaps when Supabase has no contact.
      try {
        for (const key of Object.keys(localStorage)) {
          if (!key.startsWith("choco-label-")) continue;
          const addr = key.slice("choco-label-".length);
          if (!contactsByAddress.has(addr)) {
            contactsByAddress.set(addr, { label: localStorage.getItem(key), wallet_address: addr });
          }
        }
      } catch {}

      setPlans(attachContactLabels(ledger.plans, contactsByAddress));
      setTransactions(attachContactLabels(ledger.history, contactsByAddress));
      setError(ledger.error || "");
    } catch (readError) {
      setPlans([]);
      setTransactions([]);
      // Raw viem/RPC text (URLs, request bodies, version strings) must never render in the UI.
      setError(humaniseReadError(readError, "We couldn't load your activity. Please try again."));
    } finally {
      window.clearTimeout(safetyTimer);
      setLoading(false);
      state.running = false;
      if (state.queued) { state.queued = false; void refresh(); } // one coalesced rerun
    }
  }, [address]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (!address) return undefined;
    let timer;
    const refreshOnReturn = () => {
      if (document.visibilityState && document.visibilityState !== "visible") return;
      // Debounce: a wallet round-trip fires focus + visibilitychange back-to-back. Coalesce them, and
      // re-read from the module cache (no forced re-scan) — mutations already call refreshFresh to show
      // new data, so focus needn't hammer forno with a full history read the moment the user starts the
      // next send. The cache self-expires (2 min), so off-app keeper settlements still surface shortly.
      clearTimeout(timer);
      timer = setTimeout(() => { void refresh(); }, 800);
    };
    document.addEventListener("visibilitychange", refreshOnReturn);
    window.addEventListener("focus", refreshOnReturn);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", refreshOnReturn);
      window.removeEventListener("focus", refreshOnReturn);
    };
  }, [address, refresh]);

  // Optimistically patch a plan in local state — call after a successful on-chain mutation
  // so the UI updates instantly without waiting for the full ledger re-read.
  const patchPlan = useCallback((onchainId, updates) => {
    setPlans((prev) => prev.map((plan) =>
      plan.onchainId === onchainId ? { ...plan, ...updates } : plan,
    ));
  }, []);

  // Remove a plan from local state immediately after a successful cancel.
  const removePlan = useCallback((onchainId) => {
    setPlans((prev) => prev.filter((plan) => plan.onchainId !== onchainId));
  }, []);

  // Invalidate the module-level cache then refresh so the next read goes to the chain.
  const refreshFresh = useCallback(async () => {
    clearLedgerCache();
    await refresh();
  }, [refresh]);

  return { plans, transactions, loading, error, refresh, refreshFresh, patchPlan, removePlan };
}
