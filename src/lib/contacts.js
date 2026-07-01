import { isAddress } from "viem";
import { SUPABASE_READY, assertSupabase, supabase } from "./supabase.js";

export { SUPABASE_READY };

// Supabase error text (fetch failures, JWT/RLS details) is developer-facing — log it for
// debugging and surface only plain-language copy to the user.
function friendlyContactError(error, friendly) {
  console.error("[Choco] contacts error:", error);
  return new Error(friendly);
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

export function contactLabelMatches(a, b) {
  const left = searchKey(a);
  const right = searchKey(b);
  return Boolean(left && right && left === right);
}

export async function findContactByLabel({ ownerWallet, label }) {
  if (!supabase || !ownerWallet || !label) return null;
  const owner = normaliseWallet(ownerWallet);
  const key = searchKey(label);
  if (!key) return null;
  const { data, error } = await supabase
    .from("contacts")
    .select("*")
    .ilike("owner_wallet", owner);
  if (error) throw friendlyContactError(error, "Could not check saved contacts. Please try again.");
  return (data || []).find((contact) => contactLabelMatches(contact.label, label)) || null;
}

export async function findContactByAddress({ ownerWallet, walletAddress }) {
  if (!supabase || !ownerWallet || !walletAddress) return null;
  const { data, error } = await supabase
    .from("contacts")
    .select("*")
    .ilike("owner_wallet", normaliseWallet(ownerWallet))
    .ilike("wallet_address", normaliseWallet(walletAddress))
    .maybeSingle();
  if (error) throw friendlyContactError(error, "Could not check saved contacts. Please try again.");
  return data || null;
}

export async function listContacts(ownerWallet) {
  if (!supabase || !ownerWallet) return [];
  const { data, error } = await supabase
    .from("contacts")
    .select("*")
    .ilike("owner_wallet", normaliseWallet(ownerWallet))
    .order("updated_at", { ascending: false });
  if (error) throw friendlyContactError(error, "Could not load saved contacts. Please try again.");
  return data || [];
}

export async function upsertContact({ ownerWallet, label, walletAddress, paymentReason = "" }) {
  const client = assertSupabase();
  if (!isAddress(walletAddress)) throw new Error("Contact wallet must be a valid Celo address.");
  const cleanLabel = normaliseLabel(label);
  if (!cleanLabel) throw new Error("Contact label is required.");

  const existing = await findContactByLabel({ ownerWallet, label: cleanLabel });
  if (existing) {
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
  return data;
}

export async function removeContact({ ownerWallet, id }) {
  const client = assertSupabase();
  if (!id) throw new Error("Contact id is required.");
  const { error } = await client
    .from("contacts")
    .delete()
    .ilike("owner_wallet", normaliseWallet(ownerWallet))
    .eq("id", id);
  if (error) throw friendlyContactError(error, "Could not remove this contact. Please try again.");
  return true;
}
