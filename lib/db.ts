import { Pool } from "pg";

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
let _initialized = false;

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

async function ensureTable(): Promise<void> {
  if (_initialized) return;
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
  _initialized = true;
}

export async function createSession(session: {
  id: string;
  rep_name: string;
  persona_id: string;
  transcript: TranscriptEntry[];
  score: ScoreResult | null;
  duration_seconds: number;
}): Promise<Session> {
  await ensureTable();
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
  await ensureTable();
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
  await ensureTable();
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
