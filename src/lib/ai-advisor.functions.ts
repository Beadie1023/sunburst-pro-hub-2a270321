import { z } from "zod";

const InputSchema = z.object({
  imageBase64: z.string().min(20),
  mimeType: z.string().default("image/jpeg"),
  roomType: z.string().min(1),
  style: z.string().min(1),
  notes: z.string().optional().default(""),
});

interface Recommendation {
  id: string;
  role: "primary" | "accent" | "trim";
  finish: string;
  reason: string;
}

export async function recommendColors(input: any) {
  // 1. Extract payload safely whether it's wrapped in .data or sent directly
  const payloadToValidate = input && typeof input === "object" && "data" in input ? input.data : input;

  // 2. Run client-side validation against the payload
  const data = InputSchema.parse(payloadToValidate);

  // 3. Fetch Supabase configurations using Lovable's exact client variable signatures
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  const supabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
  const geminiApiKey = import.meta.env.VITE_GEMINI_API_KEY;

  if (!supabaseUrl || !supabaseKey) {
    throw new Error("Supabase client environment variables are missing");
  }
  if (!geminiApiKey) {
    throw new Error("Gemini API key not configured");
  }

  // Fetch the active palette directly from your Supabase instance via client
  const palRes = await fetch(
    `${supabaseUrl}/rest/v1/paint_colors?select=id,code,name,hex,collection,recommended_use&active=eq.true`,
    { headers: { apikey: supabaseKey, Authorization: `Bearer ${supabaseKey}` } },
  );
  if (!palRes.ok) throw new Error("Failed to load palette from Supabase");

  const palette = (await palRes.json()) as Array<{
    id: string; code: string; name: string; hex: string; collection: string; recommended_use: string | null;
  }>;

  // 4. Build the Gemini prompt using a trimmed palette to stay under token limits
  const paletteContext = palette
    .slice(0, 80)
    .map((p) => `ID:${p.id} NAME:${p.name} HEX:${p.hex} USE:${p.recommended_use ?? "general"}`)
    .join("\n");

  const prompt = `
You are an expert paint color consultant
for Sunburst Paints in Nassau, Bahamas.
Analyze this room photo and recommend exactly
3 paint colors from the Sunburst palette below.

ROOM TYPE: ${data.roomType}
STYLE PREFERENCE: ${data.style}
NOTES: ${data.notes}

SUNBURST PALETTE (use ONLY these IDs):
${paletteContext}

Return ONLY valid JSON - no markdown, no explanation:
{
  "recommendations": [
    {
      "id": "exact_id_from_palette",
      "role": "primary",
      "finish": "Satin",
      "reason": "One sentence why this works for this space"
    },
    {
      "id": "exact_id_from_palette",
      "role": "accent",
      "finish": "Eggshell",
      "reason": "One sentence why this works"
    },
    {
      "id": "exact_id_from_palette",
      "role": "trim",
      "finish": "Semi-Gloss",
      "reason": "One sentence why this works"
    }
  ]
}

Rules:
- Every id must exist exactly in the palette above
- Return exactly 3 recommendations
- primary covers main walls
- accent covers feature wall or ceiling
- trim covers doors, windows, baseboards
- Consider Caribbean natural light in your selection
- Favor colors that work in humid tropical climates
`;

  // 5. Send directly to the Gemini vision API
  const geminiRes = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${geminiApiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              {
                inline_data: {
                  mime_type: data.mimeType,
                  data: data.imageBase64,
                },
              },
              { text: prompt },
            ],
          },
        ],
        generationConfig: {
          temperature: 0.3,
          maxOutputTokens: 1024,
        },
      }),
    },
  );

  if (geminiRes.status === 429) throw new Error("AI rate limit reached — please try again in a moment.");
  if (!geminiRes.ok) {
    const t = await geminiRes.text();
    throw new Error(`AI request failed: ${geminiRes.status} ${t.slice(0, 200)}`);
  }

  const geminiJson = await geminiRes.json();

  // 6. Extract content from Gemini response format, stripping markdown fences if present
  let content =
    geminiJson?.candidates?.[0]?.content?.parts?.[0]?.text ?? "{}";

  if (typeof content === "string") {
    content = content
      .trim()
      .replace(/^```json/i, "")
      .replace(/^```/, "")
      .replace(/```$/, "")
      .trim();
  }

  let parsed: { recommendations?: Recommendation[] } = {};
  try {
    parsed = typeof content === "string" ? JSON.parse(content) : content;
  } catch {
    parsed = {};
  }

  const recs = (parsed.recommendations ?? []).filter((r) => r && palette.some((p) => p.id === r.id));

  // 7. Hydrate recommendations back with the full color objects
  const enriched = recs.map((r) => {
    const c = palette.find((p) => p.id === r.id)!;
    return { ...r, color: c };
  });

  return { recommendations: enriched };
}
