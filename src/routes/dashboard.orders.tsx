import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Loader2, Plus, Search, DollarSign, Clock, Truck, CheckCircle2 } from "lucide-react";

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

const STATUS_STYLE: Record<string, string> = {
  pending: "bg-warning/15 text-warning-foreground border border-warning/40",
  confirmed: "bg-teal/15 text-teal border border-teal/40",
  preparing: "bg-teal/15 text-teal border border-teal/40",
  out_for_delivery: "bg-accent/15 text-accent border border-accent/40",
  completed: "bg-success/15 text-success border border-success/40",
  cancelled: "bg-destructive/15 text-destructive border border-destructive/40",
};

const PAYMENT_STYLE: Record<string, string> = {
  unpaid: "bg-destructive/10 text-destructive border-destructive/30",
  partial: "bg-warning/15 text-warning-foreground border-warning/40",
  paid: "bg-success/15 text-success border-success/40",
};

function StatusPill({ value, map }: { value: string; map: Record<string, string> }) {
  const cls = map[value] ?? "bg-muted text-muted-foreground border-border";
  return (
    <span className={`inline-flex rounded-full border px-2 py-0.5 text-[11px] font-semibold capitalize ${cls}`}>
      {value.replace(/_/g, " ")}
    </span>
  );
}

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

  const stats = useMemo(() => {
    const now = Date.now();
    const monthRevenue = orders
      .filter((o) => now - new Date(o.created_at).getTime() < 30 * 24 * 60 * 60 * 1000)
      .reduce((s, o) => s + Number(o.total ?? 0), 0);
    return {
      total: orders.length,
      pending: orders.filter((o) => o.status === "pending").length,
      shipping: orders.filter((o) => o.status === "out_for_delivery" || o.status === "preparing").length,
      completed: orders.filter((o) => o.status === "completed").length,
      monthRevenue,
    };
  }, [orders]);

  return (
    <div className="space-y-5">
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

      {/* Stat cards */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-md bg-accent/10 text-accent">
              <DollarSign className="h-5 w-5" />
            </div>
            <div>
              <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                30-Day Revenue
              </div>
              <div className="text-xl font-bold text-primary">${stats.monthRevenue.toFixed(2)}</div>
            </div>
          </div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-md bg-warning/15 text-warning-foreground">
              <Clock className="h-5 w-5" />
            </div>
            <div>
              <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Pending</div>
              <div className="text-xl font-bold text-primary">{stats.pending}</div>
            </div>
          </div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-md bg-teal/15 text-teal">
              <Truck className="h-5 w-5" />
            </div>
            <div>
              <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">In Transit</div>
              <div className="text-xl font-bold text-primary">{stats.shipping}</div>
            </div>
          </div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-md bg-success/15 text-success">
              <CheckCircle2 className="h-5 w-5" />
            </div>
            <div>
              <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Completed</div>
              <div className="text-xl font-bold text-primary">{stats.completed}</div>
            </div>
          </div>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2">
        <div className="relative md:w-72">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search order # or client…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
          <SelectContent>
            {STATUS_OPTIONS.map((s) => (
              <SelectItem key={s} value={s}>{s === "all" ? "All statuses" : s.replace(/_/g, " ")}</SelectItem>
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
          <div className="overflow-x-auto">
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
