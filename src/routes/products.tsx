import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState, useMemo } from "react";
import { Header } from "@/components/Header";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, Search } from "lucide-react";

export const Route = createFileRoute("/products")({
  component: ProductsPage,
});

interface Product {
  id: string;
  name: string;
  sku: string;
  brand: string | null;
  category: string;
  unit: string;
  stock_quantity: number;
  status: string;
  price: number | null;
}

function ProductsPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [cat, setCat] = useState<string>("All");

  useEffect(() => {
    supabase
      .from("products")
      .select("*")
      .order("category")
      .order("name")
      .then(({ data }) => {
        setProducts((data ?? []) as Product[]);
        setLoading(false);
      });
  }, []);

  const categories = useMemo(
    () => ["All", ...Array.from(new Set(products.map((p) => p.category))).sort()],
    [products],
  );

  const filtered = products.filter(
    (p) =>
      (cat === "All" || p.category === cat) &&
      (q === "" || p.name.toLowerCase().includes(q.toLowerCase()) || p.sku.includes(q)),
  );

  const statusVariant = (s: string) =>
    s === "Out of Stock" ? "destructive" : s === "Low Stock" ? "secondary" : "default";

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <div className="container mx-auto px-4 py-8">
        <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
          <div>
            <h1 className="text-3xl font-bold text-primary">Product Catalog</h1>
            <p className="text-muted-foreground">{products.length} items in stock at Nassau warehouse</p>
          </div>
          <div className="relative md:w-72">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search by name or SKU…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              className="pl-9"
            />
          </div>
        </div>

        <div className="mt-6 flex flex-wrap gap-2">
          {categories.map((c) => (
            <button
              key={c}
              onClick={() => setCat(c)}
              className={`rounded-full px-4 py-1.5 text-sm font-semibold transition-colors ${
                cat === c
                  ? "bg-primary text-primary-foreground"
                  : "bg-secondary text-secondary-foreground hover:bg-muted"
              }`}
            >
              {c}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="flex justify-center py-20">
            <Loader2 className="h-8 w-8 animate-spin text-accent" />
          </div>
        ) : (
          <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {filtered.map((p) => (
              <Card key={p.id} className="flex flex-col p-4 transition-shadow hover:shadow-lg">
                <div className="flex items-start justify-between gap-2">
                  <span className="text-xs font-semibold uppercase tracking-wide text-accent">
                    {p.category}
                  </span>
                  <Badge variant={statusVariant(p.status) as "default" | "secondary" | "destructive"}>
                    {p.status}
                  </Badge>
                </div>
                <h3 className="mt-2 font-bold leading-tight text-primary">{p.name}</h3>
                <div className="mt-1 text-xs text-muted-foreground">
                  SKU {p.sku} {p.brand && `· ${p.brand}`}
                </div>
                <div className="mt-auto flex items-end justify-between pt-4">
                  <div className="text-sm">
                    <div className="font-semibold text-foreground">
                      {p.price ? `$${Number(p.price).toFixed(2)}` : "Pricing on request"}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      Stock: {p.stock_quantity} {p.unit}
                    </div>
                  </div>
                </div>
              </Card>
            ))}
            {filtered.length === 0 && (
              <p className="col-span-full py-10 text-center text-muted-foreground">
                No products match your search.
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
