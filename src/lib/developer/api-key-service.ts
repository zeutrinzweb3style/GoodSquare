import { createServiceRoleClient } from "@/lib/supabase/server";
import { normalizeAddress } from "@/lib/auth/wallet";
import {
  apiKeyMatches,
  generateApiKey,
  keyPrefix,
  type ApiKeyEnvironment,
} from "@/lib/developer/api-keys";
import { omit } from "@/lib/developer/serialize";

export interface ApiKeyRow {
  id: string;
  owner_address: string;
  name: string;
  key_prefix: string;
  key_hash: string;
  scopes: string[];
  last_used_at: string | null;
  revoked_at: string | null;
  created_at: string;
}

/** Public shape returned to the owner: never includes the hash. */
export type ApiKeyView = Omit<ApiKeyRow, "key_hash">;

export function serializeApiKey(row: ApiKeyRow): ApiKeyView {
  return omit(row, ["key_hash"]);
}

export async function listApiKeys(owner: string): Promise<ApiKeyView[]> {
  const supabase = createServiceRoleClient();
  const { data, error } = await supabase
    .from("api_keys")
    .select("*")
    .eq("owner_address", normalizeAddress(owner))
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map(serializeApiKey);
}

export async function createApiKey(input: {
  owner: string;
  name: string;
  scopes?: string[];
  environment?: ApiKeyEnvironment;
}): Promise<{ key: string; record: ApiKeyView }> {
  const generated = generateApiKey(input.environment ?? "live");
  const supabase = createServiceRoleClient();
  const { data, error } = await supabase
    .from("api_keys")
    .insert({
      owner_address: normalizeAddress(input.owner),
      name: input.name,
      key_prefix: generated.prefix,
      key_hash: generated.hash,
      scopes: input.scopes ?? [],
    })
    .select("*")
    .single();
  if (error) throw error;
  return { key: generated.key, record: serializeApiKey(data) };
}

export async function revokeApiKey(
  owner: string,
  id: string,
): Promise<boolean> {
  const supabase = createServiceRoleClient();
  const { data, error } = await supabase
    .from("api_keys")
    .update({ revoked_at: new Date().toISOString() })
    .eq("id", id)
    .eq("owner_address", normalizeAddress(owner))
    .is("revoked_at", null)
    .select("id");
  if (error) throw error;
  return (data ?? []).length > 0;
}

/**
 * Resolves a presented key to its owner. Looks the key up by its non-secret
 * prefix, then confirms the full key in constant time. Returns null when the
 * key is malformed, unknown, or revoked.
 */
export async function authenticateApiKey(
  presentedKey: string,
): Promise<{ owner: string; scopes: string[]; keyId: string } | null> {
  const prefix = keyPrefix(presentedKey);
  if (!prefix) return null;

  const supabase = createServiceRoleClient();
  const { data, error } = await supabase
    .from("api_keys")
    .select("*")
    .eq("key_prefix", prefix)
    .is("revoked_at", null)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  if (!apiKeyMatches(presentedKey, data.key_hash)) return null;

  // Best-effort usage stamp; never blocks authentication.
  await supabase
    .from("api_keys")
    .update({ last_used_at: new Date().toISOString() })
    .eq("id", data.id);

  return { owner: data.owner_address, scopes: data.scopes, keyId: data.id };
}
