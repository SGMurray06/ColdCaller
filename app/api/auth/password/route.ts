import { NextResponse } from "next/server";
import {
  MIN_PASSWORD_LENGTH,
  SESSION_COOKIE,
  issueSessionToken,
  sessionCookieOptions,
  verifyPasswordHash,
} from "@/lib/auth";
import { setUserPassword } from "@/lib/db";
import { requireUser } from "@/lib/session";

// POST /api/auth/password — change your own password.
export async function POST(request: Request) {
  const auth = await requireUser();
  if ("error" in auth) return auth.error;
  const me = auth.user;

  let currentPassword: unknown;
  let newPassword: unknown;
  try {
    const body = await request.json();
    currentPassword = body?.currentPassword;
    newPassword = body?.newPassword;
  } catch {
    // Leave undefined; the checks below reject.
  }

  // Still required on a forced first change — the rep typed it at login a
  // moment ago, and without it an unattended logged-in browser is a takeover.
  if (!(await verifyPasswordHash(currentPassword, me.passwordHash))) {
    return NextResponse.json(
      { error: "Current password is incorrect" },
      { status: 400 }
    );
  }

  if (typeof newPassword !== "string" || newPassword.length < MIN_PASSWORD_LENGTH) {
    return NextResponse.json(
      { error: `New password must be at least ${MIN_PASSWORD_LENGTH} characters` },
      { status: 400 }
    );
  }

  if (newPassword === currentPassword) {
    return NextResponse.json(
      { error: "New password must be different from the current one" },
      { status: 400 }
    );
  }

  await setUserPassword(me.id, newPassword, false);

  // Re-issue with mc cleared, otherwise the proxy keeps redirecting them back
  // to this page with the stale claim.
  const response = NextResponse.json({ ok: true });
  response.cookies.set(
    SESSION_COOKIE,
    issueSessionToken({ uid: me.id, role: me.role, mc: false }),
    sessionCookieOptions
  );
  return response;
}
