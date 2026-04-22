import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState, type FormEvent } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { ArrowLeft } from "lucide-react";

export const Route = createFileRoute("/dashboard/orders/new")({
  component: NewOrderPage,
});

function NewOrderPage() {
  const navigate = useNavigate();
  const [clients, setClients] = useState<{ id: string; company_name: string }[]>([]);
  const [saving, setSaving] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState("Bank Transfer");
  const [deliveryMethod, setDeliveryMethod] = useState("Nassau Job-Site Drop-Off");

  useEffect(() => {
    supabase
      .from("clients")
      .select("id, company_name")
      .order("company_name")
      .then(({ data }) => setClients(data ?? []));
  }, []);

  const onSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const total = Number(fd.get("total") || 0);
    setSaving(true);
    const { error } = await supabase.from("orders").insert({
      client_id: (fd.get("client_id") as string) || null,
      payment_method: paymentMethod,
      delivery_method: deliveryMethod,
      delivery_address: fd.get("delivery_address") as string,
      notes: fd.get("notes") as string,
      subtotal: total,
      total,
      status: "pending",
      payment_status: "unpaid",
    });
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("Order created");
    navigate({ to: "/dashboard/orders" });
  };

  return (
    <div className="space-y-4">
      <Button asChild variant="ghost" size="sm">
        <Link to="/dashboard/orders">
          <ArrowLeft className="mr-2 h-4 w-4" /> Back to orders
        </Link>
      </Button>
      <Card className="p-6">
        <h1 className="text-2xl font-bold text-primary">New Order</h1>
        <form onSubmit={onSubmit} className="mt-6 grid gap-4 md:grid-cols-2">
          <div className="md:col-span-2">
            <Label htmlFor="client_id">Client</Label>
            <select
              id="client_id"
              name="client_id"
              className="mt-1 flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
            >
              <option value="">— Walk-in / no client linked —</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.company_name}
                </option>
              ))}
            </select>
            {clients.length === 0 && (
              <p className="mt-1 text-xs text-muted-foreground">
                No clients yet —{" "}
                <Link to="/dashboard/clients" className="text-accent underline">
                  add one first
                </Link>.
              </p>
            )}
          </div>

          <div>
            <Label>Payment Method</Label>
            <Select value={paymentMethod} onValueChange={setPaymentMethod}>
              <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="Bank Transfer">Bank Transfer</SelectItem>
                <SelectItem value="WhatsApp Manual">WhatsApp Manual</SelectItem>
                <SelectItem value="Cash">Cash</SelectItem>
                <SelectItem value="Net-30">Net-30</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label>Delivery Method</Label>
            <Select value={deliveryMethod} onValueChange={setDeliveryMethod}>
              <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="Nassau Job-Site Drop-Off">Nassau Job-Site Drop-Off</SelectItem>
                <SelectItem value="Mailboat - Exuma">Mailboat - Exuma</SelectItem>
                <SelectItem value="Mailboat - Abaco">Mailboat - Abaco</SelectItem>
                <SelectItem value="Mailboat - Eleuthera">Mailboat - Eleuthera</SelectItem>
                <SelectItem value="Pickup">Pickup at warehouse</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="md:col-span-2">
            <Label htmlFor="delivery_address">Delivery Address</Label>
            <Input id="delivery_address" name="delivery_address" />
          </div>

          <div>
            <Label htmlFor="total">Order Total ($)</Label>
            <Input id="total" name="total" type="number" step="0.01" min="0" defaultValue="0" />
          </div>

          <div className="md:col-span-2">
            <Label htmlFor="notes">Notes</Label>
            <Textarea id="notes" name="notes" rows={3} placeholder="Items ordered, special instructions, etc." />
          </div>

          <div className="md:col-span-2 flex justify-end gap-2">
            <Button asChild variant="outline" type="button">
              <Link to="/dashboard/orders">Cancel</Link>
            </Button>
            <Button type="submit" disabled={saving} className="bg-accent text-accent-foreground hover:bg-accent/90">
              {saving ? "Creating…" : "Create Order"}
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
}
