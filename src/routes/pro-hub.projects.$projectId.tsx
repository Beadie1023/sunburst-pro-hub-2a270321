import { createFileRoute, Link, useParams } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowLeft, Loader2, Trash2, Calculator, Plus, Search, Package } from "lucide-react";

export const Route = createFileRoute("/pro-hub/projects/$projectId")({
  component: ProjectDetail,
});

interface Project {
  id: string; name: string; client_name: string | null; location: string | null;
  status: string; notes: string | null;
  wall_width: number | null; wall_height: number | null;
  subtotal: number; vat_rate: number; vat_amount: number; total: number;
}
interface ProjectColor {
  id: string; finish: string; gallons: number;
  paint_color_id: string;
  paint_colors: { code: string; name: string; hex: string; coverage_sqft: number } | null;
}
interface ProductLite {
  id: string; sku: string; name: string; unit: string;
  price: number | null; retail_price: number | null; contractor_price: number | null;
}
interface ProjectItem {
  id: string; project_id: string; product_id: string; quantity: number;
  products: ProductLite | null;
}

const STATUSES = ["draft", "quoted", "ordered", "in_progress", "completed"];
const VAT = 0.10;
// Indicative gallon price for early planning; real pricing comes from order placement.
const GALLON_PRICE = 65;

const unitPrice = (p: ProductLite | null, isContractor: boolean): number => {
  if (!p) return 0;
  const pref = isContractor ? p.contractor_price : p.retail_price;
  return Number(pref ?? p.price ?? p.retail_price ?? 0);
};

function ProjectDetail() {
  const { projectId } = useParams({ from: "/pro-hub/projects/$projectId" });
  const { user, role } = useAuth();
  const isContractor = role === "contractor" || role === "admin";
  const [project, setProject] = useState<Project | null>(null);
  const [colors, setColors] = useState<ProjectColor[]>([]);
  const [items, setItems] = useState<ProjectItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Product search state
  const [search, setSearch] = useState("");
  const [searchResults, setSearchResults] = useState<ProductLite[]>([]);
  const [searching, setSearching] = useState(false);

  const load = async () => {
    const [{ data: p }, { data: pc }, { data: pi }] = await Promise.all([
      supabase.from("projects").select("*").eq("id", projectId).maybeSingle(),
      supabase.from("project_colors").select("*, paint_colors(code,name,hex,coverage_sqft)").eq("project_id", projectId),
      supabase.from("project_items").select("id,project_id,product_id,quantity").eq("project_id", projectId),
    ]);
    setProject(p as Project | null);
    setColors((pc ?? []) as ProjectColor[]);
    const rawItems = (pi ?? []) as Array<{ id: string; project_id: string; product_id: string; quantity: number }>;
    if (rawItems.length) {
      const ids = Array.from(new Set(rawItems.map((r) => r.product_id)));
      const { data: prods } = await supabase
        .from("products")
        .select("id,sku,name,unit,price,retail_price,contractor_price")
        .in("id", ids);
      const map = new Map((prods ?? []).map((x) => [x.id as string, x as unknown as ProductLite]));
      setItems(rawItems.map((r) => ({ ...r, products: map.get(r.product_id) ?? null })));
    } else {
      setItems([]);
    }
    setLoading(false);
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [projectId]);

  // Debounced product search
  useEffect(() => {
    const q = search.trim();
    if (!q) { setSearchResults([]); return; }
    setSearching(true);
    const t = setTimeout(async () => {
      const { data } = await supabase
        .from("products")
        .select("id,sku,name,unit,price,retail_price,contractor_price")
        .or(`name.ilike.%${q}%,sku.ilike.%${q}%`)
        .limit(8);
      setSearchResults((data ?? []) as ProductLite[]);
      setSearching(false);
    }, 200);
    return () => clearTimeout(t);
  }, [search]);

  const wallArea = useMemo(() => {
    if (!project) return 0;
    return Number(project.wall_width ?? 0) * Number(project.wall_height ?? 0);
  }, [project]);

  // Paint calculator (indicative) — unchanged
  const paintTotals = useMemo(() => {
    const totalGallons = colors.reduce((s, c) => s + Number(c.gallons ?? 0), 0);
    const subtotal = totalGallons * GALLON_PRICE;
    const vat = +(subtotal * VAT).toFixed(2);
    const total = +(subtotal + vat).toFixed(2);
    return { totalGallons, subtotal: +subtotal.toFixed(2), vat, total };
  }, [colors]);

  // Quote totals (from product line items)
  const quoteTotals = useMemo(() => {
    const subtotal = items.reduce(
      (s, it) => s + Number(it.quantity) * unitPrice(it.products, isContractor),
      0,
    );
    const sub = +subtotal.toFixed(2);
    const vat = +(sub * VAT).toFixed(2);
    const total = +(sub + vat).toFixed(2);
    return { subtotal: sub, vat, total };
  }, [items, isContractor]);

  // Persist quote totals when they change
  useEffect(() => {
    if (!project) return;
    if (
      Number(project.subtotal) === quoteTotals.subtotal &&
      Number(project.vat_amount) === quoteTotals.vat &&
      Number(project.total) === quoteTotals.total
    ) return;
    supabase
      .from("projects")
      .update({ subtotal: quoteTotals.subtotal, vat_rate: VAT, vat_amount: quoteTotals.vat, total: quoteTotals.total })
      .eq("id", project.id)
      .then(({ error }) => { if (error) toast.error(error.message); });
    setProject({ ...project, subtotal: quoteTotals.subtotal, vat_amount: quoteTotals.vat, total: quoteTotals.total, vat_rate: VAT });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quoteTotals.subtotal, quoteTotals.vat, quoteTotals.total]);

  // Auto-suggest gallons from wall area (round up)
  const suggestedGallons = (coverage: number) => wallArea > 0 ? Math.ceil(wallArea / Math.max(1, coverage)) : 1;

  const updateProject = async (patch: Partial<Project>) => {
    if (!project) return;
    setSaving(true);
    const { error } = await supabase.from("projects").update(patch).eq("id", project.id);
    setSaving(false);
    if (error) toast.error(error.message);
    else { setProject({ ...project, ...patch }); }
  };

  const updateColor = async (id: string, patch: { finish?: string; gallons?: number }) => {
    setColors((cs) => cs.map((c) => (c.id === id ? { ...c, ...patch } : c)));
    const { error } = await supabase.from("project_colors").update(patch).eq("id", id);
    if (error) toast.error(error.message);
  };

  const removeColor = async (id: string) => {
    const { error } = await supabase.from("project_colors").delete().eq("id", id);
    if (error) return toast.error(error.message);
    setColors((cs) => cs.filter((c) => c.id !== id));
  };

  const addItem = async (product: ProductLite) => {
    // If already present, bump quantity
    const existing = items.find((i) => i.product_id === product.id);
    if (existing) {
      await updateItemQty(existing.id, existing.quantity + 1);
      setSearch(""); setSearchResults([]);
      return;
    }
    const { data, error } = await supabase
      .from("project_items")
      .insert({ project_id: projectId, product_id: product.id, quantity: 1 })
      .select("id,project_id,product_id,quantity")
      .single();
    if (error) return toast.error(error.message);
    const row = data as { id: string; project_id: string; product_id: string; quantity: number };
    setItems((xs) => [...xs, { ...row, products: product }]);
    setSearch(""); setSearchResults([]);
  };

  const updateItemQty = async (id: string, qty: number) => {
    const q = Math.max(1, Math.floor(qty || 1));
    setItems((xs) => xs.map((i) => (i.id === id ? { ...i, quantity: q } : i)));
    const { error } = await supabase.from("project_items").update({ quantity: q }).eq("id", id);
    if (error) toast.error(error.message);
  };

  const removeItem = async (id: string) => {
    const { error } = await supabase.from("project_items").delete().eq("id", id);
    if (error) return toast.error(error.message);
    setItems((xs) => xs.filter((i) => i.id !== id));
  };

  if (loading) return <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-accent" /></div>;
  if (!project || (user && project && (project as Project & { user_id?: string }).user_id && false)) {
    // RLS will keep us safe; show generic message if missing
    return <Card className="p-8 text-center">Project not found.</Card>;
  }
  if (!project) return <Card className="p-8 text-center">Project not found.</Card>;

  return (
    <div className="space-y-5">
      <Link to="/pro-hub/projects" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> All projects
      </Link>

      {/* Header */}
      <Card className="p-5">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-2xl font-bold text-primary">{project.name}</h1>
            {project.client_name && <p className="text-sm text-muted-foreground">{project.client_name}{project.location ? ` · ${project.location}` : ""}</p>}
          </div>
          <Select value={project.status} onValueChange={(v) => updateProject({ status: v })}>
            <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
            <SelectContent>
              {STATUSES.map((s) => <SelectItem key={s} value={s}>{s.replace(/_/g, " ")}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </Card>

      <div className="grid gap-5 lg:grid-cols-3">
        {/* Calculator */}
        <Card className="space-y-3 p-5 lg:col-span-1">
          <div className="flex items-center gap-2">
            <Calculator className="h-4 w-4 text-accent" />
            <h2 className="font-semibold">Paint Calculator</h2>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="text-xs">Wall width (ft)</Label>
              <Input type="number" min="0" value={project.wall_width ?? ""} onChange={(e) => updateProject({ wall_width: e.target.value ? Number(e.target.value) : null })} />
            </div>
            <div>
              <Label className="text-xs">Wall height (ft)</Label>
              <Input type="number" min="0" value={project.wall_height ?? ""} onChange={(e) => updateProject({ wall_height: e.target.value ? Number(e.target.value) : null })} />
            </div>
          </div>
          <div className="rounded-md bg-muted/40 p-3 text-sm">
            <div className="flex justify-between"><span className="text-muted-foreground">Wall area</span><span className="font-semibold">{wallArea.toLocaleString()} sq ft</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Selected gallons</span><span className="font-semibold">{totals.totalGallons}</span></div>
          </div>
          <div className="space-y-1 border-t border-border pt-3 text-sm">
            <div className="flex justify-between"><span className="text-muted-foreground">Subtotal</span><span>${totals.subtotal.toFixed(2)}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">VAT (10%)</span><span>${totals.vat.toFixed(2)}</span></div>
            <div className="flex justify-between text-base font-bold text-primary"><span>Estimate</span><span>${totals.total.toFixed(2)}</span></div>
            <p className="text-[10px] text-muted-foreground">Estimate at indicative ${GALLON_PRICE}/gal. Final pricing applies your contractor tier at checkout.</p>
          </div>
          {saving && <div className="text-[10px] text-muted-foreground">Saving…</div>}
        </Card>

        {/* Colors */}
        <Card className="p-5 lg:col-span-2">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-semibold">Selected Colors</h2>
            <Button asChild size="sm" variant="outline">
              <Link to="/pro-hub">Add from catalog →</Link>
            </Button>
          </div>
          {colors.length === 0 ? (
            <div className="rounded-md border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
              No colors yet. Browse the <Link to="/pro-hub" className="text-accent underline">Global Catalog</Link> and tap a swatch to add it here.
            </div>
          ) : (
            <ul className="divide-y divide-border">
              {colors.map((c) => (
                <li key={c.id} className="flex flex-wrap items-center gap-3 py-3">
                  <div className="h-12 w-12 shrink-0 rounded-md border border-border" style={{ backgroundColor: c.paint_colors?.hex }} />
                  <div className="min-w-0 flex-1">
                    <div className="font-mono text-[10px] text-accent">{c.paint_colors?.code}</div>
                    <div className="truncate font-semibold">{c.paint_colors?.name}</div>
                  </div>
                  <Input
                    type="number" min={1}
                    value={c.gallons}
                    onChange={(e) => updateColor(c.id, { gallons: Math.max(1, Number(e.target.value || 1)) })}
                    className="w-20"
                  />
                  <span className="text-xs text-muted-foreground">gal</span>
                  <Select value={c.finish} onValueChange={(v) => updateColor(c.id, { finish: v })}>
                    <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {["Matte","Eggshell","Satin","Semi-Gloss"].map((f) => <SelectItem key={f} value={f}>{f}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  {wallArea > 0 && c.paint_colors && (
                    <button
                      onClick={() => updateColor(c.id, { gallons: suggestedGallons(c.paint_colors!.coverage_sqft) })}
                      className="text-[10px] uppercase tracking-wider text-accent hover:underline"
                    >
                      Auto ({suggestedGallons(c.paint_colors.coverage_sqft)} gal)
                    </button>
                  )}
                  <Button size="icon" variant="ghost" onClick={() => removeColor(c.id)} aria-label="Remove">
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      {/* Notes */}
      <Card className="p-5">
        <Label className="text-xs">Project notes</Label>
        <Textarea
          value={project.notes ?? ""}
          onChange={(e) => setProject({ ...project, notes: e.target.value })}
          onBlur={() => updateProject({ notes: project.notes })}
          rows={4}
          placeholder="Site notes, access, deadlines…"
        />
      </Card>
    </div>
  );
}
