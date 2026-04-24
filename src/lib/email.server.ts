// Server-only: sends transactional invoice emails via Resend connector gateway.
// Never import this file from client code.

const GATEWAY_URL = "https://connector-gateway.lovable.dev/resend";

export interface InvoiceItem {
  name: string;
  quantity: number;
  unit_price: number;
  line_total: number;
}

export interface InvoicePayload {
  order_number: string;
  customer_name: string;
  customer_company: string;
  customer_email: string;
  items: InvoiceItem[];
  subtotal: number;
  vat_amount: number;
  vat_rate: number;
  total: number;
  payment_method: string | null;
  delivery_method: string | null;
  delivery_address: string | null;
}

const fmt = (n: number) => `$${Number(n).toFixed(2)}`;

function renderInvoiceHtml(p: InvoicePayload): string {
  const itemRows = p.items
    .map(
      (i) => `
      <tr>
        <td style="padding:10px 8px;border-bottom:1px solid #eee;">${escapeHtml(i.name)}</td>
        <td style="padding:10px 8px;border-bottom:1px solid #eee;text-align:center;">${i.quantity}</td>
        <td style="padding:10px 8px;border-bottom:1px solid #eee;text-align:right;">${fmt(i.unit_price)}</td>
        <td style="padding:10px 8px;border-bottom:1px solid #eee;text-align:right;font-weight:600;">${fmt(i.line_total)}</td>
      </tr>`,
    )
    .join("");

  const isBank = p.payment_method === "bank_transfer";
  const paymentBlock = isBank
    ? `
      <div style="margin-top:24px;padding:16px;background:#fff7e6;border-left:4px solid #f5a623;border-radius:4px;">
        <div style="font-weight:700;color:#1a3a5c;margin-bottom:6px;">Bank Transfer Instructions</div>
        <div style="font-size:14px;color:#444;line-height:1.5;">
          Please wire payment to <strong>Sunburst Paints Ltd.</strong>, RBC Bahamas,
          Account 100-456-789. Use reference <strong>${escapeHtml(p.order_number)}</strong>.
          Your order will ship once payment is confirmed.
        </div>
      </div>`
    : `
      <div style="margin-top:24px;padding:16px;background:#f0f7ff;border-left:4px solid #1a3a5c;border-radius:4px;">
        <div style="font-weight:700;color:#1a3a5c;margin-bottom:6px;">Payment</div>
        <div style="font-size:14px;color:#444;">Method: <strong>${escapeHtml(p.payment_method ?? "—")}</strong></div>
      </div>`;

  return `<!doctype html>
<html><head><meta charset="utf-8"><title>Invoice ${escapeHtml(p.order_number)}</title></head>
<body style="margin:0;padding:0;background:#f5f5f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;color:#333;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f5;padding:24px 0;">
    <tr><td align="center">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:8px;overflow:hidden;max-width:600px;">
        <tr><td style="background:#1a3a5c;padding:24px;color:#fff;">
          <div style="font-size:22px;font-weight:700;letter-spacing:0.5px;">SUNBURST PAINTS</div>
          <div style="font-size:13px;opacity:0.85;margin-top:4px;">Contractor supply · The Bahamas</div>
        </td></tr>
        <tr><td style="padding:24px;">
          <h1 style="margin:0 0 4px;font-size:20px;color:#1a3a5c;">Invoice ${escapeHtml(p.order_number)}</h1>
          <p style="margin:0 0 20px;color:#666;font-size:14px;">Thank you for your order, ${escapeHtml(p.customer_name)}.</p>

          <div style="font-size:14px;line-height:1.6;color:#444;margin-bottom:20px;">
            <strong>Bill To:</strong><br/>
            ${escapeHtml(p.customer_company)}<br/>
            ${escapeHtml(p.customer_name)}<br/>
            ${escapeHtml(p.customer_email)}
          </div>

          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;font-size:14px;">
            <thead>
              <tr style="background:#f5f5f5;">
                <th align="left" style="padding:10px 8px;border-bottom:2px solid #ddd;">Item</th>
                <th style="padding:10px 8px;border-bottom:2px solid #ddd;text-align:center;">Qty</th>
                <th style="padding:10px 8px;border-bottom:2px solid #ddd;text-align:right;">Unit</th>
                <th style="padding:10px 8px;border-bottom:2px solid #ddd;text-align:right;">Total</th>
              </tr>
            </thead>
            <tbody>${itemRows}</tbody>
          </table>

          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:16px;font-size:14px;">
            <tr><td align="right" style="padding:4px 8px;color:#666;">Subtotal</td><td align="right" style="padding:4px 8px;width:120px;">${fmt(p.subtotal)}</td></tr>
            <tr><td align="right" style="padding:4px 8px;color:#666;">VAT (${(p.vat_rate * 100).toFixed(0)}%)</td><td align="right" style="padding:4px 8px;">${fmt(p.vat_amount)}</td></tr>
            <tr><td align="right" style="padding:10px 8px;border-top:2px solid #1a3a5c;font-weight:700;font-size:16px;color:#1a3a5c;">Total</td><td align="right" style="padding:10px 8px;border-top:2px solid #1a3a5c;font-weight:700;font-size:16px;color:#1a3a5c;">${fmt(p.total)}</td></tr>
          </table>

          <div style="margin-top:20px;font-size:14px;color:#444;">
            <strong>Delivery:</strong> ${escapeHtml(p.delivery_method ?? "—")}${p.delivery_address ? `<br/><span style="color:#666;">${escapeHtml(p.delivery_address)}</span>` : ""}
          </div>

          ${paymentBlock}

          <p style="margin-top:28px;font-size:13px;color:#888;line-height:1.5;">
            Questions? Reply to this email or contact us via WhatsApp.
            Includes 10% VAT.
          </p>
        </td></tr>
        <tr><td style="background:#f5f5f5;padding:16px;text-align:center;font-size:12px;color:#999;">
          © ${new Date().getFullYear()} Sunburst Paints Ltd. · Nassau, Bahamas
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export async function sendInvoiceEmail(payload: InvoicePayload): Promise<{ ok: boolean; error?: string }> {
  const LOVABLE_API_KEY = process.env.LOVABLE_API_KEY;
  if (!LOVABLE_API_KEY) {
    console.error("[invoice-email] LOVABLE_API_KEY not configured");
    return { ok: false, error: "LOVABLE_API_KEY missing" };
  }
  const RESEND_API_KEY = process.env.RESEND_API_KEY;
  if (!RESEND_API_KEY) {
    console.error("[invoice-email] RESEND_API_KEY not configured");
    return { ok: false, error: "RESEND_API_KEY missing" };
  }

  try {
    const html = renderInvoiceHtml(payload);
    const res = await fetch(`${GATEWAY_URL}/emails`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "X-Connection-Api-Key": RESEND_API_KEY,
      },
      body: JSON.stringify({
        from: "Sunburst Paints <onboarding@resend.dev>",
        to: [payload.customer_email],
        subject: `Invoice ${payload.order_number} · ${fmt(payload.total)} (incl. VAT)`,
        html,
      }),
    });
    const body = await res.text();
    if (!res.ok) {
      console.error(`[invoice-email] Resend failed [${res.status}]: ${body}`);
      return { ok: false, error: `Resend ${res.status}: ${body}` };
    }
    console.log(`[invoice-email] Sent to ${payload.customer_email} for ${payload.order_number}`);
    return { ok: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[invoice-email] Exception: ${msg}`);
    return { ok: false, error: msg };
  }
}
