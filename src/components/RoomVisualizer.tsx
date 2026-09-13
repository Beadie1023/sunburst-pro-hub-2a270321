import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent, type MouseEvent } from "react";
import { Download, Eye, EyeOff, ImagePlus, Loader2, RotateCcw, X } from "lucide-react";
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

interface WallSelection {
  id: string;
  seed: { x: number; y: number };
  tolerance: number;
  strength: number;
  mask: Uint8Array;
  color: PaintColor;
}

const MAX_IMAGE_EDGE = 1400;

// Gradient magnitude above which a pixel boundary is treated as a real
// architectural edge (a corner, trim line, door frame) that the flood-fill
// should never cross, regardless of the Wall range setting. Set high enough
// to ignore soft lighting variation and shadow gradients on a wall (which
// the adaptive-mean tolerance check below already handles) and only catch
// sharp, real boundaries. Raise further if the fill is still leaking into
// neighboring surfaces; lower it if it's stopping short on genuinely flat
// walls with crisp trim lines.
const EDGE_THRESHOLD = 120;

// Any unpainted region fully enclosed inside a wall selection, smaller than
// this fraction of the whole photo, is treated as a stray gap and filled
// in rather than left as a hole. Real openings (a closet, a doorway) are
// expected to take up noticeably more of the frame than this — raise the
// fraction if genuine small openings are getting incorrectly painted over,
// lower it if larger stray gaps are still surviving.
const MAX_HOLE_FRACTION = 0.02;

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
 * Fills small unpainted "islands" that end up fully enclosed inside a mask —
 * a stray patch that briefly tripped the edge or tolerance check during the
 * flood-fill and got isolated on all sides. Any unpainted region touching
 * the photo's outer border, or larger than `maxHoleSize`, is left alone —
 * that's a real other surface (a closet opening, a doorway), not a gap.
 * Only small, fully-enclosed holes get folded back into the wall.
 */
function fillEnclosedHoles(mask: Uint8Array, width: number, height: number, maxHoleSize: number): Uint8Array {
  const filled = new Uint8Array(mask);
  const isOutside = new Uint8Array(width * height);
  const queue = new Int32Array(width * height);
  let head = 0;
  let tail = 0;

  // Seed the "outside" flood from every unpainted border pixel — anything
  // reachable from the border without crossing painted pixels is background
  // that legitimately touches the edge of the photo (or connects to it).
  for (let x = 0; x < width; x += 1) {
    for (const y of [0, height - 1]) {
      const i = y * width + x;
      if (!mask[i] && !isOutside[i]) {
        isOutside[i] = 1;
        queue[tail++] = i;
      }
    }
  }
  for (let y = 0; y < height; y += 1) {
    for (const x of [0, width - 1]) {
      const i = y * width + x;
      if (!mask[i] && !isOutside[i]) {
        isOutside[i] = 1;
        queue[tail++] = i;
      }
    }
  }
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
      if (!mask[neighbor] && !isOutside[neighbor]) {
        isOutside[neighbor] = 1;
        queue[tail++] = neighbor;
      }
    }
  }

  // Anything unpainted and NOT reached by that outside flood is an enclosed
  // hole. Group each into its connected component and fill only the small
  // ones — a real opening (closet, doorway) will be far larger.
  const visited = new Uint8Array(width * height);
  const componentQueue = new Int32Array(width * height);
  for (let start = 0; start < width * height; start += 1) {
    if (mask[start] || isOutside[start] || visited[start]) continue;
    let componentHead = 0;
    let componentTail = 0;
    componentQueue[componentTail++] = start;
    visited[start] = 1;
    const members: number[] = [start];
    while (componentHead < componentTail) {
      const pixel = componentQueue[componentHead++];
      const px = pixel % width;
      const py = (pixel - px) / width;
      const neighbors: number[] = [];
      if (px > 0) neighbors.push(pixel - 1);
      if (px < width - 1) neighbors.push(pixel + 1);
      if (py > 0) neighbors.push(pixel - width);
      if (py < height - 1) neighbors.push(pixel + width);
      for (const neighbor of neighbors) {
        if (!mask[neighbor] && !isOutside[neighbor] && !visited[neighbor]) {
          visited[neighbor] = 1;
          componentQueue[componentTail++] = neighbor;
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
 * Grows a mask outward by `passes` pixels. Closes hairline gaps that can
 * otherwise be left between two adjacent wall selections (or between a
 * selection and a real edge it correctly stopped at), which would
 * otherwise show up as a thin unpainted sliver of the original photo.
 */
function dilateMask(mask: Uint8Array, width: number, height: number, passes: number): Uint8Array {
  let current = mask;
  for (let pass = 0; pass < passes; pass += 1) {
    const next = new Uint8Array(current.length);
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const i = y * width + x;
        if (current[i]) {
          next[i] = 1;
          continue;
        }
        const left = x > 0 && current[i - 1];
        const right = x < width - 1 && current[i + 1];
        const up = y > 0 && current[i - width];
        const down = y < height - 1 && current[i + width];
        if (left || right || up || down) next[i] = 1;
      }
    }
    current = next;
  }
  return current;
}

/**
 * Room Visualizer
 *
 * Everything here runs on-device: the photo is decoded straight into a
 * <canvas>, each wall's mask is built with a bounded flood-fill over the
 * pixel buffer, and its paint color is blended in using the pixel's own
 * luminance so shadows/highlights/texture survive. The photo is never sent
 * anywhere — there is no network call in this component. The only server
 * round-trip in AI Design Tools remains the separate Color Match flow
 * (recommend-colors).
 *
 * Multiple walls: tapping an unselected area starts a new wall selection
 * with whichever catalog color is currently highlighted; tapping inside an
 * existing selection makes it active again so its color/tolerance/strength
 * can be edited. Selections are tracked in a list rather than a single mask
 * so several walls can carry different colors at once.
 */
export function RoomVisualizer() {
  const sourceCanvasRef = useRef<HTMLCanvasElement>(null);
  const previewCanvasRef = useRef<HTMLCanvasElement>(null);
  // Edge-strength map for the current photo, computed once on load and
  // reused by every flood-fill so re-tapping or changing tolerance stays fast.
  const edgeMapRef = useRef<Float32Array | null>(null);
  const nextIdRef = useRef(1);

  const [colors, setColors] = useState<PaintColor[]>([]);
  const [colorsLoading, setColorsLoading] = useState(true);
  // The color that will be used for the NEXT new wall tapped, when nothing
  // is currently active. Once a wall is active, picking a color edits that
  // wall instead (see chooseColor).
  const [pendingColor, setPendingColor] = useState<PaintColor | null>(null);
  const [search, setSearch] = useState("");

  const [photoLoaded, setPhotoLoaded] = useState(false);
  const [tolerance, setTolerance] = useState(38);
  const [strength, setStrength] = useState(72);
  const [selections, setSelections] = useState<WallSelection[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
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
          setPendingColor(available[0] ?? null);
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

  const activeSelection = useMemo(() => selections.find((selection) => selection.id === activeId) ?? null, [selections, activeId]);
  const highlightColorId = activeSelection ? activeSelection.color.id : pendingColor?.id;

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

    if (showPaint && selections.length) {
      // Assign each pixel to whichever selection most recently claimed it,
      // so overlapping taps don't double-blend — the wall you edited last
      // simply wins on any shared pixels.
      const pixelCount = image.data.length / 4;
      const owner = new Int16Array(pixelCount).fill(-1);
      selections.forEach((selection, index) => {
        for (let pixel = 0; pixel < selection.mask.length; pixel += 1) {
          if (selection.mask[pixel]) owner[pixel] = index;
        }
      });

      for (let pixel = 0; pixel < pixelCount; pixel += 1) {
        const ownerIndex = owner[pixel];
        if (ownerIndex === -1) continue;
        const selection = selections[ownerIndex];
        const paint = hexToRgb(selection.color.hex);
        const amount = selection.strength / 100;
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
        // toward the wall's OLD color. This guarantees the new color always
        // fully replaces the old one; a lower strength just looks like a
        // flatter coat, not a wash of the previous paint showing through.
        image.data[offset] = paint.red * (1 - amount) + shadedRed * amount;
        image.data[offset + 1] = paint.green * (1 - amount) + shadedGreen * amount;
        image.data[offset + 2] = paint.blue * (1 - amount) + shadedBlue * amount;
      }
    }
    previewContext.putImageData(image, 0, 0);
  }, [selections, showPaint]);

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

    // Running average of the region accepted so far, seeded from the tapped
    // pixel. New pixels are compared against this MEAN rather than the
    // original tapped pixel, so the fill can follow gradual lighting drift
    // across a wall (soft shadows, window light, a photographed vignette)
    // without hitting an artificial ceiling as it moves away from the exact
    // spot that was tapped. Real boundaries — corners, trim, door frames —
    // are still caught by the edge-map check below, independent of this.
    let meanRed = image[startOffset];
    let meanGreen = image[startOffset + 1];
    let meanBlue = image[startOffset + 2];
    let acceptedCount = 1;

    while (head < tail) {
      const pixel = queue[head++];
      const offset = pixel * 4;
      const distance = Math.sqrt(
        (image[offset] - meanRed) ** 2 + (image[offset + 1] - meanGreen) ** 2 + (image[offset + 2] - meanBlue) ** 2,
      );
      if (distance > toleranceValue) continue;
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
        if (edgeMap) {
          const crossingStrength = Math.max(edgeMap[pixel], edgeMap[neighbor]);
          if (crossingStrength > EDGE_THRESHOLD) continue; // real boundary — do not cross
        }
        queue[tail++] = neighbor;
      }
    }
    return dilateMask(fillEnclosedHoles(selected, width, height, Math.round(width * height * MAX_HOLE_FRACTION)), width, height, 1);
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
      setSelections([]);
      setActiveId(null);
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
    const x = Math.max(0, Math.min(canvas.width - 1, Math.floor(((event.clientX - bounds.left) * canvas.width) / bounds.width)));
    const y = Math.max(0, Math.min(canvas.height - 1, Math.floor(((event.clientY - bounds.top) * canvas.height) / bounds.height)));
    const pixel = y * canvas.width + x;

    // Tapping inside an already-selected wall re-activates it for editing
    // instead of starting a new, overlapping selection.
    const hit = selections.find((selection) => selection.mask[pixel]);
    if (hit) {
      setActiveId(hit.id);
      setTolerance(hit.tolerance);
      setStrength(hit.strength);
      setShowPaint(true);
      return;
    }

    const color = pendingColor ?? colors[0];
    if (!color) {
      toast.error("Colors are still loading — try again in a moment.");
      return;
    }
    const mask = buildMaskFor({ x, y }, tolerance);
    const id = String(nextIdRef.current++);
    const newSelection: WallSelection = { id, seed: { x, y }, tolerance, strength, mask, color };
    setSelections((prev) => [...prev, newSelection]);
    setActiveId(id);
    setShowPaint(true);
  };

  const selectExistingWall = (id: string) => {
    const selection = selections.find((entry) => entry.id === id);
    if (!selection) return;
    setActiveId(id);
    setTolerance(selection.tolerance);
    setStrength(selection.strength);
  };

  const removeWall = (id: string) => {
    setSelections((prev) => prev.filter((selection) => selection.id !== id));
    setActiveId((current) => (current === id ? null : current));
  };

  const clearAllWalls = () => {
    setSelections([]);
    setActiveId(null);
  };

  const updateTolerance = (value: number) => {
    setTolerance(value);
    if (!activeId) return; // no wall active yet — this just sets the default for the next new wall
    setSelections((prev) =>
      prev.map((selection) =>
        selection.id === activeId ? { ...selection, tolerance: value, mask: buildMaskFor(selection.seed, value) } : selection,
      ),
    );
  };

  const updateStrength = (value: number) => {
    setStrength(value);
    if (!activeId) return;
    setSelections((prev) => prev.map((selection) => (selection.id === activeId ? { ...selection, strength: value } : selection)));
  };

  const chooseColor = (color: PaintColor) => {
    setPendingColor(color);
    if (activeId) {
      setSelections((prev) => prev.map((selection) => (selection.id === activeId ? { ...selection, color } : selection)));
      setShowPaint(true);
    }
  };

  const download = () => {
    const canvas = previewCanvasRef.current;
    if (!canvas || !photoLoaded) return;
    const link = document.createElement("a");
    const name = (activeSelection?.color.name ?? pendingColor?.name ?? "sunburst").replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "");
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
            aria-label="Room color preview. Tap a wall to paint it, or tap a painted wall to edit it."
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
            <Button variant="outline" size="sm" onClick={() => activeId && removeWall(activeId)} disabled={!activeId}>
              <RotateCcw className="mr-1.5 h-4 w-4" />
              Reset wall
            </Button>
            <Button variant="outline" size="sm" onClick={() => setShowPaint((visible) => !visible)} disabled={!selections.length}>
              {showPaint ? <EyeOff className="mr-1.5 h-4 w-4" /> : <Eye className="mr-1.5 h-4 w-4" />}
              {showPaint ? "Before" : "After"}
            </Button>
            <Button size="sm" onClick={download} disabled={!selections.length} className="ml-auto">
              <Download className="mr-1.5 h-4 w-4" />
              Download
            </Button>
          </div>
        )}

        {selections.length > 0 && (
          <div className="flex flex-wrap items-center gap-2">
            {selections.map((selection, index) => (
              <button
                key={selection.id}
                type="button"
                onClick={() => selectExistingWall(selection.id)}
                className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium ${
                  selection.id === activeId ? "border-accent bg-accent/10" : "border-border hover:bg-muted/60"
                }`}
              >
                <span className="h-3.5 w-3.5 shrink-0 rounded-full border border-border" style={{ backgroundColor: selection.color.hex }} />
                Wall {index + 1}
                <X
                  className="h-3 w-3 text-muted-foreground hover:text-foreground"
                  onClick={(event) => {
                    event.stopPropagation();
                    removeWall(selection.id);
                  }}
                />
              </button>
            ))}
            <button type="button" onClick={clearAllWalls} className="text-xs text-muted-foreground underline-offset-2 hover:underline">
              Clear all
            </button>
          </div>
        )}

        <p className="text-sm text-muted-foreground">
          {activeSelection
            ? "Editing this wall — try colors or adjust the controls below. Tap another wall to add a second color."
            : selections.length
              ? "Tap another wall to add a color there, or tap a painted wall to edit it."
              : photoLoaded
                ? "Tap the middle of the wall you want to paint."
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
                  onClick={() => chooseColor(color)}
                  className={`flex w-full items-center gap-3 border-b border-border p-2.5 text-left last:border-0 ${
                    highlightColorId === color.id ? "bg-accent/10" : "hover:bg-muted/60"
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
            {activeSelection ? "Applies to the wall you're currently editing." : "Applies to the next wall you tap."}
          </p>
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
              onChange={(event) => updateStrength(Number(event.target.value))}
              className="w-full accent-accent"
            />
          </div>
        </div>
      </aside>
    </div>
  );
}
