import { useEffect, useState } from "react";
import {
  SUPABASE_READY,
  findContactByLabel,
  findLocalContactByLabel,
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

  // Supabase is the cross-device backup for all users (including MiniPay).
  // localStorage is primary: instant, offline, zero auth. Supabase syncs in the background.
  const supabaseEnabled = SUPABASE_READY;

  // When the review screen opens, attempt to auto-resolve the label from saved contacts.
  useEffect(() => {
    if (
      visibleScreen !== "review" ||
      !contactResolutionRequired ||
      !contactKey ||
      !wallet.address ||
      !wallet.canSign
    ) {
      setContactLookup({ key: contactKey, status: "idle", message: "" });
      return undefined;
    }

    if (resolvedContact?.address) {
      setContactLookup({ key: contactKey, status: "resolved", message: "" });
      return undefined;
    }

    const cachedContact = findLocalContactByLabel({ ownerWallet: wallet.address, label: receiptLabel });
    if (cachedContact?.wallet_address) {
      cacheContact(cachedContact, contactKey);
      setContactLookup({ key: contactKey, status: "resolved", message: "" });
    } else {
      setContactLookup({ key: contactKey, status: "checking", message: "Checking saved contacts..." });
    }

    let active = true;

    (async () => {
      try {
        // MiniPay: use only the local cache (no Supabase, no personal_sign prompt).
        // Browser: use a cached JWT only — no unexpected popup on review-screen open.
        const session = supabaseEnabled
          ? await getCachedSession()
          : null;
        if (!session) {
          if (active && !cachedContact?.wallet_address) {
            setContactLookup({ key: contactKey, status: "missing", message: "" });
          }
          return;
        }
        const contact = await findContactByLabel({ ownerWallet: wallet.address, label: receiptLabel });
        if (!active) return;
        if (contact?.wallet_address) {
          cacheContact(contact, contactKey);
          setContactLookup({ key: contactKey, status: "resolved", message: "" });
        } else if (!cachedContact?.wallet_address) {
          setContactLookup({ key: contactKey, status: "missing", message: "" });
        }
      } catch (error) {
        if (!active || cachedContact?.wallet_address) return;
        const errorMessage = error.message || "Could not check saved contacts.";
        setContactLookup({ key: contactKey, status: "error", message: errorMessage });
        onError?.(errorMessage);
      }
    })();

    return () => { active = false; };
  }, [visibleScreen, contactResolutionRequired, contactKey, receiptLabel, wallet.address, wallet.canSign, supabaseEnabled, resolvedContact?.address, onError]);

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

    // Persist address→label locally so history can show names without Supabase.
    if (address && label) {
      try { localStorage.setItem(`choco-label-${String(address).toLowerCase()}`, label); } catch {}
    }

    if (supabaseEnabled && wallet.address && !wallet.isReadOnly && saveContact && details.source !== "contacts") {
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
    if (!resolvedContact?.contactId || !contactKey || wallet.isReadOnly) return;
    try {
      if (supabaseEnabled) await ensureSupabaseAuth(wallet.address);
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
    if (!resolvedContact?.contactId || !contactKey || wallet.isReadOnly) return;
    try {
      if (supabaseEnabled) await ensureSupabaseAuth(wallet.address);
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

    if (supabaseEnabled && wallet.address && !wallet.canSign) {
      const errorMessage = "Open Choco in MiniPay or a wallet browser to read saved contacts.";
      setContactLookup({ key: contactKey, status: "error", message: errorMessage });
      onError?.(errorMessage);
      return;
    }

    if (supabaseEnabled && wallet.address) {
      try {
        await ensureSupabaseAuth(wallet.address);
        setShowContactPicker(true);
      } catch (error) {
        const errorMessage = error.message || "Could not load saved contacts.";
        setContactLookup({ key: contactKey, status: "error", message: errorMessage });
        onError?.(errorMessage);
      }
      return;
    }

    if (wallet.address) {
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
    supabaseEnabled,
    contactLookupStatus,
    contactLookupMessage,
    resolveContact,
    editContact,
    removeResolvedContact,
    pickContact,
  };
}
