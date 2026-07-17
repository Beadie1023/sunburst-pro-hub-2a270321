/**
 * ColorMatcherTool.tsx
 *
 * Shared Color Competitor Matcher component. Rendered at both
 * /pro-hub/color-matcher (contractor dashboard) and
 * /admin/color-matcher (admin dashboard) — same component, same logic,
 * no duplication. Each host route supplies its own `onAddToProject`
 * handler, since "active project" means something different in each
 * dashboard context.
 *
 * Matching now runs entirely against the local data_colors.json catalog
 * via findClosestSunburstColors / findClosestByRgb (Delta E 2000) —
 * Supabase is no longer used for this feature. The Color Name and Photo
 * Upload tabs still call Gemini, but only to extract an { r, g, b } value;
 * the Delta E engine does the final matching either way.
 */

import { useRef, useState } from "react";
import {
  ColorMatch,
  SunburstColor,
  findClosestByRgb,
  findClosestSunburstColors,
} from "../lib/colorMatching";
import "./ColorMatcherTool.css";

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const ACCEPTED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];

type ColorInputMethod = "hexRgb" | "name" | "photo";

interface RGB {
  r: number;
  g: number;
  b: number;
}

export interface ColorMatcherToolProps {
  /**
   * Called when a contractor/admin clicks "Add to Project" on a result card.
   * Receives the full SunburstColor. The host dashboard owns what "active
   * project" means in its context.
   */
  onAddToProject?: (color: SunburstColor) => void;
}

/**
 * Parses a hex string (with or without leading #) into a normalized
 * 6-character hex string (no #), or null if invalid.
 */
function parseHexInput(input: string): string | null {
  const clean = input.trim().replace(/^#/, "");
  return /^[0-9A-Fa-f]{6}$/.test(clean) ? clean : null;
}

/**
 * Parses comma/space-separated RGB text (e.g. "163, 180, 197") into an
 * RGB object, or null if invalid.
 */
function parseRgbInput(input: string): RGB | null {
  const match = input.trim().match(/^(\d{1,3})\s*[, ]\s*(\d{1,3})\s*[, ]\s*(\d{1,3})$/);
  if (!match) return null;
  const [r, g, b] = [Number(match[1]), Number(match[2]), Number(match[3])];
  return [r, g, b].every((n) => n >= 0 && n <= 255) ? { r, g, b } : null;
}

/** Strips markdown code fences from a Gemini text response before JSON parsing. */
function stripMarkdownFences(text: string): string {
  return text
    .trim()
    .replace(/^```json/i, "")
    .replace(/^```/, "")
    .replace(/```$/, "")
    .trim();
}

/**
 * Sends a competitor paint color name to Gemini and returns the RGB
 * values it identifies for that color.
 */
async function getRgbFromColorName(colorName: string): Promise<RGB> {
  const geminiApiKey = import.meta.env.VITE_GEMINI_API_KEY;
  if (!geminiApiKey) throw new Error("Gemini API key not configured");

  const prompt = `You are a paint color expert. 
Convert this paint color name to 
its exact RGB values.
Color: ${colorName}
Return ONLY valid JSON like this:
{"r": 163, "g": 180, "b": 197}
No explanation. No markdown.`;

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${geminiApiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.1, maxOutputTokens: 200 },
      }),
    },
  );

  if (res.status === 429) throw new Error("AI rate limit reached — please try again in a moment.");
  if (!res.ok) throw new Error("Color name not recognized. Try entering a hex code instead.");

  const json = await res.json();
  const text: string | undefined = json?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error("Color name not recognized. Try entering a hex code instead.");

  try {
    const parsed = JSON.parse(stripMarkdownFences(text));
    const { r, g, b } = parsed;
    if (
      typeof r === "number" && typeof g === "number" && typeof b === "number" &&
      [r, g, b].every((n) => n >= 0 && n <= 255)
    ) {
      return { r, g, b };
    }
    throw new Error("invalid shape");
  } catch {
    throw new Error("Color name not recognized. Try entering a hex code instead.");
  }
}

/**
 * Sends a photo of a paint chip or painted wall to Gemini Vision and
 * returns the RGB values it identifies as the dominant paint color.
 */
async function getRgbFromImage(base64Image: string, mimeType: string): Promise<RGB> {
  const geminiApiKey = import.meta.env.VITE_GEMINI_API_KEY;
  if (!geminiApiKey) throw new Error("Gemini API key not configured");

  const prompt = `You are a paint color expert.
Look at this image of a paint chip 
or painted wall.
Identify the dominant paint color.
Return ONLY valid JSON like this:
{"r": 163, "g": 180, "b": 197}
No explanation. No markdown.
Focus on the paint color itself,
ignore shadows, lighting variations,
and surface texture.`;

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${geminiApiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              { inline_data: { mime_type: mimeType, data: base64Image } },
              { text: prompt },
            ],
          },
        ],
        generationConfig: { temperature: 0.1, maxOutputTokens: 200 },
      }),
    },
  );

  if (res.status === 429) throw new Error("AI rate limit reached — please try again in a moment.");
  if (!res.ok) throw new Error("Could not detect a clear paint color. Try a closer photo of the paint chip.");

  const json = await res.json();
  const text: string | undefined = json?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error("Could not detect a clear paint color. Try a closer photo of the paint chip.");

  try {
    const parsed = JSON.parse(stripMarkdownFences(text));
    const { r, g, b } = parsed;
    if (
      typeof r === "number" && typeof g === "number" && typeof b === "number" &&
      [r, g, b].every((n) => n >= 0 && n <= 255)
    ) {
      return { r, g, b };
    }
    throw new Error("invalid shape");
  } catch {
    throw new Error("Could not detect a clear paint color. Try a closer photo of the paint chip.");
  }
}

export function ColorMatcherTool({ onAddToProject }: ColorMatcherToolProps) {
  const [activeMethod, setActiveMethod] = useState<ColorInputMethod>("hexRgb");

  const [hexRgbValue, setHexRgbValue] = useState("");
  const [nameValue, setNameValue] = useState("");

  const [dropzoneActive, setDropzoneActive] = useState(false);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [errors, setErrors] = useState<Record<ColorInputMethod, string | null>>({
    hexRgb: null,
    name: null,
    photo: null,
  });

  const [loading, setLoading] = useState(false);
  const [inputColorHex, setInputColorHex] = useState<string | null>(null);
  const [results, setResults] = useState<ColorMatch[] | null>(null);

  const setError = (method: ColorInputMethod, message: string | null) => {
    setErrors((prev) => ({ ...prev, [method]: message }));
  };

  const runMatchByRgb = async (rgb: RGB) => {
    setLoading(true);
    setInputColorHex(
      "#" + [rgb.r, rgb.g, rgb.b].map((v) => Math.max(0, Math.min(255, v)).toString(16).padStart(2, "0")).join(""),
    );
    setResults(null);
    try {
      const matches = findClosestByRgb(rgb.r, rgb.g, rgb.b);
      setResults(matches);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Something went wrong while matching colors.";
      setError(activeMethod, message);
      setResults(null);
    } finally {
      setLoading(false);
    }
  };

  const runMatchByHex = async (hex: string) => {
    setLoading(true);
    setInputColorHex(`#${hex}`);
    setResults(null);
    try {
      const matches = findClosestSunburstColors(hex);
      setResults(matches);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Something went wrong while matching colors.";
      setError(activeMethod, message);
      setResults(null);
    } finally {
      setLoading(false);
    }
  };

  const handleHexRgbSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("hexRgb", null);

    const asHex = parseHexInput(hexRgbValue);
    if (asHex) {
      await runMatchByHex(asHex);
      return;
    }

    const asRgb = parseRgbInput(hexRgbValue);
    if (asRgb) {
      await runMatchByRgb(asRgb);
      return;
    }

    setError("hexRgb", "Enter a valid hex code (e.g. #A3B4C5) or RGB values (e.g. 163, 180, 197).");
  };

  const handleNameSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("name", null);

    if (!nameValue.trim()) {
      setError("name", "Enter a competitor color name.");
      return;
    }

    setLoading(true);
    try {
      const rgb = await getRgbFromColorName(nameValue.trim());
      await runMatchByRgb(rgb);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Color name not recognized. Try entering a hex code instead.";
      setError("name", message);
      setLoading(false);
    }
  };

  const readFileAsBase64 = (file: File): Promise<string> =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result as string;
        resolve(result.split(",")[1] ?? "");
      };
      reader.onerror = () => reject(new Error("Could not read the image file."));
      reader.readAsDataURL(file);
    });

  const handlePhotoFile = async (file: File) => {
    setError("photo", null);

    if (!ACCEPTED_IMAGE_TYPES.includes(file.type)) {
      setError("photo", "Please upload a JPG, PNG, or WEBP image.");
      return;
    }
    if (file.size > MAX_IMAGE_BYTES) {
      setError("photo", "Image is too large. Please upload a file under 5MB.");
      return;
    }

    setPhotoPreview(URL.createObjectURL(file));
    setLoading(true);
    try {
      const base64 = await readFileAsBase64(file);
      const rgb = await getRgbFromImage(base64, file.type);
      await runMatchByRgb(rgb);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Could not detect a clear paint color. Try a closer photo of the paint chip.";
      setError("photo", message);
      setLoading(false);
    }
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDropzoneActive(false);
    const file = e.dataTransfer.files?.[0];
    if (file) handlePhotoFile(file);
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handlePhotoFile(file);
  };

  const switchMethod = (method: ColorInputMethod) => {
    setActiveMethod(method);
    setResults(null);
    setInputColorHex(null);
  };

  return (
    <div className="color-matcher">
      <div className="color-matcher__tabs" role="tablist" aria-label="Color input method">
        <button
          type="button"
          role="tab"
          aria-selected={activeMethod === "hexRgb"}
          className={`color-matcher__tab ${activeMethod === "hexRgb" ? "color-matcher__tab--active" : ""}`}
          onClick={() => switchMethod("hexRgb")}
        >
          Hex / RGB
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeMethod === "name"}
          className={`color-matcher__tab ${activeMethod === "name" ? "color-matcher__tab--active" : ""}`}
          onClick={() => switchMethod("name")}
        >
          Color Name
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeMethod === "photo"}
          className={`color-matcher__tab ${activeMethod === "photo" ? "color-matcher__tab--active" : ""}`}
          onClick={() => switchMethod("photo")}
        >
          Photo Upload
        </button>
      </div>

      {activeMethod === "hexRgb" && (
        <form className="color-matcher__input-panel" onSubmit={handleHexRgbSubmit}>
          <label className="color-matcher__label" htmlFor="color-matcher-hexrgb">
            Competitor color (hex or RGB)
          </label>
          <input
            id="color-matcher-hexrgb"
            className="color-matcher__text-input"
            type="text"
            placeholder="#A3B4C5 or 163, 180, 197"
            value={hexRgbValue}
            onChange={(e) => setHexRgbValue(e.target.value)}
          />
          <span className="color-matcher__hint">Accepts a hex code or comma-separated RGB values.</span>
          {errors.hexRgb && <span className="color-matcher__error">{errors.hexRgb}</span>}
          <button type="submit" className="btn-primary" disabled={loading}>
            Find Matches
          </button>
        </form>
      )}

      {activeMethod === "name" && (
        <form className="color-matcher__input-panel" onSubmit={handleNameSubmit}>
          <label className="color-matcher__label" htmlFor="color-matcher-name">
            Competitor color name
          </label>
          <input
            id="color-matcher-name"
            className="color-matcher__text-input"
            type="text"
            placeholder='e.g. "Accessible Beige SW 7036"'
            value={nameValue}
            onChange={(e) => setNameValue(e.target.value)}
          />
          {errors.name && <span className="color-matcher__error">{errors.name}</span>}
          <button type="submit" className="btn-primary" disabled={loading}>
            Find Matches
          </button>
        </form>
      )}

      {activeMethod === "photo" && (
        <div className="color-matcher__input-panel">
          <span className="color-matcher__label">Paint chip or wall photo</span>
          <div
            className={`color-matcher__dropzone ${dropzoneActive ? "color-matcher__dropzone--active" : ""}`}
            onDragOver={(e) => {
              e.preventDefault();
              setDropzoneActive(true);
            }}
            onDragLeave={() => setDropzoneActive(false)}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") fileInputRef.current?.click();
            }}
          >
            {photoPreview ? (
              <img src={photoPreview} alt="Uploaded paint chip preview" className="color-matcher__dropzone-preview" />
            ) : (
              <span className="color-matcher__dropzone-text">
                Drag and drop a photo here, or click to browse (JPG, PNG, WEBP — up to 5MB)
              </span>
            )}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              onChange={handleFileInputChange}
              style={{ display: "none" }}
            />
          </div>
          {errors.photo && <span className="color-matcher__error">{errors.photo}</span>}
        </div>
      )}

      {loading && (
        <div className="color-matcher__loading" role="status">
          <span className="color-matcher__spinner" aria-hidden="true" />
          Analyzing color...
        </div>
      )}

      {!loading && results && inputColorHex && (
        <div className="color-matcher__results-grid">
          {results.map((match) => (
            <div key={match.color.id} className="card-sunburst">
              <div className="color-matcher__swatch-row">
                <div className="color-matcher__swatch-col">
                  <div
                    className="color-matcher__swatch"
                    style={{ backgroundColor: inputColorHex }}
                  />
                  <span className="color-matcher__swatch-label">Your Color</span>
                </div>
                <div className="color-matcher__swatch-col">
                  <div
                    className="color-matcher__swatch"
                    style={{ backgroundColor: match.color.base_color }}
                  />
                  <span className="color-matcher__swatch-label">Sunburst Match</span>
                </div>
              </div>

              <div className="color-matcher__match-details">
                <span className="color-matcher__match-name">{match.color.name}</span>
                <span className="color-matcher__match-theme">{match.color.theme}</span>
                <span className="color-matcher__match-sku">{match.color.product_sku}</span>
                {match.color.is_sunburst_exclusive && (
                  <span className="color-matcher__exclusive-badge">Sunburst Exclusive</span>
                )}
                <span className="color-matcher__delta-score">Match score: {match.deltaE.toFixed(2)}</span>
              </div>

              {onAddToProject && (
                <button
                  type="button"
                  className="btn-primary"
                  onClick={() => onAddToProject(match.color)}
                >
                  Add to Project
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
