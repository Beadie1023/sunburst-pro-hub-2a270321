/**
 * Color matching utilities.
 *
 * Client-side Delta-E matching against the bundled Sunburst catalog
 * (data_colors.json) plus lightweight helpers used by the Color Matcher UI.
 */

import colorsData from "../../data_colors.json";
import { supabase } from "@/integrations/supabase/client";

// ----- Types -----

export interface RGB { r: number; g: number; b: number; }

export interface SunburstColor {
  id: string;
  name: string;
  theme: string;
  base_color: string;
  secondary_color?: string;
  accent_style?: string;
  neutral_tone?: string;
  description?: string;
  is_sunburst_exclusive?: boolean;
  product_sku: string;
}

export interface ColorMatch {
  color: SunburstColor;
  deltaE: number;
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

// ----- Local catalog -----

const CATALOG = colorsData as SunburstColor[];

// ----- Hex/RGB helpers -----

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

// ----- Perceptual Delta E (CIE76 on Lab) -----

function srgbToLinear(c: number): number {
  const v = c / 255;
  return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
}

function rgbToLab(rgb: RGB): { L: number; a: number; b: number } {
  const r = srgbToLinear(rgb.r);
  const g = srgbToLinear(rgb.g);
  const b = srgbToLinear(rgb.b);
  // sRGB → XYZ (D65)
  let x = (r * 0.4124 + g * 0.3576 + b * 0.1805) / 0.95047;
  let y = (r * 0.2126 + g * 0.7152 + b * 0.0722) / 1.0;
  let z = (r * 0.0193 + g * 0.1192 + b * 0.9505) / 1.08883;
  const f = (t: number) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  const fx = f(x), fy = f(y), fz = f(z);
  return { L: 116 * fy - 16, a: 500 * (fx - fy), b: 200 * (fy - fz) };
}

function deltaE(a: RGB, b: RGB): number {
  const la = rgbToLab(a);
  const lb = rgbToLab(b);
  const dL = la.L - lb.L;
  const dA = la.a - lb.a;
  const dB = la.b - lb.b;
  return Math.sqrt(dL * dL + dA * dA + dB * dB);
}

// ----- Public matching APIs -----

export function findClosestByRgb(r: number, g: number, b: number, limit = 3): ColorMatch[] {
  const target: RGB = { r, g, b };
  const scored: ColorMatch[] = [];
  for (const color of CATALOG) {
    const rgb = hexToRgb(color.base_color);
    if (!rgb) continue;
    scored.push({ color, deltaE: deltaE(target, rgb) });
  }
  scored.sort((a, b) => a.deltaE - b.deltaE);
  return scored.slice(0, limit);
}

export function findClosestSunburstColors(hex: string, limit = 3): ColorMatch[] {
  const rgb = hexToRgb(hex.startsWith("#") ? hex : `#${hex}`);
  if (!rgb) return [];
  return findClosestByRgb(rgb.r, rgb.g, rgb.b, limit);
}

// ----- Legacy Supabase palette helpers (kept for existing callers) -----

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
      const d = deltaE(target, rgb);
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
