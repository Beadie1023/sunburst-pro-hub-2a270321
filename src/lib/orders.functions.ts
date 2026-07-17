// Browser-safe client wrappers. Actual persistence handled by Express endpoints in server.ts.
// These fetch shims allow the SPA to compile and call server endpoints when available.

interface PlaceOrderInput {
  data: {
    user_id: string | null;
    contact_name: string;
    company: string;
    phone: string;
    email: string;
    delivery_method: "nassau" | "mailboat" | "pickup";
    delivery_address?: string;
    payment_method: "bank_transfer" | "cod" | "net30";
    notes?: string;
    items: { product_id: string; quantity: number }[];
  };
}

export async function placeOrder(input: PlaceOrderInput) {
  const res = await fetch("/api/orders/place", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input.data),
  });
  if (!res.ok) throw new Error(`Order failed: ${res.status}`);
  return res.json() as Promise<{
    order_id: string;
    order_number: string;
    subtotal: number;
    vat_amount: number;
    total: number;
    isContractor: boolean;
  }>;
}

export async function getOrder(input: { data: { orderId: string } }) {
  const res = await fetch(`/api/orders/${encodeURIComponent(input.data.orderId)}`);
  if (!res.ok) throw new Error(`Failed to load order: ${res.status}`);
  return res.json();
}
