import { createFileRoute, Link } from "@tanstack/react-router";
import { Header } from "@/components/Header";
import { useCart } from "@/lib/cart";
import { useAuth } from "@/lib/auth";
import { computeTotals, VAT_RATE } from "@/lib/tax";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Trash2, ShoppingBag } from "lucide-react";

export const Route = createFileRoute("/cart")({
  component: CartPage,
  head: () => ({ meta: [{ title: "Your Cart | Sunburst Paints" }] }),
});

function CartPage() {
  const { items, subtotal, updateQuantity, removeFromCart, clearCart } = useCart();
  const { role } = useAuth();
  const isContractor = role === "contractor" || role === "admin";

  return (
    <div className="min-h-screen bg-secondary">
      <Header />
      <div className="container mx-auto max-w-4xl px-4 py-10">
        <div className="flex items-center justify-between">
          <h1 className="text-3xl font-bold text-primary">Your Job Cart</h1>
          {items.length > 0 && (
            <Button variant="ghost" size="sm" onClick={clearCart}>Clear cart</Button>
          )}
        </div>

        {isContractor && (
          <div className="mt-3 inline-flex items-center gap-2 rounded-md bg-accent/10 px-3 py-1.5 text-sm font-semibold text-accent">
            ✓ Pro Pricing Applied (10% off)
          </div>
        )}

        {items.length === 0 ? (
          <Card className="mt-8 flex flex-col items-center gap-4 py-16">
            <ShoppingBag className="h-12 w-12 text-muted-foreground" />
            <p className="text-muted-foreground">Your cart is empty.</p>
            <Button asChild className="bg-accent text-accent-foreground hover:bg-accent/90">
              <Link to="/products">Browse Products</Link>
            </Button>
          </Card>
        ) : (
          <>
            <Card className="mt-6 divide-y divide-border">
              {items.map((it) => (
                <div key={it.product_id} className="flex items-center gap-3 p-4">
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold text-primary truncate">{it.name}</div>
                    <div className="text-xs text-muted-foreground">SKU {it.sku} · ${it.price.toFixed(2)} each</div>
                  </div>
                  <Input
                    type="number"
                    min={1}
                    value={it.quantity}
                    onChange={(e) => updateQuantity(it.product_id, Math.max(1, Number(e.target.value) || 1))}
                    className="h-9 w-20"
                  />
                  <div className="w-20 text-right font-semibold">${(it.price * it.quantity).toFixed(2)}</div>
                  <Button variant="ghost" size="icon" onClick={() => removeFromCart(it.product_id)}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </Card>

            <Card className="mt-6 p-6">
              {(() => {
                const t = computeTotals(subtotal);
                return (
                  <div className="space-y-1.5 text-sm">
                    <div className="flex justify-between"><span className="text-muted-foreground">Subtotal</span><span>${t.subtotal.toFixed(2)}</span></div>
                    <div className="flex justify-between"><span className="text-muted-foreground">VAT ({(VAT_RATE * 100).toFixed(0)}%)</span><span>${t.vat.toFixed(2)}</span></div>
                    <div className="mt-2 flex items-center justify-between border-t border-border pt-2 text-lg">
                      <span className="font-semibold">Total</span>
                      <span className="font-bold text-primary">${t.total.toFixed(2)}</span>
                    </div>
                  </div>
                );
              })()}
              <p className="mt-2 text-xs text-muted-foreground">
                Includes 10% VAT. Final total recalculated server-side using current database prices.
              </p>
              <Button asChild className="mt-4 w-full bg-accent text-accent-foreground hover:bg-accent/90">
                <Link to="/checkout">Proceed to Checkout</Link>
              </Button>
            </Card>
          </>
        )}
      </div>
    </div>
  );
}
