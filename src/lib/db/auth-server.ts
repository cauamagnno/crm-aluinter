import { cookies } from "next/headers";

import { cookieOptions, SESSION_COOKIE, signToken, verifyToken } from "./jwt";
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

async function sessionFromUser(user: User): Promise<Session> {
  const { token, payload } = await signToken({
    sub: user.id,
    email: user.email ?? "",
  });
  return {
    access_token: token,
    refresh_token: token,
    expires_in: payload.exp - payload.iat,
    expires_at: payload.exp,
    token_type: "bearer",
    user,
  };
}

export async function getUserFromCookies(): Promise<User | null> {
  const token = await readCookieToken();
  if (!token) return null;
  const payload = await verifyToken(token);
  if (!payload) return null;
  return {
    id: payload.sub,
    email: payload.email,
    user_metadata: {},
    app_metadata: {},
    aud: "authenticated",
    role: "authenticated",
    created_at: new Date(payload.iat * 1000).toISOString(),
  };
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
      const user: User = {
        id: payload.sub,
        email: payload.email,
        user_metadata: {},
        app_metadata: {},
        aud: "authenticated",
        role: "authenticated",
        created_at: new Date(payload.iat * 1000).toISOString(),
      };
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
