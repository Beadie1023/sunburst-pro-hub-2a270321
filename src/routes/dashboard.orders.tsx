import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
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
  vat_amount: number;
  created_at: string;
  client_id: string | null;
  clients: { company_name: string } | null;
}

const STATUS_OPTIONS = ["all", "pending", "confirmed", "preparing", "out_for_delivery", "completed", "cancelled"];

function OrdersPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("all");

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

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return orders.filter((o) => {
      if (status !== "all" && o.status !== status) return false;
      if (!needle) return true;
      return (
        o.order_number.toLowerCase().includes(needle) ||
        (o.clients?.company_name ?? "").toLowerCase().includes(needle)
      );
    });
  }, [orders, q, status]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
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

      <div className="flex flex-wrap gap-2">
        <Input
          placeholder="Search order # or client…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className="md:w-72"
        />
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
          <SelectContent>
            {STATUS_OPTIONS.map((s) => (
              <SelectItem key={s} value={s}>{s === "all" ? "All statuses" : s}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <Card className="overflow-hidden">
        {loading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-accent" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="py-16 text-center">
            <p className="text-muted-foreground">No matching orders.</p>
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
                <TableHead className="text-right">VAT</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead>Date</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((o) => (
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
                  <TableCell className="text-right text-sm text-muted-foreground">${Number(o.vat_amount ?? 0).toFixed(2)}</TableCell>
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
