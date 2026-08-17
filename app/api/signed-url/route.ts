import { getSignedUrl } from "@/lib/elevenlabs";

// GET /api/signed-url — returns a signed ElevenLabs WebSocket URL.
//
// This used to also stash the chosen persona in a module-scope variable for
// /api/llm to read back. That variable was shared by every request in the
// process, so two reps starting calls seconds apart overwrote each other's
// prospect — silently, since the second write just won. The persona now
// travels with the conversation instead, via customLlmExtraBody in
// CallInterface, so nothing needs to be remembered between these two routes.
export async function GET() {
  try {
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
