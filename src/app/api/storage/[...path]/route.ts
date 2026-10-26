import { readFile } from "node:fs/promises";

import { NextResponse } from "next/server";

import { resolveObjectPath } from "@/lib/db/storage";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  context: { params: Promise<{ path: string[] }> },
) {
  const { path: segments } = await context.params;
  if (!segments?.length) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const [bucket, ...rest] = segments;
  try {
    const filePath = resolveObjectPath(bucket, rest.join("/"));
    const bytes = await readFile(filePath);
    return new NextResponse(bytes, {
      headers: {
        "cache-control": "public, max-age=3600",
        "content-type": "application/octet-stream",
      },
    });
  } catch {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
}
