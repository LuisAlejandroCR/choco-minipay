import { useEffect, useState } from "react";
import {
  SUPABASE_READY,
  findContactByLabel,
  removeContact,
  upsertContact,
} from "../../lib/contacts.js";
import { ensureSupabaseAuth, getCachedSession } from "../../lib/supabase.js";

function getPlanReceiptLabel(plan) {
  return plan?.receiptLabel || plan?.recipient || plan?.intent?.receiptLabel || "";
}

function contactCacheKey(label) {
  return String(label || "").trim().toLowerCase();
}

// Owns the full contact resolution lifecycle for a transfer:
// - Cache of resolved contacts keyed by label
// - Supabase auto-lookup effect when the review screen opens
// - Manual address entry, contact picker, edit, and remove flows
export function useContactResolution({
  wallet,
  visibleScreen,
  reviewPlan,
  demoRecipientAddress,
  onError,   // (message) => void  — routes errors to the parent status display
  onMessage, // (message) => void  — routes info messages to the parent status display
}) {
  const [resolvedContacts, setResolvedContacts] = useState({});
  const [contactLookup, setContactLookup] = useState({ key: "", status: "idle", message: "" });
  const [showContactPicker, setShowContactPicker] = useState(false);

  const receiptLabel = getPlanReceiptLabel(reviewPlan);
  const contactKey = contactCacheKey(receiptLabel);
  const contactResolutionRequired = Boolean(
    reviewPlan?.contactResolutionRequired || reviewPlan?.intent?.contactResolutionRequired,
  );
  const resolvedContact = contactKey ? resolvedContacts[contactKey] : null;
  const recipientAddress = contactResolutionRequired
    ? resolvedContact?.address || ""
    : demoRecipientAddress;

  // When the review screen opens, attempt to auto-resolve the label from Supabase so the
  // user doesn't have to paste an address for known contacts.
  useEffect(() => {
    if (
      visibleScreen !== "review" ||
      !contactResolutionRequired ||
      !contactKey ||
      !wallet.address ||
      !SUPABASE_READY
    ) {
      setContactLookup({ key: contactKey, status: "idle", message: "" });
      return undefined;
    }

    if (resolvedContact?.address) {
      setContactLookup({ key: contactKey, status: "resolved", message: "" });
      return undefined;
    }

    let active = true;
    setContactLookup({ key: contactKey, status: "checking", message: "Checking saved contacts..." });

    (async () => {
      try {
        // Best-effort auth — stored JWT from a prior MiniPay session is enough.
        // If no wallet is present (browser context) we still attempt the query;
        // the Supabase client auto-restores the JWT from localStorage.
        try { await ensureSupabaseAuth(wallet.address); } catch { /* fall through */ }
        const contact = await findContactByLabel({ ownerWallet: wallet.address, label: receiptLabel });
        if (!active) return;
        if (contact?.wallet_address) {
          cacheContact(contact, contactKey);
          setContactLookup({ key: contactKey, status: "resolved", message: "" });
        } else {
          setContactLookup({ key: contactKey, status: "missing", message: "" });
        }
      } catch (error) {
        if (!active) return;
        // Auth / network errors degrade silently — the inline contact list handles selection.
        setContactLookup({ key: contactKey, status: "missing", message: "" });
      }
    })();

    return () => { active = false; };
  }, [visibleScreen, contactResolutionRequired, contactKey, receiptLabel, wallet.address, resolvedContact?.address]);

  // Reset picker when a contact is resolved (e.g., picker was open, user selected)
  useEffect(() => {
    if (resolvedContact?.address) setShowContactPicker(false);
  }, [resolvedContact?.address]);

  function cacheContact(contact, keyOverride = "") {
    const key = keyOverride || contactCacheKey(contact?.label);
    if (!key || !contact?.wallet_address) return;
    setResolvedContacts((prev) => ({
      ...prev,
      [key]: {
        address: contact.wallet_address,
        label: contact.label,
        phone: contact.payment_reason || "",
        source: "contacts",
        contactId: contact.id,
      },
    }));
  }

  async function resolveContact(address, options = {}) {
    if (!contactKey) return;
    const { saveContact = false, ...details } = options;
    const label = details.label || receiptLabel;

    setResolvedContacts((prev) => ({
      ...prev,
      [contactKey]: {
        address,
        label,
        phone: details.phone || "",
        source: details.source || "manual",
        contactId: details.contactId || null,
      },
    }));
    onMessage?.(`${label} selected for this transfer.`);

    if (SUPABASE_READY && wallet.address && saveContact && details.source !== "contacts") {
      try {
        await ensureSupabaseAuth(wallet.address);
        const saved = await upsertContact({
          ownerWallet: wallet.address,
          label,
          walletAddress: address,
          paymentReason: details.phone || "",
        });
        setResolvedContacts((prev) => ({
          ...prev,
          [contactKey]: { ...prev[contactKey], source: "contacts", contactId: saved.id },
        }));
        onMessage?.(`${label} selected and saved for future transfers.`);
      } catch (saveError) {
        console.warn("Could not save contact:", saveError.message);
      }
    }
  }

  async function editContact(newAddress) {
    if (!resolvedContact?.contactId || !contactKey) return;
    try {
      await ensureSupabaseAuth(wallet.address);
      await upsertContact({
        ownerWallet: wallet.address,
        label: resolvedContact.label,
        walletAddress: newAddress,
      });
      setResolvedContacts((prev) => ({
        ...prev,
        [contactKey]: { ...prev[contactKey], address: newAddress },
      }));
    } catch (err) {
      onError?.(err.message || "Could not update contact.");
    }
  }

  async function removeResolvedContact() {
    if (!resolvedContact?.contactId || !contactKey) return;
    try {
      await ensureSupabaseAuth(wallet.address);
      await removeContact({ ownerWallet: wallet.address, id: resolvedContact.contactId });
      setResolvedContacts((prev) => {
        const next = { ...prev };
        delete next[contactKey];
        return next;
      });
    } catch (err) {
      onError?.(err.message || "Could not remove contact.");
    }
  }

  async function pickContact() {
    if (!contactKey) return;

    if (SUPABASE_READY && wallet.address) {
      setShowContactPicker(true);
      return;
    }

    if (!navigator.contacts?.select) {
      onError?.("No saved contacts. Enter an address below to continue.");
      return;
    }

    try {
      const [contact] = await navigator.contacts.select(["name", "tel"], { multiple: false });
      if (!contact) return;
      const label = contact.name?.[0] || receiptLabel;
      const phone = contact.tel?.[0] || "";
      await resolveContact(demoRecipientAddress, { label, phone });
      if (!demoRecipientAddress) {
        onError?.("Contact selected. Add a one-time wallet address to continue.");
      }
    } catch (error) {
      onError?.(error.message || "Could not open contacts.");
    }
  }

  const contactLookupStatus = (() => {
    if (visibleScreen !== "review") return "idle";
    if (contactLookup.key !== contactKey) return "idle";
    return contactLookup.status;
  })();

  const contactLookupMessage = contactLookup.key === contactKey ? contactLookup.message : "";

  return {
    resolvedContacts,
    setResolvedContacts,
    showContactPicker,
    setShowContactPicker,
    contactKey,
    receiptLabel,
    contactResolutionRequired,
    resolvedContact,
    recipientAddress,
    contactLookupStatus,
    contactLookupMessage,
    resolveContact,
    editContact,
    removeResolvedContact,
    pickContact,
  };
}
