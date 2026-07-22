import { createFileRoute, Link, useParams } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Header } from "@/components/Header";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CheckCircle2, Loader2, Mail, AlertTriangle, Printer } from "lucide-react";

export const Route = createFileRoute("/order-confirmation/$orderId")({
  component: ConfirmationPage,
  head: () => ({ meta: [{ title: "Order Confirmed | Sunburst Paints" }] }),
});

interface OrderItem { name: string; quantity: number; unit_price?: number; line_total: number; }
interface Order {
  order_number: string;
  subtotal: number;
  vat_amount: number;
  total: number;
  payment_method: string | null;
  delivery_method: string | null;
  delivery_address: string | null;
  items: OrderItem[];
}

const SUNBURST_EMAIL = "sunburstpaints242@gmail.com";

function ConfirmationPage() {
  const { orderId } = useParams({ from: "/order-confirmation/$orderId" });
  const [order, setOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getOrder({ data: { orderId } })
      .then((data) => setOrder(data as unknown as Order))
      .catch((err) => {
        console.error("Failed to load order:", err);
        setError(err?.message ?? "Could not load order.");
      })
      .finally(() => setLoading(false));
  }, [orderId]);

  if (loading) {
    return (
      <div className="min-h-screen bg-secondary">
        <Header />
        <div className="flex flex-col items-center justify-center py-24">
          <Loader2 className="h-8 w-8 animate-spin text-accent" />
          <p className="mt-3 text-sm text-muted-foreground">Loading your order…</p>
        </div>
      </div>
    );
  }

  if (error || !order) {
    return (
      <div className="min-h-screen bg-secondary">
        <Header />
        <div className="container mx-auto max-w-xl px-4 py-16">
          <Card className="border-l-4 border-l-destructive p-8 text-center">
            <AlertTriangle className="mx-auto h-10 w-10 text-destructive" />
            <h1 className="mt-3 text-2xl font-bold text-primary">Order not found</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              {error ?? "We couldn't find this order. It may still be processing."}
            </p>
            <Button asChild className="mt-6">
              <Link to="/products">Back to products</Link>
            </Button>
          </Card>
        </div>
      </div>
    );
  }

  const emailSubject = `Order ${order.order_number}`;
  const itemList = order.items.map((i) => `• ${i.name} ×${i.quantity}`).join("\n");
  const emailBody = `Order ${order.order_number}\n\n${itemList}\n\nSubtotal: $${Number(order.subtotal ?? 0).toFixed(2)}\nVAT (10%): $${Number(order.vat_amount ?? 0).toFixed(2)}\nTotal: $${Number(order.total).toFixed(2)}\n\nDelivery: ${order.delivery_method ?? "—"}\nPayment: ${order.payment_method ?? "—"}`;
  const mailto = `mailto:${SUNBURST_EMAIL}?subject=${encodeURIComponent(emailSubject)}&body=${encodeURIComponent(emailBody)}`;

  return (
    <div className="min-h-screen bg-secondary">
      <Header />
      <div className="container mx-auto max-w-2xl px-4 py-10 print:py-4">
        <Card className="overflow-hidden p-0">
          {/* Hero confirmation banner */}
          <div className="relative overflow-hidden bg-primary p-8 text-center text-primary-foreground print:bg-white print:text-foreground">
            <div className="absolute inset-0 opacity-30" style={{ background: "var(--gradient-ocean)" }} />
            <div className="relative">
              <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-success text-success-foreground shadow-lg">
                <CheckCircle2 className="h-9 w-9" />
              </div>
              <h1 className="mt-4 text-3xl font-extrabold">Order placed!</h1>
              <p className="mt-1 text-sm text-primary-foreground/80 print:text-muted-foreground">
                Reference number
              </p>
              <p className="mt-1 font-mono text-2xl font-bold text-accent">{order.order_number}</p>
              <p className="mt-4 inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1 text-xs backdrop-blur print:hidden">
                <Mail className="h-3.5 w-3.5" /> Invoice sent to your email
              </p>
            </div>
          </div>

          <div className="p-6">
            {/* Items */}
            <div>
              <div className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                Items
              </div>
              <div className="mt-2 divide-y divide-border rounded-md border border-border">
                {order.items.map((i, idx) => (
                  <div key={idx} className="flex items-center justify-between gap-3 px-4 py-2 text-sm">
                    <div className="flex-1">
                      <div className="font-medium text-foreground">{i.name}</div>
                      <div className="text-xs text-muted-foreground">Qty {i.quantity}</div>
                    </div>
                    <div className="font-semibold">${Number(i.line_total).toFixed(2)}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* Totals */}
            <div className="mt-5 rounded-md bg-secondary p-4 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Subtotal</span>
                <span>${Number(order.subtotal ?? 0).toFixed(2)}</span>
              </div>
              <div className="mt-1 flex justify-between">
                <span className="text-muted-foreground">VAT (10%)</span>
                <span>${Number(order.vat_amount ?? 0).toFixed(2)}</span>
              </div>
              <div className="mt-2 flex justify-between border-t border-border pt-2 text-base">
                <span className="font-semibold">Total</span>
                <span className="font-bold">${Number(order.total).toFixed(2)}</span>
              </div>
            </div>

            {/* Meta */}
            <div className="mt-4 grid gap-2 text-sm sm:grid-cols-2">
              <div className="rounded-md bg-secondary p-3">
                <div className="text-xs uppercase tracking-wider text-muted-foreground">Delivery</div>
                <div className="font-medium capitalize">{order.delivery_method?.replace(/_/g, " ") ?? "—"}</div>
                {order.delivery_address && (
                  <div className="mt-1 text-xs text-muted-foreground">{order.delivery_address}</div>
                )}
              </div>
              <div className="rounded-md bg-secondary p-3">
                <div className="text-xs uppercase tracking-wider text-muted-foreground">Payment</div>
                <div className="font-medium capitalize">{order.payment_method?.replace(/_/g, " ") ?? "—"}</div>
              </div>
            </div>

            {order.payment_method === "bank_transfer" && (
              <div className="mt-4 rounded-md border border-accent/30 bg-accent/5 p-4 text-sm">
                <strong className="text-primary">Bank Transfer Instructions</strong>
                <p className="mt-1 text-muted-foreground">
                  Wire to <strong>Sunburst Paints Ltd.</strong>, RBC Bahamas, Account 100-456-789, reference{" "}
                  <strong>{order.order_number}</strong>. Order ships once payment is confirmed.
                </p>
              </div>
            )}

            <div className="mt-6 flex flex-col gap-2 print:hidden sm:flex-row">
              <Button asChild variant="outline" className="flex-1">
                <Link to="/products">Keep Shopping</Link>
              </Button>
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => window.print()}
              >
                <Printer className="mr-2 h-4 w-4" /> Print Receipt
              </Button>
              <Button asChild className="flex-1 bg-accent text-accent-foreground hover:bg-accent/90">
                <a href={mailto}>
                  <Mail className="mr-2 h-4 w-4" /> Email Sunburst
                </a>
              </Button>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}
