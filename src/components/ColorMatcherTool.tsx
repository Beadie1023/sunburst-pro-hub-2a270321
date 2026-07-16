/**
 * ColorMatcherTool.tsx
 *
 * Shared Color Competitor Matcher component. Rendered at both
 * /pro-hub/color-matcher (contractor dashboard) and
 * /admin/color-matcher (admin dashboard) — same component, same logic,
 * no duplication. Each host route supplies its own `onAddToProject`
 * handler, since "active project" means something different in each
 * dashboard context.
 */

import { useCallback, useRef, useState } from "react";
import {
  ColorInputMethod,
  MatchResult,
  PaintColor,
  RGB,
  fetchActivePalette,
  getRgbFromColorName,
  getRgbFromImage,
  matchColorToPalette,
  parseHexOrRgbInput,
  rgbToHex,
} from "../lib/colorMatching";
import "./ColorMatcherTool.css";

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const ACCEPTED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];

export interface ColorMatcherToolProps {
  /**
   * Called when a contractor/admin clicks "Add to Project" on a result card.
   * The host dashboard owns what "active project" means in its context.
   */
  onAddToProject?: (match: MatchResult) => void;
}

function deltaBadgeClass(label: MatchResult["matchLabel"]): string {
  switch (label) {
    case "Excellent Match":
      return "color-matcher__delta-badge color-matcher__delta-badge--excellent";
    case "Very Good Match":
      return "color-matcher__delta-badge color-matcher__delta-badge--very-good";
    case "Good Match":
      return "color-matcher__delta-badge color-matcher__delta-badge--good";
    default:
      return "color-matcher__delta-badge color-matcher__delta-badge--close";
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
  const [inputRgb, setInputRgb] = useState<RGB | null>(null);
  const [results, setResults] = useState<MatchResult[] | null>(null);

  const setError = (method: ColorInputMethod, message: string | null) => {
    setErrors((prev) => ({ ...prev, [method]: message }));
  };

  const runMatch = useCallback(async (rgb: RGB) => {
    setLoading(true);
    setInputRgb(rgb);
    setResults(null);
    try {
      const palette: PaintColor[] = await fetchActivePalette();
      const matches = matchColorToPalette(rgb, palette);
      setResults(matches);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Something went wrong while matching colors.";
      setError(activeMethod, message);
      setResults(null);
    } finally {
      setLoading(false);
    }
  }, [activeMethod]);

  const handleHexRgbSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("hexRgb", null);

    const parsed = parseHexOrRgbInput(hexRgbValue);
    if (!parsed) {
      setError("hexRgb", "Enter a valid hex code (e.g. #A3B4C5) or RGB values (e.g. 163, 180, 197).");
      return;
    }

    await runMatch(parsed);
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
      await runMatch(rgb);
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
      await runMatch(rgb);
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
    setInputRgb(null);
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

      {!loading && results && inputRgb && (
        <div className="color-matcher__results-grid">
          {results.map((match) => (
            <div key={match.color.id} className="card-sunburst">
              <div className="color-matcher__swatch-row">
                <div className="color-matcher__swatch-col">
                  <div
                    className="color-matcher__swatch"
                    style={{ backgroundColor: `#${rgbToHex(inputRgb)}` }}
                  />
                  <span className="color-matcher__swatch-label">Your Color</span>
                </div>
                <div className="color-matcher__swatch-col">
                  <div
                    className="color-matcher__swatch"
                    style={{ backgroundColor: `#${match.color.hex}` }}
                  />
                  <span className="color-matcher__swatch-label">Sunburst Match</span>
                </div>
              </div>

              <div className="color-matcher__match-details">
                <span className="color-matcher__match-name">{match.color.name}</span>
                <span className="color-matcher__match-code">{match.color.code}</span>
                <span className="color-matcher__match-collection">{match.color.collection}</span>
                <span className={deltaBadgeClass(match.matchLabel)}>{match.matchLabel}</span>
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
