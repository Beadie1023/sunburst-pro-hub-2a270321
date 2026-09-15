import { useCallback, useEffect, useRef, useState, type ChangeEvent, type MouseEvent } from "react";
import { Download, Eye, EyeOff, ImagePlus, Loader2, RotateCcw } from "lucide-react";
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

const MAX_IMAGE_EDGE = 1400;
const TOLERANCE_DEBOUNCE_MS = 90;
const COLLAPSED_COLOR_COUNT = 60;

function hexToRgb(hex: string) {
  const normalized = hex.replace("#", "");
  const value = Number.parseInt(normalized.length === 3
    ? normalized.split("").map((character) => character + character).join("")
    : normalized, 16);
  return { red: (value >> 16) & 255, green: (value >> 8) & 255, blue: value & 255 };
}

/**
 * Paints a mask into an ImageData in place, preserving per-pixel luminance
 * so shadows/highlights on the wall survive the recolor. Pulled out as its
 * own function so both the live preview and the PNG export use exactly the
 * same math — previously the export just serialized whatever the preview
 * canvas happened to be showing, which broke when "Before" was toggled on.
 */
function applyPaint(imageData: ImageData, mask: Uint8Array, colorHex: string, strengthPercent: number) {
  const paint = hexToRgb(colorHex);
  const amount = strengthPercent / 100;
  for (let pixel = 0; pixel < mask.length; pixel += 1) {
    if (!mask[pixel]) continue;
    const offset = pixel * 4;
    const luminance = (imageData.data[offset] * 0.2126 + imageData.data[offset + 1] * 0.7152 + imageData.data[offset + 2] * 0.0722) / 255;
    const light = 0.35 + luminance * 0.9;
    const targetRed = Math.min(255, paint.red * light);
    const targetGreen = Math.min(255, paint.green * light);
    const targetBlue = Math.min(255, paint.blue * light);
    imageData.data[offset] = imageData.data[offset] * (1 - amount) + targetRed * amount;
    imageData.data[offset + 1] = imageData.data[offset + 1] * (1 - amount) + targetGreen * amount;
    imageData.data[offset + 2] = imageData.data[offset + 2] * (1 - amount) + targetBlue * amount;
  }
}

/**
 * The edge map (Sobel over each color channel, max response kept) and the
 * flood-fill mask build are the two expensive operations here — both scale
 * with image area and used to run on the main thread, which freezes the UI
 * on a real photo and makes every tolerance-slider tick feel choppy. This
 * worker owns that math instead. It keeps the edge map resident after
 * computing it once per photo, so later mask rebuilds (new click, new
 * tolerance) only need to re-run the flood fill, not the edge detection.
 */
const workerSource = `
  function computeEdgeMap(width, height, data) {
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

  function buildMaskCore(x, y, toleranceValue, width, height, edgeMap) {
    const startPixel = y * width + x;
    const selected = new Uint8Array(width * height);
    const visited = new Uint8Array(width * height);
    const queue = new Int32Array(width * height);
    let head = 0;
    let tail = 1;
    queue[0] = startPixel;
    visited[startPixel] = 1;

    const effectiveEdgeThreshold = toleranceValue * 3.2;
    const maxDistance = Math.max(width, height) * 0.3;
    const maxDistanceSq = maxDistance * maxDistance;
    const maxAcceptedPixels = Math.floor(width * height * 0.25);
    let acceptedCount = 0;

    while (head < tail) {
      const pixel = queue[head++];
      selected[pixel] = 1;
      acceptedCount += 1;
      if (acceptedCount >= maxAcceptedPixels) break;
      const px = pixel % width;
      const py = (pixel - px) / width;
      const neighbors = [];
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
        const dx = nx - x;
        const dy = ny - y;
        if (dx * dx + dy * dy > maxDistanceSq) continue;
        visited[neighbor] = 1;
        if (edgeMap) {
          const crossingStrength = Math.max(edgeMap[pixel], edgeMap[neighbor]);
          if (crossingStrength > effectiveEdgeThreshold) continue;
        }
        queue[tail++] = neighbor;
      }
    }
    return selected;
  }

  let edgeMap = null;
  let imgWidth = 0;
  let imgHeight = 0;

  self.onmessage = (event) => {
    const msg = event.data;
    if (msg.type === "computeEdgeMap") {
      imgWidth = msg.width;
      imgHeight = msg.height;
      const data = new Uint8ClampedArray(msg.buffer);
      edgeMap = computeEdgeMap(imgWidth, imgHeight, data);
      self.postMessage({ type: "edgeMapReady" });
    } else if (msg.type === "buildMask") {
      if (!edgeMap || imgWidth !== msg.width || imgHeight !== msg.height) return;
      const mask = buildMaskCore(msg.x, msg.y, msg.tolerance, imgWidth, imgHeight, edgeMap);
      self.postMessage({ type: "maskReady", buffer: mask.buffer, requestId: msg.requestId }, [mask.buffer]);
    }
  };
`;

export function RoomVisualizer() {
  const sourceCanvasRef = useRef<HTMLCanvasElement>(null);
  const previewCanvasRef = useRef<HTMLCanvasElement>(null);
  const workerRef = useRef<Worker | null>(null);
  const maskRequestIdRef = useRef(0);
  const [colors, setColors] = useState<VisualizerColor[]>([]);
  const [colorsLoading, setColorsLoading] = useState(true);
  const [photoLoaded, setPhotoLoaded] = useState(false);
  const [edgeMapReady, setEdgeMapReady] = useState(false);
  const [selectedColor, setSelectedColor] = useState<VisualizerColor | null>(null);
  const [search, setSearch] = useState("");
  const [tolerance, setTolerance] = useState(38);
  const [strength, setStrength] = useState(72);
  const [seed, setSeed] = useState<{ x: number; y: number } | null>(null);
  const [mask, setMask] = useState<Uint8Array | null>(null);
  const [showPaint, setShowPaint] = useState(true);

  // Spin up the worker once and keep it alive for the component's lifetime.
  useEffect(() => {
    const blob = new Blob([workerSource], { type: "application/javascript" });
    const url = URL.createObjectURL(blob);
    const worker = new Worker(url);
    URL.revokeObjectURL(url);
    workerRef.current = worker;

    const handleMessage = (event: MessageEvent) => {
      const msg = event.data;
      if (msg.type === "edgeMapReady") {
        setEdgeMapReady(true);
      } else if (msg.type === "maskReady") {
        // Ignore results from a stale request (e.g. the user moved the
        // slider again before the previous mask finished computing).
        if (msg.requestId !== maskRequestIdRef.current) return;
        setMask(new Uint8Array(msg.buffer));
      }
    };
    worker.addEventListener("message", handleMessage);
    return () => {
      worker.removeEventListener("message", handleMessage);
      worker.terminate();
    };
  }, []);

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
      applyPaint(image, mask, selectedColor.hex, strength);
    }
    previewContext.putImageData(image, 0, 0);
  }, [mask, selectedColor, showPaint, strength]);

  useEffect(() => renderPreview(), [renderPreview]);

  const requestMask = useCallback((x: number, y: number, toleranceValue: number) => {
    const source = sourceCanvasRef.current;
    const worker = workerRef.current;
    if (!source || !worker) return;
    maskRequestIdRef.current += 1;
    worker.postMessage({
      type: "buildMask",
      x,
      y,
      tolerance: toleranceValue,
      width: source.width,
      height: source.height,
      requestId: maskRequestIdRef.current,
    });
  }, []);

  // Debounced so dragging the tolerance slider doesn't fire a flood fill on
  // every intermediate value — only once movement settles.
  useEffect(() => {
    if (!seed || !edgeMapReady) return;
    const id = setTimeout(() => requestMask(seed.x, seed.y, tolerance), TOLERANCE_DEBOUNCE_MS);
    return () => clearTimeout(id);
  }, [seed, tolerance, edgeMapReady, requestMask]);

  const loadPhoto = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) return toast.error("Choose a photo file");
    const image = new Image();
    const url = URL.createObjectURL(file);
    image.onload = () => {
      const source = sourceCanvasRef.current;
      const preview = previewCanvasRef.current;
      const worker = workerRef.current;
      if (!source || !preview || !worker) return;
      const scale = Math.min(1, MAX_IMAGE_EDGE / Math.max(image.width, image.height));
      source.width = Math.round(image.width * scale);
      source.height = Math.round(image.height * scale);
      const context = source.getContext("2d", { willReadFrequently: true });
      context?.drawImage(image, 0, 0, source.width, source.height);
      preview.width = source.width;
      preview.height = source.height;
      preview.getContext("2d")?.drawImage(source, 0, 0);

      setPhotoLoaded(true);
      setEdgeMapReady(false);
      setSeed(null);
      setMask(null);

      if (context) {
        const pixels = context.getImageData(0, 0, source.width, source.height);
        // Transfer the buffer instead of copying it — this pixel data
        // isn't needed on the main thread again, so it's zero-copy.
        worker.postMessage(
          { type: "computeEdgeMap", width: source.width, height: source.height, buffer: pixels.data.buffer },
          [pixels.data.buffer],
        );
      }
      URL.revokeObjectURL(url);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      toast.error("Could not open that photo");
    };
    image.src = url;
    event.target.value = "";
  };

  const selectWall = (event: MouseEvent<HTMLCanvasElement>) => {
    const canvas = previewCanvasRef.current;
    if (!canvas || !photoLoaded || !edgeMapReady) return;
    const bounds = canvas.getBoundingClientRect();
    setSeed({
      x: Math.max(0, Math.min(canvas.width - 1, Math.floor((event.clientX - bounds.left) * canvas.width / bounds.width))),
      y: Math.max(0, Math.min(canvas.height - 1, Math.floor((event.clientY - bounds.top) * canvas.height / bounds.height))),
    });
    setShowPaint(true);
  };

  const download = () => {
    const source = sourceCanvasRef.current;
    if (!source || !photoLoaded) return;
    const context = source.getContext("2d", { willReadFrequently: true });
    if (!context) return;
    // Always export the painted version, regardless of the Before/After
    // toggle in the UI — downloading while "Before" is showing used to
    // silently save the unpainted photo.
    const imageData = context.getImageData(0, 0, source.width, source.height);
    if (mask && selectedColor) applyPaint(imageData, mask, selectedColor.hex, strength);
    const exportCanvas = document.createElement("canvas");
    exportCanvas.width = source.width;
    exportCanvas.height = source.height;
    exportCanvas.getContext("2d")?.putImageData(imageData, 0, 0);
    const link = document.createElement("a");
    link.download = `${selectedColor?.name ?? "Sunburst-color"}-room-preview.png`;
    link.href = exportCanvas.toDataURL("image/png");
    link.click();
  };

  const query = search.trim().toLowerCase();
  const matchingColors = colors.filter((color) => (
    !query || color.name.toLowerCase().includes(query) || color.code.toLowerCase().includes(query)
  ));
  // Only truncate the unfiltered "browse everything" list — a real search
  // always sees every match, so typing never hides a color that exists.
  const filteredColors = query ? matchingColors : matchingColors.slice(0, COLLAPSED_COLOR_COUNT);
  const isCollapsed = !query && matchingColors.length > COLLAPSED_COLOR_COUNT;

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_300px]">
      <section className="space-y-3">
        <div className="relative flex min-h-80 items-center justify-center overflow-hidden rounded-lg border border-border bg-muted/40">
          <canvas ref={sourceCanvasRef} className="hidden" />
          <canvas
            ref={previewCanvasRef}
            onClick={selectWall}
            className={`max-h-[620px] w-full object-contain ${photoLoaded ? (edgeMapReady ? "cursor-crosshair" : "cursor-wait") : "hidden"}`}
            aria-label="Room color preview. Click a wall to paint it."
          />
          {photoLoaded && !edgeMapReady && (
            <div className="absolute inset-0 flex items-center justify-center gap-2 bg-background/70 text-sm font-medium text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Preparing photo…
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
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" size="sm" asChild><label className="cursor-pointer"><ImagePlus className="mr-1.5 h-4 w-4" />New photo<input type="file" accept="image/*" capture="environment" onChange={loadPhoto} className="hidden" /></label></Button>
            <Button variant="outline" size="sm" onClick={() => { setSeed(null); setMask(null); }} disabled={!mask}><RotateCcw className="mr-1.5 h-4 w-4" />Reset wall</Button>
            <Button variant="outline" size="sm" onClick={() => setShowPaint((visible) => !visible)} disabled={!mask}>{showPaint ? <EyeOff className="mr-1.5 h-4 w-4" /> : <Eye className="mr-1.5 h-4 w-4" />}{showPaint ? "Before" : "After"}</Button>
            <Button size="sm" onClick={download} disabled={!mask} className="ml-auto"><Download className="mr-1.5 h-4 w-4" />Download</Button>
          </div>
        )}
        <p className="text-sm text-muted-foreground">
          {mask ? "Wall selected. Try colors or adjust the controls." : photoLoaded ? (edgeMapReady ? "Tap the middle of the wall you want to paint." : "Preparing photo…") : "Your photo stays on this device."}
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
                <span className="min-w-0"><span className="block truncate text-sm font-semibold">{color.name}</span><span className="block text-xs text-muted-foreground">{color.code} · {color.collection}</span></span>
              </button>
            )) : <p className="p-5 text-center text-sm text-muted-foreground">No matching colors</p>}
          </div>
          {isCollapsed && (
            <p className="text-xs text-muted-foreground">
              Showing {COLLAPSED_COLOR_COUNT} of {matchingColors.length} colors — search by name or code to see the rest.
            </p>
          )}
        </div>
        <div className="space-y-4 border-t border-border pt-4">
          <div className="space-y-2"><div className="flex justify-between text-sm"><Label htmlFor="tolerance">Wall range</Label><span className="text-muted-foreground">{tolerance}</span></div><input id="tolerance" type="range" min="10" max="90" value={tolerance} onChange={(event) => setTolerance(Number(event.target.value))} className="w-full accent-accent" /></div>
          <div className="space-y-2"><div className="flex justify-between text-sm"><Label htmlFor="strength">Paint strength</Label><span className="text-muted-foreground">{strength}%</span></div><input id="strength" type="range" min="30" max="100" value={strength} onChange={(event) => setStrength(Number(event.target.value))} className="w-full accent-accent" /></div>
        </div>
      </aside>
    </div>
  );
}
