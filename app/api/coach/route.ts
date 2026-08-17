import { getAnthropic } from "@/lib/anthropic";
import { getPersona } from "@/lib/db";
import type { TranscriptEntry } from "@/lib/db";

interface CoachRequest {
  transcript: TranscriptEntry[];
  persona_id: string;
}

export interface CoachSuggestion {
  phase: "opener" | "discovery" | "objection" | "close";
  suggestion: string;
  why: string;
}

const COACHING_PROMPT = `You are a real-time sales coach watching a live outbound call for MTN South Africa. The agent is calling an EXISTING MTN customer to upsell, upgrade, or renew — not to win them from a rival. All money is in rand.

Plans the agent may offer:
- Yellow Core — R175 pm x24 — 1 GB, 60 all-net minutes
- Yellow Plus — R199 pm x24 — 3 GB, 3 000 minutes — NEW LINES ONLY, not available as an upgrade
- Sky Iron — R849 pm x24 — 15 GB, 800 minutes, R50 off MTN Home Internet
- Sky Bronze — R1 139 pm x36 — 30 GB, 1 600 minutes, R200 off MTN Home Internet

If the customer asks why they cannot have Yellow Plus, coach the agent to say plainly that it is new lines only. Never coach them to dodge it.

Analyze the conversation so far and give ONE specific coaching suggestion for what the agent should say or do RIGHT NOW.

Rules:
- Be specific — suggest exact words the agent should say, not generic advice
- Keep the suggestion to 1-2 sentences max
- Reference what the prospect just said to make it contextual
- Detect the current phase: "opener" (first 15 seconds), "discovery" (learning about them), "objection" (handling pushback), "close" (securing next step)

Respond ONLY with valid JSON:
{
  "phase": "opener" | "discovery" | "objection" | "close",
  "suggestion": "<exact words or action to take right now>",
  "why": "<1 sentence explaining why this works>"
}`;

export async function POST(request: Request) {
  try {
    const { transcript, persona_id }: CoachRequest = await request.json();

    if (!transcript || transcript.length === 0) {
      return Response.json(
        { error: "No transcript provided" },
        { status: 400 }
      );
    }

    const persona = await getPersona(persona_id);
    const personaContext = persona
      ? `\nProspect: "${persona.name}" — ${persona.disposition}\nLikely objections: ${persona.objections.join("; ")}\nWin condition: ${persona.winCondition}`
      : "";

    const formattedTranscript = transcript
      .map(
        (entry) =>
          `[${entry.speaker === "rep" ? "Agent" : "Prospect"}] ${entry.text}`
      )
      .join("\n");

    const response = await getAnthropic().messages.create({
      model: "claude-sonnet-5",
      max_tokens: 200,
      // Thinking off: it would consume this small budget, and content[0] below
      // would be a thinking block rather than text, silently returning "".
      thinking: { type: "disabled" },
      messages: [
        {
          role: "user",
          content: `${COACHING_PROMPT}${personaContext}\n\n--- LIVE TRANSCRIPT ---\n${formattedTranscript}\n--- END ---\n\nWhat should the agent say or do RIGHT NOW?`,
        },
      ],
    });

    const text =
      response.content[0].type === "text" ? response.content[0].text : "";

    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return Response.json(
        { error: "Failed to parse coaching suggestion" },
        { status: 500 }
      );
    }

    const suggestion: CoachSuggestion = JSON.parse(jsonMatch[0]);
    return Response.json(suggestion);
  } catch (err) {
    console.error("Coach endpoint error:", err);
    return Response.json(
      { error: "Failed to generate coaching suggestion" },
      { status: 500 }
    );
  }
}
