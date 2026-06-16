import { useEffect, useState } from "react";
import { Check, Pencil, Trash2, X } from "lucide-react";
import { isAddress } from "viem";
import { listContacts, removeContact, upsertContact } from "../lib/contacts.js";

function shortAddr(addr) {
  const a = String(addr || "");
  if (a.length < 14) return a;
  return `${a.slice(0, 8)}…${a.slice(-6)}`;
}

export function ContactPicker({ ownerWallet, onSelect, onClose, inline = false }) {
  const [contacts, setContacts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editId, setEditId] = useState(null);
  const [editAddress, setEditAddress] = useState("");
  const [pendingDeleteId, setPendingDeleteId] = useState(null);

  useEffect(() => {
    if (!ownerWallet) { setLoading(false); return; }
    listContacts(ownerWallet)
      .then(setContacts)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [ownerWallet]);

  async function saveEdit(contact) {
    if (!isAddress(editAddress)) return;
    try {
      await upsertContact({ ownerWallet, label: contact.label, walletAddress: editAddress });
      setContacts(cs =>
        cs.map(c => c.id === contact.id ? { ...c, wallet_address: editAddress.toLowerCase() } : c)
      );
      setEditId(null);
    } catch {}
  }

  async function confirmDelete(id) {
    try {
      await removeContact({ ownerWallet, id });
      setContacts(cs => cs.filter(c => c.id !== id));
      setPendingDeleteId(null);
    } catch {}
  }

  const listContent = (
    <>
      {loading && <p className="contact-picker-status">Loading…</p>}

      {!loading && contacts.length === 0 && (
        <p className="contact-picker-status">No saved contacts yet.</p>
      )}

      {!loading && contacts.length > 0 && (
        <ul className="contact-picker-list">
          {contacts.map(c => (
            <li
              key={c.id}
              className={`contact-picker-row${pendingDeleteId === c.id ? " pending-delete" : ""}`}
            >
              {editId === c.id ? (
                <div className="contact-picker-edit-mode">
                  <span className="contact-picker-name">{c.label}</span>
                  <input
                    className="contact-picker-input"
                    type="text"
                    inputMode="text"
                    autoCapitalize="none"
                    autoCorrect="off"
                    spellCheck="false"
                    value={editAddress}
                    onChange={e => setEditAddress(e.target.value)}
                    placeholder="0x…"
                    aria-label="New wallet address"
                  />
                  <div className="contact-picker-edit-actions">
                    <button
                      type="button"
                      className="cp-btn-save"
                      onClick={() => saveEdit(c)}
                      disabled={!isAddress(editAddress)}
                    >
                      <Check size={14} /> Save
                    </button>
                    <button type="button" className="cp-btn-cancel" onClick={() => setEditId(null)}>
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <button
                    type="button"
                    className="contact-picker-select"
                    onClick={() => onSelect({ address: c.wallet_address, label: c.label, contactId: c.id })}
                  >
                    <span className="contact-picker-name">{c.label}</span>
                    <span className="contact-picker-addr">{shortAddr(c.wallet_address)}</span>
                    {c.payment_reason && (
                      <span className="contact-picker-reason">{c.payment_reason}</span>
                    )}
                  </button>

                  <div className="contact-picker-row-actions">
                    <button
                      type="button"
                      className="cp-icon"
                      onClick={() => { setEditId(c.id); setEditAddress(""); setPendingDeleteId(null); }}
                      aria-label={`Edit ${c.label}`}
                    >
                      <Pencil size={14} />
                    </button>
                    <button
                      type="button"
                      className={`cp-icon${pendingDeleteId === c.id ? " cp-icon-danger" : ""}`}
                      onClick={() =>
                        pendingDeleteId === c.id ? confirmDelete(c.id) : setPendingDeleteId(c.id)
                      }
                      aria-label={pendingDeleteId === c.id ? "Confirm delete" : `Delete ${c.label}`}
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </>
              )}
            </li>
          ))}
        </ul>
      )}
    </>
  );

  if (inline) {
    return (
      <div className="contact-picker-inline">
        <span className="contact-picker-inline-label">Saved contacts</span>
        {listContent}
      </div>
    );
  }

  return (
    <div className="contact-picker-overlay" role="dialog" aria-modal="true" aria-label="Saved contacts">
      <div className="contact-picker-sheet">
        <div className="contact-picker-head">
          <span>Saved contacts</span>
          <button type="button" className="contact-picker-close" onClick={onClose} aria-label="Close">
            <X size={18} />
          </button>
        </div>
        {listContent}
      </div>
    </div>
  );
}
