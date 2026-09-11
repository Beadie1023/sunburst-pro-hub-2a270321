// Places a customer order. Recomputes totals server-side from live product prices
// and applies contractor pricing (10% off) when the caller is authenticated as one.
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const VAT_RATE = 0.1;

interface Item { product_id: string; quantity: number }

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const body = await req.json();
    const {
      contact_name, company, phone, email,
      delivery_method, delivery_address, payment_method, notes,
      items,
    } = body as {
      contact_name: string; company: string; phone: string; email: string;
      delivery_method: "nassau" | "mailboat" | "pickup";
      delivery_address?: string;
      payment_method: "bank_transfer" | "cod" | "net30";
      notes?: string;
      items: Item[];
    };

    if (!Array.isArray(items) || items.length === 0) {
      return json({ error: "Cart is empty" }, 400);
    }

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SRK = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
    const adminHeaders = { apikey: SRK, Authorization: `Bearer ${SRK}`, "Content-Type": "application/json" };

    // Identity comes ONLY from the verified auth token, never from the request body.
    let user_id: string | null = null;
    const authHeader = req.headers.get("Authorization") ?? "";
    if (authHeader.toLowerCase().startsWith("bearer ")) {
      const uRes = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
        headers: { apikey: ANON, Authorization: authHeader },
      });
      if (uRes.ok) {
        const u = await uRes.json();
        user_id = typeof u?.id === "string" ? u.id : null;
      }
    }

    // Determine contractor pricing from the verified user's role
    let isContractor = false;
    if (user_id) {
      const rRes = await fetch(
        `${SUPABASE_URL}/rest/v1/user_roles?select=role&user_id=eq.${user_id}`,
        { headers: adminHeaders },
      );
      if (rRes.ok) {
        const rows: { role: string }[] = await rRes.json();
        isContractor = rows.some((r) => r.role === "contractor" || r.role === "admin");
      }
    }


    // Load live product prices
    const ids = [...new Set(items.map((i) => i.product_id))];
    const inList = ids.map((id) => `"${id}"`).join(",");
    const pRes = await fetch(
      `${SUPABASE_URL}/rest/v1/products?select=id,name,price,retail_price,contractor_price&id=in.(${inList})`,
      { headers: adminHeaders },
    );
    if (!pRes.ok) {
      return json({ error: "Failed to load products" }, 502);
    }
    const products: Record<string, { id: string; name: string; price: number | null; retail_price: number | null; contractor_price: number | null }> = {};
    for (const p of await pRes.json()) products[p.id] = p;

    let subtotal = 0;
    const lineItems = items.map((i) => {
      const p = products[i.product_id];
      if (!p) throw new Error(`Product not found: ${i.product_id}`);
      const unit = isContractor
        ? (p.contractor_price ?? p.retail_price ?? p.price ?? 0)
        : (p.retail_price ?? p.price ?? 0);
      const qty = Math.max(1, Math.floor(Number(i.quantity) || 1));
      const line = Number(unit) * qty;
      subtotal += line;
      return { product_id: p.id, name: p.name, quantity: qty, unit_price: Number(unit), line_total: line };
    });
    subtotal = round2(subtotal);
    const vat_amount = round2(subtotal * VAT_RATE);
    const total = round2(subtotal + vat_amount);

    const order_number = `SB-${Date.now().toString(36).toUpperCase()}`;

    const insertRes = await fetch(`${SUPABASE_URL}/rest/v1/orders`, {
      method: "POST",
      headers: { ...adminHeaders, Prefer: "return=representation" },
      body: JSON.stringify([{
        order_number,
        status: "pending",
        payment_method,
        payment_status: "unpaid",
        delivery_method,
        delivery_address: delivery_address ?? "",
        subtotal,
        vat_rate: VAT_RATE,
        vat_amount,
        total,
        notes: notes ?? "",
        items: {
          contact: { name: contact_name, company, phone, email, user_id },
          lines: lineItems,
          isContractor,
        },
      }]),
    });
    if (!insertRes.ok) {
      const txt = await insertRes.text();
      console.error("order insert failed", insertRes.status, txt);
      return json({ error: "Failed to save order" }, 500);
    }
    const [order] = await insertRes.json();

    return json({
      order_id: order.id,
      order_number: order.order_number,
      subtotal, vat_amount, total, isContractor,
    });
  } catch (e) {
    console.error(e);
    return json({ error: e instanceof Error ? e.message : "Internal error" }, 500);
  }

  function json(obj: unknown, status = 200) {
    return new Response(JSON.stringify(obj), {
      status, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  function round2(n: number) { return Math.round(n * 100) / 100; }
});
