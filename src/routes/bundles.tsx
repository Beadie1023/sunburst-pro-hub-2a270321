import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Header } from "@/components/Header";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, Package, Sparkles } from "lucide-react";

export const Route = createFileRoute("/bundles")({
  component: BundlesPage,
  head: () => ({
    meta: [
      { title: "Contractor Bundles | Sunburst Paints" },
      { name: "description", content: "Pre-built paint & supply bundles built from real products. Save 5–10% vs buying piece by piece." },
    ],
  }),
});

interface BundleRow {
  id: string;
  name: string;
  description: string | null;
  category: string;
  price: number | null;
  subtotal: number | null;
  discount_pct: number;
  bundle_items: { quantity: number; products: { name: string; sku: string; price: number | null } | null }[];
}

function BundlesPage() {
  const [bundles, setBundles] = useState<BundleRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase
      .from("bundles")
      .select("id,name,description,category,price,subtotal,discount_pct,bundle_items(quantity,products(name,sku,price))")
      .eq("active", true)
      .order("price", { ascending: true })
      .then(({ data }) => {
        setBundles((data ?? []) as unknown as BundleRow[]);
        setLoading(false);
      });
  }, []);

  return (
    <div className="min-h-screen bg-secondary">
      <Header />
      <div className="container mx-auto px-4 py-10">
        <div className="mx-auto max-w-2xl text-center">
          <h1 className="text-4xl font-bold text-primary">Contractor Bundles</h1>
          <p className="mt-2 text-muted-foreground">
            Pre-built kits from real Sunburst products. Order in one click — save 5–10%.
          </p>
        </div>

        {loading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="h-6 w-6 animate-spin text-accent" />
          </div>
        ) : (
          <div className="mt-10 grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {bundles.map((b, idx) => {
              const savings = (b.subtotal ?? 0) - (b.price ?? 0);
              const isBestValue = idx === bundles.length - 1;
              return (
                <Card key={b.id} className="overflow-hidden p-0">
                  <div className="flex items-center justify-between bg-primary px-6 py-3 text-xs font-bold uppercase tracking-wider text-accent">
                    <span>{b.category}</span>
                    {isBestValue && (
                      <span className="flex items-center gap-1 text-primary-foreground">
                        <Sparkles className="h-3 w-3" /> Best Value
                      </span>
                    )}
                  </div>
                  <div className="p-6">
                    <Package className="h-10 w-10 text-accent" />
                    <h3 className="mt-3 text-xl font-bold text-primary">{b.name}</h3>
                    {b.description && <p className="mt-2 text-sm text-muted-foreground">{b.description}</p>}

                    <ul className="mt-4 space-y-1 text-sm">
                      {b.bundle_items.map((it, i) => (
                        <li key={i} className="flex justify-between border-b border-border/50 py-1">
                          <span className="truncate pr-2">{it.products?.name ?? "—"}</span>
                          <Badge variant="secondary">×{it.quantity}</Badge>
                        </li>
                      ))}
                    </ul>

                    <div className="mt-5 flex items-end justify-between">
                      <div>
                        {b.subtotal != null && b.price != null && savings > 0 && (
                          <div className="text-xs text-muted-foreground line-through">
                            ${Number(b.subtotal).toFixed(2)}
                          </div>
                        )}
                        <div className="text-2xl font-bold text-primary">
                          ${Number(b.price ?? 0).toFixed(2)}
                        </div>
                        {savings > 0 && (
                          <div className="text-xs font-semibold text-accent">
                            You save ${savings.toFixed(2)} ({b.discount_pct}% off)
                          </div>
                        )}
                      </div>
                    </div>

                    <Button asChild className="mt-5 w-full bg-accent text-accent-foreground hover:bg-accent/90">
                      <Link to="/login">Add Bundle to Cart</Link>
                    </Button>
                  </div>
                </Card>
              );
            })}
            {bundles.length === 0 && (
              <p className="col-span-full py-16 text-center text-muted-foreground">No active bundles yet.</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
