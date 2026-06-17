import { useCallback, useEffect, useState } from "react";
import { clearLedgerCache, readOwnerLedger } from "../../lib/celo.js";
import { SUPABASE_READY, listContacts } from "../../lib/contacts.js";

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
      to: `${contact.label} - ${address.slice(0, 6)}...${address.slice(-4)}`,
    };
  });
}

export function useChocoLedger(address) {
  const [plans, setPlans] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const refresh = useCallback(async () => {
    if (!address) {
      setPlans([]);
      setTransactions([]);
      setError("");
      return;
    }
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
      setPlans(attachContactLabels(ledger.plans, contactsByAddress));
      setTransactions(attachContactLabels(ledger.history, contactsByAddress));
      setError(ledger.error || "");
    } catch (readError) {
      setPlans([]);
      setTransactions([]);
      setError(readError.message);
    } finally {
      window.clearTimeout(safetyTimer);
      setLoading(false);
    }
  }, [address]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

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
  const refreshFresh = useCallback(() => {
    clearLedgerCache();
    void refresh();
  }, [refresh]);

  return { plans, transactions, loading, error, refresh, refreshFresh, patchPlan, removePlan };
}
