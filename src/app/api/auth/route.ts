import { NextResponse } from "next/server";

import { hashInviteToken } from "@/lib/auth/invitations";
import { createServerAuth } from "@/lib/db/auth-server";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function GET() {
  const auth = createServerAuth();
  const { data, error } = await auth.getSession();
  return NextResponse.json({
    session: data.session,
    user: data.session?.user ?? null,
    error,
  });
}

export async function POST(request: Request) {
  const auth = createServerAuth();
  const body = (await request.json()) as {
    action?: string;
    email?: string;
    password?: string;
    invite?: string;
    options?: { data?: Record<string, unknown>; emailRedirectTo?: string };
    redirectTo?: string;
  };

  switch (body.action) {
    case "signin":
      return NextResponse.json(
        await auth.signInWithPassword({
          email: body.email ?? "",
          password: body.password ?? "",
        }),
      );
    case "signup": {
      const invite = body.invite?.trim();
      if (!invite) {
        return NextResponse.json(
          {
            data: { user: null, session: null },
            error: {
              message: "Cadastro apenas com convite",
              name: "AuthError",
              status: 403,
            },
          },
          { status: 403 },
        );
      }

      const supabase = await createClient();
      const { data: peek, error: peekError } = await supabase.rpc(
        "peek_invitation",
        { p_token_hash: hashInviteToken(invite) },
      );
      let peekPayload: { ok?: boolean } | null = null;
      try {
        peekPayload =
          typeof peek === "string"
            ? (JSON.parse(peek) as { ok?: boolean })
            : (peek as { ok?: boolean } | null);
      } catch {
        peekPayload = null;
      }
      if (peekError || !peekPayload || peekPayload.ok !== true) {
        return NextResponse.json(
          {
            data: { user: null, session: null },
            error: {
              message: "Convite inválido ou expirado",
              name: "AuthError",
              status: 403,
            },
          },
          { status: 403 },
        );
      }

      return NextResponse.json(
        await auth.signUp({
          email: body.email ?? "",
          password: body.password ?? "",
          options: body.options,
        }),
      );
    }
    case "signout":
      return NextResponse.json(await auth.signOut());
    case "update":
      return NextResponse.json(
        await auth.updateUser({
          email: body.email,
          password: body.password,
        }),
      );
    case "reset":
      return NextResponse.json(
        await auth.resetPasswordForEmail(body.email ?? "", {
          redirectTo: body.redirectTo,
        }),
      );
    default:
      return NextResponse.json(
        { error: { message: "Unknown auth action", name: "AuthError" } },
        { status: 400 },
      );
  }
}
