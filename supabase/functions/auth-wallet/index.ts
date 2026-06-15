import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { ethers } from "https://esm.sh/ethers@6";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { address, signature, message } = await req.json();

    if (!address || !signature || !message) {
      return new Response(
        JSON.stringify({ error: "Missing address, signature, or message" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Reject signatures older than 10 minutes to prevent replay attacks.
    const timeMatch = message.match(/Time: (\d+)/);
    const signedAt = timeMatch ? parseInt(timeMatch[1], 10) : 0;
    if (!signedAt || Date.now() - signedAt > 10 * 60 * 1000) {
      return new Response(
        JSON.stringify({ error: "Signature expired — please try again" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // The message must embed the wallet address to bind signature to identity.
    const addrMatch = message.match(/Wallet: (0x[0-9a-fA-F]{40})/);
    if (!addrMatch || addrMatch[1].toLowerCase() !== address.toLowerCase()) {
      return new Response(
        JSON.stringify({ error: "Address mismatch in message" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Recover the signer from the EIP-191 personal_sign signature.
    const recoveredAddress = ethers.verifyMessage(message, signature);
    if (recoveredAddress.toLowerCase() !== address.toLowerCase()) {
      return new Response(
        JSON.stringify({ error: "Invalid signature" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const normalizedAddress = address.toLowerCase();
    const email = `${normalizedAddress}@wallet.choco.internal`;

    const adminClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { autoRefreshToken: false, persistSession: false } },
    );

    // First sign-in: create the Supabase user. Subsequent sign-ins: no-op (user exists).
    const { error: createError } = await adminClient.auth.admin.createUser({
      email,
      email_confirm: true,
      app_metadata: { wallet_address: normalizedAddress, provider: "wallet" },
    });
    if (createError && !/already/i.test(createError.message)) {
      throw new Error(`User creation failed: ${createError.message}`);
    }

    // Mint a one-time token the client exchanges for a real Supabase session.
    const { data: linkData, error: linkError } = await adminClient.auth.admin.generateLink({
      type: "magiclink",
      email,
      options: { redirectTo: Deno.env.get("SUPABASE_URL")! },
    });
    if (linkError || !linkData?.properties?.hashed_token) {
      throw new Error(linkError?.message || "Failed to generate session token");
    }

    return new Response(
      JSON.stringify({ token_hash: linkData.properties.hashed_token }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Internal error";
    return new Response(
      JSON.stringify({ error: msg }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
