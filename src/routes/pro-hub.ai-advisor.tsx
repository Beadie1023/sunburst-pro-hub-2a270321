import { createFileRoute } from "@tanstack/react-router";
import { useState, type ChangeEvent } from "react";
import { useServerFn } from "@tanstack/react-start";
import { recommendColors } from "@/lib/ai-advisor.functions";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Sparkles, Upload, Loader2, Heart, Save } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";

export const Route = createFileRoute("/pro-hub/ai-advisor")({
  component: AdvisorPage,
  head: () => ({
    meta: [
      { title: "AI Color Advisor — Sunburst Pro Hub" },
      { name: "description", content: "Upload a room photo and let AI recommend Sunburst paint colors tuned for Bahamian light." },
    ],
  }),
});

const ROOM_TYPES = ["Living Room", "Bedroom", "Kitchen", "Office", "Rental Property", "Commercial", "Exterior", "Marine / Coastal"];
const STYLES = ["Coastal", "Luxury", "Modern", "Tropical", "Minimalist", "Airbnb / Rental", "High-End Residential", "Commercial Neutral"];

interface PaintColor {
  id: string; code: string; name: string; hex: string; collection: string; recommended_use: string | null;
}
interface Recommendation {
  id: string; role: string; finish: string; reason: string; color: PaintColor;
}

function AdvisorPage() {
  const { user } = useAuth();
  const recommend = useServerFn(recommendColors);
  const [imageDataUrl, setImageDataUrl] = useState<string | null>(null);
  const [imageBase64, setImageBase64] = useState<string | null>(null);
  const [mimeType, setMimeType] = useState<string>("image/jpeg");
  const [roomType, setRoomType] = useState<string>(ROOM_TYPES[0]);
  const [style, setStyle] = useState<string>(STYLES[0]);
  const [notes, setNotes] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [recs, setRecs] = useState<Recommendation[]>([]);

  const onFile = (e: ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    if (f.size > 8 * 1024 * 1024) return toast.error("Image too large (max 8MB)");
    setMimeType(f.type || "image/jpeg");
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      setImageDataUrl(result);
      const base64 = result.split(",")[1] ?? "";
      setImageBase64(base64);
    };
    reader.readAsDataURL(f);
  };

  const submit = async () => {
    if (!imageBase64) return toast.error("Upload a room photo first");
    setLoading(true);
    setRecs([]);
    try {
      const res = await recommend({ data: { imageBase64, mimeType, roomType, style, notes } });
      setRecs(res.recommendations as Recommendation[]);
      if (!res.recommendations.length) toast.message("No matches found — try a clearer photo or different style.");
      else toast.success(`AI suggested ${res.recommendations.length} colors`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "AI request failed");
    } finally {
      setLoading(false);
    }
  };

  const saveFavorite = async (paintColorId: string) => {
    if (!user) return toast.error("Sign in first");
    const { error } = await supabase.from("saved_colors").insert({ user_id: user.id, paint_color_id: paintColorId });
    if (error) toast.error(error.message);
    else toast.success("Saved to favorites");
  };

  return (
    <div className="space-y-5">
      <div>
        <h1 className="flex items-center gap-2 text-3xl font-bold text-primary">
          <Sparkles className="h-7 w-7 text-accent" /> AI Color Advisor
        </h1>
        <p className="text-muted-foreground">Upload a room photo and pick the vibe. AI matches colors from the Sunburst catalog.</p>
      </div>

      <Card className="grid gap-4 p-5 md:grid-cols-[260px_1fr]">
        <div>
          <Label className="mb-1.5 block">Room photo</Label>
          <label className="flex h-44 cursor-pointer flex-col items-center justify-center rounded-md border-2 border-dashed border-border bg-muted/30 text-center transition hover:border-accent">
            {imageDataUrl ? (
              <img src={imageDataUrl} alt="Room" className="h-full w-full rounded-md object-cover" />
            ) : (
              <>
                <Upload className="mb-1 h-6 w-6 text-muted-foreground" />
                <span className="text-xs text-muted-foreground">Tap to upload or take photo</span>
              </>
            )}
            <input type="file" accept="image/*" capture="environment" onChange={onFile} className="hidden" />
          </label>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <Label>Project type</Label>
            <Select value={roomType} onValueChange={setRoomType}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{ROOM_TYPES.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div>
            <Label>Style</Label>
            <Select value={style} onValueChange={setStyle}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{STYLES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="sm:col-span-2">
            <Label>Notes (optional)</Label>
            <Textarea
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="e.g. west-facing windows, dark mahogany floors, owner loves teal"
            />
          </div>
          <div className="sm:col-span-2">
            <Button
              onClick={submit}
              disabled={loading || !imageBase64}
              className="h-11 w-full bg-accent text-accent-foreground hover:bg-accent/90"
            >
              {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
              Get AI Recommendations
            </Button>
          </div>
        </div>
      </Card>

      {recs.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-xl font-semibold text-primary">Recommended Sunburst colors</h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-2">
            {recs.map((r) => (
              <Card key={r.id} className="overflow-hidden">
                <div className="h-28 w-full" style={{ backgroundColor: r.color.hex }} />
                <div className="space-y-2 p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="text-xs uppercase tracking-wider text-muted-foreground">{r.color.collection} · {r.color.code}</div>
                      <h3 className="text-lg font-bold text-foreground">{r.color.name}</h3>
                    </div>
                    <span className="rounded-full bg-accent/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-accent">
                      {r.role}
                    </span>
                  </div>
                  <p className="text-sm text-foreground/80">{r.reason}</p>
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    <span className="rounded bg-muted px-2 py-0.5">Finish: {r.finish}</span>
                    <span className="rounded bg-muted px-2 py-0.5 font-mono">{r.color.hex}</span>
                  </div>
                  <div className="flex gap-2 pt-1">
                    <Button size="sm" variant="outline" onClick={() => saveFavorite(r.color.id)}>
                      <Heart className="mr-1 h-3.5 w-3.5" /> Save
                    </Button>
                    <Button size="sm" variant="outline" asChild>
                      <a href={`/pro-hub/projects`}>
                        <Save className="mr-1 h-3.5 w-3.5" /> Add to Project
                      </a>
                    </Button>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
