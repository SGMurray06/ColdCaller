import {
  createHash,
  createHmac,
  randomBytes,
  scrypt,
  timingSafeEqual,
} from "node:crypto";
import { promisify } from "node:util";

// Server-only. Never import this from a "use client" component — it would pull
// node:crypto and AUTH_SECRET into the browser bundle.
//
// This file must also stay free of any `lib/db` import: proxy.ts depends on it,
// and pulling `pg` into the proxy graph would break the request path. The
// dependency direction is db -> auth, never the reverse.

export const SESSION_COOKIE = "coldcaller_session";

// proxy.ts stamps the request path here so server components can see it —
// they have no access to their own URL otherwise.
export const PATHNAME_HEADER = "x-coldcaller-pathname";

const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export type Role = "rep" | "admin";

// What the cookie asserts. Deliberately small — it is a coarse gate for
// proxy.ts, which has no database access. Anything that must be current
// (is_active, a demotion, a display name) is re-read from the DB by the API
// routes via lib/session.ts.
export interface SessionClaims {
  uid: string;
  role: Role;
  mc: boolean; // must change password
  exp: number;
}

// Constant-time compare. Both sides are hashed first because timingSafeEqual
// throws on length mismatch, which would leak the expected length.
export function safeEqual(a: string, b: string): boolean {
  const ha = createHash("sha256").update(a, "utf8").digest();
  const hb = createHash("sha256").update(b, "utf8").digest();
  return timingSafeEqual(ha, hb);
}

function authSecret(): string {
  const secret = process.env.AUTH_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error(
      "AUTH_SECRET is missing or too short. Set it to a random string of at least 32 characters (openssl rand -base64 32)."
    );
  }
  return secret;
}

function sign(payload: string): string {
  return createHmac("sha256", authSecret()).update(payload).digest("base64url");
}

// ---- Session token ----
//
// Format: "<base64url(JSON claims)>.<hmac>". base64url shares no characters
// with ".", so splitting at the first dot is unambiguous.

export function issueSessionToken(
  claims: Omit<SessionClaims, "exp">
): string {
  const full: SessionClaims = { ...claims, exp: Date.now() + SESSION_TTL_MS };
  const payload = Buffer.from(JSON.stringify(full), "utf8").toString(
    "base64url"
  );
  return `${payload}.${sign(payload)}`;
}

export function verifySessionToken(
  token: string | undefined
): SessionClaims | null {
  if (!token) return null;

  const dot = token.indexOf(".");
  if (dot < 1) return null;

  const payload = token.slice(0, dot);
  const signature = token.slice(dot + 1);
  if (!signature) return null;

  // Verify before parsing: never JSON.parse attacker-controlled bytes that
  // haven't been authenticated.
  if (!safeEqual(signature, sign(payload))) return null;

  let claims: unknown;
  try {
    claims = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
  } catch {
    return null;
  }

  if (!claims || typeof claims !== "object") return null;
  const c = claims as Record<string, unknown>;

  if (typeof c.uid !== "string" || !c.uid) return null;
  if (c.role !== "rep" && c.role !== "admin") return null;
  if (typeof c.exp !== "number" || !Number.isFinite(c.exp)) return null;
  if (c.exp < Date.now()) return null;

  return { uid: c.uid, role: c.role, mc: c.mc === true, exp: c.exp };
}

// ---- Password hashing ----

const scryptAsync = promisify(scrypt) as (
  password: string,
  salt: Buffer,
  keylen: number
) => Promise<Buffer>;

const SALT_BYTES = 16;
const KEY_BYTES = 64;

// Async scrypt, never scryptSync: this takes ~50-100ms and scryptSync would
// block the event loop for the duration of every login.
export async function hashPassword(plain: string): Promise<string> {
  const salt = randomBytes(SALT_BYTES);
  const key = await scryptAsync(plain, salt, KEY_BYTES);
  return `scrypt$${salt.toString("hex")}$${key.toString("hex")}`;
}

export async function verifyPasswordHash(
  plain: unknown,
  stored: string | undefined
): Promise<boolean> {
  if (typeof plain !== "string" || plain.length === 0) return false;
  if (!stored) return false;

  const parts = stored.split("$");
  if (parts.length !== 3 || parts[0] !== "scrypt") return false;

  let salt: Buffer;
  let expected: Buffer;
  try {
    salt = Buffer.from(parts[1], "hex");
    expected = Buffer.from(parts[2], "hex");
  } catch {
    return false;
  }
  if (salt.length !== SALT_BYTES || expected.length !== KEY_BYTES) return false;

  const actual = await scryptAsync(plain, salt, KEY_BYTES);
  // Both are KEY_BYTES long by construction, so timingSafeEqual is safe here
  // without the hash-first dance in safeEqual above.
  return timingSafeEqual(actual, expected);
}

// Applies to self-service changes and to admin-issued temporary passwords.
// Lowered from 10 at the user's request. Since these accounts sit on a public
// URL with only the per-IP/per-username login throttle in front of them, don't
// lower it further.
export const MIN_PASSWORD_LENGTH = 8;

// ---- ElevenLabs custom-LLM callback ----

// ElevenLabs sends this via its Custom LLM "API key" field as a bearer token.
// Fails closed: no configured token means every request is rejected.
export function verifyLlmBearer(authHeader: string | null): boolean {
  const expected = process.env.LLM_WEBHOOK_TOKEN;
  if (!expected) return false;
  if (!authHeader?.startsWith("Bearer ")) return false;

  const presented = authHeader.slice(7).trim();
  if (!presented) return false;

  return safeEqual(presented, expected);
}

// Secure is browser-enforced against the address bar, so it must be off for
// http://localhost — otherwise the cookie is silently dropped and login
// appears to succeed then immediately bounces back to /login.
export const sessionCookieOptions = {
  httpOnly: true,
  secure:
    process.env.COOKIE_INSECURE !== "1" &&
    process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/",
  maxAge: Math.floor(SESSION_TTL_MS / 1000),
};
