import { NextResponse } from "next/server";

import { getUserFromCookies } from "@/lib/db/auth-server";
import { createStorage } from "@/lib/db/storage";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const user = await getUserFromCookies();
  if (!user) {
    return NextResponse.json({ error: { message: "Unauthorized" } }, { status: 401 });
  }

  const form = await request.formData();
  const bucket = String(form.get("bucket") ?? "");
  const objectPath = String(form.get("path") ?? "");
  const file = form.get("file");
  if (!bucket || !objectPath || !(file instanceof Blob)) {
    return NextResponse.json(
      { error: { message: "bucket, path and file are required" } },
      { status: 400 },
    );
  }

  const storage = createStorage({ role: "authenticated", userId: user.id });
  const result = await storage.from(bucket).upload(objectPath, file, {
    upsert: form.get("upsert") === "1",
    contentType: String(form.get("contentType") || file.type || "application/octet-stream"),
  });
  return NextResponse.json(result, { status: result.error ? 400 : 200 });
}

export async function DELETE(request: Request) {
  const user = await getUserFromCookies();
  if (!user) {
    return NextResponse.json({ error: { message: "Unauthorized" } }, { status: 401 });
  }

  const body = (await request.json()) as { bucket?: string; paths?: string[] };
  if (!body.bucket || !body.paths?.length) {
    return NextResponse.json(
      { error: { message: "bucket and paths are required" } },
      { status: 400 },
    );
  }

  const storage = createStorage({ role: "authenticated", userId: user.id });
  const result = await storage.from(body.bucket).remove(body.paths);
  return NextResponse.json(result, { status: result.error ? 400 : 200 });
}
