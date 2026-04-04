// Simple in-memory store for the active persona ID.
// When the client requests a signed URL, it sets the persona.
// When /api/llm is called, it reads it as a fallback.
let activePersonaId: string | null = null;

export function setActivePersona(id: string) {
  activePersonaId = id;
}

export function getActivePersona(): string | null {
  return activePersonaId;
}
