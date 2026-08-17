import { createSession, getSessions, getSession } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { NextRequest } from "next/server";
import { v4 as uuidv4 } from "uuid";

// GET /api/sessions?limit=...&id=...&user_id=...
export async function GET(request: NextRequest) {
  try {
    const auth = await requireUser();
    if ("error" in auth) return auth.error;
    const me = auth.user;

    const { searchParams } = request.nextUrl;
    const id = searchParams.get("id");
    const parsedLimit = parseInt(searchParams.get("limit") || "50", 10);
    const limit = Number.isFinite(parsedLimit)
      ? Math.min(Math.max(parsedLimit, 1), 200)
      : 50;

    // Single session lookup — full transcript, so it needs an ownership check.
    if (id) {
      const session = await getSession(id);

      // 404 rather than 403 for someone else's session: a 403 would confirm
      // the ID exists, turning this into a way to probe for sessions.
      if (
        !session ||
        (me.role !== "admin" && session.user_id !== me.id)
      ) {
        return Response.json({ error: "Session not found" }, { status: 404 });
      }
      return Response.json(session);
    }

    // List. Reps see only their own; an admin sees everyone, optionally
    // narrowed to one rep. Transcripts are stripped either way — the full text
    // comes only from the ?id= lookup above.
    const userFilter =
      me.role === "admin" ? searchParams.get("user_id") || undefined : me.id;

    const sessions = await getSessions({ user_id: userFilter, limit });

    return Response.json(
      sessions.map(({ transcript: _omitted, ...summary }) => summary)
    );
  } catch (err) {
    console.error("Sessions GET error:", err);
    return Response.json(
      { error: "Failed to fetch sessions" },
      { status: 500 }
    );
  }
}

// POST /api/sessions — save a new session.
export async function POST(request: Request) {
  try {
    const auth = await requireUser();
    if ("error" in auth) return auth.error;
    const me = auth.user;

    const body = await request.json();
    const { persona_id, transcript, score, duration_seconds } = body;

    if (!persona_id) {
      return Response.json(
        { error: "persona_id is required" },
        { status: 400 }
      );
    }

    // rep_name is NOT read from the body. Whatever the browser claims, the call
    // is recorded against the signed-in user — that is the whole point of
    // having accounts. rep_name is stored as a snapshot of the display name at
    // call time, so renaming a rep later doesn't rewrite their history.
    const session = await createSession({
      id: uuidv4(),
      user_id: me.id,
      rep_name: me.displayName,
      persona_id,
      transcript: transcript || [],
      score: score || null,
      duration_seconds: duration_seconds || 0,
    });

    return Response.json(session);
  } catch (err) {
    console.error("Sessions POST error:", err);
    return Response.json(
      { error: "Failed to save session" },
      { status: 500 }
    );
  }
}
