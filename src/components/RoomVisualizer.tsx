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

interface WallPatch {
  id: string;
  seed: { x: number; y: number };
  mask: Uint8Array;
}

const MAX_IMAGE_EDGE = 1400;

/**
 * Precomputes a per-pixel edge-strength map for one photo. Runs a Sobel
 * filter over a slightly blurred version of each color channel separately
 * (not just combined luminance), then keeps the strongest response at each
 * pixel. Two surfaces can be nearly identical in brightness but clearly
 * different in hue (a beige wall next to beige bedding, for example) — a
 * luminance-only edge map misses that boundary entirely.
 */
function computeEdgeMap(width: number, height: number, data: Uint8ClampedArray): Float32Array {
  const edges = new Float32Array(width * height);
  const channelBlurred = new Float32Array(width * height);
  const gx = [-1, 0, 1, -2, 0, 2, -1, 0, 1];
  const gy = [-1, -2, -1, 0, 0, 0, 1, 2, 1];

  for (let channel = 0; channel < 3; channel += 1) {
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
            sum += data[(ny * width + nx) * 4 + channel];
            count += 1;
          }
        }
        channelBlurred[y * width + x] = sum / count;
      }
    }

    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        let sx = 0;
        let sy = 0;
        let k = 0;
        for (let dy = -1; dy <= 1; dy += 1) {
          const ny = Math.min(height - 1, Math.max(0, y + dy));
          for (let dx = -1; dx <= 1; dx += 1) {
            const nx = Math.min(width - 1, Math.max(0, x + dx));
            const v = channelBlurred[ny * width + nx];
            sx += v * gx[k];
            sy += v * gy[k];
            k += 1;
          }
        }
        const magnitude = Math.sqrt(sx * sx + sy * sy);
        const idx = y * width + x;
        if (magnitude > edges[idx]) edges[idx] = magnitude;
      }
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
 * <canvas>, wall patches are built with a bounded flood-fill over the pixel
 * buffer, and the paint color is blended in using each pixel's own
 * luminance so shadows/highlights/texture survive. The photo is never sent
 * anywhere. The only server round-trip in AI Design Tools remains the
 * separate Color Match flow (recommend-colors).
 *
 * One color for every wall: tapping an unpainted spot adds that connected
 * surface to the set of "wall" patches; tapping an already-painted patch
 * removes just that patch. Every patch shares the same currently-selected
 * color, tolerance, and strength.
 */
export function RoomVisualizer() {
  const sourceCanvasRef = useRef<HTMLCanvasElement>(null);
  const previewCanvasRef = useRef<HTMLCanvasElement>(null);
  const edgeMapRef = useRef<Float32Array | null>(null);
  const nextIdRef = useRef(1);

  const [colors, setColors] = useState<PaintColor[]>([]);
  const [colorsLoading, setColorsLoading] = useState(true);
  const [selectedColor, setSelectedColor] = useState<PaintColor | null>(null);
  const [search, setSearch] = useState("");

  const [photoLoaded, setPhotoLoaded] = useState(false);
  const [tolerance, setTolerance] = useState(38);
  const [strength, setStrength] = useState(72);
  const [patches, setPatches] = useState<WallPatch[]>([]);
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

    if (showPaint && patches.length && selectedColor) {
      const paint = hexToRgb(selectedColor.hex);
      const amount = strength / 100;
      const pixelCount = image.data.length / 4;
      const isWall = new Uint8Array(pixelCount);
      patches.forEach((patch) => {
        for (let pixel = 0; pixel < patch.mask.length; pixel += 1) {
          if (patch.mask[pixel]) isWall[pixel] = 1;
        }
      });

      for (let pixel = 0; pixel < pixelCount; pixel += 1) {
        if (!isWall[pixel]) continue;
        const offset = pixel * 4;
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
  }, [patches, showPaint, selectedColor, strength]);

  useEffect(() => renderPreview(), [renderPreview]);

  const buildMaskFor = useCallback((seed: { x: number; y: number }, toleranceValue: number) => {
    const source = sourceCanvasRef.current;
    const context = source?.getContext("2d", { willReadFrequently: true });
    if (!source || !context) return new Uint8Array(0);
    const { width, height } = source;
    const startPixel = seed.y * width + seed.x;
    const edgeMap = edgeMapRef.current;
    const selected = new Uint8Array(width * height);
    const visited = new Uint8Array(width * height);
    const queue = new Int32Array(width * height);
    let head = 0;
    let tail = 1;
    queue[0] = startPixel;
    visited[startPixel] = 1;

    // "Wall range" controls how strong a brightness/color change has to be
    // before it counts as a real boundary (a corner, trim line, door frame)
    // rather than ordinary shading, shadow, or texture across the wall.
    const effectiveEdgeThreshold = toleranceValue * 3.2;

    // Safety net for photos with very little local contrast: growth is
    // capped both by distance from the tapped point and by total area,
    // independent of how the edge check behaves, since a wall in a room
    // photo is never the entire photo.
    const seedX = seed.x;
    const seedY = seed.y;
    const maxDistance = Math.max(width, height) * 0.5;
    const maxDistanceSq = maxDistance * maxDistance;
    const maxAcceptedPixels = Math.floor(width * height * 0.45);
    let acceptedCount = 0;

    while (head < tail) {
      const pixel = queue[head++];
      selected[pixel] = 1;
      acceptedCount += 1;
      if (acceptedCount >= maxAcceptedPixels) break; // hit the area safety cap
      const px = pixel % width;
      const py = (pixel - px) / width;
      // 8-connected (including diagonals) so unconstrained growth rounds
      // out naturally instead of forming a hard diamond shape.
      const neighbors: number[] = [];
      if (py > 0) neighbors.push(pixel - width);
      if (py < height - 1) neighbors.push(pixel + width);
      if (px > 0) neighbors.push(pixel - 1);
      if (px < width - 1) neighbors.push(pixel + 1);
      if (px > 0 && py > 0) neighbors.push(pixel - width - 1);
      if (px < width - 1 && py > 0) neighbors.push(pixel - width + 1);
      if (px > 0 && py < height - 1) neighbors.push(pixel + width - 1);
      if (px < width - 1 && py < height - 1) neighbors.push(pixel + width + 1);
      for (const neighbor of neighbors) {
        if (neighbor < 0 || neighbor >= visited.length || visited[neighbor]) continue;
        const nx = neighbor % width;
        const ny = (neighbor - nx) / width;
        const dx = nx - seedX;
        const dy = ny - seedY;
        if (dx * dx + dy * dy > maxDistanceSq) continue; // too far from the tapped point to still be the same wall
        visited[neighbor] = 1;
        if (edgeMap) {
          const crossingStrength = Math.max(edgeMap[pixel], edgeMap[neighbor]);
          if (crossingStrength > effectiveEdgeThreshold) continue; // real boundary — do not cross
        }
        queue[tail++] = neighbor;
      }
    }
    return selected;
  }, []);

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
      const scale = Math.min(1, MAX_IMAGE_EDGE / Math.max(image.width, image.height));
      source.width = Math.round(image.width * scale);
      source.height = Math.round(image.height * scale);
      const context = source.getContext("2d", { willReadFrequently: true });
      context?.drawImage(image, 0, 0, source.width, source.height);
      preview.width = source.width;
      preview.height = source.height;
      preview.getContext("2d")?.drawImage(source, 0, 0);

      if (context) {
        const pixels = context.getImageData(0, 0, source.width, source.height);
        edgeMapRef.current = computeEdgeMap(source.width, source.height, pixels.data);
      }

      setPhotoLoaded(true);
      setPatches([]);
      setShowPaint(true);
      URL.revokeObjectURL(url);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      toast.error("Could not open that photo.");
    };
    image.src = url;
  };

  const tapCanvas = (event: MouseEvent<HTMLCanvasElement>) => {
    const canvas = previewCanvasRef.current;
    if (!canvas || !photoLoaded) return;
    const bounds = canvas.getBoundingClientRect();
    const x = Math.max(0, Math.min(canvas.width - 1, Math.floor(((event.clientX - bounds.left) * canvas.width) / bounds.width)));
    const y = Math.max(0, Math.min(canvas.height - 1, Math.floor(((event.clientY - bounds.top) * canvas.height) / bounds.height)));
    const pixel = y * canvas.width + x;

    const hit = patches.find((patch) => patch.mask[pixel]);
    if (hit) {
      setPatches((prev) => prev.filter((patch) => patch.id !== hit.id));
      return;
    }

    if (!selectedColor) {
      toast.error("Colors are still loading — try again in a moment.");
      return;
    }
    const mask = buildMaskFor({ x, y }, tolerance);
    const id = String(nextIdRef.current++);
    setPatches((prev) => [...prev, { id, seed: { x, y }, mask }]);
    setShowPaint(true);
  };

  const clearAllPatches = () => setPatches([]);
  const undoLastPatch = () => setPatches((prev) => prev.slice(0, -1));

  const updateTolerance = (value: number) => {
    setTolerance(value);
    setPatches((prev) => prev.map((patch) => ({ ...patch, mask: buildMaskFor(patch.seed, value) })));
  };

  const download = () => {
    const canvas = previewCanvasRef.current;
    if (!canvas || !photoLoaded) return;
    const link = document.createElement("a");
    const name = (selectedColor?.name ?? "sunburst").replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "");
    link.download = `${name}-room-preview.png`;
    link.href = canvas.toDataURL("image/png");
    link.click();
  };

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_300px]">
      <section className="space-y-3">
        <div className="relative flex min-h-80 items-center justify-center overflow-hidden rounded-lg border border-border bg-muted/40">
          <canvas ref={sourceCanvasRef} className="hidden" />
          <canvas
            ref={previewCanvasRef}
            onClick={tapCanvas}
            className={`max-h-[620px] w-full object-contain ${photoLoaded ? "cursor-crosshair" : "hidden"}`}
            aria-label="Room color preview. Tap a wall to paint it, tap a painted wall to remove it."
          />
          {!photoLoaded && (
            <label className="flex min-h-80 w-full cursor-pointer flex-col items-center justify-center gap-3 text-center">
              <span className="flex h-12 w-12 items-center justify-center rounded-full bg-accent/15 text-accent">
                <ImagePlus className="h-6 w-6" />
              </span>
              <span className="font-semibold text-foreground">Upload or take a room photo</span>
              <span className="max-w-xs text-sm text-muted-foreground">
                Tap the wall you want to paint after uploading. Your photo stays on this device.
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
            <Button variant="outline" size="sm" onClick={undoLastPatch} disabled={!patches.length}>
              <RotateCcw className="mr-1.5 h-4 w-4" />
              Undo last tap
            </Button>
            <Button variant="outline" size="sm" onClick={() => setShowPaint((visible) => !visible)} disabled={!patches.length}>
              {showPaint ? <EyeOff className="mr-1.5 h-4 w-4" /> : <Eye className="mr-1.5 h-4 w-4" />}
              {showPaint ? "Before" : "After"}
            </Button>
            <Button size="sm" onClick={download} disabled={!patches.length} className="ml-auto">
              <Download className="mr-1.5 h-4 w-4" />
              Download
            </Button>
          </div>
        )}

        {patches.length > 0 && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span>{patches.length} {patches.length === 1 ? "area" : "areas"} selected</span>
            <button type="button" onClick={clearAllPatches} className="underline-offset-2 hover:underline">
              Clear all
            </button>
          </div>
        )}

        <p className="text-sm text-muted-foreground">
          {photoLoaded
            ? "Tap each wall you want painted — they'll all share the color you pick. Tap a painted area again to remove it."
            : "No photo is ever uploaded — the preview is rendered locally in your browser."}
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
                  onClick={() => { setSelectedColor(color); setShowPaint(true); }}
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
          <p className="text-xs text-muted-foreground">Applies to every wall you've selected.</p>
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
              onChange={(event) => updateTolerance(Number(event.target.value))}
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
