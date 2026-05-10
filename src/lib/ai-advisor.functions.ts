import { createServerFn } from "@tanstack/react-start";
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

export const recommendColors = createServerFn({ method: "POST" })
  .inputValidator((data) => InputSchema.parse(data))
  .handler(async ({ data }) => {
    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) throw new Error("LOVABLE_API_KEY not configured");

    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_PUBLISHABLE_KEY;
    if (!supabaseUrl || !supabaseKey) throw new Error("Supabase env missing");

    // Fetch the active palette
    const palRes = await fetch(
      `${supabaseUrl}/rest/v1/paint_colors?select=id,code,name,hex,collection,recommended_use&active=eq.true`,
      { headers: { apikey: supabaseKey, Authorization: `Bearer ${supabaseKey}` } },
    );
    if (!palRes.ok) throw new Error("Failed to load palette");
    const palette = (await palRes.json()) as Array<{
      id: string; code: string; name: string; hex: string; collection: string; recommended_use: string | null;
    }>;

    // Compress catalog for the model
    const catalogList = palette
      .map((c) => `${c.id}|${c.code}|${c.name}|${c.hex}|${c.collection}`)
      .join("\n");

    const systemPrompt = `You are a senior Bahamian interior color consultant for Sunburst Paints.
Analyze the uploaded photo (lighting, dominant tones, flooring, furniture) and recommend exactly 4 colors strictly from the supplied palette.
Each recommendation must include:
- id (from catalog row)
- role: "primary" | "accent" | "trim"
- finish: one of Matte, Eggshell, Satin, Semi-Gloss
- reason: one short sentence (<= 140 chars) explaining the choice in plain contractor language.
Return ONLY JSON of shape: {"recommendations":[{id,role,finish,reason}, ...4 items]}`;

    const userText = `Room type: ${data.roomType}
Style preference: ${data.style}
Contractor notes: ${data.notes || "(none)"}

Available palette (id|code|name|hex|collection):
${catalogList}`;

    const aiRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: systemPrompt },
          {
            role: "user",
            content: [
              { type: "text", text: userText },
              {
                type: "image_url",
                image_url: { url: `data:${data.mimeType};base64,${data.imageBase64}` },
              },
            ],
          },
        ],
        response_format: { type: "json_object" },
      }),
    });

    if (aiRes.status === 429) throw new Error("AI rate limit reached — please try again in a moment.");
    if (aiRes.status === 402) throw new Error("AI credits exhausted — please add credits in workspace settings.");
    if (!aiRes.ok) {
      const t = await aiRes.text();
      throw new Error(`AI request failed: ${aiRes.status} ${t.slice(0, 200)}`);
    }

    const aiJson = await aiRes.json();
    const content = aiJson?.choices?.[0]?.message?.content ?? "{}";
    let parsed: { recommendations?: Recommendation[] } = {};
    try { parsed = JSON.parse(content); } catch { parsed = {}; }
    const recs = (parsed.recommendations ?? []).filter((r) => r && palette.some((p) => p.id === r.id));

    // Hydrate with full color info
    const enriched = recs.map((r) => {
      const c = palette.find((p) => p.id === r.id)!;
      return { ...r, color: c };
    });

    return { recommendations: enriched };
  });
