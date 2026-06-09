import { useState } from "react";
import { isValidWalletAddress } from "@core/domain/contacts.js";

// ContactCapture — shown in ReviewScreen when the plan's recipient has no stored wallet address.
// The user pastes a Celo Sepolia 0x address. Optionally saves it under the alias for future plans.
export function ContactCapture({ alias, onSubmit }) {
  const [address, setAddress] = useState("");
  const [shouldSave, setShouldSave] = useState(true);
  const isValid = isValidWalletAddress(address);

  function handleSubmit(event) {
    event.preventDefault();
    if (isValid) onSubmit(address, shouldSave);
  }

  return (
    <section className="contact-capture" aria-label={`${alias}'s wallet address`}>
      <span className="contact-capture-eyebrow">Recipient address</span>
      <b className="contact-capture-heading">{alias}'s Celo Sepolia wallet</b>
      <form className="wallet-address-form" onSubmit={handleSubmit}>
        <div>
          <input
            type="text"
            inputMode="text"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck="false"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            placeholder="0x..."
            aria-label="Recipient wallet address"
          />
          <button type="submit" disabled={!isValid}>Use</button>
        </div>
        {isValid && (
          <label className="contact-save-toggle">
            <input
              type="checkbox"
              checked={shouldSave}
              onChange={(e) => setShouldSave(e.target.checked)}
            />
            Save as {alias}
          </label>
        )}
        <small>Celo Sepolia testnet address</small>
      </form>
    </section>
  );
}
