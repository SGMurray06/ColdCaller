import { toPublicUser } from "@/lib/db";
import { requireUser } from "@/lib/session";

// GET /api/auth/me — who am I? Used by client components that need the role or
// the display name. toPublicUser keeps the password hash out of the response.
export async function GET() {
  const auth = await requireUser();
  if ("error" in auth) return auth.error;
  return Response.json(toPublicUser(auth.user));
}
