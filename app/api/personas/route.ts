import { getAllPersonas, getPersona, createPersona, updatePersona, deletePersona } from "@/lib/db";
import type { Persona } from "@/lib/db";
import { requireAdmin } from "@/lib/session";
import { NextRequest } from "next/server";

// Type-only: a value import of Persona would pull `pg` into the client bundle.
export type PublicPersona = Omit<Persona, "systemPrompt">;

// systemPrompt is the prospect's behaviour rules — including the instructions
// telling it not to break character. Shipping that to the browser on every page
// load hands trainees the answer sheet. Not an authorization boundary (any
// logged-in user can still ask for ?include_prompt=1); it just stops the
// prompt leaking into /, /call, /history and /results by default.
function toPublicPersona(persona: Persona): PublicPersona {
  const { systemPrompt: _omitted, ...rest } = persona;
  return rest;
}

export async function GET(request: NextRequest) {
  try {
    const id = request.nextUrl.searchParams.get("id");
    const includePrompt =
      request.nextUrl.searchParams.get("include_prompt") === "1";

    if (id) {
      const persona = await getPersona(id);
      if (!persona) {
        return Response.json({ error: "Persona not found" }, { status: 404 });
      }
      return Response.json(includePrompt ? persona : toPublicPersona(persona));
    }

    const personas = await getAllPersonas();
    return Response.json(
      includePrompt ? personas : personas.map(toPublicPersona)
    );
  } catch (err) {
    console.error("Personas GET error:", err);
    return Response.json(
      { error: "Failed to fetch personas" },
      { status: 500 }
    );
  }
}

// The mutations below are gated in proxy.ts by the role in the cookie, and
// again here against the database. The proxy's copy of the role can be up to
// a token lifetime stale; this one cannot.
export async function POST(request: Request) {
  try {
    const auth = await requireAdmin();
    if ("error" in auth) return auth.error;

    const body = await request.json();
    const persona = await createPersona(body);
    return Response.json(persona);
  } catch (err) {
    console.error("Personas POST error:", err);
    return Response.json(
      { error: "Failed to create persona" },
      { status: 500 }
    );
  }
}

export async function PUT(request: Request) {
  try {
    const auth = await requireAdmin();
    if ("error" in auth) return auth.error;

    const body = await request.json();
    const { id, ...updates } = body;
    if (!id) {
      return Response.json({ error: "id is required" }, { status: 400 });
    }
    const persona = await updatePersona(id, updates);
    if (!persona) {
      return Response.json({ error: "Persona not found" }, { status: 404 });
    }
    return Response.json(persona);
  } catch (err) {
    console.error("Personas PUT error:", err);
    return Response.json(
      { error: "Failed to update persona" },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const auth = await requireAdmin();
    if ("error" in auth) return auth.error;

    const id = request.nextUrl.searchParams.get("id");
    if (!id) {
      return Response.json({ error: "id is required" }, { status: 400 });
    }
    const deleted = await deletePersona(id);
    if (!deleted) {
      return Response.json({ error: "Persona not found" }, { status: 404 });
    }
    return Response.json({ success: true });
  } catch (err) {
    console.error("Personas DELETE error:", err);
    return Response.json(
      { error: "Failed to delete persona" },
      { status: 500 }
    );
  }
}
