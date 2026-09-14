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

function hexToRgb(hex: string) {
  const normalized = hex.replace("#", "");
  const value = Number.parseInt(normalized.length === 3
    ? normalized.split("").map((character) => character + character).join("")
    : normalized, 16);
  return { red: (value >> 16) & 255, green: (value >> 8) & 255, blue: value & 255 };
}

/**
 * Cleans a raw binary selection: closes pin-holes left by texture noise, then
 * feathers the border so painted walls blend instead of showing hard blotches.
 */
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

  // Closing (dilate then erode) fills holes without growing the wall outline.
  const closed = morph(morph(selection, true, 2), false, 2);

  // Box blur into 0-255 weights for a soft edge.
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
  const [colors, setColors] = useState<VisualizerColor[]>([]);
  const [colorsLoading, setColorsLoading] = useState(true);
  const [photoLoaded, setPhotoLoaded] = useState(false);
  const [selectedColor, setSelectedColor] = useState<VisualizerColor | null>(null);
  const [search, setSearch] = useState("");
  const [tolerance, setTolerance] = useState(38);
  const [strength, setStrength] = useState(72);
  const [seed, setSeed] = useState<{ x: number; y: number } | null>(null);
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
    const context = source?.getContext("2d", { willReadFrequently: true });
    if (!source || !context) return;
    const { width, height } = source;
    const image = context.getImageData(0, 0, width, height).data;

    // Average a small patch around the tap so one noisy pixel cannot define the wall.
    let sumRed = 0, sumGreen = 0, sumBlue = 0, samples = 0;
    for (let dy = -3; dy <= 3; dy += 1) {
      for (let dx = -3; dx <= 3; dx += 1) {
        const sx = x + dx;
        const sy = y + dy;
        if (sx < 0 || sy < 0 || sx >= width || sy >= height) continue;
        const offset = (sy * width + sx) * 4;
        sumRed += image[offset];
        sumGreen += image[offset + 1];
        sumBlue += image[offset + 2];
        samples += 1;
      }
    }
    const targetRed = sumRed / samples;
    const targetGreen = sumGreen / samples;
    const targetBlue = sumBlue / samples;
    const targetLuminance = targetRed * 0.2126 + targetGreen * 0.7152 + targetBlue * 0.0722;
    // Hue signature of the wall, independent of how brightly it is lit.
    const targetRedGreen = targetRed - targetGreen;
    const targetGreenBlue = targetGreen - targetBlue;
    const chromaLimit = Math.max(8, tolerance * 0.45);
    const luminanceLimit = tolerance * 1.8;
    // Sharp boundary detector: walls change brightness gradually, while door
    // frames, trim, furniture edges and pictures change color in a single step.
    // The fill refuses to cross any edge stronger than this, so paint stays on
    // the tapped wall only.
    const edgeLimit = Math.max(18, tolerance * 1.2);
    const pixelDistance = (from: number, to: number) => {
      const redDiff = image[from] - image[to];
      const greenDiff = image[from + 1] - image[to + 1];
      const blueDiff = image[from + 2] - image[to + 2];
      return Math.abs(redDiff) + Math.abs(greenDiff) + Math.abs(blueDiff);
    };

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
      const offset = pixel * 4;
      const red = image[offset];
      const green = image[offset + 1];
      const blue = image[offset + 2];
      const chromaDistance = Math.abs(red - green - targetRedGreen) + Math.abs(green - blue - targetGreenBlue);
      const luminanceDistance = Math.abs(red * 0.2126 + green * 0.7152 + blue * 0.0722 - targetLuminance);
      if (chromaDistance > chromaLimit || luminanceDistance > luminanceLimit) continue;
      selected[pixel] = 1;
      const px = pixel % width;
      const neighbors = [pixel - width, pixel + width];
      if (px > 0) neighbors.push(pixel - 1);
      if (px < width - 1) neighbors.push(pixel + 1);
      for (const neighbor of neighbors) {
        if (neighbor >= 0 && neighbor < visited.length && !visited[neighbor]) {
          visited[neighbor] = 1;
          queue[tail++] = neighbor;
        }
      }
    }
    setMask(refineMask(selected, width, height));
  }, [tolerance]);

  useEffect(() => {
    if (!seed) return;
    setWorking(true);
    const timer = window.setTimeout(() => {
      buildMask(seed.x, seed.y);
      setWorking(false);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [buildMask, seed]);

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
      setPhotoLoaded(true);
      setSeed(null);
      setMask(null);
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
    if (!canvas || !photoLoaded) return;
    const bounds = canvas.getBoundingClientRect();
    setSeed({
      x: Math.max(0, Math.min(canvas.width - 1, Math.floor((event.clientX - bounds.left) * canvas.width / bounds.width))),
      y: Math.max(0, Math.min(canvas.height - 1, Math.floor((event.clientY - bounds.top) * canvas.height / bounds.height))),
    });
    setShowPaint(true);
  };

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

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_300px]">
      <section className="space-y-3">
        <div className="relative flex min-h-80 items-center justify-center overflow-hidden rounded-lg border border-border bg-muted/40">
          <canvas ref={sourceCanvasRef} className="hidden" />
          <canvas
            ref={previewCanvasRef}
            onClick={selectWall}
            className={`max-h-[620px] w-full object-contain ${photoLoaded ? "cursor-crosshair" : "hidden"}`}
            aria-label="Room color preview. Click a wall to paint it."
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
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" size="sm" asChild><label className="cursor-pointer"><ImagePlus className="mr-1.5 h-4 w-4" />New photo<input type="file" accept="image/*" capture="environment" onChange={loadPhoto} className="hidden" /></label></Button>
            <Button variant="outline" size="sm" onClick={() => { setSeed(null); setMask(null); }} disabled={!mask}><RotateCcw className="mr-1.5 h-4 w-4" />Reset wall</Button>
            <Button variant="outline" size="sm" onClick={() => setShowPaint((visible) => !visible)} disabled={!mask}>{showPaint ? <EyeOff className="mr-1.5 h-4 w-4" /> : <Eye className="mr-1.5 h-4 w-4" />}{showPaint ? "Before" : "After"}</Button>
            <Button size="sm" onClick={download} disabled={!mask} className="ml-auto"><Download className="mr-1.5 h-4 w-4" />Download</Button>
          </div>
        )}
        <p className="text-sm text-muted-foreground">
          {mask
            ? "Wall selected. If paint spreads too far, lower the wall range; if patches are missed, raise it."
            : photoLoaded
              ? "Tap the middle of the wall you want to paint."
              : "Your photo stays on this device."}
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
        </div>
        <div className="space-y-4 border-t border-border pt-4">
          <div className="space-y-2"><div className="flex justify-between text-sm"><Label htmlFor="tolerance">Wall range</Label><span className="text-muted-foreground">{tolerance}</span></div><input id="tolerance" type="range" min="10" max="90" value={tolerance} onChange={(event) => setTolerance(Number(event.target.value))} className="w-full accent-accent" /></div>
          <div className="space-y-2"><div className="flex justify-between text-sm"><Label htmlFor="strength">Paint strength</Label><span className="text-muted-foreground">{strength}%</span></div><input id="strength" type="range" min="30" max="100" value={strength} onChange={(event) => setStrength(Number(event.target.value))} className="w-full accent-accent" /></div>
        </div>
      </aside>
    </div>
  );
}
