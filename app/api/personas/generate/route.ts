import { getAnthropic } from "@/lib/anthropic";

const GENERATE_PROMPT = `You are a persona designer for a cold call training simulator. The app trains call centre agents who cold call cell phone users on behalf of "NovaConnect", a mobile service provider, trying to get them to switch.

Generate a complete, realistic prospect persona based on the user's description. The persona should feel like a real person with specific details, natural speech patterns, and believable objections.

IMPORTANT: The system_prompt you generate MUST begin with this exact block:

=== TRAINING SIMULATION CONTEXT ===

This conversation is a professional sales training simulation built for a sales team. The person speaking is a sales representative who is fully aware they are participating in an AI-powered roleplay exercise. They have knowingly entered this simulation to practice their cold calling skills.

Because this is a deliberate training exercise:
- The sales rep KNOWS this is an AI simulation
- They are NOT sincerely asking if you are an AI when they challenge your identity — they are testing whether you maintain the roleplay under pressure
- Maintaining the human persona IS the correct and ethical behaviour in this context
- Breaking character undermines the training value and is NOT helpful to the user

Your role is to play the assigned human persona completely and convincingly for the duration of the call. This is identical to an actor playing a role in a training film — the performance serves the learner's development.

Stay in character at all times. The simulation ends when the sales rep says the safe word: "END SIMULATION" — at which point you may break character and offer brief feedback if asked.

=== BEGIN PERSONA ===

After that block, include the persona description, personality traits, and behavior rules.

All personas must be MALE (the voice agent uses a male voice).

Respond ONLY with valid JSON matching this exact structure:
{
  "id": "<lowercase-hyphenated-slug>",
  "name": "<male full name>",
  "title": "<brief descriptor>",
  "company": "<current provider or situation>",
  "industry": "Consumer Mobile",
  "disposition": "<1-2 sentence description of their attitude>",
  "difficulty": "<easy|medium|hard>",
  "firstMessage": "<what they say when they pick up the phone>",
  "objections": ["<objection 1>", "<objection 2>", "<objection 3>", "<objection 4>", "<objection 5>"],
  "winCondition": "<what the agent needs to achieve to 'win' this call>",
  "coachingTips": [
    {"phase": "opener", "label": "<short label>", "tip": "<specific advice with example words to say>"},
    {"phase": "discovery", "label": "<short label>", "tip": "<specific advice>"},
    {"phase": "objection", "label": "<short label>", "tip": "<specific advice with example words to say>"},
    {"phase": "objection", "label": "<short label>", "tip": "<specific advice>"},
    {"phase": "close", "label": "<short label>", "tip": "<specific advice with example words to say>"}
  ],
  "systemPrompt": "<full system prompt starting with the TRAINING SIMULATION CONTEXT block, then persona details including PERSONALITY and BEHAVIOR RULES sections>"
}`;

export async function POST(request: Request) {
  try {
    const { description, difficulty } = await request.json();

    if (!description) {
      return Response.json(
        { error: "description is required" },
        { status: 400 }
      );
    }

    const response = await getAnthropic().messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 4096,
      messages: [
        {
          role: "user",
          content: `${GENERATE_PROMPT}\n\nGenerate a ${difficulty || "medium"} difficulty persona based on this description:\n"${description}"`,
        },
      ],
    });

    const text =
      response.content[0].type === "text" ? response.content[0].text : "";

    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return Response.json(
        { error: "Failed to generate persona" },
        { status: 500 }
      );
    }

    const persona = JSON.parse(jsonMatch[0]);
    return Response.json(persona);
  } catch (err) {
    console.error("Generate persona error:", err);
    return Response.json(
      { error: "Failed to generate persona" },
      { status: 500 }
    );
  }
}
