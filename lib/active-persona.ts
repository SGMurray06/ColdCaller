import type { RepProfile } from "./rep-profile";

// Simple in-memory store for the active persona ID and rep profile.
// When the client requests a signed URL, it sets both.
// When /api/llm is called, it reads them as a fallback.
let activePersonaId: string | null = null;
let activeRepProfile: RepProfile | null = null;

export function setActivePersona(id: string) {
  activePersonaId = id;
}

export function getActivePersona(): string | null {
  return activePersonaId;
}

export function setActiveRepProfile(profile: RepProfile | null) {
  activeRepProfile = profile;
}

export function getActiveRepProfile(): RepProfile | null {
  return activeRepProfile;
}
