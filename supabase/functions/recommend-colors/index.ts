// AI color advisor. Runs server-side so no AI keys are exposed to the browser.
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(obj: unknown, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const body = await req.json().catch(() => ({}));
    const imageBase64 = typeof body.imageBase64 === "string" ? body.imageBase64 : "";
    const mimeType = typeof body.mimeType === "string" ? body.mimeType : "image/jpeg";
    const roomType = typeof body.roomType === "string" ? body.roomType.slice(0, 100) : "";
    const style = typeof body.style === "string" ? body.style.slice(0, 100) : "";
    const notes = typeof body.notes === "string" ? body.notes.slice(0, 1000) : "";

    if (imageBase64.length < 20 || imageBase64.length > 8_000_000) {
      return json({ error: "A room photo is required (max ~6MB)." }, 400);
    }
    if (!/^image\/(jpeg|png|webp)$/.test(mimeType)) {
      return json({ error: "Unsupported image type." }, 400);
    }
    if (!roomType || !style) {
      return json({ error: "Room type and style are required." }, 400);
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) return json({ error: "AI gateway not configured" }, 500);

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SRK = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const palRes = await fetch(
      `${SUPABASE_URL}/rest/v1/paint_colors?select=id,code,name,hex,collection,recommended_use&active=eq.true&limit=80`,
      { headers: { apikey: SRK, Authorization: `Bearer ${SRK}` } },
    );
    if (!palRes.ok) return json({ error: "Failed to load palette" }, 502);
    const palette: Array<Record<string, string>> = await palRes.json();

    const paletteContext = palette
      .map((p) => `ID:${p.id} NAME:${p.name} HEX:${p.hex} USE:${p.recommended_use ?? "general"}`)
      .join("\n");

    const prompt = `You are an expert paint color consultant for Sunburst Paints in Nassau, Bahamas.
Analyze this room photo and recommend exactly 3 paint colors from the palette below.

ROOM TYPE: ${roomType}
STYLE PREFERENCE: ${style}
NOTES: ${notes}

SUNBURST PALETTE (use ONLY these IDs):
${paletteContext}

Return ONLY valid JSON:
{"recommendations":[{"id":"exact_id","role":"primary","finish":"Satin","reason":"one sentence"},{"id":"exact_id","role":"accent","finish":"Eggshell","reason":"one sentence"},{"id":"exact_id","role":"trim","finish":"Semi-Gloss","reason":"one sentence"}]}

Rules: every id must exist in the palette; exactly 3 items; consider Caribbean light and humid tropical climates.`;

    const aiRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: prompt },
              { type: "image_url", image_url: { url: `data:${mimeType};base64,${imageBase64}` } },
            ],
          },
        ],
        response_format: { type: "json_object" },
      }),
    });

    if (aiRes.status === 429) return json({ error: "AI rate limit reached — please try again shortly." }, 429);
    if (!aiRes.ok) {
      console.error("AI gateway error", aiRes.status, await aiRes.text());
      return json({ error: "Could not generate recommendations" }, 502);
    }

    const aiJson = await aiRes.json();
    let parsed: { recommendations?: Array<Record<string, string>> } = {};
    try {
      parsed = JSON.parse(aiJson.choices?.[0]?.message?.content ?? "{}");
    } catch {
      parsed = {};
    }

    const enriched = (parsed.recommendations ?? [])
      .filter((r) => r && palette.some((p) => p.id === r.id))
      .map((r) => ({ ...r, color: palette.find((p) => p.id === r.id) }));

    return json({ recommendations: enriched });
  } catch (e) {
    console.error(e);
    return json({ error: "Internal error" }, 500);
  }
});
