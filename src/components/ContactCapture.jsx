import { useState } from "react";

function isValidWalletAddress(value) {
  return /^0x[a-fA-F0-9]{40}$/.test(String(value || "").trim());
}

// Optional fallback for demos where a contact resolver is not connected yet.
export function ContactCapture({ alias, onSubmit, supabaseReady = false }) {
  const [address, setAddress] = useState("");
  const [saveContact, setSaveContact] = useState(false);
  const isValid = isValidWalletAddress(address);

  function handleSubmit(event) {
    event.preventDefault();
    if (isValid) onSubmit(address, { saveContact });
  }

  return (
    <section className="contact-capture" aria-label={`${alias}'s wallet address`}>
      <span className="contact-capture-eyebrow">Recipient address</span>
      <b className="contact-capture-heading">{alias}'s Celo wallet</b>
      <form className="wallet-address-form" onSubmit={handleSubmit}>
        <div>
          <input
            type="text"
            inputMode="text"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck="false"
            value={address}
            onChange={(event) => setAddress(event.target.value)}
            placeholder="0x..."
            aria-label="Recipient wallet address"
          />
          <button type="submit" className="wallet-use-btn" disabled={!isValid}>Confirm address</button>
        </div>
        {supabaseReady && (
          <label className="contact-save-toggle">
            <input
              type="checkbox"
              checked={saveContact}
              onChange={(e) => setSaveContact(e.target.checked)}
            />
            <span>Save contact</span>
          </label>
        )}
        <small>
          {supabaseReady
            ? saveContact
              ? "Will be saved for next time"
              : "Used once, not saved"
            : "Used once, not saved"}
        </small>
      </form>
    </section>
  );
}
