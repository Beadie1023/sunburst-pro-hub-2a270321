import { createFileRoute, Link, useParams } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Header } from "@/components/Header";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CheckCircle2, Loader2, MessageCircle } from "lucide-react";

export const Route = createFileRoute("/order-confirmation/$orderId")({
  component: ConfirmationPage,
  head: () => ({ meta: [{ title: "Order Confirmed | Sunburst Paints" }] }),
});

interface OrderItem { name: string; quantity: number; line_total: number; }
interface Order {
  order_number: string;
  total: number;
  payment_method: string | null;
  delivery_method: string | null;
  delivery_address: string | null;
  items: OrderItem[];
}

const SUNBURST_WHATSAPP = "12423570000"; // placeholder Bahamian number

function ConfirmationPage() {
  const { orderId } = useParams({ from: "/order-confirmation/$orderId" });
  const [order, setOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase
      .from("orders")
      .select("order_number, total, payment_method, delivery_method, delivery_address, items, clients(company_name)")
      .eq("id", orderId)
      .single()
      .then(({ data }) => {
        setOrder(data as unknown as Order);
        setLoading(false);
      });
  }, [orderId]);

  if (loading) {
    return (
      <div className="min-h-screen bg-secondary">
        <Header />
        <div className="flex justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-accent" /></div>
      </div>
    );
  }

  if (!order) {
    return (
      <div className="min-h-screen bg-secondary">
        <Header />
        <div className="container mx-auto max-w-xl px-4 py-16 text-center">
          <p>Order not found.</p>
          <Button asChild className="mt-4"><Link to="/products">Back to products</Link></Button>
        </div>
      </div>
    );
  }

  const itemList = order.items.map((i) => `• ${i.name} ×${i.quantity}`).join("\n");
  const message = `Order Request — ${order.order_number}\n\nItems:\n${itemList}\n\nTotal: $${Number(order.total).toFixed(2)}\nDelivery: ${order.delivery_method ?? "—"}\nPayment: ${order.payment_method ?? "—"}`;
  const waUrl = `https://wa.me/${SUNBURST_WHATSAPP}?text=${encodeURIComponent(message)}`;

  return (
    <div className="min-h-screen bg-secondary">
      <Header />
      <div className="container mx-auto max-w-2xl px-4 py-10">
        <Card className="p-8 text-center">
          <CheckCircle2 className="mx-auto h-14 w-14 text-success" />
          <h1 className="mt-3 text-3xl font-bold text-primary">Order Placed</h1>
          <p className="mt-1 text-muted-foreground">Reference</p>
          <p className="text-2xl font-mono font-bold text-accent">{order.order_number}</p>
          <div className="mt-6 rounded-md bg-secondary p-4 text-left text-sm">
            <div className="flex justify-between"><span>Total</span><span className="font-bold">${Number(order.total).toFixed(2)}</span></div>
            <div className="mt-1 flex justify-between"><span>Delivery</span><span className="capitalize">{order.delivery_method?.replace("_", " ")}</span></div>
            <div className="mt-1 flex justify-between"><span>Payment</span><span className="capitalize">{order.payment_method?.replace("_", " ")}</span></div>
          </div>

          {order.payment_method === "bank_transfer" && (
            <div className="mt-4 rounded-md border border-accent/30 bg-accent/5 p-4 text-left text-sm">
              <strong className="text-primary">Bank Transfer Instructions</strong>
              <p className="mt-1 text-muted-foreground">
                Wire to <strong>Sunburst Paints Ltd.</strong>, RBC Bahamas, Account 100-456-789, reference{" "}
                <strong>{order.order_number}</strong>. Order ships once payment is confirmed.
              </p>
            </div>
          )}

          <div className="mt-6 flex flex-col gap-2 sm:flex-row">
            <Button asChild variant="outline" className="flex-1"><Link to="/products">Keep Shopping</Link></Button>
            <Button asChild className="flex-1 bg-success text-success-foreground hover:bg-success/90">
              <a href={waUrl} target="_blank" rel="noopener noreferrer">
                <MessageCircle className="mr-2 h-4 w-4" /> Send to WhatsApp
              </a>
            </Button>
          </div>
        </Card>
      </div>
    </div>
  );
}
