import { getAnthropic } from "@/lib/anthropic";
import type { RepProfile } from "@/lib/rep-profile";

// POST /api/parse-plan-image — accepts a plan screenshot, returns extracted RepProfile fields
export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const file = formData.get("image") as File | null;
    if (!file) {
      return Response.json({ error: "No image provided" }, { status: 400 });
    }

    const buffer = await file.arrayBuffer();
    const base64 = Buffer.from(buffer).toString("base64");
    const mediaType = (
      ["image/png", "image/jpeg", "image/webp", "image/gif"].includes(file.type)
        ? file.type
        : "image/png"
    ) as "image/png" | "image/jpeg" | "image/webp" | "image/gif";

    const response = await getAnthropic().messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 1024,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image",
              source: { type: "base64", media_type: mediaType, data: base64 },
            },
            {
              type: "text",
              text: `Extract the mobile plan details from this screenshot. Return ONLY a JSON object with these fields (omit any you cannot confidently determine):
{
  "companyName": "the cell/mobile company name",
  "planName": "the plan or offer name",
  "contractType": "Prepaid" or "Postpaid" or "SIM-only",
  "dataAllowance": "total data e.g. 2GB",
  "voice": "voice call allowance e.g. 60 MIN All-Net or Unlimited",
  "sms": "SMS allowance if shown",
  "monthlyPrice": "price e.g. R99/month or R99 once-off",
  "contractLength": "contract term if shown e.g. Month-to-month",
  "currentPromotion": "any promotional offer shown",
  "keySellingPoints": "notable features, comma-separated"
}
Return ONLY the JSON object. No explanation, no markdown fences.`,
            },
          ],
        },
      ],
    });

    const text =
      response.content[0].type === "text" ? response.content[0].text : "{}";
    // Strip markdown code fences if Claude adds them
    const cleaned = text
      .replace(/^```[a-z]*\n?/i, "")
      .replace(/\n?```$/i, "")
      .trim();

    const fields: Partial<RepProfile> = JSON.parse(cleaned);
    return Response.json({ fields });
  } catch (err) {
    console.error("parse-plan-image error:", err);
    return Response.json(
      { error: "Failed to parse image" },
      { status: 500 }
    );
  }
}
