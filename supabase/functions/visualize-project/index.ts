// Repaints the selected surface (walls, ceiling, trim, roof, or walls+roof)
// in an uploaded project photo using Gemini's native image-editing model
// ("Nano Banana"), via the same Lovable AI Gateway used elsewhere in this
// app. Runs server-side so no AI keys reach the browser.
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

const SURFACE_LABELS: Record<string, string> = {
  walls: "walls",
  ceiling: "ceiling",
  trim: "trim (doors, window frames, and baseboards)",
  roof: "roof",
  "walls-and-roof": "walls and roof/ceiling",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const body = await req.json().catch(() => ({}));
    const imageBase64 = typeof body.imageBase64 === "string" ? body.imageBase64 : "";
    const mimeType = typeof body.mimeType === "string" ? body.mimeType : "image/jpeg";
    const projectType = body.projectType === "exterior" ? "exterior" : "interior";
    const surfaceKey = typeof body.surface === "string" && body.surface in SURFACE_LABELS ? body.surface : "walls";
    const color = body.color && typeof body.color === "object" ? body.color : null;
    const colorHex = typeof color?.hex === "string" ? color.hex : "";
    const colorName = typeof color?.name === "string" ? color.name.slice(0, 100) : "the selected color";

    if (imageBase64.length < 20 || imageBase64.length > 12_000_000) {
      return json({ error: "A project photo is required (max ~9MB)." }, 400);
    }
    if (!/^#?[0-9a-fA-F]{6}$/.test(colorHex.replace("#", ""))) {
      return json({ error: "A valid SunBurst color is required." }, 400);
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) return json({ error: "AI gateway not configured" }, 500);

    const hex = colorHex.startsWith("#") ? colorHex : `#${colorHex}`;
    const surfaceLabel = SURFACE_LABELS[surfaceKey];
    const prompt = `Edit this photo of an ${projectType} project: repaint only the ${surfaceLabel} in the color "${colorName}" (hex ${hex}). Keep every other element of the photo identical \u2014 same layout, furniture or landscaping, flooring, other surfaces not mentioned, windows, doors, lighting, shadows, camera angle, and perspective. Do not add, remove, or move any objects. Return only the edited photograph, photorealistic, no text or watermark.`;

    const aiRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash-image",
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: prompt },
              { type: "image_url", image_url: { url: `data:${mimeType};base64,${imageBase64}` } },
            ],
          },
        ],
        modalities: ["image", "text"],
      }),
    });

    if (aiRes.status === 429) return json({ error: "AI rate limit reached \u2014 please try again shortly." }, 429);
    if (!aiRes.ok) {
      console.error("AI gateway error", aiRes.status, await aiRes.text());
      return json({ error: "Could not generate the visualization" }, 502);
    }

    const aiJson = await aiRes.json();
    const message = aiJson?.choices?.[0]?.message;

    // Gemini image-output responses commonly surface the result in one of a
    // few shapes depending on gateway/version; check the likely spots.
    let dataUrl: string | null = null;
    if (Array.isArray(message?.images) && message.images[0]?.image_url?.url) {
      dataUrl = message.images[0].image_url.url;
    } else if (Array.isArray(message?.content)) {
      const imagePart = message.content.find((p: { type?: string; image_url?: { url?: string } }) => p?.type === "image_url" || p?.image_url?.url);
      if (imagePart?.image_url?.url) dataUrl = imagePart.image_url.url;
    }

    if (!dataUrl) {
      console.error("No image in AI response", JSON.stringify(aiJson).slice(0, 500));
      return json({ error: "The AI didn't return an image. Try a different photo or color." }, 502);
    }

    const match = /^data:([^;]+);base64,(.+)$/.exec(dataUrl);
    if (!match) return json({ error: "Unexpected image format from the AI." }, 502);
    const [, returnedMimeType, returnedBase64] = match;

    return json({ imageBase64: returnedBase64, mimeType: returnedMimeType });
  } catch (e) {
    console.error(e);
    return json({ error: e instanceof Error ? e.message : "Internal error" }, 500);
  }
});
