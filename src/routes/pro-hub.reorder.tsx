import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { useCart } from "@/lib/cart";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2, RotateCcw, ShoppingCart } from "lucide-react";

export const Route = createFileRoute("/pro-hub/reorder")({
  component: ReorderPage,
});

interface OrderRow {
  id: string;
  order_number: string;
  total: number;
  created_at: string;
  status: string;
  items: { product_id: string; sku: string; name: string; unit_price: number; quantity: number }[];
}

function ReorderPage() {
  const { user } = useAuth();
  const { addToCart } = useCart();
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      if (!user) return;
      // Find this contractor's client records, then their orders
      const { data: clientRows } = await supabase.from("clients").select("id").eq("email", user.email ?? "");
      const clientIds = (clientRows ?? []).map((r: { id: string }) => r.id);
      if (clientIds.length === 0) { setLoading(false); return; }
      const { data } = await supabase
        .from("orders")
        .select("id, order_number, total, created_at, status, items")
        .in("client_id", clientIds)
        .order("created_at", { ascending: false })
        .limit(20);
      setOrders((data ?? []) as OrderRow[]);
      setLoading(false);
    })();
  }, [user]);

  const reorderAll = (o: OrderRow) => {
    o.items.forEach((it) =>
      addToCart({ product_id: it.product_id, sku: it.sku, name: it.name, price: it.unit_price }, it.quantity)
    );
    toast.success(`Added ${o.items.reduce((s, i) => s + i.quantity, 0)} items to cart`);
  };

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-3xl font-bold text-primary">Reorder Center</h1>
        <p className="text-muted-foreground">Repeat past orders in one tap.</p>
      </div>
      {loading ? (
        <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-accent" /></div>
      ) : orders.length === 0 ? (
        <Card className="p-12 text-center">
          <RotateCcw className="mx-auto h-10 w-10 text-muted-foreground" />
          <p className="mt-3 text-muted-foreground">No previous orders found for your account.</p>
          <Link to="/products" className="mt-3 inline-block text-accent underline">Start your first order →</Link>
        </Card>
      ) : (
        <div className="space-y-3">
          {orders.map((o) => (
            <Card key={o.id} className="p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="font-mono text-sm font-bold text-accent">{o.order_number}</div>
                  <div className="text-xs text-muted-foreground">
                    {new Date(o.created_at).toLocaleDateString()} · {o.items?.length ?? 0} line items · ${Number(o.total).toFixed(2)}
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" asChild>
                    <Link to="/order-confirmation/$orderId" params={{ orderId: o.id }}>View</Link>
                  </Button>
                  <Button size="sm" onClick={() => reorderAll(o)} className="bg-accent text-accent-foreground hover:bg-accent/90">
                    <ShoppingCart className="mr-1.5 h-4 w-4" /> Reorder all
                  </Button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
