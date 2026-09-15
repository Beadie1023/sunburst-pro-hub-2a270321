import { useEffect, useMemo, useState, type ChangeEvent } from "react";
import { Download, ImagePlus, Loader2, Sparkles } from "lucide-react";
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

type Surface = "walls" | "ceiling" | "trim" | "roof" | "walls-and-roof";

const MAX_EDGE = 1400;
const MAX_BYTES = 7 * 1024 * 1024;

function prepareImage(file: File): Promise<{ data: string; mimeType: string }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);

    img.onload = () => {
      URL.revokeObjectURL(url);
      const scale = Math.min(1, MAX_EDGE / Math.max(img.naturalWidth, img.naturalHeight));
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
      canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));

      const ctx = canvas.getContext("2d");
      if (!ctx) return reject(new Error("Could not prepare image."));
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

      const dataUrl = canvas.toDataURL("image/jpeg", 0.86);
      const comma = dataUrl.indexOf(",");
      if (comma < 0) return reject(new Error("Could not encode image."));

      const data = dataUrl.slice(comma + 1);
      if (Math.ceil(data.length * 3 / 4) > MAX_BYTES) {
        return reject(new Error("Photo is too large. Please choose a smaller image."));
      }

      resolve({ data, mimeType: "image/jpeg" });
    };

    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Could not open that photo."));
    };
    img.src = url;
  });
}

const surfaceNames: Record<Surface, string> = {
  walls: "Walls",
  ceiling: "Ceiling",
  trim: "Trim",
  roof: "Roof",
  "walls-and-roof": "Walls + Roof",
};

export function RoomVisualizer() {
  const [colors, setColors] = useState<PaintColor[]>([]);
  const [selectedColor, setSelectedColor] = useState<PaintColor | null>(null);
  const [search, setSearch] = useState("");
  const [projectType, setProjectType] = useState<"interior" | "exterior">("interior");
  const [surface, setSurface] = useState<Surface>("walls");
  const [originalImage, setOriginalImage] = useState<string | null>(null);
  const [resultImage, setResultImage] = useState<string | null>(null);
  const [resultMimeType, setResultMimeType] = useState("image/png");
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [showBefore, setShowBefore] = useState(false);

  useEffect(() => {
    supabase
      .from("paint_colors")
      .select("id,code,name,hex,collection")
      .eq("active", true)
      .order("name")
      .then(({ data, error }) => {
        if (error) {
          toast.error("Could not load SunBurst colors.");
        } else {
          const list = (data ?? []) as PaintColor[];
          setColors(list);
          setSelectedColor(list[0] ?? null);
        }
        setLoading(false);
      });
  }, []);

  const filteredColors = useMemo(() => {
    const q = search.trim().toLowerCase();
    return colors.filter(c =>
      !q ||
      c.name.toLowerCase().includes(q) ||
      c.code.toLowerCase().includes(q) ||
      c.collection.toLowerCase().includes(q)
    ).slice(0, 100);
  }, [colors, search]);

  const upload = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      toast.error("Please choose an image.");
      return;
    }

    try {
      const prepared = await prepareImage(file);
      setOriginalImage(`data:${prepared.mimeType};base64,${prepared.data}`);
      setResultImage(null);
      setShowBefore(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not load photo.");
    }
  };

  const visualize = async () => {
    if (!originalImage || !selectedColor) {
      toast.error("Upload a photo and select a SunBurst color first.");
      return;
    }

    const comma = originalImage.indexOf(",");
    const imageBase64 = originalImage.slice(comma + 1);

    setGenerating(true);
    try {
      const { data, error } = await supabase.functions.invoke("visualize-project", {
        body: {
          imageBase64,
          mimeType: "image/jpeg",
          projectType,
          surface,
          color: selectedColor,
        },
      });

      if (error) throw new Error(error.message || "Visualization failed.");
      if (!data?.imageBase64) throw new Error(data?.error || "No image was returned.");

      setResultMimeType(data.mimeType || "image/png");
      setResultImage(`data:${data.mimeType || "image/png"};base64,${data.imageBase64}`);
      setShowBefore(false);
      toast.success("Project visualization is ready.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Visualization failed.");
    } finally {
      setGenerating(false);
    }
  };

  const download = () => {
    if (!resultImage) return;
    const ext = resultMimeType.includes("jpeg") ? "jpg" : "png";
    const name = selectedColor?.name.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "") || "sunburst";
    const a = document.createElement("a");
    a.href = resultImage;
    a.download = `${name}-project-visualization.${ext}`;
    a.click();
  };

  const displayed = resultImage && !showBefore ? resultImage : originalImage;

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
      <section className="space-y-3">
        <div className="relative flex min-h-80 items-center justify-center overflow-hidden rounded-lg border bg-muted/40">
          {!displayed ? (
            <label className="flex min-h-80 w-full cursor-pointer flex-col items-center justify-center gap-3 text-center">
              <ImagePlus className="h-8 w-8 text-accent" />
              <span className="font-semibold">Upload a project photo</span>
              <span className="max-w-md text-sm text-muted-foreground">
                Use the actual room, house, wall, or project photo you want to visualize.
              </span>
              <input type="file" accept="image/*" capture="environment" onChange={upload} className="hidden" />
            </label>
          ) : (
            <img
              src={displayed}
              alt={showBefore ? "Original project" : "SunBurst project visualization"}
              className="max-h-[680px] w-full object-contain"
            />
          )}

          {generating && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-background/80 backdrop-blur-sm">
              <Loader2 className="h-8 w-8 animate-spin text-accent" />
              <p className="font-semibold">Creating your project visualization…</p>
              <p className="text-sm text-muted-foreground">
                AI is identifying the selected paintable surface.
              </p>
            </div>
          )}
        </div>

        {originalImage && (
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" asChild>
              <label className="cursor-pointer">
                <ImagePlus className="mr-1.5 h-4 w-4" /> New photo
                <input type="file" accept="image/*" capture="environment" onChange={upload} className="hidden" />
              </label>
            </Button>

            {resultImage && (
              <Button variant="outline" size="sm" onClick={() => setShowBefore(v => !v)}>
                {showBefore ? "Show visualization" : "Show original"}
              </Button>
            )}

            <Button className="ml-auto" size="sm" disabled={!resultImage} onClick={download}>
              <Download className="mr-1.5 h-4 w-4" /> Download
            </Button>
          </div>
        )}
      </section>

      <aside className="space-y-5">
        <div className="space-y-2">
          <Label>Project type</Label>
          <div className="grid grid-cols-2 gap-2">
            {(["interior", "exterior"] as const).map(type => (
              <button
                key={type}
                type="button"
                onClick={() => setProjectType(type)}
                className={`rounded-md border px-3 py-2 text-sm font-medium capitalize ${
                  projectType === type ? "border-accent bg-accent/10" : "hover:bg-muted/60"
                }`}
              >
                {type}
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="surface">Paint area</Label>
          <select
            id="surface"
            value={surface}
            onChange={e => setSurface(e.target.value as Surface)}
            className="h-10 w-full rounded-md border bg-background px-3 text-sm"
          >
            <option value="walls">Walls</option>
            <option value="ceiling">Ceiling</option>
            <option value="trim">Trim</option>
            <option value="roof">Roof</option>
            <option value="walls-and-roof">Walls + Roof</option>
          </select>
        </div>

        <div className="space-y-2">
          <Label htmlFor="color-search">SunBurst color</Label>
          <Input
            id="color-search"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search color, code, or collection"
          />

          <div className="max-h-72 overflow-y-auto rounded-md border">
            {loading ? (
              <div className="p-6 text-center text-sm text-muted-foreground">
                <Loader2 className="mx-auto mb-2 h-4 w-4 animate-spin" /> Loading colors
              </div>
            ) : filteredColors.map(color => (
              <button
                key={color.id}
                type="button"
                onClick={() => setSelectedColor(color)}
                className={`flex w-full items-center gap-3 border-b p-2.5 text-left last:border-0 ${
                  selectedColor?.id === color.id ? "bg-accent/10" : "hover:bg-muted/60"
                }`}
              >
                <span className="h-9 w-9 shrink-0 rounded border" style={{ backgroundColor: color.hex }} />
                <span className="min-w-0">
                  <span className="block truncate text-sm font-semibold">{color.name}</span>
                  <span className="block text-xs text-muted-foreground">
                    {color.code} · {color.collection} · {color.hex}
                  </span>
                </span>
              </button>
            ))}
          </div>
        </div>

        {selectedColor && (
          <div className="rounded-lg border bg-muted/30 p-4 text-sm">
            <p className="font-semibold">{selectedColor.name}</p>
            <p className="text-muted-foreground">
              {selectedColor.code} · {selectedColor.hex}
            </p>
            <p className="mt-2 text-muted-foreground">
              Exact SunBurst catalog HEX is sent to the server for the visualization.
            </p>
          </div>
        )}

        <Button className="w-full" size="lg" disabled={!originalImage || !selectedColor || generating} onClick={visualize}>
          {generating ? (
            <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Visualizing…</>
          ) : (
            <><Sparkles className="mr-2 h-4 w-4" /> Visualize my project</>
          )}
        </Button>

        {resultImage && (
          <p className="text-xs text-muted-foreground">
            Showing {surfaceNames[surface]} in {selectedColor?.name}.
          </p>
        )}
      </aside>
    </div>
  );
}
