import { createBrowserDbClient } from "@/lib/db/client";
import type { SupabaseClient } from "@/lib/db/types";

let browserClient: SupabaseClient | undefined;

export function createClient() {
  if (browserClient) return browserClient;
  browserClient = createBrowserDbClient();
  return browserClient;
}
