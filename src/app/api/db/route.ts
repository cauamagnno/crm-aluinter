import { NextResponse } from "next/server";

import { getUserFromCookies } from "@/lib/db/auth-server";
import { executeSpec } from "@/lib/db/query-builder";
import type { QuerySpec } from "@/lib/db/types";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const user = await getUserFromCookies();
  if (!user) {
    return NextResponse.json(
      {
        data: null,
        error: { message: "Unauthorized", details: "", hint: "", code: "401" },
        count: null,
        status: 401,
        statusText: "Unauthorized",
      },
      { status: 401 },
    );
  }

  const spec = (await request.json()) as QuerySpec;
  const result = await executeSpec(spec, {
    role: "authenticated",
    userId: user.id,
  });
  return NextResponse.json(result, { status: result.error ? 400 : 200 });
}
