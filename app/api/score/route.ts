import { getAnthropic } from "@/lib/anthropic";
import { getPersona } from "@/lib/db";
import type { TranscriptEntry, ScoreResult } from "@/lib/db";
import type { RepProfile } from "@/lib/rep-profile";

interface ScoreRequest {
  transcript: TranscriptEntry[];
  persona_id: string;
  rep_profile?: RepProfile;
}

const SCORING_PROMPT = `You are an expert call centre trainer evaluating a cold call training session.
The agent was practicing cold calling a cell phone user on behalf of NovaConnect, a mobile service provider, trying to get the prospect to consider switching their phone plan. Evaluate their performance honestly but constructively.

Score each category from 0-10:

1. **Opener** (0-10): Did they clearly identify themselves and NovaConnect? Did they ask permission to continue? Was the opening warm and professional rather than robotic?
2. **Objection Handling** (0-10): How well did they handle consumer pushback (loyalty to current provider, anger about the call, time pressure, skepticism)? Did they acknowledge concerns before pivoting?
3. **Value Proposition** (0-10): Was the pitch specific about savings, coverage, or plan benefits compared to the prospect's current provider? Did they use concrete numbers rather than vague claims?
4. **Next Step** (0-10): Did they secure a callback time, email address, or agreement to receive more information? Did they create a clear reason to follow up?
5. **Overall** (0-10): Composite score considering all factors plus compliance (respecting do-not-call requests, not using pressure tactics, maintaining professionalism throughout).

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
    const { transcript, persona_id, rep_profile }: ScoreRequest = await request.json();

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

    let repContext = "";
    if (rep_profile?.companyName) {
      repContext = `\nThe rep was selling: ${rep_profile.planName} from ${rep_profile.companyName} (${rep_profile.contractType}, ${rep_profile.contractLength}).`;
      repContext += `\nOffer — Data: ${rep_profile.dataAllowance}, Voice: ${rep_profile.voice}, Price: ${rep_profile.monthlyPrice}.`;
      if (rep_profile.currentPromotion) repContext += ` Promotion: ${rep_profile.currentPromotion}.`;
      repContext += `\nEvaluate how accurately the rep described this specific offer.`;
    }

    // Format transcript for Claude
    const formattedTranscript = transcript
      .map(
        (entry) =>
          `[${entry.speaker === "rep" ? "Agent" : "Prospect"}] ${entry.text}`
      )
      .join("\n");

    const response = await getAnthropic().messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 1024,
      messages: [
        {
          role: "user",
          content: `${SCORING_PROMPT}${repContext}${personaContext}\n\n--- TRANSCRIPT ---\n${formattedTranscript}\n--- END TRANSCRIPT ---`,
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
