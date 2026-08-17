import { getAnthropic } from "@/lib/anthropic";
import { getPersona } from "@/lib/db";
import type { TranscriptEntry, ScoreResult } from "@/lib/db";

interface ScoreRequest {
  transcript: TranscriptEntry[];
  persona_id: string;
}

const SCORING_PROMPT = `You are an expert call centre trainer evaluating an outbound call training session for MTN South Africa.
The agent was calling an EXISTING MTN customer — to upsell, upgrade, or renew, not to win them from a rival. All money is in South African rand. Evaluate their performance honestly but constructively.

The plans the agent may offer:
- Yellow Core — R175 pm x24 — 1 GB anytime data, 60 all-net minutes
- Yellow Plus — R199 pm x24 — 3 GB (1.5 anytime + 1.5 bonus), 3 000 minutes (120 + 2 880 bonus) — NEW LINES ONLY, cannot be sold as an upgrade to an existing line
- Sky Iron — R849 pm x24 — 15 GB, 800 minutes, R50 off MTN Home Internet, Priority Service
- Sky Bronze — R1 139 pm x36 — 30 GB, 1 600 minutes, R200 off MTN Home Internet, Priority Service

Score each category from 0-10:

1. **Opener** (0-10): Did they identify themselves and MTN clearly? Did they acknowledge that the person is already a customer rather than pitching them as a stranger? Did they ask permission to continue?
2. **Objection Handling** (0-10): How well did they handle pushback (contract lock-in, bill shock, loyalty resentment, time pressure, anger at being called)? Did they acknowledge concerns before pivoting? Crucially: if the customer asked why the better-value Yellow Plus is unavailable to them, did the agent answer HONESTLY that it is new lines only? Deflecting, spinning, or implying they could get it should score badly regardless of how smooth it sounded.
3. **Value Proposition** (0-10): Did they anchor against what the customer ACTUALLY spends (including out-of-bundle charges and multiple top-ups) rather than the headline plan price? Did they use concrete rand figures rather than vague claims? Did they recommend a plan that genuinely fits the stated usage, rather than the most expensive one?
4. **Next Step** (0-10): Did they secure a migration, a renewal, a booked callback with a specific time, or agreement to receive a written comparison? Did they create a clear reason to follow up?
5. **Overall** (0-10): Composite score including compliance — respecting requests not to be called, not applying pressure, not overstating what a plan includes, and handling any service or billing complaint before attempting to sell.

Also provide:
- "done_well": exactly 3 specific things they did well (reference actual quotes from the transcript)
- "to_improve": exactly 3 specific things to improve (with concrete suggestions for what to say instead)
- "verdict": a single punchy sentence summarizing the call (e.g., "Great composure under pressure but forgot to ask for the callback — always secure a next step.")

Respond ONLY with valid JSON matching this exact structure:
{
  "opener": <number>,
  "objection_handling": <number>,
  "value_proposition": <number>,
  "next_step": <number>,
  "overall": <number>,
  "done_well": ["<string>", "<string>", "<string>"],
  "to_improve": ["<string>", "<string>", "<string>"],
  "verdict": "<string>"
}`;

export async function POST(request: Request) {
  try {
    const { transcript, persona_id }: ScoreRequest = await request.json();

    if (!transcript || transcript.length === 0) {
      return Response.json(
        { error: "No transcript provided" },
        { status: 400 }
      );
    }

    const persona = await getPersona(persona_id);
    const personaContext = persona
      ? `\nThe prospect was "${persona.name}" (${persona.title} at ${persona.company}). Persona type: ${persona.disposition}\nWin condition: ${persona.winCondition}`
      : "";

    // Format transcript for Claude
    const formattedTranscript = transcript
      .map(
        (entry) =>
          `[${entry.speaker === "rep" ? "Agent" : "Prospect"}] ${entry.text}`
      )
      .join("\n");

    const response = await getAnthropic().messages.create({
      model: "claude-sonnet-5",
      max_tokens: 1024,
      // Keeps content[0] a text block so the JSON parsing below works.
      thinking: { type: "disabled" },
      messages: [
        {
          role: "user",
          content: `${SCORING_PROMPT}${personaContext}\n\n--- TRANSCRIPT ---\n${formattedTranscript}\n--- END TRANSCRIPT ---`,
        },
      ],
    });

    // Extract the text response
    const text =
      response.content[0].type === "text" ? response.content[0].text : "";

    // Parse the JSON from Claude's response
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return Response.json(
        { error: "Failed to parse score from AI response" },
        { status: 500 }
      );
    }

    const score: ScoreResult = JSON.parse(jsonMatch[0]);

    return Response.json(score);
  } catch (err) {
    console.error("Score endpoint error:", err);
    return Response.json(
      { error: "Failed to generate score" },
      { status: 500 }
    );
  }
}
