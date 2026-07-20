// Resolves a competitor color name (e.g. "Sherwin Williams Mindful Gray") to a
// hex value via Lovable AI Gateway, then returns the closest Sunburst matches
// using Delta-E (CIE76 Lab). No API keys exposed to the client.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface SunburstColor {
  id: string;
  name: string;
  theme: string;
  base_color: string;
  product_sku: string;
  is_sunburst_exclusive?: boolean;
}

function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const c = hex.replace(/^#/, "");
  if (!/^[0-9a-fA-F]{6}$/.test(c)) return null;
  return {
    r: parseInt(c.slice(0, 2), 16),
    g: parseInt(c.slice(2, 4), 16),
    b: parseInt(c.slice(4, 6), 16),
  };
}
function srgbLin(c: number) { const v = c / 255; return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }
function rgbToLab({ r, g, b }: { r: number; g: number; b: number }) {
  const R = srgbLin(r), G = srgbLin(g), B = srgbLin(b);
  let x = (R * 0.4124 + G * 0.3576 + B * 0.1805) / 0.95047;
  let y = (R * 0.2126 + G * 0.7152 + B * 0.0722);
  let z = (R * 0.0193 + G * 0.1192 + B * 0.9505) / 1.08883;
  const f = (t: number) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  const fx = f(x), fy = f(y), fz = f(z);
  return { L: 116 * fy - 16, a: 500 * (fx - fy), b: 200 * (fy - fz) };
}
function deltaE(a: any, b: any) {
  const la = rgbToLab(a), lb = rgbToLab(b);
  const dL = la.L - lb.L, dA = la.a - lb.a, dB = la.b - lb.b;
  return Math.sqrt(dL * dL + dA * dA + dB * dB);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { input_color } = await req.json();
    if (!input_color || typeof input_color !== "string") {
      return new Response(JSON.stringify({ error: "input_color required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      return new Response(JSON.stringify({ error: "AI gateway not configured" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Ask Gemini to resolve name -> hex
    const aiRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: "You resolve competitor paint color names to hex codes. Reply with JSON only." },
          { role: "user", content: `Resolve this competitor paint color to its representative hex code: "${input_color}". Return JSON: {"hex":"#RRGGBB","name":"official name","brand":"brand"}` },
        ],
        response_format: { type: "json_object" },
      }),
    });

    if (aiRes.status === 429) {
      return new Response(JSON.stringify({ error: "Rate limit reached" }), {
        status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!aiRes.ok) {
      const txt = await aiRes.text();
      console.error("AI gateway error", aiRes.status, txt);
      return new Response(JSON.stringify({ error: "Could not resolve color name" }), {
        status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const aiJson = await aiRes.json();
    let resolved: any = {};
    try {
      resolved = JSON.parse(aiJson.choices?.[0]?.message?.content ?? "{}");
    } catch {
      resolved = {};
    }
    const hex: string | undefined = resolved.hex;
    const rgb = hex ? hexToRgb(hex) : null;
    if (!rgb) {
      return new Response(JSON.stringify({ error: "Color name not recognized" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Load active Sunburst palette
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SRK = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const palRes = await fetch(
      `${SUPABASE_URL}/rest/v1/paint_colors?select=id,name,code,hex,collection&active=eq.true`,
      { headers: { apikey: SRK, Authorization: `Bearer ${SRK}` } },
    );
    const palette: any[] = palRes.ok ? await palRes.json() : [];

    const scored = palette
      .map((c) => {
        const rgb2 = hexToRgb(c.hex ?? "");
        if (!rgb2) return null;
        return { c, d: deltaE(rgb, rgb2) };
      })
      .filter((x): x is { c: any; d: number } => !!x)
      .sort((a, b) => a.d - b.d)
      .slice(0, 3);

    const matches = scored.map(({ c, d }) => ({
      id: c.id,
      name: c.name,
      hex: c.hex,
      sku: c.code,
      theme: c.collection ?? "",
      matchScore: parseFloat(Math.max(40, 100 - d * 1.5).toFixed(1)),
    }));

    return new Response(
      JSON.stringify({
        success: true,
        resolved_competitor: { hex: resolved.hex, name: resolved.name, brand: resolved.brand },
        matches,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    console.error(e);
    return new Response(JSON.stringify({ error: "Internal error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
