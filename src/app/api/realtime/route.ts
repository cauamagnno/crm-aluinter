import { Client } from "pg";

import { getUserFromCookies } from "@/lib/db/auth-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const user = await getUserFromCookies();
  if (!user) {
    return new Response("Unauthorized", { status: 401 });
  }

  const url = new URL(request.url);
  const allowed = new Set(
    (url.searchParams.get("tables") ?? "")
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean),
  );

  const encoder = new TextEncoder();
  let client: Client | null = null;
  let closed = false;

  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: unknown) => {
        if (closed) return;
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
      };

      client = new Client({ connectionString: process.env.DATABASE_URL });
      await client.connect();
      await client.query("LISTEN wacrm_realtime");
      client.on("notification", (msg) => {
        if (!msg.payload) return;
        try {
          const payload = JSON.parse(msg.payload) as { table?: string };
          if (allowed.size && payload.table && !allowed.has(payload.table)) {
            return;
          }
          send(payload);
        } catch {
          // ignore
        }
      });

      const ping = setInterval(() => {
        if (closed) return;
        controller.enqueue(encoder.encode(`: ping\n\n`));
      }, 25000);

      const close = async () => {
        if (closed) return;
        closed = true;
        clearInterval(ping);
        try {
          await client?.query("UNLISTEN wacrm_realtime");
          await client?.end();
        } catch {
          // ignore
        }
        try {
          controller.close();
        } catch {
          // ignore
        }
      };

      request.signal.addEventListener("abort", () => {
        void close();
      });
    },
    async cancel() {
      closed = true;
      try {
        await client?.end();
      } catch {
        // ignore
      }
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "text/event-stream",
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive",
    },
  });
}
