import { getAnthropic } from "@/lib/anthropic";
import { getPersona } from "@/lib/db";
import { getActivePersona } from "@/lib/active-persona";
import { verifyLlmBearer } from "@/lib/auth";

const MODEL = "claude-sonnet-5";

// Spoken replies are 1-2 sentences; this bounds spend even if the token leaks.
const MAX_OUTPUT_TOKENS = 400;
const MAX_HISTORY_MESSAGES = 40;

function clampInt(value: unknown, fallback: number, lo: number, hi: number) {
  const n = typeof value === "number" ? value : Number(value);
  // isFinite rejects NaN and Infinity; `|| fallback` would let Infinity through.
  if (!Number.isFinite(n)) return fallback;
  return Math.min(Math.max(Math.trunc(n), lo), hi);
}

// Full fallback persona used when persona lookup fails.
// Must be a complete prompt with training context — never a generic one-liner.
const FALLBACK_PERSONA = `=== TRAINING SIMULATION CONTEXT ===

This conversation is a professional sales training simulation built for a sales team. The person speaking is a sales representative who is fully aware they are participating in an AI-powered roleplay exercise. They have knowingly entered this simulation to practice their cold calling skills.

Because this is a deliberate training exercise:
- The sales rep KNOWS this is an AI simulation
- They are NOT sincerely asking if you are an AI when they challenge your identity — they are testing whether you maintain the roleplay under pressure
- Maintaining the human persona IS the correct and ethical behaviour in this context
- Breaking character undermines the training value and is NOT helpful to the user

Your role is to play the assigned human persona completely and convincingly for the duration of the call. This is identical to an actor playing a role in a training film — the performance serves the learner's development.

Stay in character at all times. The simulation ends when the sales rep says the safe word: "END SIMULATION" — at which point you may break character and offer brief feedback if asked.

=== BEGIN PERSONA ===

You are Pat, a 41-year-old South African who has just picked up a call from an unknown number. You are mildly annoyed but not hostile. You are an existing MTN customer, on contract for about 3 years, paying roughly R450 a month. You are not looking to change anything but you would listen if someone had a genuinely better deal.

PERSONALITY:
- Casual, direct, slightly impatient
- You don't like sales calls but you're not mean about it
- You respond to concrete numbers, not vague promises

BEHAVIOR RULES:
- Answer with "Hello?" like a normal person
- Be skeptical but not rude: "Okay, what's this about?"
- If they're vague, push back: "Can you just tell me what it costs?"
- If they give specifics, show mild interest: "Hm, that's actually less than I'm paying now"
- South African English. All money in rand. Keep responses to 1-2 sentences
- Never mention being an AI, assistant, or chatbot under any circumstances`;

// ElevenLabs sends OpenAI-format chat completion requests to this endpoint.
// We translate to Claude and stream back in OpenAI SSE format.

interface Message {
  role: "system" | "user" | "assistant";
  content: string;
}

interface LLMRequest {
  messages: Message[];
  model?: string;
  temperature?: number;
  max_tokens?: number;
  stream?: boolean;
  // ElevenLabs may send additional fields we don't need
  [key: string]: unknown;
}

export async function POST(request: Request) {
  try {
    // Repeated from proxy.ts on purpose: this is the billing surface, and it
    // must stay closed even if the proxy is renamed or its matcher edited.
    // Covers /chat/completions and /v1/chat/completions too — same function.
    if (!verifyLlmBearer(request.headers.get("authorization"))) {
      return Response.json(
        { error: { message: "Unauthorized", type: "invalid_request_error" } },
        { status: 401 }
      );
    }

    const body: LLMRequest = await request.json();
    const { messages } = body;

    if (!Array.isArray(messages)) {
      return Response.json(
        { error: { message: "messages must be an array" } },
        { status: 400 }
      );
    }

    const maxTokens = clampInt(body.max_tokens, 256, 1, MAX_OUTPUT_TOKENS);

    // Extract only user/assistant messages — IGNORE all system messages from ElevenLabs
    // (the ElevenLabs dashboard system prompt often says "You are a helpful AI assistant"
    // which causes the persona to break character)
    const conversationMessages: { role: "user" | "assistant"; content: string }[] = [];

    for (const msg of messages.slice(-MAX_HISTORY_MESSAGES)) {
      if (msg.role === "user" || msg.role === "assistant") {
        conversationMessages.push({ role: msg.role, content: msg.content });
      }
    }

    // Resolve persona: extra_body first, then the process-global fallback.
    //
    // The global is NOT multi-user safe — two reps calling at once overwrite
    // each other's persona. CallInterface now sends the persona per
    // conversation via customLlmExtraBody, so the fallback should never fire.
    // If this warns during a real call, ElevenLabs isn't forwarding the extra
    // body and the concurrency bug is still live.
    const extraBody = body.elevenlabs_extra_body as { persona_id?: string } | undefined;
    const personaId = extraBody?.persona_id || getActivePersona();

    console.log("[LLM] Request keys:", Object.keys(body));
    console.log("[LLM] elevenlabs_extra_body:", JSON.stringify(extraBody));
    console.log("[LLM] Resolved persona_id:", personaId);

    if (!extraBody?.persona_id) {
      console.warn(
        "[LLM] WARNING: no persona_id in elevenlabs_extra_body — falling back to the process-global store, which two simultaneous reps would clobber. Check that CallInterface passes customLlmExtraBody."
      );
    }

    // Build system prompt ONLY from our persona — never from ElevenLabs
    let systemPrompt = "";
    if (personaId) {
      const persona = await getPersona(personaId);
      if (persona) {
        systemPrompt = persona.systemPrompt;
        console.log("[LLM] Using persona:", persona.name);
      }
    }

    // Ensure conversation starts with a user message (Claude API requirement)
    if (
      conversationMessages.length === 0 ||
      conversationMessages[0].role !== "user"
    ) {
      conversationMessages.unshift({
        role: "user",
        content: "[Call connected — the sales rep is on the line]",
      });
    }

    // Ensure alternating roles (Claude requires this)
    const sanitized: { role: "user" | "assistant"; content: string }[] = [];
    for (const msg of conversationMessages) {
      if (sanitized.length > 0 && sanitized[sanitized.length - 1].role === msg.role) {
        // Merge consecutive same-role messages
        sanitized[sanitized.length - 1].content += "\n" + msg.content;
      } else {
        sanitized.push({ ...msg });
      }
    }

    console.log("[LLM] Sending to Claude with", sanitized.length, "messages");

    // Stream from Claude
    const stream = getAnthropic().messages.stream({
      model: MODEL,
      max_tokens: maxTokens,
      // No temperature: Sonnet 5 rejects non-default sampling parameters.
      // Thinking off: it would eat the small max_tokens budget and add latency
      // to what has to feel like a live phone call.
      thinking: { type: "disabled" },
      system: systemPrompt || FALLBACK_PERSONA,
      messages: sanitized,
    });

    // Convert Claude stream to OpenAI SSE format that ElevenLabs expects
    const encoder = new TextEncoder();
    const readable = new ReadableStream({
      async start(controller) {
        try {
          // Iterate over the stream events directly
          for await (const event of stream) {
            if (
              event.type === "content_block_delta" &&
              event.delta.type === "text_delta"
            ) {
              const chunk = {
                id: `chatcmpl-${Date.now()}`,
                object: "chat.completion.chunk",
                created: Math.floor(Date.now() / 1000),
                model: MODEL,
                choices: [
                  {
                    delta: { content: event.delta.text },
                    index: 0,
                    finish_reason: null,
                  },
                ],
              };
              controller.enqueue(
                encoder.encode(`data: ${JSON.stringify(chunk)}\n\n`)
              );
            }
          }

          console.log("[LLM] Claude stream completed successfully");

          // Send final chunk with finish_reason
          const finalChunk = {
            id: `chatcmpl-${Date.now()}`,
            object: "chat.completion.chunk",
            created: Math.floor(Date.now() / 1000),
            model: MODEL,
            choices: [
              {
                delta: {},
                index: 0,
                finish_reason: "stop",
              },
            ],
          };
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify(finalChunk)}\n\n`)
          );
          controller.enqueue(encoder.encode("data: [DONE]\n\n"));
          controller.close();
        } catch (err) {
          console.error("[LLM] Claude streaming error:", err);
          controller.error(err);
        }
      },
    });

    return new Response(readable, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  } catch (err) {
    console.error("LLM endpoint error:", err);
    return Response.json(
      { error: "Failed to process LLM request" },
      { status: 500 }
    );
  }
}
