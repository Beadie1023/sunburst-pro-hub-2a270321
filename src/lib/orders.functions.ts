// Client wrappers around Lovable Cloud edge functions.
import { supabase } from "@/integrations/supabase/client";

interface PlaceOrderInput {
  data: {
    user_id?: string | null; // ignored by the server; identity comes from the auth token
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
  const { user_id: _ignored, ...payload } = input.data;
  const { data, error } = await supabase.functions.invoke("place-order", {
    body: payload,
  });

  if (error) throw new Error(error.message || "Failed to place order");
  if (data?.error) throw new Error(data.error);
  return data as {
    order_id: string;
    order_number: string;
    subtotal: number;
    vat_amount: number;
    total: number;
    isContractor: boolean;
  };
}

export async function getOrder(input: { data: { orderId: string } }) {
  const { data, error } = await supabase.functions.invoke("get-order", {
    body: { orderId: input.data.orderId },
  });
  if (error) throw new Error(error.message || "Failed to load order");
  if (data?.error) throw new Error(data.error);
  return data;
}
