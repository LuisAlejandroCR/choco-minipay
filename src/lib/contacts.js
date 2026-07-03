import { isAddress } from "viem";
import { SUPABASE_READY, assertSupabase, supabase } from "./supabase.js";

export { SUPABASE_READY };

const LOCAL_CONTACT_CACHE_VERSION = "v1";
const LOCAL_CONTACT_CACHE_PREFIX = `choco-contacts-${LOCAL_CONTACT_CACHE_VERSION}`;

// Supabase error text is developer-facing. Log it for debugging and surface only
// plain-language copy to the user.
function friendlyContactError(error, friendly) {
  console.error("[Choco] contacts error:", error);
  return new Error(friendly);
}

function canUseLocalStorage() {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

function normaliseWallet(value) {
  return String(value || "").toLowerCase();
}

function normaliseLabel(value) {
  return String(value || "").trim().replace(/\s+/g, " ");
}

// Receipt lookups are forgiving: case-insensitive on label, ignoring leading articles.
function searchKey(value) {
  return normaliseLabel(value).toLowerCase().replace(/^\s*(my|the|el|la|los|las|mi|mis)\s+/u, "");
}

function localCacheKey(ownerWallet) {
  const owner = normaliseWallet(ownerWallet);
  return owner ? `${LOCAL_CONTACT_CACHE_PREFIX}:${owner}` : "";
}

function normaliseContact(contact, ownerWallet = "") {
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

function sortContacts(contacts) {
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

function mergeLocalContacts(ownerWallet, contacts) {
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

function removeLocalContact({ ownerWallet, id, label, walletAddress }) {
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

export async function findContactByLabel({ ownerWallet, label }) {
  const localMatch = findLocalContactByLabel({ ownerWallet, label });
  if (!supabase || !ownerWallet || !label) return localMatch;
  const owner = normaliseWallet(ownerWallet);
  const key = searchKey(label);
  if (!key) return localMatch;
  const { data, error } = await supabase
    .from("contacts")
    .select("*")
    .ilike("owner_wallet", owner);
  if (error) {
    if (localMatch) return localMatch;
    throw friendlyContactError(error, "Could not check saved contacts. Please try again.");
  }
  const contacts = mergeLocalContacts(ownerWallet, data || []);
  return contacts.find((contact) => contactLabelMatches(contact.label, label)) || localMatch || null;
}

export async function findContactByAddress({ ownerWallet, walletAddress }) {
  const localMatch = findLocalContactByAddress({ ownerWallet, walletAddress });
  if (!supabase || !ownerWallet || !walletAddress) return localMatch;
  const { data, error } = await supabase
    .from("contacts")
    .select("*")
    .ilike("owner_wallet", normaliseWallet(ownerWallet))
    .ilike("wallet_address", normaliseWallet(walletAddress))
    .maybeSingle();
  if (error) {
    if (localMatch) return localMatch;
    throw friendlyContactError(error, "Could not check saved contacts. Please try again.");
  }
  if (data) mergeLocalContacts(ownerWallet, [data]);
  return data || localMatch || null;
}

export async function listContacts(ownerWallet) {
  const localContacts = readLocalContacts(ownerWallet);
  if (!supabase || !ownerWallet) return localContacts;
  const { data, error } = await supabase
    .from("contacts")
    .select("*")
    .ilike("owner_wallet", normaliseWallet(ownerWallet))
    .order("updated_at", { ascending: false });
  if (error) {
    if (localContacts.length) return localContacts;
    throw friendlyContactError(error, "Could not load saved contacts. Please try again.");
  }
  return mergeLocalContacts(ownerWallet, data || []);
}

export async function upsertContact({ ownerWallet, label, walletAddress, paymentReason = "" }) {
  if (!isAddress(walletAddress)) throw new Error("Contact wallet must be a valid Celo address.");
  const cleanLabel = normaliseLabel(label);
  if (!cleanLabel) throw new Error("Contact label is required.");

  if (!SUPABASE_READY) {
    const cached = normaliseContact({
      owner_wallet: ownerWallet,
      label: cleanLabel,
      wallet_address: walletAddress,
      payment_reason: paymentReason || null,
      updated_at: new Date().toISOString(),
    }, ownerWallet);
    mergeLocalContacts(ownerWallet, [cached]);
    return cached;
  }

  const client = assertSupabase();
  const existing = await findContactByLabel({ ownerWallet, label: cleanLabel });
  if (existing?.id && !String(existing.id).includes(":")) {
    const { data, error } = await client
      .from("contacts")
      .update({
        wallet_address: normaliseWallet(walletAddress),
        payment_reason: paymentReason || existing.payment_reason || null,
      })
      .eq("id", existing.id)
      .select()
      .single();
    if (error) throw friendlyContactError(error, "Could not save this contact. Please try again.");
    mergeLocalContacts(ownerWallet, [data]);
    return data;
  }

  const { data, error } = await client
    .from("contacts")
    .insert({
      owner_wallet: normaliseWallet(ownerWallet),
      label: cleanLabel,
      wallet_address: normaliseWallet(walletAddress),
      payment_reason: paymentReason || null,
    })
    .select()
    .single();
  if (error) throw friendlyContactError(error, "Could not save this contact. Please try again.");
  mergeLocalContacts(ownerWallet, [data]);
  return data;
}

export async function removeContact({ ownerWallet, id, label = "", walletAddress = "" }) {
  if (!id) throw new Error("Contact id is required.");
  removeLocalContact({ ownerWallet, id, label, walletAddress });
  if (!SUPABASE_READY || String(id).includes(":")) return true;
  const client = assertSupabase();
  const { error } = await client
    .from("contacts")
    .delete()
    .ilike("owner_wallet", normaliseWallet(ownerWallet))
    .eq("id", id);
  if (error) throw friendlyContactError(error, "Could not remove this contact. Please try again.");
  return true;
}