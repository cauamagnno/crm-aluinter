const enc = new TextEncoder();

export const SESSION_COOKIE = "wacrm-session";
const TOKEN_TTL_SEC = 60 * 60 * 24 * 7;

export interface JwtPayload {
  sub: string;
  email: string;
  role: string;
  exp: number;
  iat: number;
}

function authSecret(): string {
  return process.env.AUTH_SECRET || "wacrm-local-dev-secret";
}

function b64url(data: Uint8Array | string): string {
  const str =
    typeof data === "string"
      ? btoa(data)
      : btoa(String.fromCharCode(...data));
  return str.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromB64url(value: string): string {
  const pad = value.length % 4 === 0 ? "" : "=".repeat(4 - (value.length % 4));
  return atob(value.replace(/-/g, "+").replace(/_/g, "/") + pad);
}

async function hmac(data: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(authSecret()),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(data));
  return b64url(new Uint8Array(sig));
}

export async function signToken(input: {
  sub: string;
  email: string;
  role?: string;
}): Promise<{ token: string; payload: JwtPayload }> {
  const now = Math.floor(Date.now() / 1000);
  const payload: JwtPayload = {
    sub: input.sub,
    email: input.email,
    role: input.role ?? "authenticated",
    iat: now,
    exp: now + TOKEN_TTL_SEC,
  };
  const body = b64url(JSON.stringify(payload));
  const token = `${body}.${await hmac(body)}`;
  return { token, payload };
}

export async function verifyToken(token: string): Promise<JwtPayload | null> {
  const [body, sig] = token.split(".");
  if (!body || !sig) return null;
  const expected = await hmac(body);
  if (expected.length !== sig.length) return null;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) {
    diff |= expected.charCodeAt(i) ^ sig.charCodeAt(i);
  }
  if (diff !== 0) return null;
  try {
    const payload = JSON.parse(fromB64url(body)) as JwtPayload;
    if (!payload.sub || payload.exp * 1000 < Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}

export function cookieOptions() {
  return {
    name: SESSION_COOKIE,
    httpOnly: true,
    sameSite: "lax" as const,
    path: "/",
    secure: process.env.NODE_ENV === "production",
    maxAge: TOKEN_TTL_SEC,
  };
}
