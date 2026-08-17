import { Pool } from "pg";
import { randomUUID } from "node:crypto";
import { hashPassword, type Role } from "@/lib/auth";

// ---- User types ----

export interface User {
  id: string;
  username: string;
  displayName: string;
  passwordHash: string;
  role: Role;
  mustChangePassword: boolean;
  isActive: boolean;
  createdAt: string;
}

// What is safe to send to a browser. passwordHash never leaves this module's
// callers without going through here.
export type PublicUser = Omit<User, "passwordHash">;

export function toPublicUser(user: User): PublicUser {
  const { passwordHash: _omitted, ...rest } = user;
  return rest;
}

// ---- Persona types ----

export interface CoachingTip {
  phase: "opener" | "discovery" | "objection" | "close";
  label: string;
  tip: string;
}

export interface Persona {
  id: string;
  name: string;
  title: string;
  company: string;
  industry: string;
  disposition: string;
  difficulty: "easy" | "medium" | "hard";
  firstMessage: string;
  objections: string[];
  winCondition: string;
  coachingTips: CoachingTip[];
  systemPrompt: string;
}

// ---- Session types ----

export interface TranscriptEntry {
  speaker: "rep" | "prospect";
  text: string;
  timestamp: number;
}

export interface ScoreResult {
  opener: number;
  objection_handling: number;
  value_proposition: number;
  next_step: number;
  overall: number;
  done_well: string[];
  to_improve: string[];
  verdict: string;
}

export interface Session {
  id: string;
  user_id: string | null;
  rep_name: string;
  persona_id: string;
  transcript: TranscriptEntry[];
  score: ScoreResult | null;
  duration_seconds: number;
  created_at: string;
}

// What GET /api/sessions returns for a list: no transcript, so the list can't
// be used to bulk-download call history.
export type SessionSummary = Omit<Session, "transcript">;

export interface LeaderboardEntry {
  rep_name: string;
  persona_id: string;
  overall: number;
}

let _pool: Pool | null = null;
let _sessionsInitialized = false;
let _personasInitialized = false;
let _usersInitialized = false;

function getPool(): Pool {
  if (!_pool) {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
      throw new Error("Missing DATABASE_URL environment variable");
    }
    _pool = new Pool({
      connectionString,
      ssl: connectionString.includes("localhost")
        ? false
        : { rejectUnauthorized: false },
      max: 5,
    });
  }
  return _pool;
}

async function ensureSessionsTable(): Promise<void> {
  if (_sessionsInitialized) return;
  const pool = getPool();
  await pool.query(`
    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      rep_name TEXT NOT NULL,
      persona_id TEXT NOT NULL,
      transcript JSONB NOT NULL DEFAULT '[]'::jsonb,
      score JSONB,
      duration_seconds INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  // Nullable on purpose. Rows written before accounts existed keep their
  // free-text rep_name and stay orphaned — they still appear on the
  // leaderboard, but no rep owns them, so only an admin can open them.
  // No FK: the rest of the schema has none, and users are deactivated
  // rather than deleted.
  await pool.query(
    `ALTER TABLE sessions ADD COLUMN IF NOT EXISTS user_id TEXT`
  );
  await pool.query(
    `CREATE INDEX IF NOT EXISTS sessions_user_id_idx ON sessions (user_id)`
  );

  _sessionsInitialized = true;
}

async function ensureUsersTable(): Promise<void> {
  if (_usersInitialized) return;
  const pool = getPool();
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      username TEXT NOT NULL UNIQUE,
      display_name TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'rep',
      must_change_password BOOLEAN NOT NULL DEFAULT FALSE,
      is_active BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  // Bootstrap admin, same shape as the DEFAULT_PERSONAS seed below.
  //
  // NOTE: like that seed, this check is memoised per process. Changing
  // APP_PASSWORD after first boot does nothing, and `DELETE FROM users;`
  // will not re-seed until the server restarts.
  const count = await pool.query("SELECT COUNT(*) FROM users");
  if (parseInt(count.rows[0].count) === 0) {
    const password = process.env.APP_PASSWORD;
    if (!password) {
      throw new Error(
        "APP_PASSWORD is required to seed the first admin account. Set it to a long random string, start the app once to create the admin user, then change the password from /account/password."
      );
    }
    const username = (process.env.ADMIN_USERNAME || "admin").toLowerCase();
    await pool.query(
      `INSERT INTO users (id, username, display_name, password_hash, role, must_change_password)
       VALUES ($1, $2, $3, $4, 'admin', TRUE)`,
      [randomUUID(), username, "Admin", await hashPassword(password)]
    );
    console.log(`[db] Seeded bootstrap admin user "${username}".`);
  }

  _usersInitialized = true;
}

async function ensurePersonasTable(): Promise<void> {
  if (_personasInitialized) return;
  const pool = getPool();
  await pool.query(`
    CREATE TABLE IF NOT EXISTS personas (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      title TEXT NOT NULL,
      company TEXT NOT NULL,
      industry TEXT NOT NULL,
      disposition TEXT NOT NULL,
      difficulty TEXT NOT NULL,
      first_message TEXT NOT NULL,
      objections JSONB NOT NULL DEFAULT '[]'::jsonb,
      win_condition TEXT NOT NULL,
      coaching_tips JSONB NOT NULL DEFAULT '[]'::jsonb,
      system_prompt TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  // Seed defaults if table is empty
  const count = await pool.query("SELECT COUNT(*) FROM personas");
  if (parseInt(count.rows[0].count) === 0) {
    const { DEFAULT_PERSONAS } = await import("@/lib/personas");
    for (const p of DEFAULT_PERSONAS) {
      await pool.query(
        `INSERT INTO personas (id, name, title, company, industry, disposition, difficulty, first_message, objections, win_condition, coaching_tips, system_prompt)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
        [
          p.id, p.name, p.title, p.company, p.industry, p.disposition,
          p.difficulty, p.firstMessage, JSON.stringify(p.objections),
          p.winCondition, JSON.stringify(p.coachingTips), p.systemPrompt,
        ]
      );
    }
  }
  _personasInitialized = true;
}

export async function createSession(session: {
  id: string;
  user_id: string;
  rep_name: string;
  persona_id: string;
  transcript: TranscriptEntry[];
  score: ScoreResult | null;
  duration_seconds: number;
}): Promise<Session> {
  await ensureSessionsTable();
  const pool = getPool();

  const result = await pool.query(
    `INSERT INTO sessions (id, user_id, rep_name, persona_id, transcript, score, duration_seconds)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING *`,
    [
      session.id,
      session.user_id,
      session.rep_name,
      session.persona_id,
      JSON.stringify(session.transcript),
      session.score ? JSON.stringify(session.score) : null,
      session.duration_seconds,
    ]
  );

  return rowToSession(result.rows[0]);
}

export async function getSessions(options?: {
  user_id?: string;
  limit?: number;
}): Promise<Session[]> {
  await ensureSessionsTable();
  const pool = getPool();
  const limit = options?.limit || 50;

  let result;
  if (options?.user_id) {
    result = await pool.query(
      "SELECT * FROM sessions WHERE user_id = $1 ORDER BY created_at DESC LIMIT $2",
      [options.user_id, limit]
    );
  } else {
    result = await pool.query(
      "SELECT * FROM sessions ORDER BY created_at DESC LIMIT $1",
      [limit]
    );
  }

  return result.rows.map(rowToSession);
}

// Best score per rep, across everyone. Done in SQL rather than shipping every
// session to the browser to be reduced — reps only receive their own sessions
// now, so the client can no longer compute this.
//
// Keyed on user_id where present so two reps sharing a display name don't
// merge; rep_name covers the orphaned rows written before accounts existed.
export async function getLeaderboard(limit = 10): Promise<LeaderboardEntry[]> {
  await ensureSessionsTable();
  const pool = getPool();

  const result = await pool.query(
    `SELECT rep_name, persona_id, (score->>'overall')::numeric AS overall
     FROM (
       SELECT DISTINCT ON (COALESCE(user_id, rep_name))
              rep_name, persona_id, score
       FROM sessions
       WHERE score IS NOT NULL AND score->>'overall' IS NOT NULL
       ORDER BY COALESCE(user_id, rep_name), (score->>'overall')::numeric DESC
     ) best
     ORDER BY overall DESC
     LIMIT $1`,
    [limit]
  );

  return result.rows.map((row) => ({
    rep_name: row.rep_name as string,
    persona_id: row.persona_id as string,
    overall: Number(row.overall),
  }));
}

export async function getSession(id: string): Promise<Session | null> {
  await ensureSessionsTable();
  const pool = getPool();

  const result = await pool.query(
    "SELECT * FROM sessions WHERE id = $1",
    [id]
  );

  if (result.rows.length === 0) return null;
  return rowToSession(result.rows[0]);
}

function rowToSession(row: Record<string, unknown>): Session {
  return {
    id: row.id as string,
    user_id: (row.user_id as string | null) ?? null,
    rep_name: row.rep_name as string,
    persona_id: row.persona_id as string,
    transcript: (typeof row.transcript === "string"
      ? JSON.parse(row.transcript)
      : row.transcript) as TranscriptEntry[],
    score: row.score
      ? (typeof row.score === "string"
          ? JSON.parse(row.score as string)
          : row.score) as ScoreResult
      : null,
    duration_seconds: row.duration_seconds as number,
    created_at: (row.created_at as Date).toISOString(),
  };
}

// ---- Persona CRUD ----

export async function getPersona(id: string): Promise<Persona | null> {
  await ensurePersonasTable();
  const pool = getPool();
  const result = await pool.query("SELECT * FROM personas WHERE id = $1", [id]);
  if (result.rows.length === 0) return null;
  return rowToPersona(result.rows[0]);
}

export async function getAllPersonas(): Promise<Persona[]> {
  await ensurePersonasTable();
  const pool = getPool();
  const result = await pool.query(
    "SELECT * FROM personas ORDER BY CASE difficulty WHEN 'easy' THEN 1 WHEN 'medium' THEN 2 WHEN 'hard' THEN 3 END, name"
  );
  return result.rows.map(rowToPersona);
}

export async function createPersona(persona: Persona): Promise<Persona> {
  await ensurePersonasTable();
  const pool = getPool();
  const result = await pool.query(
    `INSERT INTO personas (id, name, title, company, industry, disposition, difficulty, first_message, objections, win_condition, coaching_tips, system_prompt)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
     RETURNING *`,
    [
      persona.id, persona.name, persona.title, persona.company,
      persona.industry, persona.disposition, persona.difficulty,
      persona.firstMessage, JSON.stringify(persona.objections),
      persona.winCondition, JSON.stringify(persona.coachingTips),
      persona.systemPrompt,
    ]
  );
  return rowToPersona(result.rows[0]);
}

export async function updatePersona(id: string, persona: Partial<Persona>): Promise<Persona | null> {
  await ensurePersonasTable();
  const pool = getPool();

  const existing = await getPersona(id);
  if (!existing) return null;

  const merged = { ...existing, ...persona };
  await pool.query(
    `UPDATE personas SET name=$1, title=$2, company=$3, industry=$4, disposition=$5,
     difficulty=$6, first_message=$7, objections=$8, win_condition=$9,
     coaching_tips=$10, system_prompt=$11 WHERE id=$12`,
    [
      merged.name, merged.title, merged.company, merged.industry,
      merged.disposition, merged.difficulty, merged.firstMessage,
      JSON.stringify(merged.objections), merged.winCondition,
      JSON.stringify(merged.coachingTips), merged.systemPrompt, id,
    ]
  );

  return getPersona(id);
}

export async function deletePersona(id: string): Promise<boolean> {
  await ensurePersonasTable();
  const pool = getPool();
  const result = await pool.query("DELETE FROM personas WHERE id = $1", [id]);
  return (result.rowCount ?? 0) > 0;
}

// ---- User CRUD ----
//
// Usernames are lowercased on write and on lookup, so "Simon" and "simon" are
// the same account and a rep can't be locked out by their own capital letter.

export async function getUserById(id: string): Promise<User | null> {
  await ensureUsersTable();
  const pool = getPool();
  const result = await pool.query("SELECT * FROM users WHERE id = $1", [id]);
  if (result.rows.length === 0) return null;
  return rowToUser(result.rows[0]);
}

export async function getUserByUsername(
  username: string
): Promise<User | null> {
  await ensureUsersTable();
  const pool = getPool();
  const result = await pool.query("SELECT * FROM users WHERE username = $1", [
    username.trim().toLowerCase(),
  ]);
  if (result.rows.length === 0) return null;
  return rowToUser(result.rows[0]);
}

export async function listUsers(): Promise<User[]> {
  await ensureUsersTable();
  const pool = getPool();
  const result = await pool.query(
    "SELECT * FROM users ORDER BY is_active DESC, display_name"
  );
  return result.rows.map(rowToUser);
}

export async function createUser(input: {
  username: string;
  displayName: string;
  password: string;
  role?: Role;
}): Promise<User> {
  await ensureUsersTable();
  const pool = getPool();

  const result = await pool.query(
    `INSERT INTO users (id, username, display_name, password_hash, role, must_change_password)
     VALUES ($1, $2, $3, $4, $5, TRUE)
     RETURNING *`,
    [
      randomUUID(),
      input.username.trim().toLowerCase(),
      input.displayName.trim(),
      await hashPassword(input.password),
      input.role ?? "rep",
    ]
  );

  return rowToUser(result.rows[0]);
}

// mustChange is TRUE for an admin-issued reset (the rep picks their own on next
// login) and FALSE when the user sets it themselves.
export async function setUserPassword(
  id: string,
  password: string,
  mustChange: boolean
): Promise<boolean> {
  await ensureUsersTable();
  const pool = getPool();
  const result = await pool.query(
    "UPDATE users SET password_hash = $1, must_change_password = $2 WHERE id = $3",
    [await hashPassword(password), mustChange, id]
  );
  return (result.rowCount ?? 0) > 0;
}

export async function updateUser(
  id: string,
  updates: { displayName?: string; role?: Role; isActive?: boolean }
): Promise<User | null> {
  await ensureUsersTable();
  const pool = getPool();

  const existing = await getUserById(id);
  if (!existing) return null;

  await pool.query(
    "UPDATE users SET display_name = $1, role = $2, is_active = $3 WHERE id = $4",
    [
      updates.displayName?.trim() || existing.displayName,
      updates.role ?? existing.role,
      updates.isActive ?? existing.isActive,
      id,
    ]
  );

  return getUserById(id);
}

// Used to refuse the change that would lock everyone out of /admin.
export async function countActiveAdmins(): Promise<number> {
  await ensureUsersTable();
  const pool = getPool();
  const result = await pool.query(
    "SELECT COUNT(*) FROM users WHERE role = 'admin' AND is_active = TRUE"
  );
  return parseInt(result.rows[0].count);
}

function rowToUser(row: Record<string, unknown>): User {
  return {
    id: row.id as string,
    username: row.username as string,
    displayName: row.display_name as string,
    passwordHash: row.password_hash as string,
    role: row.role as Role,
    mustChangePassword: row.must_change_password as boolean,
    isActive: row.is_active as boolean,
    createdAt: (row.created_at as Date).toISOString(),
  };
}

function rowToPersona(row: Record<string, unknown>): Persona {
  return {
    id: row.id as string,
    name: row.name as string,
    title: row.title as string,
    company: row.company as string,
    industry: row.industry as string,
    disposition: row.disposition as string,
    difficulty: row.difficulty as "easy" | "medium" | "hard",
    firstMessage: row.first_message as string,
    objections: (typeof row.objections === "string"
      ? JSON.parse(row.objections)
      : row.objections) as string[],
    winCondition: row.win_condition as string,
    coachingTips: (typeof row.coaching_tips === "string"
      ? JSON.parse(row.coaching_tips)
      : row.coaching_tips) as CoachingTip[],
    systemPrompt: row.system_prompt as string,
  };
}
