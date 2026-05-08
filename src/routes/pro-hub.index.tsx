import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Heart, Loader2, Search, Plus, X } from "lucide-react";

export const Route = createFileRoute("/pro-hub/")({
  component: CatalogPage,
});

interface PaintColor {
  id: string;
  code: string;
  name: string;
  hex: string;
  collection: string;
  lrv: number | null;
  drying_time: string | null;
  recommended_use: string | null;
  finishes: string[];
  coverage_sqft: number;
}

interface Project { id: string; name: string; status: string; }

function CatalogPage() {
  const { user } = useAuth();
  const [colors, setColors] = useState<PaintColor[]>([]);
  const [savedIds, setSavedIds] = useState<Set<string>>(new Set());
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [collection, setCollection] = useState("all");
  const [finish, setFinish] = useState("all");
  const [active, setActive] = useState<PaintColor | null>(null);
  const [selectedFinish, setSelectedFinish] = useState("Eggshell");
  const [selectedProject, setSelectedProject] = useState<string>("");

  useEffect(() => {
    (async () => {
      const { data } = await supabase.from("paint_colors").select("*").eq("active", true).order("code");
      setColors((data ?? []) as PaintColor[]);
      setLoading(false);
    })();
  }, []);

  useEffect(() => {
    if (!user) return;
    supabase.from("saved_colors").select("paint_color_id").eq("user_id", user.id).then(({ data }) => {
      setSavedIds(new Set((data ?? []).map((r: { paint_color_id: string }) => r.paint_color_id)));
    });
    supabase.from("projects").select("id,name,status").eq("user_id", user.id).order("created_at", { ascending: false }).then(({ data }) => {
      setProjects((data ?? []) as Project[]);
    });
  }, [user]);

  const collections = useMemo(() => Array.from(new Set(colors.map((c) => c.collection))), [colors]);
  const finishes = useMemo(() => Array.from(new Set(colors.flatMap((c) => c.finishes))), [colors]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return colors.filter((c) => {
      if (collection !== "all" && c.collection !== collection) return false;
      if (finish !== "all" && !c.finishes.includes(finish)) return false;
      if (!needle) return true;
      return c.name.toLowerCase().includes(needle) || c.code.toLowerCase().includes(needle) || c.collection.toLowerCase().includes(needle);
    });
  }, [colors, q, collection, finish]);

  const toggleSave = async (id: string) => {
    if (!user) return;
    if (savedIds.has(id)) {
      await supabase.from("saved_colors").delete().eq("user_id", user.id).eq("paint_color_id", id);
      setSavedIds((s) => { const n = new Set(s); n.delete(id); return n; });
      toast.success("Removed from saved");
    } else {
      await supabase.from("saved_colors").insert({ user_id: user.id, paint_color_id: id });
      setSavedIds((s) => new Set(s).add(id));
      toast.success("Saved color");
    }
  };

  const addToProject = async () => {
    if (!active || !selectedProject || !user) return;
    const { error } = await supabase.from("project_colors").insert({
      project_id: selectedProject,
      paint_color_id: active.id,
      finish: selectedFinish,
      gallons: 1,
    });
    if (error) toast.error(error.message);
    else { toast.success(`Added ${active.name} to project`); setActive(null); }
  };

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-3xl font-bold text-primary">Global Color Catalog</h1>
        <p className="text-muted-foreground">Technical swatches engineered for the Bahamian climate.</p>
      </div>

      {/* Filters */}
      <Card className="flex flex-wrap items-center gap-2 p-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by name or code…" className="pl-9" />
        </div>
        <Select value={collection} onValueChange={setCollection}>
          <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All collections</SelectItem>
            {collections.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={finish} onValueChange={setFinish}>
          <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All finishes</SelectItem>
            {finishes.map((f) => <SelectItem key={f} value={f}>{f}</SelectItem>)}
          </SelectContent>
        </Select>
      </Card>

      {loading ? (
        <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-accent" /></div>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
          {filtered.map((c) => (
            <button
              key={c.id}
              onClick={() => { setActive(c); setSelectedFinish(c.finishes[1] ?? c.finishes[0] ?? "Eggshell"); }}
              className="group relative overflow-hidden rounded-lg border border-border bg-card text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-lg"
            >
              <div
                className="relative h-28 w-full"
                style={{
                  backgroundColor: c.hex,
                  backgroundImage:
                    "repeating-linear-gradient(45deg, rgba(255,255,255,0.04) 0 2px, transparent 2px 6px), radial-gradient(120% 80% at 30% 20%, rgba(255,255,255,0.18), transparent 60%)",
                }}
              >
                <span className="absolute right-1.5 top-1.5 rounded-full bg-success/90 px-2 py-0.5 text-[10px] font-bold text-success-foreground shadow">
                  In Stock
                </span>
                {user && (
                  <span
                    role="button"
                    tabIndex={0}
                    onClick={(e) => { e.stopPropagation(); toggleSave(c.id); }}
                    onKeyDown={(e) => { if (e.key === "Enter") { e.stopPropagation(); toggleSave(c.id); } }}
                    className="absolute left-1.5 top-1.5 inline-flex h-6 w-6 cursor-pointer items-center justify-center rounded-full bg-background/80 backdrop-blur"
                  >
                    <Heart className={`h-3.5 w-3.5 ${savedIds.has(c.id) ? "fill-destructive text-destructive" : "text-foreground/70"}`} />
                  </span>
                )}
              </div>
              <div className="p-2.5">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="font-mono text-[10px] font-bold tracking-wider text-accent">{c.code}</span>
                  <span className="text-[10px] uppercase tracking-wider text-muted-foreground">LRV {c.lrv ?? "—"}</span>
                </div>
                <div className="mt-0.5 truncate font-semibold text-foreground">{c.name}</div>
                <div className="truncate text-xs text-muted-foreground">{c.collection}</div>
              </div>
            </button>
          ))}
          {filtered.length === 0 && (
            <Card className="col-span-full p-8 text-center text-muted-foreground">No colors match your filters.</Card>
          )}
        </div>
      )}

      {/* Technical drawer */}
      <Sheet open={!!active} onOpenChange={(o) => !o && setActive(null)}>
        <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
          {active && (
            <>
              <SheetHeader>
                <SheetTitle className="flex items-center gap-3">
                  <span className="font-mono text-xs text-accent">{active.code}</span>
                  <span>{active.name}</span>
                </SheetTitle>
              </SheetHeader>
              <div className="mt-4 space-y-4">
                <div
                  className="h-44 w-full rounded-lg border border-border shadow-inner"
                  style={{
                    backgroundColor: active.hex,
                    backgroundImage:
                      "repeating-linear-gradient(45deg, rgba(255,255,255,0.05) 0 2px, transparent 2px 6px), radial-gradient(120% 80% at 30% 20%, rgba(255,255,255,0.20), transparent 60%)",
                  }}
                />
                <dl className="grid grid-cols-2 gap-3 text-sm">
                  <Spec label="Hex" value={active.hex.toUpperCase()} mono />
                  <Spec label="Collection" value={active.collection} />
                  <Spec label="LRV" value={active.lrv?.toString() ?? "—"} />
                  <Spec label="Coverage" value={`${active.coverage_sqft} sq ft / gal`} />
                  <Spec label="Drying time" value={active.drying_time ?? "—"} className="col-span-2" />
                  <Spec label="Recommended use" value={active.recommended_use ?? "—"} className="col-span-2" />
                </dl>

                <div>
                  <div className="mb-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Available finishes</div>
                  <div className="flex flex-wrap gap-1.5">
                    {active.finishes.map((f) => (
                      <button
                        key={f}
                        onClick={() => setSelectedFinish(f)}
                        className={`rounded-full border px-3 py-1 text-xs font-medium transition ${
                          selectedFinish === f ? "border-accent bg-accent text-accent-foreground" : "border-border bg-card hover:bg-muted"
                        }`}
                      >
                        {f}
                      </button>
                    ))}
                  </div>
                </div>

                <Card className="space-y-2 bg-muted/30 p-3 text-xs text-muted-foreground">
                  <div className="font-semibold text-foreground">Room visualizer (coming soon)</div>
                  <div>Upload a wall photo and preview this color in the space — generation engine arrives in the next release.</div>
                </Card>

                {user && projects.length > 0 ? (
                  <div className="space-y-2">
                    <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Add to project</div>
                    <Select value={selectedProject} onValueChange={setSelectedProject}>
                      <SelectTrigger><SelectValue placeholder="Choose a project…" /></SelectTrigger>
                      <SelectContent>
                        {projects.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                    <Button onClick={addToProject} disabled={!selectedProject} className="w-full bg-accent text-accent-foreground hover:bg-accent/90">
                      <Plus className="mr-1.5 h-4 w-4" /> Add {selectedFinish} to project
                    </Button>
                  </div>
                ) : user ? (
                  <Card className="p-3 text-xs text-muted-foreground">
                    Create your first project under <strong>My Projects</strong> to attach colors and quantities.
                  </Card>
                ) : null}

                <Button variant="outline" onClick={() => setActive(null)} className="w-full">
                  <X className="mr-1.5 h-4 w-4" /> Close
                </Button>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}

function Spec({ label, value, mono, className }: { label: string; value: string; mono?: boolean; className?: string }) {
  return (
    <div className={className}>
      <dt className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</dt>
      <dd className={`mt-0.5 ${mono ? "font-mono" : ""} text-foreground`}>{value}</dd>
    </div>
  );
}
