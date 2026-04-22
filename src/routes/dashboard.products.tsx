import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/dashboard/products")({
  component: AdminProductsPage,
});

interface Product {
  id: string;
  name: string;
  sku: string;
  brand: string | null;
  category: string;
  stock_quantity: number;
  status: string;
  price: number | null;
}

function AdminProductsPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");

  const load = () =>
    supabase
      .from("products")
      .select("*")
      .order("category")
      .order("name")
      .then(({ data }) => {
        setProducts((data ?? []) as Product[]);
        setLoading(false);
      });
  useEffect(() => { load(); }, []);

  const updatePrice = async (id: string, price: number | null) => {
    const { error } = await supabase.from("products").update({ price }).eq("id", id);
    if (error) toast.error(error.message);
    else toast.success("Price updated");
  };

  const filtered = products.filter(
    (p) => q === "" || p.name.toLowerCase().includes(q.toLowerCase()) || p.sku.includes(q),
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="text-3xl font-bold text-primary">Products</h1>
          <p className="text-muted-foreground">{products.length} items · click a price to edit</p>
        </div>
        <Input
          placeholder="Search…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className="md:w-64"
        />
      </div>
      <Card className="overflow-hidden">
        {loading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-accent" />
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>SKU</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>Brand</TableHead>
                <TableHead>Stock</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Price ($)</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((p) => (
                <TableRow key={p.id}>
                  <TableCell className="font-mono text-xs">{p.sku}</TableCell>
                  <TableCell className="font-medium">{p.name}</TableCell>
                  <TableCell>{p.category}</TableCell>
                  <TableCell className="text-sm">{p.brand ?? "—"}</TableCell>
                  <TableCell>{p.stock_quantity}</TableCell>
                  <TableCell>
                    <Badge variant={p.status === "Out of Stock" ? "destructive" : p.status === "Low Stock" ? "secondary" : "default"}>
                      {p.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <Input
                      type="number"
                      step="0.01"
                      min="0"
                      defaultValue={p.price ?? ""}
                      placeholder="—"
                      className="ml-auto h-8 w-24 text-right"
                      onBlur={(e) => {
                        const v = e.target.value === "" ? null : Number(e.target.value);
                        if (v !== p.price) updatePrice(p.id, v);
                      }}
                    />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>
    </div>
  );
}
