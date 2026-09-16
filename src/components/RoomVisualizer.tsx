import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent, type MouseEvent } from "react";
import { Download, Eye, EyeOff, ImagePlus, Loader2, Trash2 } from "lucide-react";
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

interface Region {
  id: string;
  seed: { x: number; y: number };
  mask: Uint8Array;
}

const MAX_IMAGE_EDGE = 1400;

// Gradient magnitude above which a pixel boundary counts as a real
// architectural edge (corner, trim line, door frame) the flood-fill must not
// cross. Lower = the fill stops sooner and leaks less into furniture.
const EDGE_THRESHOLD = 70;

// Unpainted patches smaller than this fraction of the photo are treated as
// stray speckle and filled in. Kept small so genuine openings (a doorway, a
// window, a picture frame) are never painted over.
const MAX_HOLE_FRACTION = 0.0015;

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
    normalized.length === 3 ? normalized.split("").map((character) => character + character).join("") : normalized,
    16,
  );
  return { red: (value >> 16) & 255, green: (value >> 8) & 255, blue: value & 255 };
}

/** Fills tiny unpainted speckles inside a selection so the coat looks solid. */
function fillSmallGaps(mask: Uint8Array, width: number, height: number, maxHoleSize: number): Uint8Array {
  const filled = new Uint8Array(mask);
  const visited = new Uint8Array(width * height);
  const queue = new Int32Array(width * height);

  for (let start = 0; start < width * height; start += 1) {
    if (mask[start] || visited[start]) continue;
    let head = 0;
    let tail = 0;
    queue[tail++] = start;
    visited[start] = 1;
    const members: number[] = [start];
    while (head < tail) {
      const pixel = queue[head++];
      const px = pixel % width;
      const py = (pixel - px) / width;
      const neighbors: number[] = [];
      if (px > 0) neighbors.push(pixel - 1);
      if (px < width - 1) neighbors.push(pixel + 1);
      if (py > 0) neighbors.push(pixel - width);
      if (py < height - 1) neighbors.push(pixel + width);
      for (const neighbor of neighbors) {
        if (!mask[neighbor] && !visited[neighbor]) {
          visited[neighbor] = 1;
          queue[tail++] = neighbor;
          members.push(neighbor);
        }
      }
    }
    if (members.length <= maxHoleSize) {
      for (const member of members) filled[member] = 1;
    }
  }

  return filled;
}

/**
 * Color Studio (Room Visualizer)
 *
 * Runs entirely on-device: the photo is decoded into a <canvas>, each tapped
 * wall area is isolated with an edge-aware flood-fill, and the chosen paint is
 * blended in using the pixel's own luminance so light, shadow and texture
 * survive. Nothing is uploaded.
 *
 * One color paints every wall at once: picking a color repaints all tapped
 * wall regions simultaneously.
 */
export function RoomVisualizer() {
  const sourceCanvasRef = useRef<HTMLCanvasElement>(null);
  const previewCanvasRef = useRef<HTMLCanvasElement>(null);
  const edgeMapRef = useRef<Float32Array | null>(null);
  const nextIdRef = useRef(1);

  const [colors, setColors] = useState<PaintColor[]>([]);
  const [colorsLoading, setColorsLoading] = useState(true);
  const [search, setSearch] = useState("");

  const [photoLoaded, setPhotoLoaded] = useState(false);
  const [selectedColor, setSelectedColor] = useState<PaintColor | null>(null);
  const [regions, setRegions] = useState<Region[]>([]);
  const [tolerance, setTolerance] = useState(34);
  const [strength, setStrength] = useState(75);
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
          setColors((data ?? []) as PaintColor[]);
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

    if (showPaint && selectedColor && regions.length) {
      const paint = hexToRgb(selectedColor.hex);
      const amount = strength / 100;
      for (const region of regions) {
        for (let pixel = 0; pixel < region.mask.length; pixel += 1) {
          if (!region.mask[pixel]) continue;
          const offset = pixel * 4;
          const luminance =
            (image.data[offset] * 0.2126 + image.data[offset + 1] * 0.7152 + image.data[offset + 2] * 0.0722) / 255;
          const light = 0.35 + luminance * 0.9;
          const shadedRed = Math.min(255, paint.red * light);
          const shadedGreen = Math.min(255, paint.green * light);
          const shadedBlue = Math.min(255, paint.blue * light);
          image.data[offset] = paint.red * (1 - amount) + shadedRed * amount;
          image.data[offset + 1] = paint.green * (1 - amount) + shadedGreen * amount;
          image.data[offset + 2] = paint.blue * (1 - amount) + shadedBlue * amount;
        }
      }
    }
    previewContext.putImageData(image, 0, 0);
  }, [regions, selectedColor, showPaint, strength]);

  useEffect(() => renderPreview(), [renderPreview]);

  const buildMaskFor = useCallback((seed: { x: number; y: number }, toleranceValue: number) => {
    const source = sourceCanvasRef.current;
    const context = source?.getContext("2d", { willReadFrequently: true });
    if (!source || !context) return new Uint8Array(0);
    const { width, height } = source;
    const image = context.getImageData(0, 0, width, height).data;
    const startPixel = seed.y * width + seed.x;
    const startOffset = startPixel * 4;
    const edgeMap = edgeMapRef.current;
    const selected = new Uint8Array(width * height);
    const visited = new Uint8Array(width * height);
    const queue = new Int32Array(width * height);
    let head = 0;
    let tail = 1;
    queue[0] = startPixel;
    visited[startPixel] = 1;

    // Compare against a running mean of what has been accepted so far, so the
    // fill follows gradual lighting drift across one surface without drifting
    // onto a genuinely different one.
    let meanRed = image[startOffset];
    let meanGreen = image[startOffset + 1];
    let meanBlue = image[startOffset + 2];
    const seedRed = meanRed;
    const seedGreen = meanGreen;
    const seedBlue = meanBlue;
    let acceptedCount = 1;

    while (head < tail) {
      const pixel = queue[head++];
      const offset = pixel * 4;
      const meanDistance = Math.sqrt(
        (image[offset] - meanRed) ** 2 + (image[offset + 1] - meanGreen) ** 2 + (image[offset + 2] - meanBlue) ** 2,
      );
      // A hard cap against the originally tapped color as well, so a long
      // chain of small steps can never wander onto furniture or floor.
      const seedDistance = Math.sqrt(
        (image[offset] - seedRed) ** 2 + (image[offset + 1] - seedGreen) ** 2 + (image[offset + 2] - seedBlue) ** 2,
      );
      if (meanDistance > toleranceValue || seedDistance > toleranceValue * 2.2) continue;
      selected[pixel] = 1;
      acceptedCount += 1;
      meanRed += (image[offset] - meanRed) / acceptedCount;
      meanGreen += (image[offset + 1] - meanGreen) / acceptedCount;
      meanBlue += (image[offset + 2] - meanBlue) / acceptedCount;
      const px = pixel % width;
      const neighbors = [pixel - width, pixel + width];
      if (px > 0) neighbors.push(pixel - 1);
      if (px < width - 1) neighbors.push(pixel + 1);
      for (const neighbor of neighbors) {
        if (neighbor < 0 || neighbor >= visited.length || visited[neighbor]) continue;
        visited[neighbor] = 1;
        if (edgeMap && Math.max(edgeMap[pixel], edgeMap[neighbor]) > EDGE_THRESHOLD) continue;
        queue[tail++] = neighbor;
      }
    }
    return fillSmallGaps(selected, width, height, Math.round(width * height * MAX_HOLE_FRACTION));
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
      setRegions([]);
      setShowPaint(true);
      URL.revokeObjectURL(url);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      toast.error("Could not open that photo.");
    };
    image.src = url;
  };

  const handleCanvasClick = (event: MouseEvent<HTMLCanvasElement>) => {
    const canvas = previewCanvasRef.current;
    if (!canvas || !photoLoaded) return;
    if (!selectedColor) {
      toast.error("Pick a color first.");
      return;
    }
    const bounds = canvas.getBoundingClientRect();
    const x = Math.max(0, Math.min(canvas.width - 1, Math.floor(((event.clientX - bounds.left) * canvas.width) / bounds.width)));
    const y = Math.max(0, Math.min(canvas.height - 1, Math.floor(((event.clientY - bounds.top) * canvas.height) / bounds.height)));
    const pixel = y * canvas.width + x;

    // Tapping an area that is already painted removes it, so a mis-tap is
    // easy to undo without clearing everything.
    const existing = regions.find((region) => region.mask[pixel]);
    if (existing) {
      setRegions((prev) => prev.filter((region) => region.id !== existing.id));
      return;
    }

    const mask = buildMaskFor({ x, y }, tolerance);
    setRegions((prev) => [...prev, { id: String(nextIdRef.current++), seed: { x, y }, mask }]);
    setShowPaint(true);
  };

  const chooseColor = (color: PaintColor) => {
    setSelectedColor(color);
    setShowPaint(true);
  };

  const updateTolerance = (value: number) => {
    setTolerance(value);
    setRegions((prev) => prev.map((region) => ({ ...region, mask: buildMaskFor(region.seed, value) })));
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
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
      <section className="space-y-3">
        <div className="relative flex min-h-80 items-center justify-center overflow-hidden rounded-lg border border-border bg-muted/40">
          <canvas ref={sourceCanvasRef} className="hidden" />
          <canvas
            ref={previewCanvasRef}
            onClick={handleCanvasClick}
            className={`max-h-[620px] w-full object-contain ${photoLoaded ? "cursor-crosshair" : "hidden"}`}
            aria-label="Room color preview. Pick a color, then tap the walls to paint them."
          />
          {!photoLoaded && (
            <label className="flex min-h-80 w-full cursor-pointer flex-col items-center justify-center gap-3 text-center">
              <span className="flex h-12 w-12 items-center justify-center rounded-full bg-accent/15 text-accent">
                <ImagePlus className="h-6 w-6" />
              </span>
              <span className="font-semibold text-foreground">Upload or take a room photo</span>
              <span className="max-w-xs text-sm text-muted-foreground">
                Use a clear photo where the walls are visible and evenly lit. Your photo stays on this device.
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
            <Button variant="outline" size="sm" onClick={() => setRegions([])} disabled={!regions.length}>
              <Trash2 className="mr-1.5 h-4 w-4" />
              Clear all
            </Button>
            <Button variant="outline" size="sm" onClick={() => setShowPaint((visible) => !visible)} disabled={!regions.length}>
              {showPaint ? <EyeOff className="mr-1.5 h-4 w-4" /> : <Eye className="mr-1.5 h-4 w-4" />}
              {showPaint ? "Before" : "After"}
            </Button>
            <Button size="sm" onClick={download} disabled={!regions.length} className="ml-auto">
              <Download className="mr-1.5 h-4 w-4" />
              Download
            </Button>
          </div>
        )}

        <p className="text-sm text-muted-foreground">
          {!photoLoaded
            ? "No photo is ever uploaded — the preview is rendered locally in your browser."
            : !selectedColor
              ? "Pick a color, then tap each wall in the photo to paint it."
              : regions.length
                ? "Tap more walls to include them, or tap a painted wall again to remove it. All walls share the selected color."
                : "Tap a wall in the photo to paint it."}
        </p>
      </section>

      <aside className="space-y-5">
        <div className="space-y-2">
          <Label htmlFor="color-search">Wall color</Label>
          <Input
            id="color-search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search name, code, or collection"
          />
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
                  onClick={() => chooseColor(color)}
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
          <p className="text-xs text-muted-foreground">
            Applies to every wall you tap — all painted walls update to this color at once.
          </p>
        </div>

        <div className="space-y-4 border-t border-border pt-4">
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <Label htmlFor="tolerance">Surface range</Label>
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
            <p className="text-xs text-muted-foreground">Lower it if the color spreads onto furniture; raise it if patches are missed.</p>
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
