import { createServerDbClient } from "@/lib/db/server-client";

export async function createClient() {
  return createServerDbClient();
}
