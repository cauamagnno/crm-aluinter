import { cookies } from "next/headers";

import {
  cookieOptions,
  SESSION_COOKIE,
  signToken,
  verifyToken,
  type JwtPayload,
} from "./jwt";
import { withAdmin } from "./pool";
import type { AuthApi, AuthError, Session, User } from "./types";

function toUser(row: {
  id: string;
  email: string | null;
  raw_user_meta_data: Record<string, unknown> | null;
  raw_app_meta_data: Record<string, unknown> | null;
  created_at: Date | string;
}): User {
  return {
    id: row.id,
    email: row.email ?? undefined,
    user_metadata: row.raw_user_meta_data ?? {},
    app_metadata: row.raw_app_meta_data ?? {},
    aud: "authenticated",
    role: "authenticated",
    created_at:
      typeof row.created_at === "string"
        ? row.created_at
        : row.created_at.toISOString(),
  };
}

function authError(message: string, status = 400): AuthError {
  return { message, name: "AuthError", status };
}

async function readCookieToken(): Promise<string | null> {
  const store = await cookies();
  return store.get(SESSION_COOKIE)?.value ?? null;
}

async function writeSessionCookie(token: string) {
  const store = await cookies();
  const opts = cookieOptions();
  store.set(opts.name, token, opts);
}

async function clearSessionCookie() {
  const store = await cookies();
  store.set(SESSION_COOKIE, "", { ...cookieOptions(), maxAge: 0 });
}

async function sessionFromUser(
  user: User,
  imp?: { sub: string; email: string },
): Promise<Session> {
  const { token, payload } = await signToken({
    sub: user.id,
    email: user.email ?? "",
    imp,
  });
  if (imp) {
    user = {
      ...user,
      app_metadata: {
        ...user.app_metadata,
        impersonator_id: imp.sub,
        impersonator_email: imp.email,
      },
    };
  }
  return {
    access_token: token,
    refresh_token: token,
    expires_in: payload.exp - payload.iat,
    expires_at: payload.exp,
    token_type: "bearer",
    user,
  };
}

function userFromPayload(payload: JwtPayload): User {
  return {
    id: payload.sub,
    email: payload.email,
    user_metadata: {},
    app_metadata: payload.imp
      ? {
          impersonator_id: payload.imp.sub,
          impersonator_email: payload.imp.email,
        }
      : {},
    aud: "authenticated",
    role: "authenticated",
    created_at: new Date(payload.iat * 1000).toISOString(),
  };
}

export async function getUserFromCookies(): Promise<User | null> {
  const token = await readCookieToken();
  if (!token) return null;
  const payload = await verifyToken(token);
  if (!payload) return null;
  return userFromPayload(payload);
}

export function createServerAuth(): AuthApi {
  return {
    async getUser() {
      const user = await getUserFromCookies();
      return { data: { user }, error: null };
    },
    async getSession() {
      const token = await readCookieToken();
      if (!token) return { data: { session: null }, error: null };
      const payload = await verifyToken(token);
      if (!payload) return { data: { session: null }, error: null };
      const user = userFromPayload(payload);
      return {
        data: {
          session: {
            access_token: token,
            refresh_token: token,
            expires_in: payload.exp - payload.iat,
            expires_at: payload.exp,
            token_type: "bearer",
            user,
          },
        },
        error: null,
      };
    },
    async signInWithPassword({ email, password }) {
      try {
        const user = await withAdmin(async (client) => {
          const { rows } = await client.query(
            `SELECT id, email, raw_user_meta_data, raw_app_meta_data, created_at
             FROM auth.users
             WHERE lower(email) = lower($1)
               AND encrypted_password = crypt($2, encrypted_password)
               AND deleted_at IS NULL`,
            [email, password],
          );
          if (!rows[0]) return null;
          await client.query(
            "UPDATE auth.users SET last_sign_in_at = now() WHERE id = $1",
            [rows[0].id],
          );
          return toUser(rows[0]);
        });
        if (!user) {
          return {
            data: { user: null, session: null },
            error: authError("Invalid login credentials", 400),
          };
        }
        const session = await sessionFromUser(user);
        await writeSessionCookie(session.access_token);
        return { data: { user, session }, error: null };
      } catch (err) {
        return {
          data: { user: null, session: null },
          error: authError(err instanceof Error ? err.message : "Sign-in failed"),
        };
      }
    },
    async signUp({ email, password, options }) {
      try {
        const user = await withAdmin(async (client) => {
          const { rows } = await client.query(
            `INSERT INTO auth.users (
               email, encrypted_password, email_confirmed_at,
               raw_user_meta_data, raw_app_meta_data
             ) VALUES (
               $1, crypt($2, gen_salt('bf')), now(), $3::jsonb, $4::jsonb
             )
             RETURNING id, email, raw_user_meta_data, raw_app_meta_data, created_at`,
            [
              email,
              password,
              JSON.stringify(options?.data ?? {}),
              JSON.stringify({ provider: "email", providers: ["email"] }),
            ],
          );
          return toUser(rows[0]);
        });
        const session = await sessionFromUser(user);
        await writeSessionCookie(session.access_token);
        return { data: { user, session }, error: null };
      } catch (err) {
        const e = err as { code?: string; message?: string };
        if (e.code === "23505") {
          return {
            data: { user: null, session: null },
            error: authError("User already registered", 400),
          };
        }
        return {
          data: { user: null, session: null },
          error: authError(e.message ?? "Sign-up failed"),
        };
      }
    },
    async signOut() {
      try {
        await clearSessionCookie();
        return { error: null };
      } catch (err) {
        return {
          error: authError(err instanceof Error ? err.message : "Sign-out failed"),
        };
      }
    },
    async updateUser(attrs) {
      const current = await getUserFromCookies();
      if (!current) {
        return { data: { user: null }, error: authError("Not authenticated", 401) };
      }
      try {
        const user = await withAdmin(async (client) => {
          if (attrs.password) {
            await client.query(
              "UPDATE auth.users SET encrypted_password = crypt($2, gen_salt('bf')), updated_at = now() WHERE id = $1",
              [current.id, attrs.password],
            );
          }
          if (attrs.email) {
            await client.query(
              "UPDATE auth.users SET email = $2, updated_at = now() WHERE id = $1",
              [current.id, attrs.email],
            );
            await client.query(
              "UPDATE public.profiles SET email = $2, updated_at = now() WHERE user_id = $1",
              [current.id, attrs.email],
            );
          }
          const { rows } = await client.query(
            `SELECT id, email, raw_user_meta_data, raw_app_meta_data, created_at
             FROM auth.users WHERE id = $1`,
            [current.id],
          );
          return toUser(rows[0]);
        });
        const session = await sessionFromUser(user);
        await writeSessionCookie(session.access_token);
        return { data: { user }, error: null };
      } catch (err) {
        return {
          data: { user: null },
          error: authError(err instanceof Error ? err.message : "Update failed"),
        };
      }
    },
    async resetPasswordForEmail() {
      // No SMTP in the local Postgres stack — accept the request so the
      // existing UI can complete, and log that email is not configured.
      console.warn(
        "[auth] resetPasswordForEmail: email delivery is not configured in the Postgres stack",
      );
      return { data: {}, error: null };
    },
    onAuthStateChange() {
      return { data: { subscription: { unsubscribe() {} } } };
    },
  };
}

export interface ImpersonationTarget {
  id: string;
  email: string;
  fullName: string;
  accountName: string;
}

async function readActor(): Promise<
  | { payload: JwtPayload; actorId: string; actorEmail: string }
  | { error: AuthError }
> {
  const token = await readCookieToken();
  if (!token) return { error: authError("Not authenticated", 401) };
  const payload = await verifyToken(token);
  if (!payload) return { error: authError("Not authenticated", 401) };
  return {
    payload,
    actorId: payload.imp?.sub ?? payload.sub,
    actorEmail: payload.imp?.email ?? payload.email,
  };
}

async function assertOwner(actorId: string): Promise<AuthError | null> {
  const role = await withAdmin(async (client) => {
    const { rows } = await client.query(
      `SELECT p.account_role
       FROM public.profiles p
       JOIN auth.users u ON u.id = p.user_id
       WHERE p.user_id = $1 AND u.deleted_at IS NULL`,
      [actorId],
    );
    return rows[0]?.account_role as string | undefined;
  });
  if (role !== "owner") {
    return authError("Somente o proprietário pode acessar outra conta", 403);
  }
  return null;
}

export async function listImpersonationTargets(): Promise<{
  users: ImpersonationTarget[];
  error: AuthError | null;
}> {
  const actor = await readActor();
  if ("error" in actor) return { users: [], error: actor.error };
  const denied = await assertOwner(actor.actorId);
  if (denied) return { users: [], error: denied };

  const users = await withAdmin(async (client) => {
    const { rows } = await client.query(
      `SELECT u.id, u.email, p.full_name, a.name AS account_name
       FROM auth.users u
       JOIN public.profiles p ON p.user_id = u.id
       JOIN public.accounts a ON a.id = p.account_id
       WHERE u.deleted_at IS NULL
       ORDER BY p.full_name`,
    );
    return rows.map((row) => ({
      id: String(row.id),
      email: String(row.email ?? ""),
      fullName: String(row.full_name || row.email || ""),
      accountName: String(row.account_name ?? ""),
    }));
  });
  return { users, error: null };
}

export async function stopImpersonation() {
  const actor = await readActor();
  if ("error" in actor) {
    return { data: { user: null, session: null }, error: actor.error };
  }
  if (!actor.payload.imp) {
    return {
      data: { user: null, session: null },
      error: authError("Nenhuma conta em acesso", 400),
    };
  }
  try {
    const owner = await withAdmin(async (client) => {
      const { rows } = await client.query(
        `SELECT id, email, raw_user_meta_data, raw_app_meta_data, created_at
         FROM auth.users
         WHERE id = $1 AND deleted_at IS NULL`,
        [actor.payload.imp?.sub],
      );
      return rows[0] ? toUser(rows[0]) : null;
    });
    if (!owner) {
      return {
        data: { user: null, session: null },
        error: authError("Conta original não encontrada", 404),
      };
    }
    const session = await sessionFromUser(owner);
    await writeSessionCookie(session.access_token);
    return { data: { user: session.user, session }, error: null };
  } catch (err) {
    return {
      data: { user: null, session: null },
      error: authError(err instanceof Error ? err.message : "Falha ao voltar"),
    };
  }
}

export async function startImpersonation(userId: string) {
  const actor = await readActor();
  if ("error" in actor) {
    return { data: { user: null, session: null }, error: actor.error };
  }
  const denied = await assertOwner(actor.actorId);
  if (denied) return { data: { user: null, session: null }, error: denied };
  if (userId === actor.actorId) {
    return actor.payload.imp
      ? stopImpersonation()
      : { data: { user: null, session: null }, error: null };
  }

  try {
    const target = await withAdmin(async (client) => {
      const { rows } = await client.query(
        `SELECT u.id, u.email, u.raw_user_meta_data, u.raw_app_meta_data, u.created_at
         FROM auth.users u
         JOIN public.profiles p ON p.user_id = u.id
         WHERE u.id = $1 AND u.deleted_at IS NULL`,
        [userId],
      );
      return rows[0] ? toUser(rows[0]) : null;
    });
    if (!target) {
      return {
        data: { user: null, session: null },
        error: authError("Usuário não encontrado", 404),
      };
    }
    const session = await sessionFromUser(target, {
      sub: actor.actorId,
      email: actor.actorEmail,
    });
    await writeSessionCookie(session.access_token);
    return { data: { user: session.user, session }, error: null };
  } catch (err) {
    return {
      data: { user: null, session: null },
      error: authError(
        err instanceof Error ? err.message : "Falha ao acessar a conta",
      ),
    };
  }
}
