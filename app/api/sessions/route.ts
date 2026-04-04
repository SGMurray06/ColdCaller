import { createSession, getSessions, getSession } from "@/lib/db";
import { NextRequest } from "next/server";
import { v4 as uuidv4 } from "uuid";

// GET /api/sessions?rep_name=...&limit=...&id=...
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl;
    const id = searchParams.get("id");
    const repName = searchParams.get("rep_name");
    const limit = parseInt(searchParams.get("limit") || "50", 10);

    // Single session lookup
    if (id) {
      const session = getSession(id);
      if (!session) {
        return Response.json({ error: "Session not found" }, { status: 404 });
      }
      return Response.json(session);
    }

    // List sessions
    const sessions = getSessions({
      rep_name: repName || undefined,
      limit,
    });

    return Response.json(sessions);
  } catch (err) {
    console.error("Sessions GET error:", err);
    return Response.json(
      { error: "Failed to fetch sessions" },
      { status: 500 }
    );
  }
}

// POST /api/sessions — save a new session
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { rep_name, persona_id, transcript, score, duration_seconds } = body;

    if (!rep_name || !persona_id) {
      return Response.json(
        { error: "rep_name and persona_id are required" },
        { status: 400 }
      );
    }

    const session = createSession({
      id: uuidv4(),
      rep_name,
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
