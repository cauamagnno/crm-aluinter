import { Client } from "pg";

import { getUserFromCookies } from "@/lib/db/auth-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Row = Record<string, unknown>;

type ChangePayload = {
  table?: string;
  new?: Row | null;
  old?: Row | null;
};

function textField(
  row: Row | null | undefined,
  key: string,
): string | null {
  const value = row?.[key];
  return typeof value === "string" && value.length > 0 ? value : null;
}

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

      const roleResult = await client.query<{ account_role: string }>(
        "SELECT account_role FROM profiles WHERE user_id = $1",
        [user.id],
      );
      const role = roleResult.rows[0]?.account_role ?? null;
      const seesTeam =
        role === "gestor" || role === "admin" || role === "owner";

      const assignedToUser = async (conversationId: string | null) => {
        if (!conversationId || !client) return false;
        const found = await client.query<{ assigned_agent_id: string | null }>(
          "SELECT assigned_agent_id FROM conversations WHERE id = $1",
          [conversationId],
        );
        return found.rows[0]?.assigned_agent_id === user.id;
      };

      const visibleToUser = async (payload: ChangePayload) => {
        if (seesTeam) return true;
        if (payload.table === "conversations") {
          const next = textField(payload.new, "assigned_agent_id");
          const prev = textField(payload.old, "assigned_agent_id");
          return next === user.id || prev === user.id;
        }
        if (payload.table === "messages") {
          const conversationId =
            textField(payload.new, "conversation_id") ??
            textField(payload.old, "conversation_id");
          return assignedToUser(conversationId);
        }
        if (payload.table === "message_reactions") {
          const messageId =
            textField(payload.new, "message_id") ??
            textField(payload.old, "message_id");
          if (!messageId || !client) return false;
          const found = await client.query<{ conversation_id: string }>(
            "SELECT conversation_id FROM messages WHERE id = $1",
            [messageId],
          );
          return assignedToUser(found.rows[0]?.conversation_id ?? null);
        }
        return true;
      };

      await client.query("LISTEN wacrm_realtime");
      client.on("notification", (msg) => {
        if (!msg.payload) return;
        let payload: ChangePayload;
        try {
          payload = JSON.parse(msg.payload) as ChangePayload;
        } catch {
          return;
        }
        if (allowed.size && payload.table && !allowed.has(payload.table)) {
          return;
        }
        void visibleToUser(payload)
          .then((ok) => {
            if (ok) send(payload);
          })
          .catch(() => {
            // Drop the event if the visibility check fails.
          });
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
