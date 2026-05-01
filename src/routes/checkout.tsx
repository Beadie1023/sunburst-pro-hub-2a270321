import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Header } from "@/components/Header";
import { useCart } from "@/lib/cart";
import { useAuth } from "@/lib/auth";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { toast } from "sonner";
import { placeOrder } from "@/lib/orders.functions";
import { computeTotals, VAT_RATE } from "@/lib/tax";
import { Loader2 } from "lucide-react";
import beachBg from "@/assets/bahamas-beach.jpg";

export const Route = createFileRoute("/checkout")({
  component: CheckoutPage,
  head: () => ({ meta: [{ title: "Checkout | Sunburst Paints" }] }),
});

function CheckoutPage() {
  const { items, subtotal, clearCart, hydrated } = useCart();
  const { user, role } = useAuth();
  const navigate = useNavigate();
  const [submitting, setSubmitting] = useState(false);
  const [delivery, setDelivery] = useState<"nassau" | "mailboat" | "pickup">("nassau");
  const [payment, setPayment] = useState<"bank_transfer" | "cod" | "net30">("bank_transfer");
  const isContractor = role === "contractor" || role === "admin";

  // Controlled form fields for clean validation
  const [contactName, setContactName] = useState(user?.user_metadata?.full_name ?? "");
  const [company, setCompany] = useState(user?.user_metadata?.company_name ?? "");
  const [phone, setPhone] = useState(user?.user_metadata?.phone ?? "");
  // Logged-in users: always use their account email (auto-filled, read-only).
  // Guests: use whatever they type (fallback).
  const [email, setEmail] = useState(user?.email ?? "");
  useEffect(() => {
    if (user?.email) setEmail(user.email);
  }, [user?.email]);
  const [deliveryAddress, setDeliveryAddress] = useState("");
  const [notes, setNotes] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Wait for cart to hydrate from localStorage before rendering empty state
  if (!hydrated) {
    return (
      <div className="min-h-screen bg-secondary">
        <Header />
        <div className="container mx-auto max-w-xl px-4 py-16 text-center">
          <Loader2 className="mx-auto h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="min-h-screen bg-secondary">
        <Header />
        <div className="container mx-auto max-w-xl px-4 py-16 text-center">
          <p className="text-muted-foreground">Your cart is empty.</p>
          <Button asChild className="mt-4 bg-accent text-accent-foreground hover:bg-accent/90">
            <Link to="/products">Browse Products</Link>
          </Button>
        </div>
      </div>
    );
  }

  const validate = () => {
    const e: Record<string, string> = {};
    if (!contactName.trim()) e.contact_name = "Name is required";
    if (!company.trim()) e.company = "Company is required";
    if (!phone.trim() || phone.trim().length < 5) e.phone = "Valid phone is required";
    if (!email.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) e.email = "Valid email is required";
    if (delivery !== "pickup" && !deliveryAddress.trim()) e.delivery_address = "Delivery address is required";
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const onSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    if (items.length === 0) {
      toast.error("Your cart is empty.");
      return;
    }
    if (!validate()) {
      toast.error("Please complete all required fields");
      return;
    }

    console.log("Submitting cart:", items);
    console.log("Order email:", user?.email ?? email.trim());
    setSubmitting(true);
    try {
      const res = await placeOrder({
        data: {
          user_id: user?.id ?? null,
          contact_name: contactName.trim(),
          company: company.trim(),
          phone: phone.trim(),
          email: email.trim(),
          delivery_method: delivery,
          delivery_address: deliveryAddress.trim(),
          payment_method: payment,
          notes: notes.trim(),
          items: items.map((i) => ({ product_id: i.product_id, quantity: i.quantity })),
        },
      });
      clearCart();
      navigate({ to: "/order-confirmation/$orderId", params: { orderId: res.order_id } });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to place order";
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  };

  const formInvalid =
    !contactName.trim() ||
    !company.trim() ||
    !phone.trim() ||
    !email.trim() ||
    (delivery !== "pickup" && !deliveryAddress.trim());

  return (
    <div className="relative min-h-screen">
      <div
        className="fixed inset-0 -z-10 bg-cover bg-center"
        style={{ backgroundImage: `linear-gradient(135deg, oklch(0.18 0.08 258 / 0.6), oklch(0.24 0.09 258 / 0.4)), url(${beachBg})` }}
      />
      <Header />
      <div className="container mx-auto max-w-5xl px-4 py-10">
        <h1 className="text-3xl font-bold text-primary-foreground drop-shadow">Checkout</h1>
        {isContractor && (
          <div className="mt-2 inline-flex items-center gap-2 rounded-md bg-accent/10 px-3 py-1 text-sm font-semibold text-accent">
            Pro Pricing Applied · 10% off
          </div>
        )}

        <form onSubmit={onSubmit} noValidate className="mt-6 grid gap-6 lg:grid-cols-3">
          <div className="space-y-6 lg:col-span-2">
            <Card className="glass-card p-6">
              <h2 className="font-bold text-primary">Contact</h2>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <div>
                  <Label>Name *</Label>
                  <Input value={contactName} onChange={(e) => setContactName(e.target.value)} maxLength={100} aria-invalid={!!errors.contact_name} />
                  {errors.contact_name && <p className="mt-1 text-xs text-destructive">{errors.contact_name}</p>}
                </div>
                <div>
                  <Label>Company *</Label>
                  <Input value={company} onChange={(e) => setCompany(e.target.value)} maxLength={120} aria-invalid={!!errors.company} />
                  {errors.company && <p className="mt-1 text-xs text-destructive">{errors.company}</p>}
                </div>
                <div>
                  <Label>Phone *</Label>
                  <Input value={phone} onChange={(e) => setPhone(e.target.value)} maxLength={40} aria-invalid={!!errors.phone} />
                  {errors.phone && <p className="mt-1 text-xs text-destructive">{errors.phone}</p>}
                </div>
                <div>
                  <Label>Email *</Label>
                  <Input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    maxLength={160}
                    aria-invalid={!!errors.email}
                    readOnly={!!user?.email}
                    className={user?.email ? "bg-muted cursor-not-allowed" : undefined}
                  />
                  {user?.email ? (
                    <p className="mt-1 text-xs text-muted-foreground">Invoice will be sent to your account email.</p>
                  ) : null}
                  {errors.email && <p className="mt-1 text-xs text-destructive">{errors.email}</p>}
                </div>
              </div>
            </Card>

            <Card className="glass-card p-6">
              <h2 className="font-bold text-primary">Delivery</h2>
              <RadioGroup value={delivery} onValueChange={(v) => setDelivery(v as typeof delivery)} className="mt-4 grid gap-2">
                <label className="flex cursor-pointer items-center gap-2 rounded border border-border p-3 hover:bg-secondary">
                  <RadioGroupItem value="nassau" /> <span>Nassau Job Site Delivery</span>
                </label>
                <label className="flex cursor-pointer items-center gap-2 rounded border border-border p-3 hover:bg-secondary">
                  <RadioGroupItem value="mailboat" /> <span>Mailboat (Exuma, Abaco, Eleuthera)</span>
                </label>
                <label className="flex cursor-pointer items-center gap-2 rounded border border-border p-3 hover:bg-secondary">
                  <RadioGroupItem value="pickup" /> <span>Pickup at Nassau Warehouse</span>
                </label>
              </RadioGroup>
              {delivery !== "pickup" && (
                <div className="mt-4">
                  <Label>Delivery Address / Mailboat dock *</Label>
                  <Textarea value={deliveryAddress} onChange={(e) => setDeliveryAddress(e.target.value)} rows={2} maxLength={400} aria-invalid={!!errors.delivery_address} />
                  {errors.delivery_address && <p className="mt-1 text-xs text-destructive">{errors.delivery_address}</p>}
                </div>
              )}
            </Card>

            <Card className="glass-card p-6">
              <h2 className="font-bold text-primary">Payment</h2>
              <RadioGroup value={payment} onValueChange={(v) => setPayment(v as typeof payment)} className="mt-4 grid gap-2">
                <label className="flex cursor-pointer items-center gap-2 rounded border border-border p-3 hover:bg-secondary">
                  <RadioGroupItem value="bank_transfer" /> <span>Bank Transfer</span>
                </label>
                <label className="flex cursor-pointer items-center gap-2 rounded border border-border p-3 hover:bg-secondary">
                  <RadioGroupItem value="cod" /> <span>Cash on Delivery</span>
                </label>
                <label className={`flex items-center gap-2 rounded border border-border p-3 ${isContractor ? "cursor-pointer hover:bg-secondary" : "opacity-50"}`}>
                  <RadioGroupItem value="net30" disabled={!isContractor} />
                  <span>Net-30 {isContractor ? "" : "(contractors only)"}</span>
                </label>
              </RadioGroup>
              <div className="mt-4">
                <Label>Notes (optional)</Label>
                <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} maxLength={1000} placeholder="Job site contact, gate code, etc." />
              </div>
            </Card>
          </div>

          <Card className="glass-card h-fit p-6 lg:sticky lg:top-20">
            <h2 className="font-bold text-primary">Order Summary</h2>
            <ul className="mt-3 space-y-2 text-sm">
              {items.map((i) => (
                <li key={i.product_id} className="flex justify-between gap-2">
                  <span className="truncate">{i.name} <span className="text-muted-foreground">×{i.quantity}</span></span>
                  <span className="shrink-0">${(i.price * i.quantity).toFixed(2)}</span>
                </li>
              ))}
            </ul>
            {(() => {
              const t = computeTotals(subtotal);
              return (
                <div className="mt-4 space-y-1.5 border-t border-border pt-3 text-sm">
                  <div className="flex justify-between"><span className="text-muted-foreground">Subtotal</span><span>${t.subtotal.toFixed(2)}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">VAT ({(VAT_RATE * 100).toFixed(0)}%)</span><span>${t.vat.toFixed(2)}</span></div>
                  <div className="mt-1 flex items-center justify-between border-t border-border pt-2 text-lg">
                    <span className="font-semibold">Total</span>
                    <span className="font-bold text-primary">${t.total.toFixed(2)}</span>
                  </div>
                </div>
              );
            })()}
            <p className="mt-1 text-xs text-muted-foreground">Includes 10% VAT. Server recalculates from live prices.</p>
            <Button
              type="submit"
              disabled={submitting || items.length === 0 || formInvalid}
              className="mt-4 w-full bg-accent text-accent-foreground hover:bg-accent/90"
            >
              {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : "Place Order"}
            </Button>
          </Card>
        </form>
      </div>
    </div>
  );
}
