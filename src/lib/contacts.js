import { isAddress } from "viem";
import { SUPABASE_READY, assertSupabase, supabase } from "./supabase.js";
import {
  normaliseWallet,
  normaliseLabel,
  searchKey,
  normaliseContact,
  mergeLocalContacts,
  removeLocalContact,
  listLocalContacts,
  findLocalContactByLabel,
  findLocalContactByAddress as findLocalByAddress,
  contactLabelMatches,
} from "./contacts-local.js";

export { SUPABASE_READY };
export { listLocalContacts, findLocalContactByLabel, findLocalContactByAddress, contactLabelMatches } from "./contacts-local.js";

// Supabase error text is developer-facing. Log it for debugging and surface only
// plain-language copy to the user.
function friendlyContactError(error, friendly) {
  console.error("[Choco] contacts error:", error);
  return new Error(friendly);
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
  const localMatch = findLocalByAddress({ ownerWallet, walletAddress });
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
  const localContacts = listLocalContacts(ownerWallet);
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
