import { NextResponse } from "next/server";
import {
  SESSION_COOKIE,
  issueSessionToken,
  sessionCookieOptions,
  verifyPasswordHash,
} from "@/lib/auth";
import { getUserByUsername } from "@/lib/db";
import { checkRateLimit } from "@/lib/rate-limit";

// POST /api/auth/login — { username, password } against the users table.
export async function POST(request: Request) {
  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";

  let username: unknown;
  let password: unknown;
  try {
    const body = await request.json();
    username = body?.username;
    password = body?.password;
  } catch {
    // Leave both undefined; the checks below reject.
  }

  const normalized =
    typeof username === "string" ? username.trim().toLowerCase() : "";

  // Two keys. Per-IP alone doesn't stop a distributed guess against one known
  // account, and per-username alone doesn't stop someone spraying many accounts
  // from one host.
  if (!checkRateLimit(`ip:${ip}`) || !checkRateLimit(`u:${normalized}`)) {
    return NextResponse.json(
      { error: "Too many attempts. Wait a minute and try again." },
      { status: 429 }
    );
  }

  // One message for every failure — a wrong username and a wrong password must
  // be indistinguishable, or this becomes a way to enumerate who works here.
  const reject = () =>
    NextResponse.json(
      { error: "Incorrect username or password" },
      { status: 401 }
    );

  if (!normalized || typeof password !== "string") return reject();

  const user = await getUserByUsername(normalized);
  if (!user || !user.isActive) return reject();
  if (!(await verifyPasswordHash(password, user.passwordHash))) return reject();

  const response = NextResponse.json({
    ok: true,
    mustChangePassword: user.mustChangePassword,
  });
  response.cookies.set(
    SESSION_COOKIE,
    issueSessionToken({
      uid: user.id,
      role: user.role,
      mc: user.mustChangePassword,
    }),
    sessionCookieOptions
  );
  return response;
}
