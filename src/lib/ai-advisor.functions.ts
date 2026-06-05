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

// Input type inference matching your old schema structure
type RecommendColorsInput = z.infer<typeof InputSchema>;

export async function recommendColors(input: RecommendColorsInput) {
  // 1. Client-side Validation
  const data = InputSchema.parse(input);

  // 2. Fetch Supabase configurations using Vite's client-exposed variables
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
  
  if (!supabaseUrl || !supabaseKey) {
    throw new Error("Supabase client environment variables are missing");
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

  // 3. Define the Render URL (using Vite environment var with hardcoded fallback)
  const renderApiUrl = import.meta.env.VITE_RENDER_API_URL || "https://sunburst-b88c.onrender.com";

  // 4. Send directly to your Render backend, completely bypassing Lovable's proxy bridge
  const aiRes = await fetch(`${renderApiUrl}/api/color-match`, {
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
  
  // 5. Parse response content safely
  let content = "{}";
  if (aiJson?.choices?.[0]?.message?.content) {
    content = aiJson.choices[0].message.content;
  } else if (aiJson?.ai_response) {
    content = aiJson.ai_response;
  }

  let parsed: { recommendations?: Recommendation[] } = {};
  try { 
    parsed = typeof content === "string" ? JSON.parse(content) : content; 
  } catch { 
    parsed = {}; 
  }
  
  const recs = (parsed.recommendations ?? []).filter((r) => r && palette.some((p) => p.id === r.id));

  // 6. Hydrate recommendations back with the full color objects
  const enriched = recs.map((r) => {
    const c = palette.find((p) => p.id === r.id)!;
    return { ...r, color: c };
  });

  return { recommendations: enriched };
}
