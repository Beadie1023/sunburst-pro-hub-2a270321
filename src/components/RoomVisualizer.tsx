import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent, type PointerEvent } from "react";
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

/**
 * Precomputes a per-pixel edge-strength map for one photo. Runs a Sobel
 * filter over a slightly blurred version of each color channel separately
 * (not just combined luminance), then keeps the strongest response at each
 * pixel — a boundary can be a hue change with little brightness change (a
 * beige wall next to beige bedding), which a luminance-only edge map misses.
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
 * Everything here runs on-device — the photo never leaves the browser.
 * Auto-detect uses TWO independent checks before a pixel joins a wall's
 * mask: its color must still be close to that wall's own running-average
 * color, AND getting to it from its neighbor must not cross a real edge
 * (a corner, trim line, door frame). Relying on either check alone fails
 * differently — edges alone can bleed straight across a low-contrast
 * boundary (a wall into a similarly-lit bedspread); color-distance alone
 * can stall out on ordinary shading. Both together catch what either
 * misses on its own. A capped area/distance safety net backstops both in
 * case a photo has almost no usable contrast at all.
 *
 * Auto-detect isn't the only way to build a mask: Add/Erase let you paint
 * or remove from the CURRENTLY ACTIVE wall by hand, for whatever the
 * automatic pass gets wrong on a given photo.
 */
export function RoomVisualizer() {
  const sourceCanvasRef = useRef<HTMLCanvasElement>(null);
  const previewCanvasRef = useRef<HTMLCanvasElement>(null);
  const edgeMapRef = useRef<Float32Array | null>(null);
  const nextIdRef = useRef(1);
  // Working copy of the active selection's mask while a brush stroke is in
  // progress — mutated directly and repainted imperatively on every pointer
  // move, then committed into React state once on pointer-up.
  const activeMaskRef = useRef<Uint8Array | null>(null);
  const isDrawingRef = useRef(false);

  const [colors, setColors] = useState<PaintColor[]>([]);
  const [colorsLoading, setColorsLoading] = useState(true);
  const [pendingColor, setPendingColor] = useState<PaintColor | null>(null);
  const [search, setSearch] = useState("");

  const [photoLoaded, setPhotoLoaded] = useState(false);
  const [tolerance, setTolerance] = useState(38);
  const [strength, setStrength] = useState(72);
  const [selections, setSelections] = useState<WallSelection[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [showPaint, setShowPaint] = useState(true);
  // "select" = tap to auto-detect a wall. "add"/"erase" = drag by hand on
  // the currently active wall to correct whatever auto-detect got wrong.
  const [tool, setTool] = useState<"select" | "add" | "erase">("select");
  const [brushSize, setBrushSize] = useState(28);

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

  // Paints the preview canvas from a given selection list. Takes the list
  // as a plain argument (rather than always reading React state) so a
  // brush stroke can call this directly, imperatively, on every
  // pointer-move for instant feedback without waiting on a React re-render.
  const paintFromSelections = useCallback(
    (currentSelections: WallSelection[]) => {
      const source = sourceCanvasRef.current;
      const preview = previewCanvasRef.current;
      if (!source || !preview) return;
      const sourceContext = source.getContext("2d", { willReadFrequently: true });
      const previewContext = preview.getContext("2d");
      if (!sourceContext || !previewContext) return;

      preview.width = source.width;
      preview.height = source.height;
      const image = sourceContext.getImageData(0, 0, source.width, source.height);

      if (showPaint && currentSelections.length) {
        // Later selections win on any overlapping pixel, so re-editing a
        // wall cleanly replaces its previous paint rather than blending.
        const pixelCount = image.data.length / 4;
        const owner = new Int16Array(pixelCount).fill(-1);
        currentSelections.forEach((selection, index) => {
          for (let pixel = 0; pixel < selection.mask.length; pixel += 1) {
            if (selection.mask[pixel]) owner[pixel] = index;
          }
        });

        for (let pixel = 0; pixel < pixelCount; pixel += 1) {
          const ownerIndex = owner[pixel];
          if (ownerIndex === -1) continue;
          const selection = currentSelections[ownerIndex];
          const paint = hexToRgb(selection.color.hex);
          const amount = selection.strength / 100;
          const offset = pixel * 4;
          const luminance =
            (image.data[offset] * 0.2126 + image.data[offset + 1] * 0.7152 + image.data[offset + 2] * 0.0722) / 255;
          const light = 0.35 + luminance * 0.9;
          const shadedRed = Math.min(255, paint.red * light);
          const shadedGreen = Math.min(255, paint.green * light);
          const shadedBlue = Math.min(255, paint.blue * light);
          // Blends between a flat coat and a fully shaded coat of the NEW
          // color — never back toward the wall's old color — so the new
          // color always fully replaces the old one regardless of strength.
          image.data[offset] = paint.red * (1 - amount) + shadedRed * amount;
          image.data[offset + 1] = paint.green * (1 - amount) + shadedGreen * amount;
          image.data[offset + 2] = paint.blue * (1 - amount) + shadedBlue * amount;
        }
      }
      previewContext.putImageData(image, 0, 0);
    },
    [showPaint],
  );

  const renderPreview = useCallback(() => paintFromSelections(selections), [paintFromSelections, selections]);
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

    // Running average color of the region accepted so far, seeded from the
    // tapped pixel. New pixels are compared against this MEAN — not just
    // the exact tapped pixel — so the fill follows gradual lighting drift
    // across one wall. This is a REQUIRED check, independent of the edge
    // check below: a smooth, low-contrast transition (wall into a
    // similarly-lit bedspread) won't trip the edge threshold, but it will
    // fail this color check the moment the color has drifted too far to
    // plausibly still be the same painted surface.
    let meanRed = image[startOffset];
    let meanGreen = image[startOffset + 1];
    let meanBlue = image[startOffset + 2];
    let acceptedCount = 1;

    // "Wall range" scales both checks together: how much color drift counts
    // as still-the-same-wall, and (via the multiplier) how strong a local
    // brightness/hue jump has to be to count as a real boundary.
    const effectiveEdgeThreshold = toleranceValue * 3.2;

    // Backstop for photos with almost no usable contrast at all, where both
    // checks above could theoretically keep passing indefinitely. A wall is
    // never the whole photo, so growth is hard-capped by distance from the
    // tapped point and by total area — kept intentionally tight since these
    // are a last resort, not the primary mechanism.
    const seedX = seed.x;
    const seedY = seed.y;
    const maxDistance = Math.max(width, height) * 0.32;
    const maxDistanceSq = maxDistance * maxDistance;
    const maxAcceptedPixels = Math.floor(width * height * 0.28);

    while (head < tail) {
      const pixel = queue[head++];
      const offset = pixel * 4;
      const colorDistance = Math.sqrt(
        (image[offset] - meanRed) ** 2 + (image[offset + 1] - meanGreen) ** 2 + (image[offset + 2] - meanBlue) ** 2,
      );
      if (colorDistance > toleranceValue) continue; // no longer close enough to this wall's own color
      selected[pixel] = 1;
      acceptedCount += 1;
      meanRed += (image[offset] - meanRed) / acceptedCount;
      meanGreen += (image[offset + 1] - meanGreen) / acceptedCount;
      meanBlue += (image[offset + 2] - meanBlue) / acceptedCount;
      if (acceptedCount >= maxAcceptedPixels) break;

      const px = pixel % width;
      const py = (pixel - px) / width;
      const neighbors = [pixel - width, pixel + width];
      if (px > 0) neighbors.push(pixel - 1);
      if (px < width - 1) neighbors.push(pixel + 1);
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
      setSelections([]);
      setActiveId(null);
      setShowPaint(true);
      setTool("select");
      URL.revokeObjectURL(url);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      toast.error("Could not open that photo.");
    };
    image.src = url;
  };

  const canvasPointFromEvent = (event: PointerEvent<HTMLCanvasElement>) => {
    const canvas = previewCanvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const bounds = canvas.getBoundingClientRect();
    return {
      x: Math.max(0, Math.min(canvas.width - 1, Math.floor(((event.clientX - bounds.left) * canvas.width) / bounds.width))),
      y: Math.max(0, Math.min(canvas.height - 1, Math.floor(((event.clientY - bounds.top) * canvas.height) / bounds.height))),
    };
  };

  const applyBrush = (x: number, y: number, value: 0 | 1) => {
    const source = sourceCanvasRef.current;
    if (!source || !activeMaskRef.current) return;
    const { width, height } = source;
    const radius = brushSize;
    const radiusSq = radius * radius;
    const minX = Math.max(0, x - radius);
    const maxX = Math.min(width - 1, x + radius);
    const minY = Math.max(0, y - radius);
    const maxY = Math.min(height - 1, y + radius);
    for (let py = minY; py <= maxY; py += 1) {
      for (let px = minX; px <= maxX; px += 1) {
        const dx = px - x;
        const dy = py - y;
        if (dx * dx + dy * dy <= radiusSq) {
          activeMaskRef.current[py * width + px] = value;
        }
      }
    }
  };

  const handlePointerDown = (event: PointerEvent<HTMLCanvasElement>) => {
    const canvas = previewCanvasRef.current;
    const source = sourceCanvasRef.current;
    if (!canvas || !source || !photoLoaded) return;
    const { x, y } = canvasPointFromEvent(event);
    const pixel = y * canvas.width + x;

    if (tool === "select") {
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
      return;
    }

    // Add / Erase: work on the active wall, starting a fresh blank one if
    // none is active yet, so you can hand-paint a wall with no auto-detect
    // step at all if you'd rather.
    isDrawingRef.current = true;
    canvas.setPointerCapture(event.pointerId);
    setShowPaint(true);

    let workingId = activeId;
    let workingSelections = selections;
    if (!workingId) {
      const color = pendingColor ?? colors[0];
      if (!color) {
        toast.error("Colors are still loading — try again in a moment.");
        isDrawingRef.current = false;
        return;
      }
      const id = String(nextIdRef.current++);
      const blank: WallSelection = {
        id,
        seed: { x, y },
        tolerance,
        strength,
        mask: new Uint8Array(source.width * source.height),
        color,
      };
      workingSelections = [...selections, blank];
      workingId = id;
      setSelections(workingSelections);
      setActiveId(id);
    }

    const working = workingSelections.find((selection) => selection.id === workingId);
    activeMaskRef.current = working ? new Uint8Array(working.mask) : new Uint8Array(source.width * source.height);
    applyBrush(x, y, tool === "add" ? 1 : 0);
    paintFromSelections(
      workingSelections.map((selection) => (selection.id === workingId ? { ...selection, mask: activeMaskRef.current! } : selection)),
    );
  };

  const handlePointerMove = (event: PointerEvent<HTMLCanvasElement>) => {
    if (!isDrawingRef.current || tool === "select" || !activeMaskRef.current) return;
    const { x, y } = canvasPointFromEvent(event);
    applyBrush(x, y, tool === "add" ? 1 : 0);
    paintFromSelections(
      selections.map((selection) => (selection.id === activeId ? { ...selection, mask: activeMaskRef.current! } : selection)),
    );
  };

  const handlePointerUp = () => {
    if (!isDrawingRef.current) return;
    isDrawingRef.current = false;
    if (!activeMaskRef.current || !activeId) return;
    const committed = activeMaskRef.current;
    setSelections((prev) => prev.map((selection) => (selection.id === activeId ? { ...selection, mask: new Uint8Array(committed) } : selection)));
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
    if (!activeId) return;
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
          <canvas ref={sourceCanvasRef} className="hidden" />
          <canvas
            ref={previewCanvasRef}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerLeave={handlePointerUp}
            className={`max-h-[620px] w-full touch-none object-contain ${
              photoLoaded ? (tool === "select" ? "cursor-crosshair" : "cursor-cell") : "hidden"
            }`}
            aria-label="Room color preview. Tap a wall to auto-detect it, or use Add/Erase to correct by hand."
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
            <div className="inline-flex rounded-md border border-border bg-muted/30 p-0.5">
              <Button variant={tool === "select" ? "default" : "ghost"} size="sm" onClick={() => setTool("select")}>
                Auto-detect
              </Button>
              <Button variant={tool === "add" ? "default" : "ghost"} size="sm" onClick={() => setTool("add")}>
                Add
              </Button>
              <Button variant={tool === "erase" ? "default" : "ghost"} size="sm" onClick={() => setTool("erase")}>
                Erase
              </Button>
            </div>
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

        {photoLoaded && tool !== "select" && (
          <div className="space-y-1.5">
            <div className="flex justify-between text-sm">
              <Label htmlFor="brush-size">Brush size</Label>
              <span className="text-muted-foreground">{brushSize}px</span>
            </div>
            <input
              id="brush-size"
              type="range"
              min="8"
              max="80"
              value={brushSize}
              onChange={(event) => setBrushSize(Number(event.target.value))}
              className="w-full accent-accent"
            />
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
          {tool === "add"
            ? "Drag over any spot the auto-detect missed to paint it by hand."
            : tool === "erase"
              ? "Drag over any spot that shouldn't be painted (like bedding) to remove it."
              : activeSelection
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
