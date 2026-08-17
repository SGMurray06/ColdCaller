import { NextResponse, type NextRequest } from "next/server";
import {
  PATHNAME_HEADER,
  SESSION_COOKIE,
  verifyLlmBearer,
  verifySessionToken,
} from "@/lib/auth";

// Next.js 16 renamed middleware -> proxy. The export must be named `proxy`, and
// the runtime is Node (not configurable), so node:crypto works in lib/auth.
//
// This is a COARSE gate. It reads the claims signed into the cookie and never
// touches the database — importing lib/db here would pull `pg` into the proxy
// graph. Consequence: a demotion or deactivation is not reflected here until
// the token expires, so every route that touches data re-checks against the DB
// via lib/session.ts. Worst case someone sees an empty page shell.

// Reachable with no session cookie.
const PUBLIC_PATHS = new Set([
  "/login",
  "/api/auth/login",
  "/api/auth/logout",
  "/api/health", // Railway healthcheck — gating this makes deploys fail to promote
]);

// Authenticated by shared bearer token instead of a cookie: ElevenLabs' servers
// call these and cannot hold a login session. All three are the same handler
// re-exported, but they are three separate routes and all must be listed.
const LLM_PATHS = new Set([
  "/api/llm",
  "/chat/completions",
  "/v1/chat/completions",
]);

// Reachable while a user still owes us a password change. Anything else
// bounces to /account/password — otherwise a rep just navigates away and
// keeps the temporary password forever.
const PASSWORD_CHANGE_PATHS = new Set([
  "/account/password",
  "/api/auth/password",
  "/api/auth/me",
]);

// Exact API paths only admins may reach.
const ADMIN_API_PATHS = new Set(["/api/users", "/api/personas/generate"]);

function normalize(pathname: string): string {
  return pathname.length > 1 && pathname.endsWith("/")
    ? pathname.slice(0, -1)
    : pathname;
}

// Let the request through, tagging it with the path. A server component can't
// see its own URL, and app/layout.tsx needs it to tell "on the login page" from
// "signed in but the account was deactivated".
function pass(request: NextRequest, path: string) {
  const headers = new Headers(request.headers);
  headers.set(PATHNAME_HEADER, path);
  return NextResponse.next({ request: { headers } });
}

function isAdminOnly(path: string, method: string): boolean {
  if (path === "/admin" || path.startsWith("/admin/")) return true;
  if (ADMIN_API_PATHS.has(path)) return true;
  // Reps need GET /api/personas to pick a prospect; only mutations are gated.
  if (path === "/api/personas" && method !== "GET") return true;
  return false;
}

export function proxy(request: NextRequest) {
  const path = normalize(request.nextUrl.pathname);
  const isApi = path.startsWith("/api/");

  if (PUBLIC_PATHS.has(path)) return pass(request, path);

  if (LLM_PATHS.has(path)) {
    if (!verifyLlmBearer(request.headers.get("authorization"))) {
      // OpenAI-shaped body — ElevenLabs surfaces this more usefully than a bare 401.
      return NextResponse.json(
        {
          error: {
            message: "Unauthorized",
            type: "invalid_request_error",
            code: "invalid_api_key",
          },
        },
        { status: 401 }
      );
    }
    return pass(request, path);
  }

  const claims = verifySessionToken(request.cookies.get(SESSION_COOKIE)?.value);

  if (!claims) {
    // API routes get JSON 401, never a redirect. Redirecting an XHR to the HTML
    // login page would resolve 200 with HTML and blow up in res.json().
    if (isApi) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    url.searchParams.set("next", path + request.nextUrl.search);
    return NextResponse.redirect(url);
  }

  if (claims.mc && !PASSWORD_CHANGE_PATHS.has(path)) {
    if (isApi) {
      return NextResponse.json(
        { error: "Password change required" },
        { status: 403 }
      );
    }

    const url = request.nextUrl.clone();
    url.pathname = "/account/password";
    url.search = "";
    return NextResponse.redirect(url);
  }

  if (claims.role !== "admin" && isAdminOnly(path, request.method)) {
    if (isApi) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const url = request.nextUrl.clone();
    url.pathname = "/";
    url.search = "";
    return NextResponse.redirect(url);
  }

  return pass(request, path);
}

// Deny by default. An allowlist like "/api/:path*" would miss /chat/completions
// and /v1/chat/completions — they sit outside /api because ElevenLabs appends
// its own path — leaving the Claude proxy open. Matcher values must be static
// literals, so they cannot share a constant with the sets above.
export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|gif|svg|webp|ico|woff|woff2|ttf)$).*)",
  ],
};
