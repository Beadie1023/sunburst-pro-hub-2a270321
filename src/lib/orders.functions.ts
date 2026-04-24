import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export const getOrder = createServerFn({ method: "GET" })
  .inputValidator((input: unknown) => z.object({ orderId: z.string().uuid() }).parse(input))
  .handler(async ({ data }) => {
    const { data: order, error } = await supabaseAdmin
      .from("orders")
      .select("order_number, subtotal, vat_amount, total, payment_method, delivery_method, delivery_address, items")
      .eq("id", data.orderId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!order) throw new Error("Order not found");
    return order;
  });


const ItemSchema = z.object({
  product_id: z.string().uuid(),
  quantity: z.number().int().min(1).max(999),
});

const PlaceOrderSchema = z.object({
  user_id: z.string().uuid().nullable(),
  contact_name: z.string().trim().min(1).max(100),
  company: z.string().trim().min(1).max(120),
  phone: z.string().trim().min(5).max(40),
  email: z.string().trim().email().max(160),
  delivery_method: z.enum(["nassau", "mailboat", "pickup"]),
  delivery_address: z.string().trim().max(400).optional().default(""),
  payment_method: z.enum(["bank_transfer", "cod", "net30"]),
  notes: z.string().trim().max(1000).optional().default(""),
  items: z.array(ItemSchema).min(1).max(100),
});

export const placeOrder = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => PlaceOrderSchema.parse(input))
  .handler(async ({ data }) => {
    // Determine pricing tier
    let isContractor = false;
    if (data.user_id) {
      const { data: roles } = await supabaseAdmin
        .from("user_roles")
        .select("role")
        .eq("user_id", data.user_id);
      isContractor = (roles ?? []).some((r) => r.role === "contractor" || r.role === "admin");
    }

    // Fetch authoritative prices
    const ids = data.items.map((i) => i.product_id);
    const { data: products, error: pErr } = await supabaseAdmin
      .from("products")
      .select("id, sku, name, price, contractor_price")
      .in("id", ids);
    if (pErr) throw new Error(pErr.message);

    const byId = new Map((products ?? []).map((p) => [p.id, p]));
    const orderItems = data.items.map((it) => {
      const p = byId.get(it.product_id);
      if (!p) throw new Error(`Product not found: ${it.product_id}`);
      const unit = isContractor && p.contractor_price != null ? Number(p.contractor_price) : Number(p.price ?? 0);
      if (!unit) throw new Error(`No price for ${p.name}`);
      return {
        product_id: p.id,
        sku: p.sku,
        name: p.name,
        unit_price: unit,
        quantity: it.quantity,
        line_total: Math.round(unit * it.quantity * 100) / 100,
      };
    });

    const VAT_RATE = 0.10;
    const subtotal = Math.round(orderItems.reduce((s, i) => s + i.line_total, 0) * 100) / 100;
    const vat_amount = Math.round(subtotal * VAT_RATE * 100) / 100;
    const total = Math.round((subtotal + vat_amount) * 100) / 100;

    // Try to link to existing client by email/company (best effort)
    let client_id: string | null = null;
    const { data: existingClient } = await supabaseAdmin
      .from("clients")
      .select("id")
      .or(`email.eq.${data.email},company_name.eq.${data.company}`)
      .maybeSingle();
    if (existingClient) {
      client_id = existingClient.id;
    } else {
      const { data: newClient } = await supabaseAdmin
        .from("clients")
        .insert({
          company_name: data.company,
          contact_name: data.contact_name,
          email: data.email,
          phone: data.phone,
        })
        .select("id")
        .single();
      client_id = newClient?.id ?? null;
    }

    const { data: order, error: oErr } = await supabaseAdmin
      .from("orders")
      .insert({
        client_id,
        items: orderItems,
        subtotal,
        vat_amount,
        vat_rate: VAT_RATE,
        total,
        status: "pending",
        payment_status: "unpaid",
        payment_method: data.payment_method,
        delivery_method: data.delivery_method,
        delivery_address: data.delivery_address || null,
        notes: data.notes || null,
      })
      .select("id, order_number, subtotal, vat_amount, total")
      .single();
    if (oErr) throw new Error(oErr.message);

    await supabaseAdmin.from("order_status_history").insert({
      order_id: order.id,
      status: "pending",
      note: "Order placed via web checkout",
    });

    return {
      order_id: order.id,
      order_number: order.order_number,
      subtotal: Number(order.subtotal),
      vat_amount: Number(order.vat_amount),
      total: Number(order.total),
      isContractor,
    };
  });
