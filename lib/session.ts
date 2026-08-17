import { cookies } from "next/headers";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/auth";
import { getUserById, type User } from "@/lib/db";

// Server-only. This is the authoritative identity check: proxy.ts gates on the
// claims inside the cookie (it has no database), but everything that actually
// touches data re-reads the user here. That is what makes a deactivation or a
// demotion take effect immediately rather than whenever the token expires.

export async function getCurrentUser(): Promise<User | null> {
  const store = await cookies();
  const claims = verifySessionToken(store.get(SESSION_COOKIE)?.value);
  if (!claims) return null;

  const user = await getUserById(claims.uid);
  if (!user || !user.isActive) return null;

  return user;
}

// Callers do:
//   const auth = await requireUser();
//   if ("error" in auth) return auth.error;
//   const me = auth.user;
export type AuthResult = { user: User } | { error: Response };

export async function requireUser(): Promise<AuthResult> {
  const user = await getCurrentUser();
  if (!user) {
    return {
      error: Response.json({ error: "Unauthorized" }, { status: 401 }),
    };
  }
  return { user };
}

export async function requireAdmin(): Promise<AuthResult> {
  const auth = await requireUser();
  if ("error" in auth) return auth;

  if (auth.user.role !== "admin") {
    return {
      error: Response.json({ error: "Forbidden" }, { status: 403 }),
    };
  }
  return auth;
}
