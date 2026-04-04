import { getSignedUrl } from "@/lib/elevenlabs";
import { setActivePersona } from "@/lib/active-persona";
import { NextRequest } from "next/server";

// GET /api/signed-url?persona_id=... — returns a signed WebSocket URL and stores the active persona
export async function GET(request: NextRequest) {
  try {
    const personaId = request.nextUrl.searchParams.get("persona_id");
    if (personaId) {
      setActivePersona(personaId);
    }

    const signedUrl = await getSignedUrl();
    return Response.json({ signed_url: signedUrl });
  } catch (err) {
    console.error("Signed URL error:", err);
    return Response.json(
      { error: "Failed to get conversation URL" },
      { status: 500 }
    );
  }
}
