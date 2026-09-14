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

// After the global color match, any selected "island" smaller than this
// fraction of the whole photo is dropped — it's almost always an incidental
// color match on furniture/decor rather than a real wall, and removing it
// keeps stray paint specks off the bed, floor, or nightstand.
const MIN_SPECK_FRACTION = 0.001;

// Only the top portion of the photo is eligible for the color match, since
// walls dominate the upper part of a typical room photo while furniture and
// floor dominate the lower part. This is a practical heuristic, not real
// object recognition, so it can still be fooled by an unusual photo
// composition — raise it if legitimate wall lower in the frame is being
// skipped, lower it if furniture is still getting painted.
const WALL_ZONE_FRACTION = 0.62;

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
 * Selects every pixel in the photo whose color is close to the tapped
 * point — not just pixels connected to it. Refines the reference color a
 * few times (recomputing the average of whatever currently matches) so it
 * settles on the room's actual overall wall tone rather than just the one
 * pixel that was tapped, which lets it catch walls in different lighting
 * without needing a separate tap for each one.
 *
 * `maxRow` excludes anything below that row from ever being a candidate —
 * both from being selected AND from influencing the running average — so a
 * similarly-toned bedspread or rug lower in the frame can't get pulled in
 * or skew the reference color toward furniture.
 */
function buildGlobalMask(
  image: Uint8ClampedArray,
  width: number,
  height: number,
  seedOffset: number,
  tolerance: number,
  maxRow: number,
): Uint8Array {
  const pixelCount = width * height;
  let meanRed = image[seedOffset];
  let meanGreen = image[seedOffset + 1];
  let meanBlue = image[seedOffset + 2];

  let selected = new Uint8Array(pixelCount);
  const refinementPasses = 4;
  for (let pass = 0; pass < refinementPasses; pass += 1) {
    const next = new Uint8Array(pixelCount);
    let sumRed = 0;
    let sumGreen = 0;
    let sumBlue = 0;
    let count = 0;
    for (let pixel = 0; pixel < pixelCount; pixel += 1) {
      const row = Math.floor(pixel / width);
      if (row > maxRow) continue;
      const offset = pixel * 4;
      const dRed = image[offset] - meanRed;
      const dGreen = image[offset + 1] - meanGreen;
      const dBlue = image[offset + 2] - meanBlue;
      const distance = Math.sqrt(dRed * dRed + dGreen * dGreen + dBlue * dBlue);
      if (distance <= tolerance) {
        next[pixel] = 1;
        sumRed += image[offset];
        sumGreen += image[offset + 1];
        sumBlue += image[offset + 2];
        count += 1;
      }
    }
    selected = next;
    if (count > 0) {
      meanRed = sumRed / count;
      meanGreen = sumGreen / count;
      meanBlue = sumBlue / count;
    }
  }
  return selected;
}

/**
 * Removes small connected "islands" from a mask — cleans up incidental
 * color matches (a lamp shade, a pale pillow) that happened to fall within
 * tolerance but aren't part of a real wall.
 */
function removeSmallSpecks(mask: Uint8Array, width: number, height: number, minSize: number): Uint8Array {
  const cleaned = new Uint8Array(mask);
  const visited = new Uint8Array(width * height);
  const queue = new Int32Array(width * height);

  for (let start = 0; start < width * height; start += 1) {
    if (!mask[start] || visited[start]) continue;
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
        if (mask[neighbor] && !visited[neighbor]) {
          visited[neighbor] = 1;
          queue[tail++] = neighbor;
          members.push(neighbor);
        }
      }
    }
    if (members.length < minSize) {
      for (const member of members) cleaned[member] = 0;
    }
  }

  return cleaned;
}

/**
 * Room Visualizer
 *
 * Everything runs on-device: the photo is decoded straight into a
 * <canvas>, the paint mask is built by matching color across the WHOLE
 * photo (not just one connected blob), and the chosen paint is blended in
 * using each pixel's own luminance so shadows/highlights/texture survive.
 * The photo is never sent anywhere — there is no network call in this
 * component. The only server round-trip in AI Design Tools remains the
 * separate Color Match flow (recommend-colors).
 *
 * Tapping any wall paints every matching wall in the photo at once —
 * including walls separated by the bed, a doorway, or furniture — since
 * selection is based on color, not on pixel connectivity. Furniture, floor,
 * and other clearly different-colored surfaces are excluded by the
 * tolerance check.
 */
export function RoomVisualizer() {
  const sourceCanvasRef = useRef<HTMLCanvasElement>(null);
  const previewCanvasRef = useRef<HTMLCanvasElement>(null);

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
        const shadedRed = Math.min(255, paint.red * light);
        const shadedGreen = Math.min(255, paint.green * light);
        const shadedBlue = Math.min(255, paint.blue * light);
        // "Paint strength" blends between a flat, unshaded coat of the new
        // color and a fully light/shadow-shaded coat of it — never back
        // toward the wall's OLD color, so the new color always fully
        // replaces the old one regardless of the slider position.
        image.data[offset] = paint.red * (1 - amount) + shadedRed * amount;
        image.data[offset + 1] = paint.green * (1 - amount) + shadedGreen * amount;
        image.data[offset + 2] = paint.blue * (1 - amount) + shadedBlue * amount;
      }
    }
    previewContext.putImageData(image, 0, 0);
  }, [mask, selectedColor, showPaint, strength]);

  useEffect(() => renderPreview(), [renderPreview]);

  const buildMask = useCallback((x: number, y: number, toleranceValue: number) => {
    const source = sourceCanvasRef.current;
    const context = source?.getContext("2d", { willReadFrequently: true });
    if (!source || !context) return;
    const { width, height } = source;
    const image = context.getImageData(0, 0, width, height).data;
    const pixelCount = width * height;
    const seedOffset = (y * width + x) * 4;
    // Always include at least a little margin below the tapped point itself
    // (in case someone deliberately taps lower on a wall), but otherwise
    // cap candidates to the upper portion of the frame.
    const maxRow = Math.max(Math.round(height * WALL_ZONE_FRACTION), y + 20);

    const rawMask = buildGlobalMask(image, width, height, seedOffset, toleranceValue, maxRow);
    const cleaned = removeSmallSpecks(rawMask, width, height, Math.max(4, Math.round(pixelCount * MIN_SPECK_FRACTION)));
    setMask(cleaned);
  }, []);

  useEffect(() => {
    if (seed) buildMask(seed.x, seed.y, tolerance);
  }, [buildMask, seed, tolerance]);

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
      // Downscale before drawing to canvas — keeps the global color match
      // fast, and this happens entirely in-memory (no upload).
      const scale = Math.min(1, MAX_IMAGE_EDGE / Math.max(image.width, image.height));
      source.width = Math.round(image.width * scale);
      source.height = Math.round(image.height * scale);
      const context = source.getContext("2d", { willReadFrequently: true });
      context?.drawImage(image, 0, 0, source.width, source.height);
      preview.width = source.width;
      preview.height = source.height;
      preview.getContext("2d")?.drawImage(source, 0, 0);

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
    const name = (selectedColor?.name ?? "sunburst").replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "");
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
            aria-label="Room color preview. Tap any wall to paint every matching wall in the room."
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
          {mask
            ? "All matching walls painted. Try another color or adjust the controls below."
            : photoLoaded
              ? "Tap any wall — every matching wall in the room will be painted."
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
