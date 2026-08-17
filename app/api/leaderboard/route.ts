import { getLeaderboard } from "@/lib/db";
import { requireUser } from "@/lib/session";

// GET /api/leaderboard — best score per rep, across everyone.
//
// Deliberately visible to every signed-in rep: the leaderboard is the point of
// the training. It returns names and scores only, never session IDs or
// transcripts, so seeing that someone scored 8/10 doesn't let you read the call.
export async function GET() {
  try {
    const auth = await requireUser();
    if ("error" in auth) return auth.error;

    return Response.json(await getLeaderboard(10));
  } catch (err) {
    console.error("Leaderboard GET error:", err);
    return Response.json(
      { error: "Failed to fetch leaderboard" },
      { status: 500 }
    );
  }
}
