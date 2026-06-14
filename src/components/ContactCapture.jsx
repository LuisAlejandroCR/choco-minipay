import { useState } from "react";

function isValidWalletAddress(value) {
  return /^0x[a-fA-F0-9]{40}$/.test(String(value || "").trim());
}

// Optional fallback for demos where a contact resolver is not connected yet.
export function ContactCapture({ alias, onSubmit }) {
  const [address, setAddress] = useState("");
  const isValid = isValidWalletAddress(address);

  function handleSubmit(event) {
    event.preventDefault();
    if (isValid) onSubmit(address);
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
          <button type="submit" disabled={!isValid}>Use</button>
        </div>
        <small>Used once for this transfer. Choco does not store contacts.</small>
      </form>
    </section>
  );
}
