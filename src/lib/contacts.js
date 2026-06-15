import { isAddress } from "viem";
import { SUPABASE_READY, assertSupabase, supabase } from "./supabase.js";

export { SUPABASE_READY };

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

export async function findContactByLabel({ ownerWallet, label }) {
  if (!supabase || !ownerWallet || !label) return null;
  const owner = normaliseWallet(ownerWallet);
  const key = searchKey(label);
  if (!key) return null;
  const { data, error } = await supabase
    .from("contacts")
    .select("*")
    .ilike("owner_wallet", owner);
  if (error) throw new Error(`Could not look up contact: ${error.message}`);
  return (data || []).find((contact) => searchKey(contact.label) === key) || null;
}

export async function findContactByAddress({ ownerWallet, walletAddress }) {
  if (!supabase || !ownerWallet || !walletAddress) return null;
  const { data, error } = await supabase
    .from("contacts")
    .select("*")
    .ilike("owner_wallet", normaliseWallet(ownerWallet))
    .ilike("wallet_address", normaliseWallet(walletAddress))
    .maybeSingle();
  if (error) throw new Error(`Could not look up contact: ${error.message}`);
  return data || null;
}

export async function listContacts(ownerWallet) {
  if (!supabase || !ownerWallet) return [];
  const { data, error } = await supabase
    .from("contacts")
    .select("*")
    .ilike("owner_wallet", normaliseWallet(ownerWallet))
    .order("updated_at", { ascending: false });
  if (error) throw new Error(`Could not list contacts: ${error.message}`);
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
    if (error) throw new Error(`Could not update contact: ${error.message}`);
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
  if (error) throw new Error(`Could not create contact: ${error.message}`);
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
  if (error) throw new Error(`Could not remove contact: ${error.message}`);
  return true;
}
