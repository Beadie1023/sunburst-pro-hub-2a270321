import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent, type MouseEvent } from "react";
import { Download, Eye, EyeOff, ImagePlus, Loader2, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface PaintColor {
  id: string;
  code: string;
  name: string;
  hex: string;
  collection: string;
}

const MAX_IMAGE_EDGE = 1400;

// Gradient magnitude above which a pixel boundary is treated as a real
// architectural edge (a corner, trim line, door frame) that the flood-fill
// should never cross, regardless of the Wall range setting. Tuned for
// typical phone photos after a light denoise blur — raise this if the fill
// is stopping too early on textured walls, lower it if it's leaking past
// faint boundaries on flat, evenly-lit walls.
const EDGE_THRESHOLD = 70;

/**
 * Precomputes a per-pixel edge-strength map for one photo. Blurs luminance
 * slightly first (to ignore JPEG noise/grain) then runs a Sobel filter, so
 * only real intensity boundaries — not sensor noise — count as edges.
 */
function computeEdgeMap(width: number, height: number, data: Uint8ClampedArray): Float32Array {
  const luminance = new Float32Array(width * height);
  for (let i = 0; i < width * height; i += 1) {
    const o = i * 4;
    luminance[i] = data[o] * 0.2126 + data[o + 1] * 0.7152 + data[o + 2] * 0.0722;
  }

  const blurred = new Float32Array(width * height);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      let sum = 0;
      let count = 0;
      for (let dy = -1; dy <= 1; dy += 1) {
        const ny = y + dy;
        if (ny < 0 || ny >= height) continue;
        for (let dx = -1; dx <= 1; dx += 1) {
          const nx = x + dx;
          if (nx < 0 || nx >= width) continue;
          sum += luminance[ny * width + nx];
          count += 1;
        }
      }
      blurred[y * width + x] = sum / count;
    }
  }

  const gx = [-1, 0, 1, -2, 0, 2, -1, 0, 1];
  const gy = [-1, -2, -1, 0, 0, 0, 1, 2, 1];
  const edges = new Float32Array(width * height);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      let sx = 0;
      let sy = 0;
      let k = 0;
      for (let dy = -1; dy <= 1; dy += 1) {
        const ny = Math.min(height - 1, Math.max(0, y + dy));
        for (let dx = -1; dx <= 1; dx += 1) {
          const nx = Math.min(width - 1, Math.max(0, x + dx));
          const v = blurred[ny * width + nx];
          sx += v * gx[k];
          sy += v * gy[k];
          k += 1;
        }
      }
      edges[y * width + x] = Math.sqrt(sx * sx + sy * sy);
    }
  }
  return edges;
}

function hexToRgb(hex: string) {
  const normalized = hex.replace("#", "");
  const value = Number.parseInt(
    normalized.length === 3
      ? normalized.split("").map((character) => character + character).join("")
      : normalized,
    16,
  );
  return { red: (value >> 16) & 255, green: (value >> 8) & 255, blue: value & 255 };
}

/**
 * Room Visualizer
 *
 * Everything here runs on-device: the photo is decoded straight into a
 * <canvas>, the wall mask is built with a bounded flood-fill over the pixel
 * buffer, and the paint color is blended in using the pixel's own luminance
 * so shadows/highlights/texture survive. The photo is never sent anywhere —
 * there is no network call in this component. The only server round-trip in
 * AI Design Tools remains the separate Color Match flow (recommend-colors).
 */
export function RoomVisualizer() {
  const sourceCanvasRef = useRef<HTMLCanvasElement>(null);
  const previewCanvasRef = useRef<HTMLCanvasElement>(null);
  // Edge-strength map for the current photo, computed once on load and
  // reused by every flood-fill so re-tapping or changing tolerance stays fast.
  const edgeMapRef = useRef<Float32Array | null>(null);

  const [colors, setColors] = useState<PaintColor[]>([]);
  const [colorsLoading, setColorsLoading] = useState(true);
  const [selectedColor, setSelectedColor] = useState<PaintColor | null>(null);
  const [search, setSearch] = useState("");

  const [photoLoaded, setPhotoLoaded] = useState(false);
  const [tolerance, setTolerance] = useState(38);
  const [strength, setStrength] = useState(72);
  const [seed, setSeed] = useState<{ x: number; y: number } | null>(null);
  const [mask, setMask] = useState<Uint8Array | null>(null);
  const [showPaint, setShowPaint] = useState(true);

  useEffect(() => {
    supabase
      .from("paint_colors")
      .select("id,code,name,hex,collection")
      .eq("active", true)
      .order("name")
      .then(({ data, error }) => {
        if (error) {
          toast.error("Could not load the Sunburst colors.");
        } else {
          const available = (data ?? []) as PaintColor[];
          setColors(available);
          setSelectedColor(available[0] ?? null);
        }
        setColorsLoading(false);
      });
  }, []);

  const filteredColors = useMemo(() => {
    const query = search.trim().toLowerCase();
    return colors
      .filter(
        (color) =>
          !query ||
          color.name.toLowerCase().includes(query) ||
          color.code.toLowerCase().includes(query) ||
          color.collection.toLowerCase().includes(query),
      )
      .slice(0, 100);
  }, [colors, search]);

  const renderPreview = useCallback(() => {
    const source = sourceCanvasRef.current;
    const preview = previewCanvasRef.current;
    if (!source || !preview) return;
    const sourceContext = source.getContext("2d", { willReadFrequently: true });
    const previewContext = preview.getContext("2d");
    if (!sourceContext || !previewContext) return;

    preview.width = source.width;
    preview.height = source.height;
    const image = sourceContext.getImageData(0, 0, source.width, source.height);

    if (showPaint && mask && selectedColor) {
      const paint = hexToRgb(selectedColor.hex);
      const amount = strength / 100;
      for (let pixel = 0; pixel < mask.length; pixel += 1) {
        if (!mask[pixel]) continue;
        const offset = pixel * 4;
        // Preserve the wall's own lighting: scale the paint color by this
        // pixel's original luminance instead of flatly overwriting RGB.
        const luminance =
          (image.data[offset] * 0.2126 + image.data[offset + 1] * 0.7152 + image.data[offset + 2] * 0.0722) / 255;
        const light = 0.35 + luminance * 0.9;
        const targetRed = Math.min(255, paint.red * light);
        const targetGreen = Math.min(255, paint.green * light);
        const targetBlue = Math.min(255, paint.blue * light);
        image.data[offset] = image.data[offset] * (1 - amount) + targetRed * amount;
        image.data[offset + 1] = image.data[offset + 1] * (1 - amount) + targetGreen * amount;
        image.data[offset + 2] = image.data[offset + 2] * (1 - amount) + targetBlue * amount;
      }
    }
    previewContext.putImageData(image, 0, 0);
  }, [mask, selectedColor, showPaint, strength]);

  useEffect(() => renderPreview(), [renderPreview]);

  const buildMask = useCallback(
    (x: number, y: number) => {
      const source = sourceCanvasRef.current;
      const context = source?.getContext("2d", { willReadFrequently: true });
      if (!source || !context) return;
      const { width, height } = source;
      const image = context.getImageData(0, 0, width, height).data;
      const startPixel = y * width + x;
      const startOffset = startPixel * 4;
      const target = [image[startOffset], image[startOffset + 1], image[startOffset + 2]];
      const edgeMap = edgeMapRef.current;
      const selected = new Uint8Array(width * height);
      const visited = new Uint8Array(width * height);
      const queue = new Int32Array(width * height);
      let head = 0;
      let tail = 1;
      queue[0] = startPixel;
      visited[startPixel] = 1;

      // Bounded flood-fill: spreads to neighboring pixels within `tolerance`
      // color distance of the tapped point (so it settles into one wall's
      // overall color range), but is also stopped at any pixel-to-pixel step
      // that crosses a real edge in the photo — a corner, trim line, or door
      // frame — even if both sides happen to be close in raw color. That's
      // what lets a higher Wall range work on flat cream/white rooms without
      // the fill leaking through the ceiling or into a closet opening.
      while (head < tail) {
        const pixel = queue[head++];
        const offset = pixel * 4;
        const distance = Math.sqrt(
          (image[offset] - target[0]) ** 2 + (image[offset + 1] - target[1]) ** 2 + (image[offset + 2] - target[2]) ** 2,
        );
        if (distance > tolerance) continue;
        selected[pixel] = 1;
        const px = pixel % width;
        const neighbors = [pixel - width, pixel + width];
        if (px > 0) neighbors.push(pixel - 1);
        if (px < width - 1) neighbors.push(pixel + 1);
        for (const neighbor of neighbors) {
          if (neighbor < 0 || neighbor >= visited.length || visited[neighbor]) continue;
          visited[neighbor] = 1;
          if (edgeMap) {
            const crossingStrength = Math.max(edgeMap[pixel], edgeMap[neighbor]);
            if (crossingStrength > EDGE_THRESHOLD) continue; // real boundary — do not cross
          }
          queue[tail++] = neighbor;
        }
      }
      setMask(selected);
    },
    [tolerance],
  );

  useEffect(() => {
    if (seed) buildMask(seed.x, seed.y);
  }, [buildMask, seed]);

  const loadPhoto = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast.error("Please choose a photo file.");
      return;
    }

    const image = new Image();
    const url = URL.createObjectURL(file);
    image.onload = () => {
      const source = sourceCanvasRef.current;
      const preview = previewCanvasRef.current;
      if (!source || !preview) return;
      // Downscale before drawing to canvas — keeps flood-fill and pixel
      // blending fast, and this happens entirely in-memory (no upload).
      const scale = Math.min(1, MAX_IMAGE_EDGE / Math.max(image.width, image.height));
      source.width = Math.round(image.width * scale);
      source.height = Math.round(image.height * scale);
      const context = source.getContext("2d", { willReadFrequently: true });
      context?.drawImage(image, 0, 0, source.width, source.height);
      preview.width = source.width;
      preview.height = source.height;
      preview.getContext("2d")?.drawImage(source, 0, 0);

      // Precompute edge strength once per photo so every tap/tolerance
      // change reuses it instead of re-running Sobel each time.
      if (context) {
        const pixels = context.getImageData(0, 0, source.width, source.height);
        edgeMapRef.current = computeEdgeMap(source.width, source.height, pixels.data);
      }

      setPhotoLoaded(true);
      setSeed(null);
      setMask(null);
      setShowPaint(true);
      URL.revokeObjectURL(url);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      toast.error("Could not open that photo.");
    };
    image.src = url;
  };

  const selectWall = (event: MouseEvent<HTMLCanvasElement>) => {
    const canvas = previewCanvasRef.current;
    if (!canvas || !photoLoaded) return;
    const bounds = canvas.getBoundingClientRect();
    setSeed({
      x: Math.max(0, Math.min(canvas.width - 1, Math.floor(((event.clientX - bounds.left) * canvas.width) / bounds.width))),
      y: Math.max(0, Math.min(canvas.height - 1, Math.floor(((event.clientY - bounds.top) * canvas.height) / bounds.height))),
    });
    setShowPaint(true);
  };

  const resetWall = () => {
    setSeed(null);
    setMask(null);
  };

  const download = () => {
    const canvas = previewCanvasRef.current;
    if (!canvas || !photoLoaded) return;
    const link = document.createElement("a");
    const name = selectedColor?.name.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "") || "sunburst";
    link.download = `${name}-room-preview.png`;
    link.href = canvas.toDataURL("image/png");
    link.click();
  };

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_300px]">
      <section className="space-y-3">
        <div className="relative flex min-h-80 items-center justify-center overflow-hidden rounded-lg border border-border bg-muted/40">
          {/* Hidden full-resolution working buffer; the visible canvas is the preview */}
          <canvas ref={sourceCanvasRef} className="hidden" />
          <canvas
            ref={previewCanvasRef}
            onClick={selectWall}
            className={`max-h-[620px] w-full object-contain ${photoLoaded ? "cursor-crosshair" : "hidden"}`}
            aria-label="Room color preview. Tap a wall to paint it."
          />
          {!photoLoaded && (
            <label className="flex min-h-80 w-full cursor-pointer flex-col items-center justify-center gap-3 text-center">
              <span className="flex h-12 w-12 items-center justify-center rounded-full bg-accent/15 text-accent">
                <ImagePlus className="h-6 w-6" />
              </span>
              <span className="font-semibold text-foreground">Upload or take a room photo</span>
              <span className="max-w-xs text-sm text-muted-foreground">
                Use a clear photo where the wall is visible and evenly lit. Your photo stays on this device.
              </span>
              <input type="file" accept="image/*" capture="environment" onChange={loadPhoto} className="hidden" />
            </label>
          )}
        </div>

        {photoLoaded && (
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" size="sm" asChild>
              <label className="cursor-pointer">
                <ImagePlus className="mr-1.5 h-4 w-4" />
                New photo
                <input type="file" accept="image/*" capture="environment" onChange={loadPhoto} className="hidden" />
              </label>
            </Button>
            <Button variant="outline" size="sm" onClick={resetWall} disabled={!mask}>
              <RotateCcw className="mr-1.5 h-4 w-4" />
              Reset wall
            </Button>
            <Button variant="outline" size="sm" onClick={() => setShowPaint((visible) => !visible)} disabled={!mask}>
              {showPaint ? <EyeOff className="mr-1.5 h-4 w-4" /> : <Eye className="mr-1.5 h-4 w-4" />}
              {showPaint ? "Before" : "After"}
            </Button>
            <Button size="sm" onClick={download} disabled={!mask} className="ml-auto">
              <Download className="mr-1.5 h-4 w-4" />
              Download
            </Button>
          </div>
        )}

        <p className="text-sm text-muted-foreground">
          {mask ? "Wall selected. Try colors or adjust the controls below." : photoLoaded ? "Tap the middle of the wall you want to paint." : "No photo is ever uploaded — the preview is rendered locally in your browser."}
        </p>
      </section>

      <aside className="space-y-5">
        <div className="space-y-2">
          <Label htmlFor="color-search">Sunburst color</Label>
          <Input id="color-search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search name, code, or collection" />
          <div className="max-h-72 overflow-y-auto rounded-md border border-border">
            {colorsLoading ? (
              <div className="flex items-center justify-center p-8 text-muted-foreground">
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Loading colors
              </div>
            ) : filteredColors.length ? (
              filteredColors.map((color) => (
                <button
                  key={color.id}
                  type="button"
                  onClick={() => {
                    setSelectedColor(color);
                    setShowPaint(true);
                  }}
                  className={`flex w-full items-center gap-3 border-b border-border p-2.5 text-left last:border-0 ${
                    selectedColor?.id === color.id ? "bg-accent/10" : "hover:bg-muted/60"
                  }`}
                >
                  <span className="h-9 w-9 shrink-0 rounded border border-border" style={{ backgroundColor: color.hex }} />
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-semibold">{color.name}</span>
                    <span className="block text-xs text-muted-foreground">
                      {color.code} · {color.collection}
                    </span>
                  </span>
                </button>
              ))
            ) : (
              <p className="p-5 text-center text-sm text-muted-foreground">No matching colors</p>
            )}
          </div>
        </div>

        <div className="space-y-4 border-t border-border pt-4">
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <Label htmlFor="tolerance">Wall range</Label>
              <span className="text-muted-foreground">{tolerance}</span>
            </div>
            <input
              id="tolerance"
              type="range"
              min="10"
              max="90"
              value={tolerance}
              onChange={(event) => setTolerance(Number(event.target.value))}
              className="w-full accent-accent"
            />
          </div>
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <Label htmlFor="strength">Paint strength</Label>
              <span className="text-muted-foreground">{strength}%</span>
            </div>
            <input
              id="strength"
              type="range"
              min="30"
              max="100"
              value={strength}
              onChange={(event) => setStrength(Number(event.target.value))}
              className="w-full accent-accent"
            />
          </div>
        </div>
      </aside>
    </div>
  );
}
