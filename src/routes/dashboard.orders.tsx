import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Loader2, Plus } from "lucide-react";

export const Route = createFileRoute("/dashboard/orders")({
  component: OrdersPage,
});

interface Order {
  id: string;
  order_number: string;
  status: string;
  payment_status: string;
  payment_method: string | null;
  delivery_method: string | null;
  total: number;
  created_at: string;
  client_id: string | null;
  clients: { company_name: string } | null;
}

function OrdersPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase
      .from("orders")
      .select("*, clients(company_name)")
      .order("created_at", { ascending: false })
      .then(({ data }) => {
        setOrders((data ?? []) as Order[]);
        setLoading(false);
      });
  }, []);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-primary">Orders</h1>
          <p className="text-muted-foreground">All contractor orders across the business.</p>
        </div>
        <Button asChild className="bg-accent text-accent-foreground hover:bg-accent/90">
          <Link to="/dashboard/orders/new">
            <Plus className="mr-2 h-4 w-4" /> New Order
          </Link>
        </Button>
      </div>
      <Card className="overflow-hidden">
        {loading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-accent" />
          </div>
        ) : orders.length === 0 ? (
          <div className="py-16 text-center">
            <p className="text-muted-foreground">No orders yet.</p>
            <Button asChild className="mt-4 bg-accent text-accent-foreground hover:bg-accent/90">
              <Link to="/dashboard/orders/new">Create your first order</Link>
            </Button>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Order #</TableHead>
                <TableHead>Client</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Payment</TableHead>
                <TableHead>Delivery</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead>Date</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {orders.map((o) => (
                <TableRow key={o.id} className="cursor-pointer hover:bg-muted/50" onClick={() => (window.location.href = `/dashboard/orders/${o.id}`)}>
                  <TableCell className="font-mono text-sm font-semibold text-accent">{o.order_number}</TableCell>
                  <TableCell>{o.clients?.company_name ?? "—"}</TableCell>
                  <TableCell>
                    <Badge variant={o.status === "completed" ? "default" : "secondary"}>
                      {o.status}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div className="text-xs">
                      <div className="font-medium">{o.payment_method ?? "—"}</div>
                      <div className="text-muted-foreground">{o.payment_status}</div>
                    </div>
                  </TableCell>
                  <TableCell className="text-sm">{o.delivery_method ?? "—"}</TableCell>
                  <TableCell className="text-right font-semibold">${Number(o.total).toFixed(2)}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {new Date(o.created_at).toLocaleDateString()}
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
