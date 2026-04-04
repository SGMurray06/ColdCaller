import Database from "better-sqlite3";
import path from "path";

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

let _db: Database.Database | null = null;

function getDb(): Database.Database {
  if (!_db) {
    const dbPath = path.join(process.cwd(), "coldcaller.db");
    _db = new Database(dbPath);
    _db.pragma("journal_mode = WAL");

    _db.exec(`
      CREATE TABLE IF NOT EXISTS sessions (
        id TEXT PRIMARY KEY,
        rep_name TEXT NOT NULL,
        persona_id TEXT NOT NULL,
        transcript TEXT NOT NULL DEFAULT '[]',
        score TEXT,
        duration_seconds INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      )
    `);
  }
  return _db;
}

export function createSession(session: {
  id: string;
  rep_name: string;
  persona_id: string;
  transcript: TranscriptEntry[];
  score: ScoreResult | null;
  duration_seconds: number;
}): Session {
  const db = getDb();
  const now = new Date().toISOString();

  db.prepare(
    `INSERT INTO sessions (id, rep_name, persona_id, transcript, score, duration_seconds, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(
    session.id,
    session.rep_name,
    session.persona_id,
    JSON.stringify(session.transcript),
    session.score ? JSON.stringify(session.score) : null,
    session.duration_seconds,
    now
  );

  return {
    ...session,
    created_at: now,
  };
}

export function getSessions(options?: {
  rep_name?: string;
  limit?: number;
}): Session[] {
  const db = getDb();
  const limit = options?.limit || 50;

  let rows: Record<string, unknown>[];
  if (options?.rep_name) {
    rows = db
      .prepare(
        "SELECT * FROM sessions WHERE rep_name = ? ORDER BY created_at DESC LIMIT ?"
      )
      .all(options.rep_name, limit) as Record<string, unknown>[];
  } else {
    rows = db
      .prepare("SELECT * FROM sessions ORDER BY created_at DESC LIMIT ?")
      .all(limit) as Record<string, unknown>[];
  }

  return rows.map((row) => ({
    id: row.id as string,
    rep_name: row.rep_name as string,
    persona_id: row.persona_id as string,
    transcript: JSON.parse(row.transcript as string),
    score: row.score ? JSON.parse(row.score as string) : null,
    duration_seconds: row.duration_seconds as number,
    created_at: row.created_at as string,
  }));
}

export function getSession(id: string): Session | null {
  const db = getDb();
  const row = db.prepare("SELECT * FROM sessions WHERE id = ?").get(id) as
    | Record<string, unknown>
    | undefined;

  if (!row) return null;

  return {
    id: row.id as string,
    rep_name: row.rep_name as string,
    persona_id: row.persona_id as string,
    transcript: JSON.parse(row.transcript as string),
    score: row.score ? JSON.parse(row.score as string) : null,
    duration_seconds: row.duration_seconds as number,
    created_at: row.created_at as string,
  };
}
