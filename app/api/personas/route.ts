import { getAllPersonas, getPersona, createPersona, updatePersona, deletePersona } from "@/lib/db";
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

export async function POST(request: Request) {
  try {
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
