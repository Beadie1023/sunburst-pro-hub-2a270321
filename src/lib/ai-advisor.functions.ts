import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const InputSchema = z.object({
  imageBase64: z.string().min(20),
  mimeType: z.string().default("image/jpeg"),
  roomType: z.string().min(1),
  style: z.string().min(1),
  notes: z.string().optional().default(""),
});

interface DetectedColor {
  hex: string;
  confidence: number;
  reason: string;
}

interface MatchedColor {
  id: string;
  code: string;
  name: string;
  hex: string;
  collection: string;
  detectedHex: string;
  confidence: number;
  colorDifference: number;
  role: "primary" | "accent" | "trim";
  reason: string;
}

// Helper: Convert hex to RGB
function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result ? {
    r: parseInt(result[1], 16),
    g: parseInt(result[2], 16),
    b: parseInt(result[3], 16),
  } : { r: 255, g: 255, b: 255 };
}

// Helper: Calculate Delta E (CIE76) color difference
function calculateColorDistance(hex1: string, hex2: string): number {
  const rgb1 = hexToRgb(hex1);
  const rgb2 = hexToRgb(hex2);
  
  const dR = rgb1.r - rgb2.r;
  const dG = rgb1.g - rgb2.g;
  const dB = rgb1.b - rgb2.b;
  
  return Math.sqrt(dR * dR + dG * dG + dB * dB);
}

// Helper: Find nearest color in palette
function findNearestColors(
  detectedColors: DetectedColor[],
  palette: Array<{ id: string; code: string; name: string; hex: string; collection: string }>
): MatchedColor[] {
  return detectedColors
    .map((detected, idx) => {
      const matches = palette
        .map((color) => ({
          ...color,
          detectedHex: detected.hex,
          colorDifference: calculateColorDistance(detected.hex, color.hex),
          confidence: detected.confidence,
          reason: detected.reason,
          role: idx === 0 ? "primary" : idx === 1 ? "accent" : "trim",
        }))
        .sort((a, b) => a.colorDifference - b.colorDifference)
        .slice(0, 1)[0];
      
      return matches;
    })
    .filter((m) => m);
}

export const recommendColors = createServerFn({ method: "POST" })
  .inputValidator((data) => InputSchema.parse(data))
  .handler(async ({ data }) => {
    try {
      const supabaseUrl = process.env.SUPABASE_URL;
      const supabaseKey = process.env.SUPABASE_PUBLISHABLE_KEY;
      if (!supabaseUrl || !supabaseKey) {
        throw new Error("Supabase env missing");
      }

      // Fetch the active palette from Supabase
      const palRes = await fetch(
        `${supabaseUrl}/rest/v1/paint_colors?select=id,code,name,hex,collection&active=eq.true&limit=1300`,
        {
          headers: {
            apikey: supabaseKey,
            Authorization: `Bearer ${supabaseKey}`,
          },
        }
      );

      if (!palRes.ok) {
        const errText = await palRes.text();
        throw new Error(`Failed to load palette: ${palRes.status} ${errText.slice(0, 100)}`);
      }

      const palette = (await palRes.json()) as Array<{
        id: string;
        code: string;
        name: string;
        hex: string;
        collection: string;
      }>;

      if (!palette || palette.length === 0) {
        throw new Error("Palette is empty - no colors available in Supabase");
      }

      // Call Gemini Vision API
      const geminiApiKey = process.env.GEMINI_API_KEY;
      if (!geminiApiKey) {
        throw new Error("Gemini API key missing");
      }

      const geminiRes = await fetch("https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": geminiApiKey,
        },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                {
                  text: `You are a professional paint color analyst. Analyze this image and detect the 3 dominant paint colors present.

Context:
- Room Type: ${data.roomType}
- Style: ${data.style}
- Notes: ${data.notes || "None"}

For each color detected, provide:
1. HEX code (e.g., #A9C4D6)
2. Confidence (0-100%)
3. Visual role (primary wall color / accent / trim)
4. Brief reason (e.g., "Main wall surface lighting")

Return ONLY valid JSON in this exact format (no markdown, no backticks):
{
  "colors": [
    { "hex": "#RRGGBB", "confidence": 85, "reason": "Main wall color under warm lighting" },
    { "hex": "#RRGGBB", "confidence": 60, "reason": "Accent or trim area" },
    { "hex": "#RRGGBB", "confidence": 40, "reason": "Shadow or secondary surface" }
  ]
}

CRITICAL: Return ONLY the JSON object. No explanation. No other text.`,
                },
                {
                  inlineData: {
                    mimeType: data.mimeType,
                    data: data.imageBase64,
                  },
                },
              ],
            },
          ],
        }),
      });

      if (!geminiRes.ok) {
        const errText = await geminiRes.text();
        throw new Error(`Gemini request failed: ${geminiRes.status} ${errText.slice(0, 200)}`);
      }

      const geminiJson = await geminiRes.json();
      
      // Extract content from Gemini response
      let detectedContent = "{}";
      if (geminiJson?.candidates?.[0]?.content?.parts?.[0]?.text) {
        detectedContent = geminiJson.candidates[0].content.parts[0].text;
      }

      // Parse detected colors
      let detectedColors: DetectedColor[] = [];
      try {
        const cleanedContent = detectedContent.replace(/```json|```/g, "").trim();
        const parsed = JSON.parse(cleanedContent);
        if (parsed.colors && Array.isArray(parsed.colors)) {
          detectedColors = parsed.colors.map((c: any) => ({
            hex: c.hex || "#CCCCCC",
            confidence: c.confidence || 50,
            reason: c.reason || "Color detected",
          }));
        }
      } catch (parseError) {
        console.error("Gemini response parse error:", parseError, "Raw content:", detectedContent);
        throw new Error(`Invalid Gemini response format: ${detectedContent.slice(0, 100)}`);
      }

      if (detectedColors.length === 0) {
        throw new Error("No colors detected in image");
      }

      // Match detected colors to Sunburst palette
      const matched = findNearestColors(detectedColors, palette);

      if (matched.length === 0) {
        throw new Error("Could not match detected colors to Sunburst palette");
      }

      return {
        success: true,
        recommendations: matched,
        detectedCount: detectedColors.length,
        paletteSize: palette.length,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error("Color match error:", errorMessage);
      return {
        success: false,
        error: errorMessage,
        recommendations: [],
      };
    }
  });
