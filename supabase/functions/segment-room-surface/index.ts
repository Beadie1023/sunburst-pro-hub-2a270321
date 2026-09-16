// Uses Gemini 2.5's native image-segmentation capability (available via the
// same Lovable AI Gateway used elsewhere in this app) to find every instance
// of a named surface (all walls, the ceiling, the roof, exterior siding) in
// an uploaded photo, and returns one segmentation mask per instance. This
// replaces pixel-color/edge-based guessing with real detection, so a single
// click can cover every wall in the room at once, even ones separated by a
// corner or doorway that a flood-fill could never safely cross.
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

const SURFACE_PROMPTS: Record<string, string> = {
  wall: "every interior wall surface (do not include the ceiling, floor, doors, windows, furniture, or trim)",
  ceiling: "the ceiling only (do not include the walls, floor, or light fixtures)",
  roof: "the roof surface of the building, as seen from outside (do not include walls, windows, gutters, or landscaping)",
  "exterior-wall": "every exterior wall/siding surface of the building (do not include the roof, windows, doors, trim, or landscaping)",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const body = await req.json().catch(() => ({}));
    const imageBase64 = typeof body.imageBase64 === "string" ? body.imageBase64 : "";
    const mimeType = typeof body.mimeType === "string" ? body.mimeType : "image/jpeg";
    const surface = typeof body.surface === "string" && body.surface in SURFACE_PROMPTS ? body.surface : "wall";

    if (imageBase64.length < 20 || imageBase64.length > 12_000_000) {
      return json({ error: "A room photo is required (max ~9MB)." }, 400);
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) return json({ error: "AI gateway not configured" }, 500);

    const target = SURFACE_PROMPTS[surface];
    const prompt = `Give the segmentation masks for ${target} in this photo. There may be more than one separate instance (for example, several walls at different angles) \u2014 include one entry per separate visible surface. Output ONLY a JSON array (no markdown, no explanation) where each entry has exactly these keys: "box_2d" (the 2D bounding box as [ymin, xmin, ymax, xmax], normalized to 0-1000), and "mask" (the segmentation mask for that box, as a base64-encoded PNG grayscale image cropped to the box, where light pixels are the surface and dark pixels are not). If none are visible, output an empty array.`;

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
      return json({ error: "Could not detect surfaces in that photo" }, 502);
    }

    const aiJson = await aiRes.json();
    let content = aiJson?.choices?.[0]?.message?.content ?? "[]";
    if (typeof content === "string") {
      content = content.trim().replace(/^```json/i, "").replace(/^```/, "").replace(/```$/, "").trim();
    }

    let masks: Array<{ box_2d?: number[]; mask?: string }> = [];
    try {
      const parsed = typeof content === "string" ? JSON.parse(content) : content;
      // The model may wrap the array in an object (e.g. { "masks": [...] }) despite
      // instructions; handle both a bare array and the first array-valued property.
      if (Array.isArray(parsed)) {
        masks = parsed;
      } else if (parsed && typeof parsed === "object") {
        const firstArray = Object.values(parsed).find((v) => Array.isArray(v));
        if (Array.isArray(firstArray)) masks = firstArray;
      }
    } catch {
      masks = [];
    }

    const cleaned = masks
      .filter((m) => Array.isArray(m.box_2d) && m.box_2d.length === 4 && typeof m.mask === "string")
      .map((m) => ({
        box_2d: m.box_2d as number[],
        mask: (m.mask as string).replace(/^data:image\/[a-z]+;base64,/, ""),
      }));

    return json({ masks: cleaned });
  } catch (e) {
    console.error(e);
    return json({ error: e instanceof Error ? e.message : "Internal error" }, 500);
  }
});
