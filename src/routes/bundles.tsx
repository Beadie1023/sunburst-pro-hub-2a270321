import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Header } from "@/components/Header";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, Package } from "lucide-react";

export const Route = createFileRoute("/bundles")({
  component: BundlesPage,
  head: () => ({
    meta: [
      { title: "Contractor Bundles | Sunburst Paints" },
      { name: "description", content: "Pre-built paint & supply bundles to keep your crew moving. Save on common job kits." },
    ],
  }),
});

interface Bundle {
  id: string;
  name: string;
  description: string | null;
  category: string;
  items: { name: string; qty: number }[];
  price: number | null;
}

function BundlesPage() {
  const [bundles, setBundles] = useState<Bundle[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase
      .from("bundles")
      .select("*")
      .eq("active", true)
      .order("name")
      .then(({ data }) => {
        setBundles((data ?? []) as unknown as Bundle[]);
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
            Pre-built kits for common jobs. One click — everything you need ships together.
          </p>
        </div>

        {loading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="h-6 w-6 animate-spin text-accent" />
          </div>
        ) : (
          <div className="mt-10 grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {bundles.map((b) => (
              <Card key={b.id} className="overflow-hidden p-0">
                <div className="flex items-center justify-between bg-primary px-6 py-3 text-xs font-bold uppercase tracking-wider text-accent">
                  <span>{b.category}</span>
                  {b.price != null && <span className="text-primary-foreground">${Number(b.price).toFixed(2)}</span>}
                </div>
                <div className="p-6">
                  <Package className="h-10 w-10 text-accent" />
                  <h3 className="mt-3 text-xl font-bold text-primary">{b.name}</h3>
                  {b.description && <p className="mt-2 text-sm text-muted-foreground">{b.description}</p>}
                  <ul className="mt-4 space-y-1 text-sm">
                    {b.items.map((it, i) => (
                      <li key={i} className="flex justify-between border-b border-border/50 py-1">
                        <span>{it.name}</span>
                        <Badge variant="secondary">×{it.qty}</Badge>
                      </li>
                    ))}
                  </ul>
                  <Button asChild className="mt-5 w-full bg-accent text-accent-foreground hover:bg-accent/90">
                    <Link to="/login">Order Bundle</Link>
                  </Button>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
