import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { toast } from "sonner";
import { Loader2, Search, Pencil, Plus } from "lucide-react";

export const Route = createFileRoute("/dashboard/colors")({
  component: ColorAdminPage,
  head: () => ({ meta: [{ title: "Color Admin — Sunburst Paints" }] }),
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
  technical_notes: string | null;
  swatch_image_url: string | null;
  in_stock: boolean;
  active: boolean;
}

const DEFAULT_FINISHES = ["Matte", "Eggshell", "Satin", "Semi-Gloss", "Gloss"];

function ColorAdminPage() {
  const [colors, setColors] = useState<PaintColor[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [collection, setCollection] = useState("all");
  const [active, setActive] = useState<PaintColor | null>(null);
  const [creating, setCreating] = useState(false);

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("paint_colors")
      .select("*")
      .order("collection")
      .order("code");
    if (error) toast.error(error.message);
    setColors((data ?? []) as PaintColor[]);
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  const collections = useMemo(
    () => Array.from(new Set(colors.map((c) => c.collection))).sort(),
    [colors],
  );

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return colors.filter((c) => {
      if (collection !== "all" && c.collection !== collection) return false;
      if (!needle) return true;
      return (
        c.name.toLowerCase().includes(needle) ||
        c.code.toLowerCase().includes(needle) ||
        c.collection.toLowerCase().includes(needle)
      );
    });
  }, [colors, q, collection]);

  const stats = useMemo(() => {
    const total = colors.length;
    const inactive = colors.filter((c) => !c.active).length;
    const oos = colors.filter((c) => !c.in_stock).length;
    return { total, inactive, oos, collections: collections.length };
  }, [colors, collections]);

  const toggleActive = async (c: PaintColor) => {
    const { error } = await supabase
      .from("paint_colors")
      .update({ active: !c.active })
      .eq("id", c.id);
    if (error) return toast.error(error.message);
    setColors((prev) =>
      prev.map((x) => (x.id === c.id ? { ...x, active: !c.active } : x)),
    );
  };

  const toggleStock = async (c: PaintColor) => {
    const { error } = await supabase
      .from("paint_colors")
      .update({ in_stock: !c.in_stock })
      .eq("id", c.id);
    if (error) return toast.error(error.message);
    setColors((prev) =>
      prev.map((x) => (x.id === c.id ? { ...x, in_stock: !c.in_stock } : x)),
    );
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold text-primary">Color Catalog Admin</h1>
          <p className="text-muted-foreground">
            Curate the full Sunburst swatch library — edit metadata, toggle stock and visibility.
          </p>
        </div>
        <Button
          onClick={() => setCreating(true)}
          className="bg-accent text-accent-foreground hover:bg-accent/90"
        >
          <Plus className="mr-1.5 h-4 w-4" /> New color
        </Button>
      </div>

      <div className="grid gap-3 sm:grid-cols-4">
        <StatCard label="Total colors" value={stats.total} />
        <StatCard label="Collections" value={stats.collections} />
        <StatCard label="Hidden" value={stats.inactive} tone="warning" />
        <StatCard label="Out of stock" value={stats.oos} tone="destructive" />
      </div>

      <Card className="flex flex-wrap items-center gap-2 p-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search code, name, collection…"
            className="pl-9"
          />
        </div>
        <Select value={collection} onValueChange={setCollection}>
          <SelectTrigger className="w-56">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All collections</SelectItem>
            {collections.map((c) => (
              <SelectItem key={c} value={c}>
                {c}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Card>

      {loading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-accent" />
        </div>
      ) : (
        <Card className="overflow-hidden">
          <div className="max-h-[70vh] overflow-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 z-10 bg-muted/80 backdrop-blur">
                <tr className="text-left text-xs uppercase tracking-wider text-muted-foreground">
                  <th className="px-3 py-2">Swatch</th>
                  <th className="px-3 py-2">Code</th>
                  <th className="px-3 py-2">Name</th>
                  <th className="px-3 py-2 hidden md:table-cell">Collection</th>
                  <th className="px-3 py-2 hidden lg:table-cell">LRV</th>
                  <th className="px-3 py-2">Stock</th>
                  <th className="px-3 py-2">Active</th>
                  <th className="px-3 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((c) => (
                  <tr key={c.id} className="border-t border-border hover:bg-muted/30">
                    <td className="px-3 py-2">
                      <div
                        className="h-9 w-9 rounded border border-border shadow-inner"
                        style={{ backgroundColor: c.hex }}
                      />
                    </td>
                    <td className="px-3 py-2 font-mono text-xs text-accent">{c.code}</td>
                    <td className="px-3 py-2 font-medium">{c.name}</td>
                    <td className="px-3 py-2 hidden md:table-cell text-muted-foreground">
                      {c.collection}
                    </td>
                    <td className="px-3 py-2 hidden lg:table-cell text-muted-foreground">
                      {c.lrv ?? "—"}
                    </td>
                    <td className="px-3 py-2">
                      <Switch checked={c.in_stock} onCheckedChange={() => toggleStock(c)} />
                    </td>
                    <td className="px-3 py-2">
                      <Switch checked={c.active} onCheckedChange={() => toggleActive(c)} />
                    </td>
                    <td className="px-3 py-2 text-right">
                      <Button variant="ghost" size="sm" onClick={() => setActive(c)}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                    </td>
                  </tr>
                ))}
                {filtered.length === 0 && (
                  <tr>
                    <td colSpan={8} className="px-3 py-12 text-center text-muted-foreground">
                      No colors match your filters.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      <EditDrawer
        color={active}
        onClose={() => setActive(null)}
        onSaved={(updated) => {
          setColors((prev) => prev.map((c) => (c.id === updated.id ? updated : c)));
          setActive(null);
        }}
      />

      <CreateDrawer
        open={creating}
        onClose={() => setCreating(false)}
        onCreated={(created) => {
          setColors((prev) => [...prev, created]);
          setCreating(false);
        }}
        collections={collections}
      />
    </div>
  );
}

function StatCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone?: "warning" | "destructive";
}) {
  const toneClass =
    tone === "warning"
      ? "text-warning"
      : tone === "destructive"
        ? "text-destructive"
        : "text-accent";
  return (
    <Card className="p-4">
      <div className="text-xs uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className={`mt-1 text-2xl font-bold ${toneClass}`}>{value}</div>
    </Card>
  );
}

function EditDrawer({
  color,
  onClose,
  onSaved,
}: {
  color: PaintColor | null;
  onClose: () => void;
  onSaved: (c: PaintColor) => void;
}) {
  const [draft, setDraft] = useState<PaintColor | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setDraft(color ? { ...color } : null);
  }, [color]);

  if (!color || !draft) {
    return (
      <Sheet open={false} onOpenChange={() => onClose()}>
        <SheetContent />
      </Sheet>
    );
  }

  const toggleFinish = (f: string) => {
    setDraft({
      ...draft,
      finishes: draft.finishes.includes(f)
        ? draft.finishes.filter((x) => x !== f)
        : [...draft.finishes, f],
    });
  };

  const save = async () => {
    setSaving(true);
    const { data, error } = await supabase
      .from("paint_colors")
      .update({
        name: draft.name,
        hex: draft.hex,
        collection: draft.collection,
        lrv: draft.lrv,
        drying_time: draft.drying_time,
        recommended_use: draft.recommended_use,
        finishes: draft.finishes,
        coverage_sqft: draft.coverage_sqft,
        technical_notes: draft.technical_notes,
        swatch_image_url: draft.swatch_image_url,
      })
      .eq("id", draft.id)
      .select("*")
      .maybeSingle();
    setSaving(false);
    if (error || !data) return toast.error(error?.message ?? "Save failed");
    toast.success("Color updated");
    onSaved(data as PaintColor);
  };

  return (
    <Sheet open onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
        <SheetHeader>
          <SheetTitle className="font-mono text-xs text-accent">{draft.code}</SheetTitle>
        </SheetHeader>
        <div className="mt-4 space-y-4">
          <div
            className="h-32 w-full rounded border border-border shadow-inner"
            style={{ backgroundColor: draft.hex }}
          />
          <div className="grid grid-cols-2 gap-3">
            <Field label="Name">
              <Input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
            </Field>
            <Field label="Hex">
              <Input
                value={draft.hex}
                onChange={(e) => setDraft({ ...draft, hex: e.target.value })}
                className="font-mono"
              />
            </Field>
            <Field label="Collection" className="col-span-2">
              <Input
                value={draft.collection}
                onChange={(e) => setDraft({ ...draft, collection: e.target.value })}
              />
            </Field>
            <Field label="LRV">
              <Input
                type="number"
                step="0.1"
                value={draft.lrv ?? ""}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    lrv: e.target.value === "" ? null : Number(e.target.value),
                  })
                }
              />
            </Field>
            <Field label="Coverage (sq ft / gal)">
              <Input
                type="number"
                value={draft.coverage_sqft}
                onChange={(e) => setDraft({ ...draft, coverage_sqft: Number(e.target.value) })}
              />
            </Field>
            <Field label="Drying time" className="col-span-2">
              <Input
                value={draft.drying_time ?? ""}
                onChange={(e) => setDraft({ ...draft, drying_time: e.target.value })}
              />
            </Field>
            <Field label="Swatch image URL" className="col-span-2">
              <Input
                value={draft.swatch_image_url ?? ""}
                placeholder="https://…"
                onChange={(e) => setDraft({ ...draft, swatch_image_url: e.target.value })}
              />
            </Field>
            <Field label="Recommended use" className="col-span-2">
              <Textarea
                value={draft.recommended_use ?? ""}
                onChange={(e) => setDraft({ ...draft, recommended_use: e.target.value })}
              />
            </Field>
            <Field label="Technical notes" className="col-span-2">
              <Textarea
                value={draft.technical_notes ?? ""}
                onChange={(e) => setDraft({ ...draft, technical_notes: e.target.value })}
              />
            </Field>
          </div>

          <div>
            <div className="mb-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Available finishes
            </div>
            <div className="flex flex-wrap gap-1.5">
              {DEFAULT_FINISHES.map((f) => {
                const on = draft.finishes.includes(f);
                return (
                  <button
                    key={f}
                    type="button"
                    onClick={() => toggleFinish(f)}
                    className={`rounded-full border px-3 py-1 text-xs font-medium transition ${
                      on
                        ? "border-accent bg-accent text-accent-foreground"
                        : "border-border bg-card hover:bg-muted"
                    }`}
                  >
                    {f}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="flex gap-2 pt-2">
            <Button variant="outline" onClick={onClose} className="flex-1">
              Cancel
            </Button>
            <Button
              onClick={save}
              disabled={saving}
              className="flex-1 bg-accent text-accent-foreground hover:bg-accent/90"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save changes"}
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function Field({
  label,
  className,
  children,
}: {
  label: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={className}>
      <Label className="text-xs">{label}</Label>
      <div className="mt-1">{children}</div>
    </div>
  );
}

function CreateDrawer({
  open,
  onClose,
  onCreated,
  collections,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: (c: PaintColor) => void;
  collections: string[];
}) {
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setBusy(true);
    const { data, error } = await supabase
      .from("paint_colors")
      .insert({
        code: fd.get("code") as string,
        name: fd.get("name") as string,
        hex: fd.get("hex") as string,
        collection: fd.get("collection") as string,
        lrv: fd.get("lrv") ? Number(fd.get("lrv")) : null,
        coverage_sqft: Number(fd.get("coverage_sqft") || 350),
        drying_time: (fd.get("drying_time") as string) || null,
      })
      .select("*")
      .maybeSingle();
    setBusy(false);
    if (error || !data) return toast.error(error?.message ?? "Could not create");
    toast.success("Color created");
    onCreated(data as PaintColor);
  };

  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-md">
        <SheetHeader>
          <SheetTitle>Create color</SheetTitle>
        </SheetHeader>
        <form onSubmit={submit} className="mt-4 space-y-3">
          <Field label="Code (unique)">
            <Input name="code" required placeholder="SP-0900" />
          </Field>
          <Field label="Name">
            <Input name="name" required />
          </Field>
          <Field label="Hex">
            <Input name="hex" required placeholder="#A8D6E5" className="font-mono" />
          </Field>
          <Field label="Collection">
            <Input name="collection" required list="collections" />
            <datalist id="collections">
              {collections.map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
          </Field>
          <Field label="LRV">
            <Input name="lrv" type="number" step="0.1" />
          </Field>
          <Field label="Coverage (sq ft / gal)">
            <Input name="coverage_sqft" type="number" defaultValue={350} />
          </Field>
          <Field label="Drying time">
            <Input name="drying_time" placeholder="1 hour to touch / 4 hours recoat" />
          </Field>
          <div className="flex gap-2 pt-2">
            <Button type="button" variant="outline" onClick={onClose} className="flex-1">
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={busy}
              className="flex-1 bg-accent text-accent-foreground hover:bg-accent/90"
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Create"}
            </Button>
          </div>
        </form>
      </SheetContent>
    </Sheet>
  );
}
