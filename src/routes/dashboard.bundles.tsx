import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Plus, Loader2, Package } from "lucide-react";

export const Route = createFileRoute("/dashboard/bundles")({
  component: AdminBundles,
});

interface Bundle {
  id: string;
  name: string;
  description: string | null;
  category: string;
  items: { name: string; qty: number }[];
  price: number | null;
  active: boolean;
}

function AdminBundles() {
  const [bundles, setBundles] = useState<Bundle[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);

  const load = () =>
    supabase
      .from("bundles")
      .select("*")
      .order("created_at", { ascending: false })
      .then(({ data }) => {
        setBundles((data ?? []) as unknown as Bundle[]);
        setLoading(false);
      });

  useEffect(() => {
    load();
  }, []);

  const onCreate = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const itemsRaw = (fd.get("items") as string).trim();
    const items = itemsRaw
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean)
      .map((l) => {
        const m = l.match(/^(.+?)\s*[x×]\s*(\d+)$/i);
        return m ? { name: m[1].trim(), qty: Number(m[2]) } : { name: l, qty: 1 };
      });
    const { error } = await supabase.from("bundles").insert({
      name: fd.get("name") as string,
      description: fd.get("description") as string,
      category: (fd.get("category") as string) || "General",
      price: fd.get("price") ? Number(fd.get("price")) : null,
      items,
    });
    if (error) return toast.error(error.message);
    toast.success("Bundle created");
    setOpen(false);
    load();
  };

  const toggleActive = async (id: string, active: boolean) => {
    await supabase.from("bundles").update({ active }).eq("id", id);
    load();
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-primary">Bundles</h1>
          <p className="text-muted-foreground">Pre-built product kits sold to contractors.</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button className="bg-accent text-accent-foreground hover:bg-accent/90">
              <Plus className="mr-2 h-4 w-4" /> New Bundle
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Create Bundle</DialogTitle></DialogHeader>
            <form onSubmit={onCreate} className="space-y-3">
              <div><Label>Name</Label><Input name="name" required /></div>
              <div><Label>Category</Label><Input name="category" placeholder="Interior, Exterior, Tools…" /></div>
              <div><Label>Description</Label><Textarea name="description" rows={2} /></div>
              <div><Label>Price ($)</Label><Input name="price" type="number" step="0.01" /></div>
              <div>
                <Label>Items (one per line, format: "Name x 2")</Label>
                <Textarea name="items" rows={5} placeholder={'9" Roller Sleeve x 4\n2.5" Angle Brush x 2'} />
              </div>
              <Button type="submit" className="w-full bg-accent text-accent-foreground hover:bg-accent/90">
                Create
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-accent" /></div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {bundles.map((b) => (
            <Card key={b.id} className="p-5">
              <div className="flex items-start justify-between">
                <div className="flex items-start gap-3">
                  <Package className="mt-1 h-6 w-6 text-accent" />
                  <div>
                    <h3 className="font-bold text-primary">{b.name}</h3>
                    <Badge variant="secondary" className="mt-1">{b.category}</Badge>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">Active</span>
                  <Switch checked={b.active} onCheckedChange={(v) => toggleActive(b.id, v)} />
                </div>
              </div>
              {b.description && <p className="mt-2 text-sm text-muted-foreground">{b.description}</p>}
              <div className="mt-3 text-sm">{b.items.length} items{b.price != null && ` · $${Number(b.price).toFixed(2)}`}</div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
