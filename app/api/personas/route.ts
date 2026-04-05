import { getAllPersonas, getPersona } from "@/lib/db";
import { NextRequest } from "next/server";

export async function GET(request: NextRequest) {
  try {
    const id = request.nextUrl.searchParams.get("id");

    if (id) {
      const persona = await getPersona(id);
      if (!persona) {
        return Response.json({ error: "Persona not found" }, { status: 404 });
      }
      return Response.json(persona);
    }

    const personas = await getAllPersonas();
    return Response.json(personas);
  } catch (err) {
    console.error("Personas GET error:", err);
    return Response.json(
      { error: "Failed to fetch personas" },
      { status: 500 }
    );
  }
}
