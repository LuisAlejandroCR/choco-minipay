export { SUPABASE_READY } from "./supabase.js";

const LOCAL_CONTACT_CACHE_VERSION = "v1";
const LOCAL_CONTACT_CACHE_PREFIX = `choco-contacts-${LOCAL_CONTACT_CACHE_VERSION}`;

function canUseLocalStorage() {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

export function normaliseWallet(value) {
  return String(value || "").toLowerCase();
}

export function normaliseLabel(value) {
  return String(value || "").trim().replace(/\s+/g, " ");
}

// Receipt lookups are forgiving: case-insensitive on label, ignoring leading articles.
export function searchKey(value) {
  return normaliseLabel(value).toLowerCase().replace(/^\s*(my|the|el|la|los|las|mi|mis)\s+/u, "");
}

function localCacheKey(ownerWallet) {
  const owner = normaliseWallet(ownerWallet);
  return owner ? `${LOCAL_CONTACT_CACHE_PREFIX}:${owner}` : "";
}

export function normaliseContact(contact, ownerWallet = "") {
  if (!contact) return null;
  const walletAddress = normaliseWallet(contact.wallet_address || contact.address);
  const label = normaliseLabel(contact.label || contact.name);
  if (!walletAddress || !label) return null;
  const owner = normaliseWallet(contact.owner_wallet || ownerWallet);
  return {
    ...contact,
    id: contact.id || `${searchKey(label)}:${walletAddress}`,
    owner_wallet: owner,
    label,
    wallet_address: walletAddress,
    payment_reason: contact.payment_reason || contact.phone || "",
    updated_at: contact.updated_at || new Date(0).toISOString(),
  };
}

export function sortContacts(contacts) {
  return [...contacts].sort((a, b) => String(b.updated_at || "").localeCompare(String(a.updated_at || "")));
}

function readLocalContacts(ownerWallet) {
  const key = localCacheKey(ownerWallet);
  if (!key || !canUseLocalStorage()) return [];
  try {
    const parsed = JSON.parse(window.localStorage.getItem(key) || "[]");
    if (!Array.isArray(parsed)) return [];
    return sortContacts(parsed.map((item) => normaliseContact(item, ownerWallet)).filter(Boolean));
  } catch (error) {
    console.warn("[Choco] contact cache read failed:", error);
    return [];
  }
}

function writeLocalContacts(ownerWallet, contacts) {
  const key = localCacheKey(ownerWallet);
  if (!key || !canUseLocalStorage()) return;
  try {
    window.localStorage.setItem(key, JSON.stringify(sortContacts(contacts)));
  } catch (error) {
    console.warn("[Choco] contact cache write failed:", error);
  }
}

export function mergeLocalContacts(ownerWallet, contacts) {
  const current = readLocalContacts(ownerWallet);
  const merged = new Map();
  [...current, ...contacts]
    .map((item) => normaliseContact(item, ownerWallet))
    .filter(Boolean)
    .forEach((item) => {
      const key = item.id || `${searchKey(item.label)}:${item.wallet_address}`;
      merged.set(key, item);
    });
  const next = sortContacts([...merged.values()]);
  writeLocalContacts(ownerWallet, next);
  return next;
}

export function removeLocalContact({ ownerWallet, id, label, walletAddress }) {
  const labelKey = searchKey(label);
  const wallet = normaliseWallet(walletAddress);
  const next = readLocalContacts(ownerWallet).filter((contact) => {
    if (id && contact.id === id) return false;
    if (wallet && contact.wallet_address === wallet) return false;
    if (labelKey && searchKey(contact.label) === labelKey) return false;
    return true;
  });
  writeLocalContacts(ownerWallet, next);
}

export function listLocalContacts(ownerWallet) {
  return readLocalContacts(ownerWallet);
}

export function findLocalContactByLabel({ ownerWallet, label }) {
  if (!ownerWallet || !label) return null;
  return readLocalContacts(ownerWallet).find((contact) => contactLabelMatches(contact.label, label)) || null;
}

export function findLocalContactByAddress({ ownerWallet, walletAddress }) {
  const wallet = normaliseWallet(walletAddress);
  if (!ownerWallet || !wallet) return null;
  return readLocalContacts(ownerWallet).find((contact) => normaliseWallet(contact.wallet_address) === wallet) || null;
}

export function contactLabelMatches(a, b) {
  const left = searchKey(a);
  const right = searchKey(b);
  return Boolean(left && right && left === right);
}
