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
 * MATCHING SOURCES:
 * - Hex/RGB tab: matched entirely client-side against the local
 *   data_colors.json catalog via findClosestSunburstColors /
 *   findClosestByRgb (Delta E). No network call, no Gemini key needed.
 * - Color Name tab: calls the existing server endpoint
 *   POST /api/colors/match-competitor, which holds the Gemini API key
 *   server-side (GEMINI_API_KEY, no VITE_ prefix) and returns its own
 *   Delta-E-ranked matches. No Gemini key is ever exposed to the browser.
 * - Photo Upload tab: NOT WIRED. /api/colors/match-competitor only
 *   accepts a text `input_color` field — it has no image/vision
 *   handling. This tab currently shows an explanatory inline error
 *   instead of silently failing or reintroducing a client-side Gemini
 *   vision call. See the note above handlePhotoFile.
 *
 * Regardless of source, every match is normalized into the same
 * MatchedColor shape before it reaches state or onAddToProject, so the
 * result cards and the "Add to Project" callback don't need to know
 * which tab produced the match.
 */

import { useRef, useState } from "react";
import {
  ColorMatch,
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

/**
 * Normalized shape for a single result card, regardless of whether it
 * came from the local Delta E catalog match or the server's Gemini-backed
 * competitor matcher. This is also the exact shape passed to
 * onAddToProject.
 */
export interface MatchedColor {
  id: string;
  name: string;
  hex: string;
  product_sku: string;
  theme: string;
  /** 0-100, higher = closer match. See scoreFromDeltaE for how the
   * local path derives this so it's comparable to the server's score. */
  matchScore: number;
  /** Only known for local catalog matches; the server endpoint doesn't
   * return this field, so it's omitted (and the badge hidden) for
   * Color Name tab results. */
  isExclusive?: boolean;
}

export interface ColorMatcherToolProps {
  /**
   * Called when a contractor/admin clicks "Add to Project" on a result card.
   * The host dashboard owns what "active project" means in its context.
   */
  onAddToProject?: (color: MatchedColor) => void;
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

/** Ensures a hex string has a leading #, or returns null if empty/undefined. */
function normalizeHex(hex?: string | null): string | null {
  if (!hex) return null;
  return hex.startsWith("#") ? hex : `#${hex}`;
}

/**
 * Converts a Delta E distance into the same 0-100 "match confidence"
 * scale used by /api/colors/match-competitor (matchScore = higher is
 * better), so local and server-sourced results read consistently in
 * the UI. Formula matches the server's exactly:
 * Math.max(40, 100 - deltaE * 1.5).
 */
function scoreFromDeltaE(deltaE: number): number {
  return parseFloat(Math.max(40, 100 - deltaE * 1.5).toFixed(1));
}

/** Converts a local Delta-E-based ColorMatch into the shared MatchedColor shape. */
function fromLocalMatch(m: ColorMatch): MatchedColor {
  return {
    id: m.color.id,
    name: m.color.name,
    hex: m.color.base_color,
    product_sku: m.color.product_sku,
    theme: m.color.theme,
    matchScore: scoreFromDeltaE(m.deltaE),
    isExclusive: m.color.is_sunburst_exclusive,
  };
}

/**
 * Calls the server's competitor color matcher for a free-text color name
 * (e.g. "Accessible Beige SW 7036"). The server resolves the name via
 * Gemini (using its own GEMINI_API_KEY) and returns Delta-E-ranked
 * Sunburst matches — no Gemini key touches the browser.
 *
 * @throws {Error} with a user-facing message if the request fails or
 * the response can't be interpreted as a valid match list.
 */
async function fetchServerMatches(inputColor: string): Promise<{ resolvedHex: string; matches: MatchedColor[] }> {
  const res = await fetch("/api/colors/match-competitor", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ input_color: inputColor }),
  });

  if (res.status === 429) throw new Error("AI rate limit reached — please try again in a moment.");
  if (!res.ok) throw new Error("Color name not recognized. Try entering a hex code instead.");

  const json = await res.json();
  if (!json?.success || !Array.isArray(json.matches) || json.matches.length === 0) {
    throw new Error("Color name not recognized. Try entering a hex code instead.");
  }

  const resolvedHex = normalizeHex(json.resolved_competitor?.hex) ?? "#808080";

  const matches: MatchedColor[] = json.matches.slice(0, 3).map((m: any) => ({
    id: m.id,
    name: m.name,
    hex: normalizeHex(m.hex) ?? "#FFFFFF",
    product_sku: m.sku,
    theme: m.theme ?? "",
    matchScore: typeof m.matchScore === "number" ? m.matchScore : 0,
    // is_sunburst_exclusive is not part of this endpoint's response shape.
  }));

  return { resolvedHex, matches };
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
  const [results, setResults] = useState<MatchedColor[] | null>(null);

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
      const matches = findClosestByRgb(rgb.r, rgb.g, rgb.b).map(fromLocalMatch);
      setResults(matches);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Something went wrong while matching colors.";
      setError("hexRgb", message);
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
      const matches = findClosestSunburstColors(hex).map(fromLocalMatch);
      setResults(matches);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Something went wrong while matching colors.";
      setError("hexRgb", message);
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
    setResults(null);
    try {
      const { resolvedHex, matches } = await fetchServerMatches(nameValue.trim());
      setInputColorHex(resolvedHex);
      setResults(matches);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Color name not recognized. Try entering a hex code instead.";
      setError("name", message);
      setResults(null);
    } finally {
      setLoading(false);
    }
  };

  /**
   * NOTE: Photo matching is intentionally not wired to a backend call.
   * /api/colors/match-competitor only accepts a text `input_color` field —
   * it has no image/base64 parameter, so there is nothing to call here.
   * This validates the file (for a good UX) and then surfaces a clear
   * explanatory error rather than silently failing or sending image
   * data to an endpoint that ignores it.
   */
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
    setError(
      "photo",
      "Photo matching isn't available yet — the server doesn't have an image-matching endpoint. Try the Color Name or Hex/RGB tab instead.",
    );
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
            <div key={match.id} className="card-sunburst">
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
                    style={{ backgroundColor: match.hex }}
                  />
                  <span className="color-matcher__swatch-label">Sunburst Match</span>
                </div>
              </div>

              <div className="color-matcher__match-details">
                <span className="color-matcher__match-name">{match.name}</span>
                {match.theme && <span className="color-matcher__match-theme">{match.theme}</span>}
                <span className="color-matcher__match-sku">{match.product_sku}</span>
                {match.isExclusive && (
                  <span className="color-matcher__exclusive-badge">Sunburst Exclusive</span>
                )}
                <span className="color-matcher__delta-score">Match confidence: {match.matchScore.toFixed(2)}%</span>
              </div>

              {onAddToProject && (
                <button
                  type="button"
                  className="btn-primary"
                  onClick={() => onAddToProject(match)}
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
