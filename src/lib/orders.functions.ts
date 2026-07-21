// Client wrappers around Lovable Cloud edge functions.
import { supabase } from "@/integrations/supabase/client";

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
  const { data, error } = await supabase.functions.invoke("place-order", {
    body: input.data,
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
  const { data, error } = await supabase
    .from("orders")
    .select("*")
    .eq("id", input.data.orderId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data;
}
