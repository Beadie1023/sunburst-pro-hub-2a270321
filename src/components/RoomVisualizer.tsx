import { useCallback, useEffect, useRef, useState, type ChangeEvent, type PointerEvent as ReactPointerEvent } from "react";
import { Brush, Download, Eraser, Eye, EyeOff, ImagePlus, Loader2, MousePointerClick, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface VisualizerColor {
  id: string;
  code: string;
  name: string;
  hex: string;
  collection: string;
}

type Mode = "select" | "add" | "erase";

const MAX_IMAGE_EDGE = 1400;

function hexToRgb(hex: string) {
  const normalized = hex.replace("#", "");
  const value = Number.parseInt(normalized.length === 3
    ? normalized.split("").map((character) => character + character).join("")
    : normalized, 16);
  return { red: (value >> 16) & 255, green: (value >> 8) & 255, blue: value & 255 };
}

/** Separable box blur used to approximate a Gaussian at a given radius. */
function blurChannels(data: Uint8ClampedArray, width: number, height: number, radius: number) {
  const size = width * height;
  const source = new Float32Array(size * 3);
  for (let pixel = 0; pixel < size; pixel += 1) {
    source[pixel * 3] = data[pixel * 4];
    source[pixel * 3 + 1] = data[pixel * 4 + 1];
    source[pixel * 3 + 2] = data[pixel * 4 + 2];
  }
  const pass = (input: Float32Array, horizontal: boolean) => {
    const output = new Float32Array(input.length);
    const outer = horizontal ? height : width;
    const inner = horizontal ? width : height;
    for (let o = 0; o < outer; o += 1) {
      for (let i = 0; i < inner; i += 1) {
        let r = 0, g = 0, b = 0, count = 0;
        for (let k = -radius; k <= radius; k += 1) {
          const j = i + k;
          if (j < 0 || j >= inner) continue;
          const index = (horizontal ? o * width + j : j * width + o) * 3;
          r += input[index]; g += input[index + 1]; b += input[index + 2];
          count += 1;
        }
        const target = (horizontal ? o * width + i : i * width + o) * 3;
        output[target] = r / count;
        output[target + 1] = g / count;
        output[target + 2] = b / count;
      }
    }
    return output;
  };
  // Two box passes per axis give a smooth, Gaussian-like result.
  return pass(pass(pass(pass(source, true), false), true), false);
}

/**
 * Builds a boundary map. Walls change brightness gradually, while ceilings,
 * floors, trim, doors and furniture meet the wall along a ridge. Two blur
 * scales are combined so both crisp trim lines and soft ceiling corners
 * register as barriers the paint must not cross.
 */
function buildEdgeMap(data: Uint8ClampedArray, width: number, height: number) {
  const scales = [
    { blurred: blurChannels(data, width, height, 2), weight: 1.5 },
    { blurred: blurChannels(data, width, height, 5), weight: 4 },
  ];
  const edges = new Float32Array(width * height);
  for (const { blurred, weight } of scales) {
    const gray = new Float32Array(width * height);
    for (let pixel = 0; pixel < gray.length; pixel += 1) {
      gray[pixel] = blurred[pixel * 3] * 0.2126 + blurred[pixel * 3 + 1] * 0.7152 + blurred[pixel * 3 + 2] * 0.0722;
    }
    for (let y = 1; y < height - 1; y += 1) {
      for (let x = 1; x < width - 1; x += 1) {
        const pixel = y * width + x;
        const dx = (gray[pixel + 1] - gray[pixel - 1]) / 2;
        const dy = (gray[pixel + width] - gray[pixel - width]) / 2;
        const magnitude = Math.hypot(dx, dy) * weight;
        if (magnitude > edges[pixel]) edges[pixel] = magnitude;
      }
    }
  }
  return { edges, smooth: scales[1].blurred };
}

/** Closes pin-holes from texture noise, then feathers the border. */
function refineMask(selection: Uint8Array, width: number, height: number) {
  const at = (data: Uint8Array, x: number, y: number) =>
    x < 0 || y < 0 || x >= width || y >= height ? 0 : data[y * width + x];

  const morph = (data: Uint8Array, dilate: boolean, radius: number) => {
    const output = new Uint8Array(data.length);
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        let hit = dilate ? 0 : 1;
        for (let dy = -radius; dy <= radius && (dilate ? !hit : hit); dy += 1) {
          for (let dx = -radius; dx <= radius; dx += 1) {
            const value = at(data, x + dx, y + dy);
            if (dilate && value) { hit = 1; break; }
            if (!dilate && !value) { hit = 0; break; }
          }
        }
        output[y * width + x] = hit;
      }
    }
    return output;
  };

  const closed = morph(morph(selection, true, 2), false, 2);

  const feathered = new Uint8ClampedArray(closed.length);
  const radius = 2;
  const area = (radius * 2 + 1) ** 2;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      let total = 0;
      for (let dy = -radius; dy <= radius; dy += 1) {
        for (let dx = -radius; dx <= radius; dx += 1) total += at(closed, x + dx, y + dy);
      }
      feathered[y * width + x] = Math.round((total / area) * 255);
    }
  }
  return feathered;
}

export function RoomVisualizer() {
  const sourceCanvasRef = useRef<HTMLCanvasElement>(null);
  const previewCanvasRef = useRef<HTMLCanvasElement>(null);
  const analysisRef = useRef<{ edges: Float32Array; smooth: Float32Array } | null>(null);
  const maskRef = useRef<Uint8ClampedArray | null>(null);
  const paintingRef = useRef(false);
  const [colors, setColors] = useState<VisualizerColor[]>([]);
  const [colorsLoading, setColorsLoading] = useState(true);
  const [photoLoaded, setPhotoLoaded] = useState(false);
  const [selectedColor, setSelectedColor] = useState<VisualizerColor | null>(null);
  const [search, setSearch] = useState("");
  const [tolerance, setTolerance] = useState(40);
  const [strength, setStrength] = useState(72);
  const [brushSize, setBrushSize] = useState(28);
  const [mode, setMode] = useState<Mode>("select");
  const [mask, setMask] = useState<Uint8ClampedArray | null>(null);
  const [working, setWorking] = useState(false);
  const [showPaint, setShowPaint] = useState(true);

  useEffect(() => {
    supabase
      .from("paint_colors")
      .select("id,code,name,hex,collection")
      .eq("active", true)
      .order("name")
      .then(({ data, error }) => {
        if (error) toast.error("Could not load the Sunburst colors");
        const availableColors = (data ?? []) as VisualizerColor[];
        setColors(availableColors);
        setSelectedColor(availableColors[0] ?? null);
        setColorsLoading(false);
      });
  }, []);

  const applyMask = useCallback((next: Uint8ClampedArray | null) => {
    maskRef.current = next;
    setMask(next ? new Uint8ClampedArray(next) : null);
  }, []);

  const renderPreview = useCallback(() => {
    const source = sourceCanvasRef.current;
    const preview = previewCanvasRef.current;
    if (!source || !preview || !source.width) return;
    const sourceContext = source.getContext("2d", { willReadFrequently: true });
    const previewContext = preview.getContext("2d");
    if (!sourceContext || !previewContext) return;

    preview.width = source.width;
    preview.height = source.height;
    const image = sourceContext.getImageData(0, 0, source.width, source.height);
    if (showPaint && mask && selectedColor) {
      const paint = hexToRgb(selectedColor.hex);
      const maxAmount = strength / 100;
      for (let pixel = 0; pixel < mask.length; pixel += 1) {
        const weight = mask[pixel];
        if (!weight) continue;
        const amount = maxAmount * (weight / 255);
        const offset = pixel * 4;
        const luminance = (image.data[offset] * 0.2126 + image.data[offset + 1] * 0.7152 + image.data[offset + 2] * 0.0722) / 255;
        const light = 0.4 + luminance * 0.85;
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

  const buildMask = useCallback((x: number, y: number) => {
    const source = sourceCanvasRef.current;
    const analysis = analysisRef.current;
    if (!source || !analysis) return;
    const { width, height } = source;
    const { edges, smooth } = analysis;

    // Average a small patch around the tap so one noisy pixel cannot define the wall.
    let sumRed = 0, sumGreen = 0, sumBlue = 0, samples = 0;
    for (let dy = -3; dy <= 3; dy += 1) {
      for (let dx = -3; dx <= 3; dx += 1) {
        const sx = x + dx;
        const sy = y + dy;
        if (sx < 0 || sy < 0 || sx >= width || sy >= height) continue;
        const index = (sy * width + sx) * 3;
        sumRed += smooth[index];
        sumGreen += smooth[index + 1];
        sumBlue += smooth[index + 2];
        samples += 1;
      }
    }
    const targetRed = sumRed / samples;
    const targetGreen = sumGreen / samples;
    const targetBlue = sumBlue / samples;
    const targetLuminance = targetRed * 0.2126 + targetGreen * 0.7152 + targetBlue * 0.0722;
    const targetRedGreen = targetRed - targetGreen;
    const targetGreenBlue = targetGreen - targetBlue;
    const chromaLimit = Math.max(10, tolerance * 0.8);
    const luminanceLimit = tolerance * 2.2;
    // Boundary strength the fill will not cross: this is what keeps paint off
    // the ceiling, floor, trim, doors and furniture.
    const edgeLimit = 1.4 + tolerance * 0.04;

    const selected = new Uint8Array(width * height);
    const visited = new Uint8Array(width * height);
    const queue = new Int32Array(width * height);
    let head = 0;
    let tail = 1;
    const startPixel = y * width + x;
    queue[0] = startPixel;
    visited[startPixel] = 1;

    while (head < tail) {
      const pixel = queue[head++];
      if (edges[pixel] > edgeLimit) continue;
      const index = pixel * 3;
      const red = smooth[index];
      const green = smooth[index + 1];
      const blue = smooth[index + 2];
      const chromaDistance = Math.abs(red - green - targetRedGreen) + Math.abs(green - blue - targetGreenBlue);
      const luminanceDistance = Math.abs(red * 0.2126 + green * 0.7152 + blue * 0.0722 - targetLuminance);
      if (chromaDistance > chromaLimit || luminanceDistance > luminanceLimit) continue;
      selected[pixel] = 1;
      const px = pixel % width;
      const neighbors = [pixel - width, pixel + width];
      if (px > 0) neighbors.push(pixel - 1);
      if (px < width - 1) neighbors.push(pixel + 1);
      for (const neighbor of neighbors) {
        if (neighbor < 0 || neighbor >= visited.length || visited[neighbor]) continue;
        visited[neighbor] = 1;
        queue[tail++] = neighbor;
      }
    }

    const refined = refineMask(selected, width, height);
    // Keep anything already painted by hand, and merge extra wall selections.
    const existing = maskRef.current;
    if (existing && existing.length === refined.length) {
      for (let pixel = 0; pixel < refined.length; pixel += 1) {
        if (existing[pixel] > refined[pixel]) refined[pixel] = existing[pixel];
      }
    }
    applyMask(refined);
  }, [applyMask, tolerance]);

  const paintStroke = useCallback((x: number, y: number, adding: boolean) => {
    const source = sourceCanvasRef.current;
    if (!source) return;
    const { width, height } = source;
    const current = maskRef.current ?? new Uint8ClampedArray(width * height);
    const radius = brushSize;
    for (let dy = -radius; dy <= radius; dy += 1) {
      const py = y + dy;
      if (py < 0 || py >= height) continue;
      for (let dx = -radius; dx <= radius; dx += 1) {
        const px = x + dx;
        if (px < 0 || px >= width) continue;
        const distance = Math.hypot(dx, dy);
        if (distance > radius) continue;
        // Soft brush edge so touch-ups blend with the flood-filled area.
        const falloff = Math.min(1, (radius - distance) / Math.max(1, radius * 0.4));
        const pixel = py * width + px;
        const value = Math.round(255 * falloff);
        current[pixel] = adding
          ? Math.max(current[pixel], value)
          : Math.min(current[pixel], 255 - value);
      }
    }
    applyMask(current);
  }, [applyMask, brushSize]);

  const loadPhoto = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) return toast.error("Choose a photo file");
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
      const pixels = context?.getImageData(0, 0, source.width, source.height);
      analysisRef.current = pixels ? buildEdgeMap(pixels.data, source.width, source.height) : null;
      setPhotoLoaded(true);
      setMode("select");
      applyMask(null);
      URL.revokeObjectURL(url);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      toast.error("Could not open that photo");
    };
    image.src = url;
    event.target.value = "";
  };

  const canvasPoint = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const canvas = previewCanvasRef.current;
    if (!canvas) return null;
    const bounds = canvas.getBoundingClientRect();
    return {
      x: Math.max(0, Math.min(canvas.width - 1, Math.floor((event.clientX - bounds.left) * canvas.width / bounds.width))),
      y: Math.max(0, Math.min(canvas.height - 1, Math.floor((event.clientY - bounds.top) * canvas.height / bounds.height))),
    };
  };

  const handlePointerDown = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    if (!photoLoaded) return;
    const point = canvasPoint(event);
    if (!point) return;
    setShowPaint(true);
    if (mode === "select") {
      setWorking(true);
      window.setTimeout(() => {
        buildMask(point.x, point.y);
        setWorking(false);
      }, 0);
      return;
    }
    paintingRef.current = true;
    event.currentTarget.setPointerCapture(event.pointerId);
    paintStroke(point.x, point.y, mode === "add");
  };

  const handlePointerMove = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    if (!paintingRef.current || mode === "select") return;
    const point = canvasPoint(event);
    if (point) paintStroke(point.x, point.y, mode === "add");
  };

  const stopStroke = () => { paintingRef.current = false; };

  const download = () => {
    const canvas = previewCanvasRef.current;
    if (!canvas || !photoLoaded) return;
    const link = document.createElement("a");
    link.download = `${selectedColor?.name ?? "Sunburst-color"}-room-preview.png`;
    link.href = canvas.toDataURL("image/png");
    link.click();
  };

  const filteredColors = colors.filter((color) => {
    const query = search.trim().toLowerCase();
    return !query || color.name.toLowerCase().includes(query) || color.code.toLowerCase().includes(query);
  }).slice(0, 80);

  const modes: { id: Mode; label: string; icon: typeof Brush }[] = [
    { id: "select", label: "Pick wall", icon: MousePointerClick },
    { id: "erase", label: "Remove paint", icon: Eraser },
    { id: "add", label: "Add paint", icon: Brush },
  ];

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_300px]">
      <section className="space-y-3">
        <div className="relative flex min-h-80 items-center justify-center overflow-hidden rounded-lg border border-border bg-muted/40">
          <canvas ref={sourceCanvasRef} className="hidden" />
          <canvas
            ref={previewCanvasRef}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={stopStroke}
            onPointerLeave={stopStroke}
            className={`max-h-[620px] w-full touch-none object-contain ${photoLoaded ? "cursor-crosshair" : "hidden"}`}
            aria-label="Room color preview. Tap a wall to paint it, then touch up with the brushes."
          />
          {working && (
            <div className="absolute inset-0 flex items-center justify-center bg-background/50">
              <Loader2 className="h-6 w-6 animate-spin text-accent" />
            </div>
          )}
          {!photoLoaded && (
            <label className="flex min-h-80 w-full cursor-pointer flex-col items-center justify-center gap-3 text-center">
              <span className="flex h-12 w-12 items-center justify-center rounded-full bg-accent/15 text-accent"><ImagePlus className="h-6 w-6" /></span>
              <span className="font-semibold text-foreground">Upload or take a room photo</span>
              <span className="max-w-xs text-sm text-muted-foreground">Use a clear photo where the wall is visible and evenly lit.</span>
              <input type="file" accept="image/*" capture="environment" onChange={loadPhoto} className="hidden" />
            </label>
          )}
        </div>
        {photoLoaded && (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex overflow-hidden rounded-md border border-border">
                {modes.map(({ id, label, icon: Icon }) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setMode(id)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold ${mode === id ? "bg-accent text-accent-foreground" : "bg-background text-muted-foreground hover:bg-mute[...]`}
                  >
                    <Icon className="h-3.5 w-3.5" />{label}
                  </button>
                ))}
              </div>
              {mode !== "select" && (
                <label className="flex items-center gap-2 text-xs text-muted-foreground">
                  Brush
                  <input type="range" min="8" max="90" value={brushSize} onChange={(event) => setBrushSize(Number(event.target.value))} className="w-24 accent-accent" />
                </label>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="outline" size="sm" asChild><label className="cursor-pointer"><ImagePlus className="mr-1.5 h-4 w-4" />New photo<input type="file" accept="image/*" capture="environment" onChange={loadPhoto} className="hidden" /></label></Button>
              <Button variant="outline" size="sm" onClick={() => { applyMask(null); setMode("select"); }} disabled={!mask}><RotateCcw className="mr-1.5 h-4 w-4" />Reset wall</Button>
              <Button variant="outline" size="sm" onClick={() => setShowPaint((visible) => !visible)} disabled={!mask}>{showPaint ? <EyeOff className="mr-1.5 h-4 w-4" /> : <Eye className="mr-1.5 h-4 w-4" />}{showPaint ? "Hide paint" : "Show paint"}</Button>
              <Button size="sm" onClick={download} disabled={!mask} className="ml-auto"><Download className="mr-1.5 h-4 w-4" />Download</Button>
            </div>
          </>
        )}
        <p className="text-sm text-muted-foreground">
          {!photoLoaded
            ? "Your photo stays on this device."
            : mode === "erase"
              ? "Drag over anything that should not be painted, like a ceiling or furniture."
              : mode === "add"
                ? "Drag over wall patches the paint missed."
                : mask
                  ? "Tap another wall to paint it too. If paint spreads too far, lower the wall range, then tidy the edges with Remove paint."
                  : "Tap the middle of the wall you want to paint."}
        </p>
      </section>

      <aside className="space-y-5">
        <div className="space-y-2">
          <Label htmlFor="color-search">Sunburst color</Label>
          <Input id="color-search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search name or code" />
          <div className="max-h-72 overflow-y-auto rounded-md border border-border">
            {colorsLoading ? (
              <div className="flex items-center justify-center p-8 text-muted-foreground"><Loader2 className="mr-2 h-4 w-4 animate-spin" />Loading colors</div>
            ) : filteredColors.length ? filteredColors.map((color) => (
              <button
                key={color.id}
                type="button"
                onClick={() => { setSelectedColor(color); setShowPaint(true); }}
                className={`flex w-full items-center gap-3 border-b border-border p-2.5 text-left last:border-0 ${selectedColor?.id === color.id ? "bg-accent/10" : "hover:bg-muted/60"}`}
              >
                <span className="h-9 w-9 shrink-0 rounded border border-border" style={{ backgroundColor: color.hex }} />
                <span className="min-w-0"><span className="block truncate text-sm font-semibold">{color.name}</span><span className="block text-xs text-muted-foreground">{color.code} · {color.co[...]}</span></span>
              </button>
            )) : <p className="p-5 text-center text-sm text-muted-foreground">No matching colors</p>}
          </div>
        </div>
        <div className="space-y-4 border-t border-border pt-4">
          <div className="space-y-2"><div className="flex justify-between text-sm"><Label htmlFor="tolerance">Wall range</Label><span className="text-muted-foreground">{tolerance}</span></div><input id="tolerance" type="range" min="6" max="120" value={tolerance} onChange={(event) => setTolerance(Number(event.target.value))} className="w-full" /></div>
          <div className="space-y-2"><div className="flex justify-between text-sm"><Label htmlFor="strength">Paint strength</Label><span className="text-muted-foreground">{strength}%</span></div><input id="strength" type="range" min="20" max="100" value={strength} onChange={(event) => setStrength(Number(event.target.value))} className="w-full" /></div>
        </div>
      </aside>
    </div>
  );
}
