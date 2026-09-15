import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { Download, ImagePlus, Loader2, RotateCcw, Undo2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";

interface PaintColor {
  id: string;
  code: string;
  name: string;
  hex: string;
  collection: string;
}

interface Seed {
  x: number;
  y: number;
}

const MAX_EDGE = 1400;
const FEATHER_RADIUS = 2;

/* ------------------------------------------------------------------ */
/* Image helpers                                                       */
/* ------------------------------------------------------------------ */

function loadImageData(file: File): Promise<ImageData> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);

    img.onload = () => {
      URL.revokeObjectURL(url);
      const scale = Math.min(1, MAX_EDGE / Math.max(img.naturalWidth, img.naturalHeight));
      const width = Math.max(1, Math.round(img.naturalWidth * scale));
      const height = Math.max(1, Math.round(img.naturalHeight * scale));

      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;

      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      if (!ctx) return reject(new Error("Could not prepare the photo."));

      ctx.drawImage(img, 0, 0, width, height);
      resolve(ctx.getImageData(0, 0, width, height));
    };

    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Could not open that photo. Try a JPG or PNG."));
    };

    img.src = url;
  });
}

function hexToRgb(hex: string): [number, number, number] {
  let value = hex.replace("#", "").trim();
  if (value.length === 3) {
    value = value
      .split("")
      .map(c => c + c)
      .join("");
  }
  const int = parseInt(value, 16);
  if (Number.isNaN(int) || value.length !== 6) return [200, 200, 200];
  return [(int >> 16) & 255, (int >> 8) & 255, int & 255];
}

function luminance(r: number, g: number, b: number) {
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/* ------------------------------------------------------------------ */
/* Selection                                                           */
/* ------------------------------------------------------------------ */

/**
 * Scanline flood fill seeded at a single point.
 *
 * Walls shift far more in brightness (shadow, falloff, bounce light) than in
 * hue, so the match test is loose on luminance and tight on chroma. A single
 * RGB distance threshold either stops at the first shadow or bleeds into the
 * furniture.
 */
function floodFill(
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
  seed: Seed,
  tolerance: number,
  out: Uint8Array
) {
  const seedIndex = (seed.y * width + seed.x) * 4;
  const sr = pixels[seedIndex];
  const sg = pixels[seedIndex + 1];
  const sb = pixels[seedIndex + 2];

  const seedLum = luminance(sr, sg, sb);
  const seedRg = sr - sg;
  const seedGb = sg - sb;

  const lumLimit = tolerance * 1.9;
  const chromaLimit = Math.max(6, tolerance * 0.65);

  const visited = new Uint8Array(width * height);

  const matches = (i: number) => {
    if (visited[i]) return false;
    const p = i * 4;
    const r = pixels[p];
    const g = pixels[p + 1];
    const b = pixels[p + 2];
    if (Math.abs(luminance(r, g, b) - seedLum) > lumLimit) return false;
    if (Math.abs(r - g - seedRg) > chromaLimit) return false;
    if (Math.abs(g - b - seedGb) > chromaLimit) return false;
    return true;
  };

  const stack: number[] = [seed.y * width + seed.x];

  while (stack.length) {
    const index = stack.pop() as number;
    if (visited[index]) continue;
    if (!matches(index)) continue;

    const y = Math.floor(index / width);
    const rowStart = y * width;

    let left = index - rowStart;
    while (left > 0 && matches(rowStart + left - 1)) left--;

    let right = index - rowStart;
    while (right < width - 1 && matches(rowStart + right + 1)) right++;

    for (let x = left; x <= right; x++) {
      visited[rowStart + x] = 1;
      out[rowStart + x] = 1;
    }

    for (const ny of [y - 1, y + 1]) {
      if (ny < 0 || ny >= height) continue;
      const nRow = ny * width;
      let inRun = false;
      for (let x = left; x <= right; x++) {
        const ok = matches(nRow + x);
        if (ok && !inRun) {
          stack.push(nRow + x);
          inRun = true;
        } else if (!ok) {
          inRun = false;
        }
      }
    }
  }
}

/** Separable box blur so the mask edge fades instead of cutting a hard line. */
function feather(mask: Uint8Array, width: number, height: number, radius: number): Float32Array {
  const horizontal = new Float32Array(width * height);
  const result = new Float32Array(width * height);
  const window = radius * 2 + 1;

  for (let y = 0; y < height; y++) {
    const row = y * width;
    let sum = 0;
    for (let x = -radius; x <= radius; x++) {
      sum += mask[row + Math.min(width - 1, Math.max(0, x))];
    }
    for (let x = 0; x < width; x++) {
      horizontal[row + x] = sum / window;
      const drop = row + Math.min(width - 1, Math.max(0, x - radius));
      const add = row + Math.min(width - 1, Math.max(0, x + radius + 1));
      sum += mask[add] - mask[drop];
    }
  }

  for (let x = 0; x < width; x++) {
    let sum = 0;
    for (let y = -radius; y <= radius; y++) {
      sum += horizontal[Math.min(height - 1, Math.max(0, y)) * width + x];
    }
    for (let y = 0; y < height; y++) {
      result[y * width + x] = sum / window;
      const drop = Math.min(height - 1, Math.max(0, y - radius)) * width + x;
      const add = Math.min(height - 1, Math.max(0, y + radius + 1)) * width + x;
      sum += horizontal[add] - horizontal[drop];
    }
  }

  return result;
}

/* ------------------------------------------------------------------ */
/* Component                                                           */
/* ------------------------------------------------------------------ */

export function RoomVisualizer() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const sourceRef = useRef<ImageData | null>(null);
  const maskRef = useRef<Float32Array | null>(null);

  const [colors, setColors] = useState<PaintColor[]>([]);
  const [selectedColor, setSelectedColor] = useState<PaintColor | null>(null);
  const [search, setSearch] = useState("");

  const [hasPhoto, setHasPhoto] = useState(false);
  const [seeds, setSeeds] = useState<Seed[]>([]);
  const [tolerance, setTolerance] = useState(28);
  const [strength, setStrength] = useState(92);
  const [showBefore, setShowBefore] = useState(false);

  const [loadingColors, setLoadingColors] = useState(true);
  const [selecting, setSelecting] = useState(false);

  /* ---------------- catalog ---------------- */

  useEffect(() => {
    let cancelled = false;

    supabase
      .from("paint_colors")
      .select("id,code,name,hex,collection")
      .eq("active", true)
      .order("name")
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) {
          console.error("paint_colors query failed:", error);
          toast.error("Could not load the Sunburst catalog. Refresh to try again.");
        } else {
          const list = (data ?? []) as PaintColor[];
          setColors(list);
          setSelectedColor(list[0] ?? null);
        }
        setLoadingColors(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const filteredColors = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return colors.slice(0, 120);
    return colors
      .filter(
        c =>
          c.name.toLowerCase().includes(q) ||
          c.code.toLowerCase().includes(q) ||
          c.collection.toLowerCase().includes(q)
      )
      .slice(0, 120);
  }, [colors, search]);

  /* ---------------- painting ---------------- */

  const render = useCallback(() => {
    const canvas = canvasRef.current;
    const source = sourceRef.current;
    if (!canvas || !source) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const mask = maskRef.current;

    if (showBefore || !mask || !selectedColor) {
      ctx.putImageData(source, 0, 0);
      return;
    }

    const src = source.data;
    const output = new ImageData(new Uint8ClampedArray(src), source.width, source.height);
    const dst = output.data;

    const [tr, tg, tb] = hexToRgb(selectedColor.hex);
    const opacity = strength / 100;

    // Mean brightness of the selection becomes the reference point, so each
    // pixel keeps its own shading as a ratio against it.
    let sum = 0;
    let count = 0;
    for (let i = 0; i < mask.length; i++) {
      const a = mask[i];
      if (a <= 0.01) continue;
      const p = i * 4;
      sum += luminance(src[p], src[p + 1], src[p + 2]) * a;
      count += a;
    }
    if (!count) {
      ctx.putImageData(source, 0, 0);
      return;
    }
    const mean = sum / count;

    for (let i = 0; i < mask.length; i++) {
      const a = mask[i];
      if (a <= 0.01) continue;

      const p = i * 4;
      const r = src[p];
      const g = src[p + 1];
      const b = src[p + 2];

      // +12 keeps deep shadows from collapsing to pure black.
      const ratio = (luminance(r, g, b) + 12) / (mean + 12);
      const blend = a * opacity;

      dst[p] = r + (Math.min(255, tr * ratio) - r) * blend;
      dst[p + 1] = g + (Math.min(255, tg * ratio) - g) * blend;
      dst[p + 2] = b + (Math.min(255, tb * ratio) - b) * blend;
    }

    ctx.putImageData(output, 0, 0);
  }, [selectedColor, showBefore, strength]);

  /* Rebuild the mask whenever the seeds or tolerance change. */
  useEffect(() => {
    const source = sourceRef.current;
    if (!source) return;

    if (!seeds.length) {
      maskRef.current = null;
      render();
      return;
    }

    setSelecting(true);
    const handle = window.setTimeout(() => {
      const { width, height, data } = source;
      const binary = new Uint8Array(width * height);
      for (const seed of seeds) {
        floodFill(data, width, height, seed, tolerance, binary);
      }
      maskRef.current = feather(binary, width, height, FEATHER_RADIUS);
      setSelecting(false);
      render();
    }, 30);

    return () => window.clearTimeout(handle);
  }, [seeds, tolerance, render]);

  /* Recolor passes are cheap, so color and strength repaint immediately. */
  useEffect(() => {
    render();
  }, [render]);

  /* ---------------- interactions ---------------- */

  const upload = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      toast.error("Choose an image file.");
      return;
    }

    try {
      const imageData = await loadImageData(file);
      sourceRef.current = imageData;
      maskRef.current = null;

      const canvas = canvasRef.current;
      if (canvas) {
        canvas.width = imageData.width;
        canvas.height = imageData.height;
        canvas.getContext("2d")?.putImageData(imageData, 0, 0);
      }

      setSeeds([]);
      setShowBefore(false);
      setHasPhoto(true);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not load that photo.");
    }
  };

  const addSeed = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    const source = sourceRef.current;
    if (!canvas || !source || showBefore) return;

    const rect = canvas.getBoundingClientRect();
    const x = Math.round(((e.clientX - rect.left) / rect.width) * source.width);
    const y = Math.round(((e.clientY - rect.top) / rect.height) * source.height);

    if (x < 0 || y < 0 || x >= source.width || y >= source.height) return;
    setSeeds(prev => [...prev, { x, y }]);
  };

  const download = () => {
    const canvas = canvasRef.current;
    if (!canvas || !hasPhoto) return;

    const wasBefore = showBefore;
    if (wasBefore) setShowBefore(false);

    window.requestAnimationFrame(() => {
      canvas.toBlob(blob => {
        if (!blob) {
          toast.error("Could not export the image.");
          return;
        }
        const slug =
          selectedColor?.name
            .replace(/[^a-z0-9]+/gi, "-")
            .replace(/^-|-$/g, "")
            .toLowerCase() || "sunburst";
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `${slug}-room-preview.png`;
        a.click();
        URL.revokeObjectURL(url);
        if (wasBefore) setShowBefore(true);
      }, "image/png");
    });
  };

  const hasSelection = seeds.length > 0;

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
      <section className="space-y-3">
        <div className="relative flex min-h-80 items-center justify-center overflow-hidden rounded-lg border bg-muted/40">
          {!hasPhoto && (
            <label className="flex min-h-80 w-full cursor-pointer flex-col items-center justify-center gap-3 p-6 text-center">
              <ImagePlus className="h-8 w-8 text-accent" />
              <span className="font-semibold">Add a room photo</span>
              <span className="max-w-md text-sm text-muted-foreground">
                Take a photo or choose one from this device. Everything stays in the browser — the
                photo is never uploaded.
              </span>
              <input
                type="file"
                accept="image/*"
                capture="environment"
                onChange={upload}
                className="hidden"
              />
            </label>
          )}

          <canvas
            ref={canvasRef}
            onPointerDown={addSeed}
            className={`max-h-[680px] w-full touch-manipulation object-contain ${
              hasPhoto ? "cursor-crosshair" : "hidden"
            }`}
          />

          {hasPhoto && !hasSelection && (
            <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-background/85 p-3 text-center text-sm font-medium backdrop-blur-sm">
              Tap the wall to select it
            </div>
          )}

          {selecting && (
            <div className="pointer-events-none absolute right-3 top-3 flex items-center gap-2 rounded-md bg-background/85 px-3 py-1.5 text-xs font-medium backdrop-blur-sm">
              <Loader2 className="h-3.5 w-3.5 animate-spin text-accent" /> Selecting
            </div>
          )}
        </div>

        {hasPhoto && (
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" size="sm" asChild>
              <label className="cursor-pointer">
                <ImagePlus className="mr-1.5 h-4 w-4" /> New photo
                <input
                  type="file"
                  accept="image/*"
                  capture="environment"
                  onChange={upload}
                  className="hidden"
                />
              </label>
            </Button>

            <Button
              variant="outline"
              size="sm"
              disabled={!hasSelection}
              onClick={() => setSeeds(prev => prev.slice(0, -1))}
            >
              <Undo2 className="mr-1.5 h-4 w-4" /> Undo area
            </Button>

            <Button variant="outline" size="sm" disabled={!hasSelection} onClick={() => setSeeds([])}>
              <RotateCcw className="mr-1.5 h-4 w-4" /> Reset
            </Button>

            <Button
              variant="outline"
              size="sm"
              disabled={!hasSelection}
              onClick={() => setShowBefore(v => !v)}
            >
              {showBefore ? "Show after" : "Show before"}
            </Button>

            <Button className="ml-auto" size="sm" disabled={!hasSelection} onClick={download}>
              <Download className="mr-1.5 h-4 w-4" /> Download
            </Button>
          </div>
        )}

        {hasPhoto && (
          <p className="text-xs text-muted-foreground">
            Tap more than once to add adjoining walls. If the color spreads onto furniture, lower the
            edge tolerance; if patches of wall stay unpainted, raise it.
          </p>
        )}
      </section>

      <aside className="space-y-5">
        <div className="space-y-2">
          <Label htmlFor="color-search">Sunburst color</Label>
          <Input
            id="color-search"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search name, code, or collection"
          />

          <div className="max-h-72 overflow-y-auto rounded-md border">
            {loadingColors ? (
              <div className="p-6 text-center text-sm text-muted-foreground">
                <Loader2 className="mx-auto mb-2 h-4 w-4 animate-spin" /> Loading colors
              </div>
            ) : filteredColors.length === 0 ? (
              <div className="p-6 text-center text-sm text-muted-foreground">
                No colors match that search.
              </div>
            ) : (
              filteredColors.map(color => (
                <button
                  key={color.id}
                  type="button"
                  onClick={() => setSelectedColor(color)}
                  className={`flex w-full items-center gap-3 border-b p-2.5 text-left last:border-0 ${
                    selectedColor?.id === color.id ? "bg-accent/10" : "hover:bg-muted/60"
                  }`}
                >
                  <span
                    className="h-9 w-9 shrink-0 rounded border"
                    style={{ backgroundColor: color.hex }}
                  />
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-semibold">{color.name}</span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {color.code} · {color.collection}
                    </span>
                  </span>
                </button>
              ))
            )}
          </div>
        </div>

        <div className="space-y-2">
          <div className="flex items-baseline justify-between">
            <Label htmlFor="tolerance">Edge tolerance</Label>
            <span className="text-xs text-muted-foreground">{tolerance}</span>
          </div>
          <Slider
            id="tolerance"
            min={6}
            max={70}
            step={1}
            value={[tolerance]}
            onValueChange={([v]) => setTolerance(v)}
            disabled={!hasPhoto}
          />
        </div>

        <div className="space-y-2">
          <div className="flex items-baseline justify-between">
            <Label htmlFor="strength">Paint strength</Label>
            <span className="text-xs text-muted-foreground">{strength}%</span>
          </div>
          <Slider
            id="strength"
            min={20}
            max={100}
            step={1}
            value={[strength]}
            onValueChange={([v]) => setStrength(v)}
            disabled={!hasPhoto}
          />
        </div>

        {selectedColor && (
          <div className="rounded-lg border bg-muted/30 p-4 text-sm">
            <div className="flex items-center gap-3">
              <span
                className="h-10 w-10 shrink-0 rounded border"
                style={{ backgroundColor: selectedColor.hex }}
              />
              <div className="min-w-0">
                <p className="truncate font-semibold">{selectedColor.name}</p>
                <p className="truncate text-muted-foreground">
                  {selectedColor.code} · {selectedColor.hex.toUpperCase()}
                </p>
              </div>
            </div>
            <p className="mt-3 text-muted-foreground">
              The preview keeps the room's original light and shadow, so the painted wall reads
              darker in corners than the flat swatch.
            </p>
          </div>
        )}
      </aside>
    </div>
  );
}
