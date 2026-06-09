/**
 * useContacts — localStorage-backed contact store for Block 11.
 *
 * Contacts map human aliases (e.g. "Mom") to Celo Sepolia wallet addresses so
 * the preflight check can require a real 0x address instead of an alias string.
 *
 * Source of truth: localStorage key "choco-contacts-v1".
 * API mirror: App.jsx calls POST /v1/contacts after each saveContact so the
 * worker can read the list without going through the browser.
 *
 * Keys in the store are lowercased aliases; values are full contact records.
 */

import { useCallback, useState } from "react";
import { buildContact } from "@core/domain/contacts.js";

const STORAGE_KEY = "choco-contacts-v1";

function loadFromStorage() {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    // localStorage unavailable in some embedded browsers — start empty.
    return {};
  }
}

function writeToStorage(store) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
  } catch {
    // Non-fatal: contact resolves for this session but won't persist.
  }
}

export function useContacts() {
  const [store, setStore] = useState(loadFromStorage);

  /**
   * Look up a contact by alias. Case-insensitive.
   * Returns the contact record or null if not found.
   */
  const getContact = useCallback(
    (alias) => store[String(alias || "").toLowerCase()] ?? null,
    [store],
  );

  /**
   * Save a contact. Validates both alias and walletAddress.
   * Returns true on success, false if validation fails.
   * network defaults to "celoSepolia" (testnet) until Block 15 adds mainnet.
   */
  const saveContact = useCallback((alias, walletAddress, network = "celoSepolia") => {
    const contact = buildContact(alias, walletAddress, network);
    if (!contact) return false;
    const key = contact.alias.toLowerCase();
    setStore((prev) => {
      const next = { ...prev, [key]: contact };
      writeToStorage(next);
      return next;
    });
    return true;
  }, []);

  /**
   * Return all stored contacts as an array.
   */
  const listContacts = useCallback(() => Object.values(store), [store]);

  return { getContact, saveContact, listContacts };
}
