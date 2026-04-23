import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState, useMemo } from "react";
import { Header } from "@/components/Header";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useCart } from "@/lib/cart";
import { useAuth } from "@/lib/auth";
import { Loader2, Search, Plus } from "lucide-react";
import { toast } from "sonner";

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
  contractor_price: number | null;
}

function ProductsPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [cat, setCat] = useState<string>("All");
  const { addToCart } = useCart();
  const { role } = useAuth();
  const isContractor = role === "contractor" || role === "admin";

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

  const effectivePrice = (p: Product) =>
    isContractor && p.contractor_price != null ? Number(p.contractor_price) : p.price != null ? Number(p.price) : null;

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <div className="container mx-auto px-4 py-8">
        <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
          <div>
            <h1 className="text-3xl font-bold text-primary">Product Catalog</h1>
            <p className="text-muted-foreground">{products.length} items in stock at Nassau warehouse</p>
            {isContractor && (
              <div className="mt-2 inline-flex items-center gap-2 rounded-md bg-accent/10 px-3 py-1 text-xs font-bold uppercase tracking-wider text-accent">
                Pro Pricing Applied · 10% off
              </div>
            )}
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
            {filtered.map((p) => {
              const eff = effectivePrice(p);
              const showProSavings = isContractor && p.contractor_price != null && p.price != null && p.contractor_price < p.price;
              const outOfStock = p.status === "Out of Stock";
              return (
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
                  <div className="mt-auto flex items-end justify-between gap-2 pt-4">
                    <div className="text-sm">
                      {eff != null ? (
                        <>
                          {showProSavings && (
                            <div className="text-xs text-muted-foreground line-through">${Number(p.price).toFixed(2)}</div>
                          )}
                          <div className="text-lg font-bold text-foreground">
                            ${eff.toFixed(2)} <span className="text-xs font-normal text-muted-foreground">/ {p.unit}</span>
                          </div>
                          {showProSavings && (
                            <div className="text-[10px] font-bold uppercase text-accent">Pro Price</div>
                          )}
                        </>
                      ) : (
                        <div className="text-sm font-semibold text-muted-foreground">Price on request</div>
                      )}
                      <div className="mt-0.5 text-xs text-muted-foreground">
                        Stock: {p.stock_quantity} {p.unit}
                      </div>
                    </div>
                    <Button
                      size="sm"
                      disabled={outOfStock || eff == null}
                      onClick={() => {
                        addToCart({ product_id: p.id, sku: p.sku, name: p.name, price: eff! });
                        toast.success(`${p.name} added to job`);
                      }}
                      className="bg-accent text-accent-foreground hover:bg-accent/90"
                    >
                      <Plus className="mr-1 h-4 w-4" /> Add
                    </Button>
                  </div>
                </Card>
              );
            })}
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
