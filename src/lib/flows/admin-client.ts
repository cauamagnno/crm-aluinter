import { createAdminClient, type SupabaseClient } from "@/lib/db/server-client";

let _adminClient: SupabaseClient | null = null;

export function supabaseAdmin(): SupabaseClient {
  if (!_adminClient) {
    _adminClient = createAdminClient();
  }
  return _adminClient;
}
