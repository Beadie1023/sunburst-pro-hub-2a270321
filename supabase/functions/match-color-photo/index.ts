// Identifies the dominant paint/wall color in an uploaded photo as a hex
// code. Runs server-side via the same Lovable AI Gateway used elsewhere in
// this app, so no AI key reaches the browser. The frontend feeds the
// returned hex straight into the existing local Delta-E matcher used by the
// Hex/RGB tab — this function's only job is "what color is this," not
// matching, so there's no matching logic to keep in sync in two places.
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

    if (imageBase64.length < 20 || imageBase64.length > 8_000_000) {
      return json({ error: "A photo is required (max ~6MB)." }, 400);
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) return json({ error: "AI gateway not configured" }, 500);

    const prompt = `This photo shows a paint chip, paint swatch, or painted wall. Identify the single dominant paint color, ignoring shadows, glare, reflections, and any visible background, text, or packaging. Output ONLY a JSON object with one key "hex", whose value is that color as a 6-digit hex code starting with #. Example: {"hex":"#A3B4C5"}`;

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

    if (aiRes.status === 429) return json({ error: "AI rate limit reached \u2014 please try again shortly." }, 429);
    if (!aiRes.ok) {
      console.error("AI gateway error", aiRes.status, await aiRes.text());
      return json({ error: "Could not read a color from that photo." }, 502);
    }

    const aiJson = await aiRes.json();
    let content = aiJson?.choices?.[0]?.message?.content ?? "{}";
    if (typeof content === "string") {
      content = content.trim().replace(/^```json/i, "").replace(/^```/, "").replace(/```$/, "").trim();
    }

    let hex = "";
    try {
      const parsed = typeof content === "string" ? JSON.parse(content) : content;
      hex = typeof parsed?.hex === "string" ? parsed.hex : "";
    } catch {
      hex = "";
    }

    const cleaned = hex.replace("#", "");
    if (!/^[0-9a-fA-F]{6}$/.test(cleaned)) {
      return json({ error: "Could not identify a clear color in that photo. Try a closer, well-lit shot of just the paint." }, 502);
    }

    return json({ hex: `#${cleaned.toUpperCase()}` });
  } catch (e) {
    console.error(e);
    return json({ error: e instanceof Error ? e.message : "Internal error" }, 500);
  }
});
