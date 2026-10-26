import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

import { SESSION_COOKIE, signToken } from "@/lib/db/jwt";

const { middleware } = await import("./middleware");

beforeEach(() => {
  process.env.AUTH_SECRET = "test-auth-secret";
});

afterEach(() => vi.clearAllMocks());

async function authedCookie() {
  const { token } = await signToken({
    sub: "user-1",
    email: "demo@local.test",
  });
  return `${SESSION_COOKIE}=${token}`;
}

describe("middleware — session cookie gates routes", () => {
  it("redirects a signed-in user off /login", async () => {
    const res = await middleware(
      new NextRequest("https://app.test/login", {
        headers: { cookie: await authedCookie() },
      }),
    );

    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toContain("/dashboard");
  });

  it("redirects an unauth user to /login", async () => {
    const res = await middleware(new NextRequest("https://app.test/dashboard"));

    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toContain("/login");
  });

  it("redirects public /signup to /login", async () => {
    const res = await middleware(new NextRequest("https://app.test/signup"));

    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toContain("/login");
  });

  it("keeps /signup available when an invite token is present", async () => {
    const res = await middleware(
      new NextRequest("https://app.test/signup?invite=abc"),
    );

    expect(res.status).toBe(200);
  });

  it("sends an invite-bearing signed-in user to /join/<token>", async () => {
    const res = await middleware(
      new NextRequest("https://app.test/login?invite=abc", {
        headers: { cookie: await authedCookie() },
      }),
    );

    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toContain("/join/abc");
  });
});
