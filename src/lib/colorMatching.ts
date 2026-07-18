import { supabase } from "@/integrations/supabase/client";

export type ColorInputMethod = "hexRgb" | "name" | "photo";

export interface RGB {
  r: number;
  g: number;
  b: number;
}

export interface PaintColor {
  id: string;
  name: string;
  code: string;
  hex: string;
  collection: string;
}

export interface MatchResult {
  color: PaintColor;
  deltaE: number;
  matchLabel: "Excellent Match" | "Very Good Match" | "Good Match" | "Close Match";
}

/** Kept for backwards compatibility with earlier callers. */
export interface SunburstColor {
  id: string;
  name: string;
  base_color: string;
  product_sku?: string;
}

export function hexToRgb(hex: string): RGB | null {
  const clean = hex.replace(/^#/, "");
  if (!/^[0-9a-fA-F]{6}$/.test(clean)) return null;
  return {
    r: parseInt(clean.slice(0, 2), 16),
    g: parseInt(clean.slice(2, 4), 16),
    b: parseInt(clean.slice(4, 6), 16),
  };
}

export function rgbToHex(rgb: RGB): string {
  const to2 = (n: number) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, "0");
  return `${to2(rgb.r)}${to2(rgb.g)}${to2(rgb.b)}`;
}

export function parseHexOrRgbInput(input: string): RGB | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith("#") || /^[0-9a-fA-F]{6}$/.test(trimmed)) {
    return hexToRgb(trimmed.startsWith("#") ? trimmed : `#${trimmed}`);
  }
  const parts = trimmed.split(/[,\s]+/).map((p) => parseInt(p, 10));
  if (parts.length === 3 && parts.every((n) => Number.isFinite(n) && n >= 0 && n <= 255)) {
    return { r: parts[0], g: parts[1], b: parts[2] };
  }
  return null;
}

export async function getRgbFromColorName(_name: string): Promise<RGB> {
  throw new Error("Color-name lookup is not configured. Use hex/RGB or upload a photo.");
}

export async function getRgbFromImage(_base64: string, _mime: string): Promise<RGB> {
  throw new Error("Photo color detection is not configured. Use hex/RGB input.");
}

function rgbDistance(a: RGB, b: RGB): number {
  const dr = a.r - b.r;
  const dg = a.g - b.g;
  const db = a.b - b.b;
  return Math.sqrt(dr * dr + dg * dg + db * db);
}

function labelForDistance(d: number): MatchResult["matchLabel"] {
  if (d < 15) return "Excellent Match";
  if (d < 30) return "Very Good Match";
  if (d < 60) return "Good Match";
  return "Close Match";
}

export function matchColorToPalette(target: RGB, palette: PaintColor[]): MatchResult[] {
  const scored = palette
    .map((color) => {
      const rgb = hexToRgb(color.hex);
      if (!rgb) return null;
      const d = rgbDistance(target, rgb);
      return { color, deltaE: d, matchLabel: labelForDistance(d) };
    })
    .filter((v): v is MatchResult => v !== null)
    .sort((a, b) => a.deltaE - b.deltaE);
  return scored.slice(0, 6);
}

export async function fetchActivePalette(): Promise<PaintColor[]> {
  const { data, error } = await supabase
    .from("paint_colors")
    .select("id,name,code,hex,collection")
    .eq("active", true);
  if (error) throw new Error(error.message);
  return (data ?? []) as PaintColor[];
}
