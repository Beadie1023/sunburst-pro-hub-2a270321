// Fetches a single order by id using the service role so the confirmation page
// works for guests and authenticated buyers alike (orders RLS is admin-only).
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const { orderId } = await req.json();
    if (!orderId || typeof orderId !== "string") {
      return json({ error: "orderId required" }, 400);
    }
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SRK = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/orders?id=eq.${orderId}&select=*`,
      { headers: { apikey: SRK, Authorization: `Bearer ${SRK}` } },
    );
    if (!res.ok) return json({ error: "Lookup failed" }, 502);
    const rows = await res.json();
    const order = rows[0];
    if (!order) return json({ error: "Order not found" }, 404);
    // Flatten items JSON into the shape the confirmation UI expects
    const lines = order.items?.lines ?? [];
    return json({
      ...order,
      items: lines,
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
});
