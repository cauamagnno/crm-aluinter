import { NextResponse, type NextRequest } from "next/server";

import { SESSION_COOKIE, verifyToken } from "@/lib/db/jwt";

export async function middleware(request: NextRequest) {
  const token = request.cookies.get(SESSION_COOKIE)?.value;
  const payload = token ? await verifyToken(token) : null;
  const user = payload ? { id: payload.sub } : null;

  if (
    !user &&
    request.nextUrl.pathname === "/signup" &&
    !request.nextUrl.searchParams.get("invite")
  ) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    return NextResponse.redirect(url);
  }

  if (
    user &&
    (request.nextUrl.pathname === "/login" ||
      request.nextUrl.pathname === "/signup" ||
      request.nextUrl.pathname === "/forgot-password")
  ) {
    const url = request.nextUrl.clone();
    const inviteToken = request.nextUrl.searchParams.get("invite");
    if (
      inviteToken &&
      (request.nextUrl.pathname === "/login" ||
        request.nextUrl.pathname === "/signup")
    ) {
      url.pathname = `/join/${encodeURIComponent(inviteToken)}`;
      url.search = "";
    } else {
      url.pathname = "/dashboard";
      url.search = "";
    }
    return NextResponse.redirect(url);
  }

  const protectedPaths = [
    "/dashboard",
    "/inbox",
    "/contacts",
    "/pipelines",
    "/broadcasts",
    "/automations",
    "/settings",
  ];
  if (
    !user &&
    protectedPaths.some((path) => request.nextUrl.pathname.startsWith(path))
  ) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  if (
    !user &&
    request.nextUrl.pathname.startsWith("/api/whatsapp/") &&
    !request.nextUrl.pathname.includes("/webhook")
  ) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  return NextResponse.next({ request });
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
