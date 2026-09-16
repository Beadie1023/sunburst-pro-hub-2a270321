import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import { Download, Eye, EyeOff, ImagePlus, Loader2, Wand2 } from "lucide-react";
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

type ProjectType = "interior" | "exterior";
type Surface = "wall" | "ceiling" | "roof" | "exterior-wall";

const MAX_IMAGE_EDGE = 1400;

function hexToRgb(hex: string) {
  const normalized = hex.replace("#", "");
  const value = Number.parseInt(
    normalized.length === 3
      ? normalized.split("").map((c) => c + c).join("")
      : normalized,
    16,
  );
  return { red: (value >> 16) & 255, green: (value >> 8) & 255, blue: value & 255 };
}

/**
 * Room Visualizer
 *
 * Detection is real, not guessed from pixel color/edges: a single click on
 * "Walls" or "Ceiling" (or "Exterior walls" / "Roof") sends the photo to
 * Gemini's native segmentation feature, which finds every separate instance
 * of that surface in the photo (including walls at different angles,
 * separated by a corner or doorway) and returns one mask per instance.
 * Those masks are combined and the paint color is blended in using each
 * pixel's own luminance, so lighting/shadow/texture still read through.
 */
export function RoomVisualizer() {
  const sourceCanvasRef = useRef<HTMLCanvasElement>(null);
  const previewCanvasRef = useRef<HTMLCanvasElement>(null);

  const [colors, setColors] = useState<PaintColor[]>([]);
  const [colorsLoading, setColorsLoading] = useState(true);
  const [selectedColor, setSelectedColor] = useState<PaintColor | null>(null);
  const [search, setSearch] = useState("");

  const [photoLoaded, setPhotoLoaded] = useState(false);
  const [projectType, setProjectType] = useState<ProjectType>("interior");
  const [surface, setSurface] = useState<Surface>("wall");
  const [strength, setStrength] = useState(78);
  const [mask, setMask] = useState<Uint8Array | null>(null);
  const [detecting, setDetecting] = useState(false);
  const [showPaint, setShowPaint] = useState(true);
  const [imageBase64, setImageBase64] = useState<{ data: string; mime: string } | null>(null);

  useEffect(() => {
    supabase
      .from("paint_colors")
      .select("id,code,name,hex,collection")
      .eq("active", true)
      .order("name")
      .then(({ data, error }) => {
        if (error) toast.error("Could not load the Sunburst colors.");
        const available = (data ?? []) as PaintColor[];
        setColors(available);
        setSelectedColor(available[0] ?? null);
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

  const surfaceOptions: { key: Surface; label: string }[] =
    projectType === "interior"
      ? [
          { key: "wall", label: "Walls" },
          { key: "ceiling", label: "Ceiling" },
        ]
      : [
          { key: "exterior-wall", label: "Exterior walls" },
          { key: "roof", label: "Roof" },
        ];

  useEffect(() => {
    // Reset to a valid surface whenever the project type changes.
    setSurface(projectType === "interior" ? "wall" : "exterior-wall");
    setMask(null);
  }, [projectType]);

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

  const loadPhoto = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (!file.type.startsWith("image/")) return toast.error("Please choose a photo file.");

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

      const dataUrl = source.toDataURL("image/jpeg", 0.9);
      const [, mime, data] = /^data:([^;]+);base64,(.+)$/.exec(dataUrl) ?? [, "image/jpeg", ""];
      setImageBase64({ data: data ?? "", mime: mime ?? "image/jpeg" });

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

  // Decodes one returned mask PNG and paints its "on" pixels into the shared
  // full-resolution mask array at the position given by its bounding box.
  const applyMaskImage = (
    maskDataUrl: string,
    box: number[],
    canvasWidth: number,
    canvasHeight: number,
    target: Uint8Array,
  ): Promise<void> =>
    new Promise((resolve) => {
      const [y0, x0, y1, x1] = box;
      const px0 = Math.round((x0 / 1000) * canvasWidth);
      const py0 = Math.round((y0 / 1000) * canvasHeight);
      const px1 = Math.round((x1 / 1000) * canvasWidth);
      const py1 = Math.round((y1 / 1000) * canvasHeight);
      const boxW = Math.max(1, px1 - px0);
      const boxH = Math.max(1, py1 - py0);

      const img = new Image();
      img.onload = () => {
        const scratch = document.createElement("canvas");
        scratch.width = boxW;
        scratch.height = boxH;
        const ctx = scratch.getContext("2d");
        if (!ctx) return resolve();
        ctx.drawImage(img, 0, 0, boxW, boxH);
        const data = ctx.getImageData(0, 0, boxW, boxH).data;
        for (let y = 0; y < boxH; y += 1) {
          for (let x = 0; x < boxW; x += 1) {
            const value = data[(y * boxW + x) * 4]; // grayscale mask — read the red channel
            if (value > 127) {
              const canvasX = px0 + x;
              const canvasY = py0 + y;
              if (canvasX >= 0 && canvasX < canvasWidth && canvasY >= 0 && canvasY < canvasHeight) {
                target[canvasY * canvasWidth + canvasX] = 1;
              }
            }
          }
        }
        resolve();
      };
      img.onerror = () => resolve();
      img.src = maskDataUrl;
    });

  const detectSurface = async () => {
    const source = sourceCanvasRef.current;
    if (!source || !imageBase64) return;
    setDetecting(true);
    setShowPaint(true);
    try {
      const { data, error } = await supabase.functions.invoke("segment-room-surface", {
        body: { imageBase64: imageBase64.data, mimeType: imageBase64.mime, surface },
      });
      if (error) throw new Error(error.message || "Detection request failed");
      if (data?.error) throw new Error(data.error);

      const masks: Array<{ box_2d: number[]; mask: string }> = data?.masks ?? [];
      if (!masks.length) {
        toast.error(`No ${surfaceOptions.find((s) => s.key === surface)?.label.toLowerCase()} were detected in this photo — try a clearer or wider shot.`);
        setMask(null);
        return;
      }

      const combined = new Uint8Array(source.width * source.height);
      await Promise.all(
        masks.map((m) => applyMaskImage(`data:image/png;base64,${m.mask}`, m.box_2d, source.width, source.height, combined)),
      );
      setMask(combined);
      toast.success(`Found ${masks.length} ${masks.length === 1 ? "area" : "areas"}.`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not detect that surface.");
    } finally {
      setDetecting(false);
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
        <div className="flex gap-2">
          {(["interior", "exterior"] as ProjectType[]).map((type) => (
            <button
              key={type}
              type="button"
              onClick={() => setProjectType(type)}
              className={`flex-1 rounded-md border px-3 py-2 text-sm font-semibold capitalize ${
                projectType === type ? "border-accent bg-accent text-accent-foreground" : "border-border hover:bg-muted/60"
              }`}
            >
              {type}
            </button>
          ))}
        </div>

        <div className="relative flex min-h-80 items-center justify-center overflow-hidden rounded-lg border border-border bg-muted/40">
          <canvas ref={sourceCanvasRef} className="hidden" />
          <canvas ref={previewCanvasRef} className={`max-h-[560px] w-full object-contain ${photoLoaded ? "" : "hidden"}`} aria-label="Room color preview" />
          {!photoLoaded && (
            <label className="flex min-h-80 w-full cursor-pointer flex-col items-center justify-center gap-3 text-center">
              <span className="flex h-12 w-12 items-center justify-center rounded-full bg-accent/15 text-accent"><ImagePlus className="h-6 w-6" /></span>
              <span className="font-semibold text-foreground">Upload the project photo</span>
              <span className="max-w-xs text-sm text-muted-foreground">Use a clear, well-lit photo. It's processed securely and never stored.</span>
              <input type="file" accept="image/*" capture="environment" onChange={loadPhoto} className="hidden" />
            </label>
          )}
        </div>

        {photoLoaded && (
          <>
            <div className="flex flex-wrap gap-2">
              {surfaceOptions.map((option) => (
                <Button
                  key={option.key}
                  variant={surface === option.key ? "default" : "outline"}
                  size="sm"
                  onClick={() => { setSurface(option.key); setMask(null); }}
                >
                  {option.label}
                </Button>
              ))}
              <Button size="sm" onClick={detectSurface} disabled={detecting} className="bg-accent text-accent-foreground hover:bg-accent/90">
                {detecting ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Wand2 className="mr-1.5 h-4 w-4" />}
                {detecting ? "Detecting…" : mask ? "Re-detect" : "Detect & paint"}
              </Button>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Button variant="outline" size="sm" asChild>
                <label className="cursor-pointer"><ImagePlus className="mr-1.5 h-4 w-4" />New photo<input type="file" accept="image/*" capture="environment" onChange={loadPhoto} className="hidden" /></label>
              </Button>
              <Button variant="outline" size="sm" onClick={() => setShowPaint((v) => !v)} disabled={!mask}>
                {showPaint ? <EyeOff className="mr-1.5 h-4 w-4" /> : <Eye className="mr-1.5 h-4 w-4" />}
                {showPaint ? "Before" : "After"}
              </Button>
              <Button size="sm" onClick={download} disabled={!mask} className="ml-auto">
                <Download className="mr-1.5 h-4 w-4" />Download
              </Button>
            </div>
          </>
        )}

        <p className="text-sm text-muted-foreground">
          {photoLoaded
            ? `Pick "${surfaceOptions.find((s) => s.key === surface)?.label}" then Detect & paint — every matching surface in the photo is found automatically and shares the color you pick.`
            : "Your photo is sent securely for detection only, and is not stored."}
        </p>
      </section>

      <aside className="space-y-5">
        <div className="space-y-2">
          <Label htmlFor="color-search">Sunburst color</Label>
          <Input id="color-search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search name, code, or collection" />
          <div className="max-h-72 overflow-y-auto rounded-md border border-border">
            {colorsLoading ? (
              <div className="flex items-center justify-center p-8 text-muted-foreground"><Loader2 className="mr-2 h-4 w-4 animate-spin" />Loading colors</div>
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
                    <span className="block text-xs text-muted-foreground">{color.code} · {color.collection}</span>
                  </span>
                </button>
              ))
            ) : (
              <p className="p-5 text-center text-sm text-muted-foreground">No matching colors</p>
            )}
          </div>
          <p className="text-xs text-muted-foreground">Applies to every detected {surfaceOptions.find((s) => s.key === surface)?.label.toLowerCase()}.</p>
        </div>

        <div className="space-y-2 border-t border-border pt-4">
          <div className="flex justify-between text-sm"><Label htmlFor="strength">Paint strength</Label><span className="text-muted-foreground">{strength}%</span></div>
          <input id="strength" type="range" min="30" max="100" value={strength} onChange={(e) => setStrength(Number(e.target.value))} className="w-full accent-accent" />
        </div>
      </aside>
    </div>
  );
}
