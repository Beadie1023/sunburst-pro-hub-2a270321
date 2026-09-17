import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import { Download, Eye, EyeOff, ImagePlus, Loader2, Sparkles, RotateCcw } from "lucide-react";
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

type Space = "interior" | "exterior";
type InteriorSurface = "wall" | "ceiling";
type ExteriorSurface = "exterior-wall" | "roof";

interface DetectedInstance {
  box_2d: number[]; // [ymin, xmin, ymax, xmax], normalized 0-1000
  mask: string; // base64 PNG, grayscale, cropped to box_2d
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
 * Decodes one detected instance's cropped grayscale mask PNG and writes it
 * into `target` (a full-photo-sized Uint8Array), at the position given by
 * its normalized box_2d. box_2d coordinates are 0-1000 per Gemini's
 * convention, so they're scaled to the actual photo's pixel dimensions
 * here. The mask PNG itself is sized to its own box, not the full photo,
 * so it's stretched to the box's actual pixel size when drawn.
 *
 * Resolves (rather than rejects) on a decode failure for a single instance
 * — one bad mask shouldn't throw away every other wall that decoded fine.
 */
function decodeMaskInstance(instance: DetectedInstance, fullWidth: number, fullHeight: number, target: Uint8Array): Promise<void> {
  return new Promise((resolve) => {
    const [ymin, xmin, ymax, xmax] = instance.box_2d;
    const left = Math.max(0, Math.min(fullWidth, Math.round((xmin / 1000) * fullWidth)));
    const top = Math.max(0, Math.min(fullHeight, Math.round((ymin / 1000) * fullHeight)));
    const right = Math.max(left + 1, Math.min(fullWidth, Math.round((xmax / 1000) * fullWidth)));
    const bottom = Math.max(top + 1, Math.min(fullHeight, Math.round((ymax / 1000) * fullHeight)));
    const boxWidth = right - left;
    const boxHeight = bottom - top;

    const image = new Image();
    image.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = boxWidth;
      canvas.height = boxHeight;
      const context = canvas.getContext("2d");
      if (!context) {
        resolve();
        return;
      }
      context.drawImage(image, 0, 0, boxWidth, boxHeight);
      const data = context.getImageData(0, 0, boxWidth, boxHeight).data;
      for (let y = 0; y < boxHeight; y += 1) {
        for (let x = 0; x < boxWidth; x += 1) {
          // Grayscale mask: R/G/B are equal, so just read R.
          const value = data[(y * boxWidth + x) * 4];
          if (value > 127) target[(top + y) * fullWidth + (left + x)] = 1;
        }
      }
      resolve();
    };
    image.onerror = () => resolve();
    image.src = `data:image/png;base64,${instance.mask}`;
  });
}

/**
 * Room Visualizer — detection-based.
 *
 * Unlike the earlier tap-to-flood-fill version, this sends the photo to the
 * `segment-room-surface` edge function, which asks Gemini to return real
 * segmentation masks for every instance of the chosen surface (every wall
 * plane, the ceiling, etc.) in one call. That means one click covers every
 * wall in the room — including ones separated by a corner a flood-fill
 * could never safely cross — at the cost of an AI call per detection and
 * the photo leaving the device (unlike the old fully local version).
 */
export function RoomVisualizer() {
  const sourceCanvasRef = useRef<HTMLCanvasElement>(null);
  const previewCanvasRef = useRef<HTMLCanvasElement>(null);

  const [colors, setColors] = useState<PaintColor[]>([]);
  const [colorsLoading, setColorsLoading] = useState(true);
  const [selectedColor, setSelectedColor] = useState<PaintColor | null>(null);
  const [search, setSearch] = useState("");

  const [photoLoaded, setPhotoLoaded] = useState(false);
  const [space, setSpace] = useState<Space>("interior");
  const [interiorSurface, setInteriorSurface] = useState<InteriorSurface>("wall");
  const [exteriorSurface, setExteriorSurface] = useState<ExteriorSurface>("exterior-wall");
  const [strength, setStrength] = useState(72);
  const [mask, setMask] = useState<Uint8Array | null>(null);
  const [isDetecting, setIsDetecting] = useState(false);
  const [showPaint, setShowPaint] = useState(true);

  const surfaceKey = space === "interior" ? interiorSurface : exteriorSurface;

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
        // Preserve the surface's own lighting: scale the paint color by
        // this pixel's original luminance instead of flatly overwriting it.
        const luminance = (image.data[offset] * 0.2126 + image.data[offset + 1] * 0.7152 + image.data[offset + 2] * 0.0722) / 255;
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
      const MAX_IMAGE_EDGE = 1400;
      const scale = Math.min(1, MAX_IMAGE_EDGE / Math.max(image.width, image.height));
      source.width = Math.round(image.width * scale);
      source.height = Math.round(image.height * scale);
      source.getContext("2d")?.drawImage(image, 0, 0, source.width, source.height);
      preview.width = source.width;
      preview.height = source.height;
      preview.getContext("2d")?.drawImage(source, 0, 0);

      setPhotoLoaded(true);
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

  const changeSpace = (next: Space) => {
    setSpace(next);
    setMask(null); // a wall mask doesn't carry over to a roof, or vice versa
  };

  const changeSurface = (next: InteriorSurface | ExteriorSurface) => {
    if (space === "interior") setInteriorSurface(next as InteriorSurface);
    else setExteriorSurface(next as ExteriorSurface);
    setMask(null); // stale detection for a different surface
  };

  const detectAndPaint = async () => {
    const source = sourceCanvasRef.current;
    if (!source || !photoLoaded) return;
    if (!selectedColor) {
      toast.error("Pick a color first.");
      return;
    }

    setIsDetecting(true);
    try {
      const dataUrl = source.toDataURL("image/jpeg", 0.9);
      const imageBase64 = dataUrl.split(",")[1] ?? "";

      const { data, error } = await supabase.functions.invoke("segment-room-surface", {
        body: { imageBase64, mimeType: "image/jpeg", surface: surfaceKey },
      });
      if (error) throw new Error(error.message || "Detection failed.");
      if (data?.error) throw new Error(data.error);

      const instances = (data?.masks ?? []) as DetectedInstance[];
      if (!instances.length) {
        toast.error("Couldn't detect that surface in this photo — try a clearer angle or a different photo.");
        setMask(null);
        return;
      }

      const combined = new Uint8Array(source.width * source.height);
      await Promise.all(instances.map((instance) => decodeMaskInstance(instance, source.width, source.height, combined)));
      setMask(combined);
      setShowPaint(true);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Detection failed.");
    } finally {
      setIsDetecting(false);
    }
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
        <div className="flex gap-1 rounded-lg border border-border bg-muted/40 p-1">
          {(["interior", "exterior"] as Space[]).map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => changeSpace(option)}
              className={`flex-1 rounded-md px-3 py-1.5 text-sm font-semibold capitalize transition-colors ${
                space === option ? "bg-accent text-accent-foreground" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {option}
            </button>
          ))}
        </div>

        <div className="relative flex min-h-80 items-center justify-center overflow-hidden rounded-lg border border-border bg-muted/40">
          <canvas ref={sourceCanvasRef} className="hidden" />
          <canvas
            ref={previewCanvasRef}
            className={`max-h-[620px] w-full object-contain ${photoLoaded ? "" : "hidden"}`}
            aria-label="Room color preview"
          />
          {isDetecting && (
            <div className="absolute inset-0 flex items-center justify-center gap-2 bg-background/70 text-sm font-medium text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Detecting {surfaceKey === "wall" ? "walls" : surfaceKey === "ceiling" ? "the ceiling" : surfaceKey === "roof" ? "the roof" : "exterior walls"}…
            </div>
          )}
          {!photoLoaded && (
            <label className="flex min-h-80 w-full cursor-pointer flex-col items-center justify-center gap-3 text-center">
              <span className="flex h-12 w-12 items-center justify-center rounded-full bg-accent/15 text-accent">
                <ImagePlus className="h-6 w-6" />
              </span>
              <span className="font-semibold text-foreground">Upload or take a room photo</span>
              <span className="max-w-xs text-sm text-muted-foreground">
                Use a clear photo where the surface is visible and evenly lit.
              </span>
              <input type="file" accept="image/*" capture="environment" onChange={loadPhoto} className="hidden" />
            </label>
          )}
        </div>

        {photoLoaded && (
          <div className="flex gap-1 rounded-lg border border-border bg-muted/40 p-1">
            {(space === "interior" ? (["wall", "ceiling"] as InteriorSurface[]) : (["exterior-wall", "roof"] as ExteriorSurface[])).map(
              (option) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => changeSurface(option)}
                  className={`flex-1 rounded-md px-3 py-1.5 text-sm font-semibold transition-colors ${
                    surfaceKey === option ? "bg-accent text-accent-foreground" : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {option === "wall" ? "Walls" : option === "ceiling" ? "Ceiling" : option === "exterior-wall" ? "Exterior walls" : "Roof"}
                </button>
              ),
            )}
          </div>
        )}

        {photoLoaded && (
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" size="sm" asChild>
              <label className="cursor-pointer">
                <ImagePlus className="mr-1.5 h-4 w-4" />
                New photo
                <input type="file" accept="image/*" capture="environment" onChange={loadPhoto} className="hidden" />
              </label>
            </Button>
            <Button size="sm" onClick={detectAndPaint} disabled={isDetecting || !selectedColor}>
              <Sparkles className="mr-1.5 h-4 w-4" />
              {isDetecting ? "Detecting…" : "Detect & paint"}
            </Button>
            <Button variant="outline" size="sm" onClick={() => setMask(null)} disabled={!mask}>
              <RotateCcw className="mr-1.5 h-4 w-4" />
              Clear detection
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
            ? "Detected. Pick another color to repaint the same surfaces, or Detect & paint again after changing the photo or surface."
            : photoLoaded
              ? isDetecting
                ? "Detecting…"
                : "Pick a color, then Detect & paint."
              : "Your photo is sent to Sunburst's AI to detect surfaces before painting."}
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
          <p className="text-xs text-muted-foreground">
            {mask ? "Changing the color repaints every detected surface." : "Applies once you Detect & paint."}
          </p>
        </div>

        <div className="space-y-4 border-t border-border pt-4">
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
