import { NextResponse } from "next/server";
import { z } from "zod";

import { agreementDraftSchema } from "@/lib/agreement-draft";

export const runtime = "nodejs";
export const maxDuration = 30;

const bodySchema = z.object({
  text: z.string().trim().min(10, "Describe the payment in a sentence or two.").max(2000),
});

const instruction = `You turn a plain-language description of a payment into JSON.
Reply with ONLY a JSON object in this exact shape:
{"recipient": string, "amount": integer, "milestones": [{"description": string, "amount": integer}]}

Rules:
- Amounts are whole numbers in the payment token. Treat 1 token as 1 US dollar.
- Convert shorthand: "30k" is 30000, "1 lakh" is 100000, "2.5 lakh" is 250000.
- The milestone amounts must add up exactly to "amount".
- Use between 1 and 10 milestones. Keep each description under 80 characters.
- If no person is named, use "Contractor" as the recipient.
- Never invent amounts that are not in the text.
- If the text does not describe a payment, reply {"error": "Describe who you are paying, the total, and when each payment is released."}`;

// A small per-visitor limit protects the free daily quota.
const hits = new Map<string, number[]>();
function tooMany(ip: string): boolean {
  const now = Date.now();
  const recent = (hits.get(ip) ?? []).filter((time) => now - time < 60_000);
  if (recent.length >= 6) {
    hits.set(ip, recent);
    return true;
  }
  recent.push(now);
  hits.set(ip, recent);
  return false;
}

export async function POST(request: Request) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "The description assistant is not configured on the server." }, { status: 503 });
  }

  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
  if (tooMany(ip)) {
    return NextResponse.json({ error: "Too many requests. Wait a minute, or fill in the form by hand." }, { status: 429 });
  }

  const parsedBody = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsedBody.success) {
    return NextResponse.json({ error: parsedBody.error.issues[0]?.message ?? "Invalid description." }, { status: 400 });
  }

  const model = process.env.GEMINI_MODEL ?? "gemini-flash-latest";

  let reply: unknown;
  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: instruction }] },
          contents: [{ role: "user", parts: [{ text: parsedBody.data.text }] }],
          generationConfig: { responseMimeType: "application/json", temperature: 0.1, maxOutputTokens: 1000 },
        }),
        signal: AbortSignal.timeout(20_000),
      },
    );

    if (!response.ok) {
      console.error("Gemini request failed", response.status, (await response.text()).slice(0, 300));
      return NextResponse.json(
        {
          error:
            response.status === 429
              ? "The free daily limit was reached. Try again later, or fill in the form by hand."
              : "The description service is temporarily unavailable.",
        },
        { status: 502 },
      );
    }
    reply = await response.json();
  } catch (error) {
    console.error("Gemini request error", error);
    return NextResponse.json({ error: "The description service is temporarily unavailable." }, { status: 502 });
  }

  const text = (reply as { candidates?: { content?: { parts?: { text?: string }[] } }[] })
    .candidates?.[0]?.content?.parts?.map((part) => part.text ?? "")
    .join("")
    .replace(/^\s*```(?:json)?/i, "")
    .replace(/```\s*$/, "")
    .trim();

  let candidate: unknown;
  try {
    candidate = JSON.parse(text ?? "");
  } catch {
    return NextResponse.json({ error: "The assistant could not understand that. Try rephrasing, or fill in the form by hand." }, { status: 422 });
  }

  const refusal = (candidate as { error?: unknown } | null)?.error;
  if (typeof refusal === "string") return NextResponse.json({ error: refusal }, { status: 422 });

  const draft = agreementDraftSchema.safeParse(candidate);
  if (!draft.success) {
    return NextResponse.json({ error: "The assistant returned an invalid draft. Please try again." }, { status: 422 });
  }
  const total = draft.data.milestones.reduce((sum, milestone) => sum + milestone.amount, 0);
  if (total !== draft.data.amount) {
    return NextResponse.json(
      { error: "The amounts did not add up to the total. Try rephrasing, or fill in the form by hand." },
      { status: 422 },
    );
  }
  return NextResponse.json({ draft: draft.data });
}