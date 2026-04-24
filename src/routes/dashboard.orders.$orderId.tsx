import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { ArrowLeft, Loader2, Repeat, CheckCircle2 } from "lucide-react";

export const Route = createFileRoute("/dashboard/orders/$orderId")({
  component: OrderDetail,
});

interface OrderItem {
  name: string;
  quantity: number;
  unit_price?: number;
  line_total?: number;
}

interface Order {
  id: string;
  order_number: string;
  status: string;
  payment_status: string;
  payment_method: string | null;
  delivery_method: string | null;
  delivery_address: string | null;
  notes: string | null;
  total: number;
  subtotal: number;
  vat_amount: number;
  items: OrderItem[];
  created_at: string;
  client_id: string | null;
  clients: { company_name: string; phone: string | null; email: string | null } | null;
}

interface HistoryEntry {
  id: string;
  status: string;
  note: string | null;
  created_at: string;
}

const STATUSES = ["pending", "confirmed", "preparing", "out_for_delivery", "completed", "cancelled"];

function OrderDetail() {
  const { orderId } = Route.useParams();
  const navigate = useNavigate();
  const [order, setOrder] = useState<Order | null>(null);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);

  const load = async () => {
    const { data: o } = await supabase
      .from("orders")
      .select("*, clients(company_name, phone, email)")
      .eq("id", orderId)
      .maybeSingle();
    const { data: h } = await supabase
      .from("order_status_history")
      .select("*")
      .eq("order_id", orderId)
      .order("created_at", { ascending: false });
    setOrder(o as unknown as Order);
    setHistory((h ?? []) as HistoryEntry[]);
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, [orderId]);

  const updateStatus = async (status: string) => {
    if (!order) return;
    setUpdating(true);
    const { data: u } = await supabase.auth.getUser();
    await supabase.from("orders").update({ status }).eq("id", order.id);
    await supabase.from("order_status_history").insert({
      order_id: order.id,
      status,
      changed_by: u.user?.id,
    });
    setUpdating(false);
    toast.success(`Status: ${status}`);
    load();
  };

  const reorder = async () => {
    if (!order) return;
    const { data, error } = await supabase
      .from("orders")
      .insert({
        client_id: order.client_id,
        payment_method: order.payment_method,
        delivery_method: order.delivery_method,
        delivery_address: order.delivery_address,
        notes: `Reorder of ${order.order_number}\n\n${order.notes ?? ""}`,
        subtotal: order.subtotal,
        total: order.total,
        items: [],
        status: "pending",
        payment_status: "unpaid",
      })
      .select()
      .single();
    if (error) return toast.error(error.message);
    toast.success("Reorder created");
    navigate({ to: "/dashboard/orders/$orderId", params: { orderId: data.id } });
  };

  if (loading) return <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-accent" /></div>;
  if (!order) return <p className="text-muted-foreground">Order not found.</p>;

  return (
    <div className="space-y-4">
      <Button asChild variant="ghost" size="sm">
        <Link to="/dashboard/orders"><ArrowLeft className="mr-2 h-4 w-4" /> Back to orders</Link>
      </Button>

      <Card className="p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="font-mono text-2xl font-bold text-primary">{order.order_number}</h1>
            <p className="text-sm text-muted-foreground">
              {order.clients?.company_name ?? "Walk-in"} · {new Date(order.created_at).toLocaleString()}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Badge variant={order.status === "completed" ? "default" : "secondary"}>{order.status}</Badge>
            <Badge variant="outline">{order.payment_status}</Badge>
          </div>
        </div>

        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          <div>
            <div className="text-xs uppercase text-muted-foreground">Payment</div>
            <div className="font-medium">{order.payment_method ?? "—"}</div>
          </div>
          <div>
            <div className="text-xs uppercase text-muted-foreground">Delivery</div>
            <div className="font-medium">{order.delivery_method ?? "—"}</div>
          </div>
          <div className="sm:col-span-2">
            <div className="text-xs uppercase text-muted-foreground">Address</div>
            <div className="font-medium">{order.delivery_address ?? "—"}</div>
          </div>
          {order.notes && (
            <div className="sm:col-span-2">
              <div className="text-xs uppercase text-muted-foreground">Notes</div>
              <div className="whitespace-pre-wrap text-sm">{order.notes}</div>
            </div>
          )}
          <div className="sm:col-span-2 border-t border-border pt-3 text-right">
            <div className="text-xs text-muted-foreground">Total</div>
            <div className="text-2xl font-bold text-primary">${Number(order.total).toFixed(2)}</div>
          </div>
        </div>

        <div className="mt-6 flex flex-wrap items-center gap-3 border-t border-border pt-4">
          <Select value={order.status} onValueChange={updateStatus} disabled={updating}>
            <SelectTrigger className="w-56"><SelectValue /></SelectTrigger>
            <SelectContent>
              {STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
            </SelectContent>
          </Select>
          <Button onClick={reorder} variant="outline">
            <Repeat className="mr-2 h-4 w-4" /> Reorder
          </Button>
        </div>
      </Card>

      <Card className="p-6">
        <h2 className="font-bold text-primary">Status Timeline</h2>
        {history.length === 0 ? (
          <p className="mt-3 text-sm text-muted-foreground">No status changes recorded yet.</p>
        ) : (
          <ol className="mt-4 space-y-3">
            {history.map((h) => (
              <li key={h.id} className="flex gap-3">
                <CheckCircle2 className="mt-0.5 h-5 w-5 text-accent" />
                <div>
                  <div className="font-medium">{h.status}</div>
                  <div className="text-xs text-muted-foreground">{new Date(h.created_at).toLocaleString()}</div>
                  {h.note && <div className="mt-1 text-sm">{h.note}</div>}
                </div>
              </li>
            ))}
          </ol>
        )}
      </Card>
    </div>
  );
}
