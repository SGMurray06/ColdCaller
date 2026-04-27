import { getSignedUrl } from "@/lib/elevenlabs";
import { setActivePersona, setActiveRepProfile } from "@/lib/active-persona";
import type { RepProfile } from "@/lib/rep-profile";

// POST /api/signed-url — stores active persona + rep profile, returns signed WebSocket URL
export async function POST(request: Request) {
  try {
    const body: { persona_id?: string; rep_profile?: RepProfile } =
      await request.json();

    if (body.persona_id) {
      setActivePersona(body.persona_id);
    }
    setActiveRepProfile(body.rep_profile ?? null);

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
