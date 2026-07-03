import { Check, Pencil, Trash2 } from "lucide-react";
import { isAddress } from "viem";
import { useEffect, useState } from "react";
import { ContactCapture } from "./ContactCapture.jsx";
import { ContactPicker } from "./ContactPicker.jsx";
import { shortAddress } from "../lib/celo.js";

// Recipient-contact resolution UI for the review screen: the resolved view (change / edit / delete),
// the lookup states (checking / error), and the picker + manual-address capture when unresolved.
// Owns its own edit/delete UI state so the review screen doesn't have to.
export function ReviewContactSection({
  resolvedContact = null,
  receiptLabel,
  walletAccount = "",
  walletReady,
  supabaseReady = false,
  contactLookupStatus = "idle",
  contactLookupMessage = "",
  onConnect,
  onPickContact,
  onResolveContact,
  onEditContact,
  onRemoveContact,
}) {
  const [editAddr, setEditAddr] = useState("");
  const [showEdit, setShowEdit] = useState(false);
  const [pendingDel, setPendingDel] = useState(false);

  useEffect(() => {
    setShowEdit(false);
    setEditAddr("");
    setPendingDel(false);
  }, [resolvedContact?.address]);

  function shortAddr(a) {
    return shortAddress(a);
  }

  function handleSaveEdit() {
    if (!isAddress(editAddr)) return;
    onEditContact?.(editAddr);
    setShowEdit(false);
    setEditAddr("");
  }

  const canCaptureContact = !supabaseReady || contactLookupStatus === "missing";
  const contactErrorNeedsWallet = !walletReady || /wallet/i.test(contactLookupMessage);
  const contactErrorActionLabel = contactErrorNeedsWallet ? "Connect wallet" : "Retry saved contacts";
  const onContactErrorAction = contactErrorNeedsWallet ? onConnect : onPickContact;

  return (
    <section className="contact-resolution-card" aria-label="Recipient contact">
      {resolvedContact?.address ? (
        <>
          {showEdit ? (
            <div>
              <span>Contact</span>
              <b>{resolvedContact.label}</b>
              <input
                className="contact-picker-input"
                type="text"
                inputMode="text"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck="false"
                value={editAddr}
                onChange={(e) => setEditAddr(e.target.value)}
                placeholder="New wallet address..."
                aria-label="New wallet address"
              />
              <div className="contact-picker-edit-actions">
                <button type="button" className="cp-btn-save" onClick={handleSaveEdit} disabled={!isAddress(editAddr)}>
                  <Check size={14} /> Save
                </button>
                <button type="button" className="cp-btn-cancel" onClick={() => { setShowEdit(false); setEditAddr(""); }}>
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <div className="contact-resolved-row">
              <div className="contact-resolved-info">
                <span>Recipient contact</span>
                <small>{shortAddr(resolvedContact.address)}</small>
              </div>
              <div className="contact-resolved-actions">
                <button
                  type="button"
                  className="contact-select-pill"
                  onClick={() => { setPendingDel(false); onPickContact(); }}
                >
                  Change
                </button>
                <button
                  type="button"
                  className="cp-icon"
                  onClick={() => { setShowEdit(true); setEditAddr(""); setPendingDel(false); }}
                  aria-label="Edit contact address"
                >
                  <Pencil size={14} />
                </button>
                <button
                  type="button"
                  className={`cp-icon${pendingDel ? " cp-icon-danger" : ""}`}
                  onClick={() => { if (pendingDel) { onRemoveContact?.(); } else { setPendingDel(true); } }}
                  aria-label={pendingDel ? "Confirm delete contact" : "Delete contact"}
                >
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          )}
        </>
      ) : contactLookupStatus === "checking" ? (
        <div>
          <span>Contact</span>
          <b>Looking up {receiptLabel}...</b>
        </div>
      ) : contactLookupStatus === "error" ? (
        <>
          <div>
            <span>Contact</span>
            <b>Could not check saved contacts</b>
            <small>{contactLookupMessage || "Try loading saved contacts again before entering a new address."}</small>
          </div>
          <button type="button" onClick={onContactErrorAction}>
            {contactErrorActionLabel}
          </button>
        </>
      ) : (
        <>
          <div>
            <span>Contact</span>
            <b>Select {receiptLabel}</b>
          </div>
          <ContactPicker
            inline
            ownerWallet={walletAccount}
            supabaseEnabled={supabaseReady}
            onSelect={(c) => onResolveContact(c.address, { label: c.label, source: "contacts", contactId: c.contactId, saveContact: false })}
            onClose={() => {}}
          />
          {canCaptureContact && (
            <>
              <div className="contact-or-divider"><span>or enter address</span></div>
              <ContactCapture
                alias={receiptLabel}
                supabaseReady={supabaseReady}
                onSubmit={(address, opts) => onResolveContact(address, { label: receiptLabel, phone: "", saveContact: opts?.saveContact })}
              />
            </>
          )}
        </>
      )}
    </section>
  );
}
