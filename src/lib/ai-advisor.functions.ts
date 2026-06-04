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
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_PUBLISHABLE_KEY;
    if (!supabaseUrl || !supabaseKey) throw new Error("Supabase env missing");

    // Fetch the active palette from your Supabase instance
    const palRes = await fetch(
      `${supabaseUrl}/rest/v1/paint_colors?select=id,code,name,hex,collection,recommended_use&active=eq.true`,
      { headers: { apikey: supabaseKey, Authorization: `Bearer ${supabaseKey}` } },
    );
    if (!palRes.ok) throw new Error("Failed to load palette");
    const palette = (await palRes.json()) as Array<{
      id: string; code: string; name: string; hex: string; collection: string; recommended_use: string | null;
    }>;

    // 🌐 Redirecting directly to your permanent live Render backend
    const baseUrl = "https://sunburst-b88c.onrender.com"; 

    const aiRes = await fetch(`${baseUrl}/api/color-match`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        roomType: data.roomType,
        style: data.style,
        notes: data.notes || "",
        palette: palette,
        image: `data:${data.mimeType};base64,${data.imageBase64}`
      }),
    });

    if (aiRes.status === 429) throw new Error("AI rate limit reached — please try again in a moment.");
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
