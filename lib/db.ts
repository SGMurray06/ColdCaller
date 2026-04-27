import { Pool } from "pg";

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
  rep_name: string;
  persona_id: string;
  transcript: TranscriptEntry[];
  score: ScoreResult | null;
  duration_seconds: number;
  created_at: string;
}

let _pool: Pool | null = null;
let _sessionsInitialized = false;
let _personasInitialized = false;

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
  _sessionsInitialized = true;
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

  // Upsert defaults on every startup so they're always present regardless of when they were added
  const { DEFAULT_PERSONAS } = await import("@/lib/personas");
  for (const p of DEFAULT_PERSONAS) {
    await pool.query(
      `INSERT INTO personas (id, name, title, company, industry, disposition, difficulty, first_message, objections, win_condition, coaching_tips, system_prompt)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
       ON CONFLICT (id) DO NOTHING`,
      [
        p.id, p.name, p.title, p.company, p.industry, p.disposition,
        p.difficulty, p.firstMessage, JSON.stringify(p.objections),
        p.winCondition, JSON.stringify(p.coachingTips), p.systemPrompt,
      ]
    );
  }
  _personasInitialized = true;
}

export async function createSession(session: {
  id: string;
  rep_name: string;
  persona_id: string;
  transcript: TranscriptEntry[];
  score: ScoreResult | null;
  duration_seconds: number;
}): Promise<Session> {
  await ensureSessionsTable();
  const pool = getPool();

  const result = await pool.query(
    `INSERT INTO sessions (id, rep_name, persona_id, transcript, score, duration_seconds)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING *`,
    [
      session.id,
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
  rep_name?: string;
  limit?: number;
}): Promise<Session[]> {
  await ensureSessionsTable();
  const pool = getPool();
  const limit = options?.limit || 50;

  let result;
  if (options?.rep_name) {
    result = await pool.query(
      "SELECT * FROM sessions WHERE rep_name = $1 ORDER BY created_at DESC LIMIT $2",
      [options.rep_name, limit]
    );
  } else {
    result = await pool.query(
      "SELECT * FROM sessions ORDER BY created_at DESC LIMIT $1",
      [limit]
    );
  }

  return result.rows.map(rowToSession);
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
