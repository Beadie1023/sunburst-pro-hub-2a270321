import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Plus, Loader2, PhoneCall } from "lucide-react";

export const Route = createFileRoute("/dashboard/followups")({
  component: FollowUps,
});

interface FollowUp {
  id: string;
  client_id: string | null;
  due_date: string;
  type: string;
  notes: string | null;
  completed: boolean;
  clients: { company_name: string } | null;
}

function FollowUps() {
  const [items, setItems] = useState<FollowUp[]>([]);
  const [clients, setClients] = useState<{ id: string; company_name: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [showCompleted, setShowCompleted] = useState(false);

  const load = async () => {
    const q = supabase
      .from("follow_ups")
      .select("*, clients(company_name)")
      .order("due_date");
    const { data } = showCompleted ? await q : await q.eq("completed", false);
    setItems((data ?? []) as unknown as FollowUp[]);
    setLoading(false);
  };

  useEffect(() => {
    supabase.from("clients").select("id, company_name").order("company_name").then(({ data }) => setClients(data ?? []));
  }, []);
  useEffect(() => {
    load();
  }, [showCompleted]);

  const onCreate = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const { error } = await supabase.from("follow_ups").insert({
      client_id: (fd.get("client_id") as string) || null,
      due_date: fd.get("due_date") as string,
      type: fd.get("type") as string,
      notes: fd.get("notes") as string,
    });
    if (error) return toast.error(error.message);
    toast.success("Follow-up scheduled");
    setOpen(false);
    load();
  };

  const toggle = async (id: string, completed: boolean) => {
    await supabase.from("follow_ups").update({ completed, completed_at: completed ? new Date().toISOString() : null }).eq("id", id);
    load();
  };

  const today = new Date().toISOString().slice(0, 10);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-primary">Follow-Ups</h1>
          <p className="text-muted-foreground">CRM reminders to keep contractor relationships warm.</p>
        </div>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 text-sm">
            <Checkbox checked={showCompleted} onCheckedChange={(v) => setShowCompleted(!!v)} />
            Show completed
          </label>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button className="bg-accent text-accent-foreground hover:bg-accent/90"><Plus className="mr-2 h-4 w-4" /> New</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>New Follow-Up</DialogTitle></DialogHeader>
              <form onSubmit={onCreate} className="space-y-3">
                <div>
                  <Label>Client</Label>
                  <select name="client_id" className="mt-1 flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm">
                    <option value="">— Unassigned —</option>
                    {clients.map((c) => <option key={c.id} value={c.id}>{c.company_name}</option>)}
                  </select>
                </div>
                <div><Label>Due date</Label><Input type="date" name="due_date" defaultValue={today} required /></div>
                <div>
                  <Label>Type</Label>
                  <Select name="type" defaultValue="call">
                    <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="call">Call</SelectItem>
                      <SelectItem value="email">Email</SelectItem>
                      <SelectItem value="visit">Site Visit</SelectItem>
                      <SelectItem value="quote">Quote Follow-Up</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div><Label>Notes</Label><Textarea name="notes" rows={3} /></div>
                <Button type="submit" className="w-full bg-accent text-accent-foreground hover:bg-accent/90">Schedule</Button>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-accent" /></div>
      ) : items.length === 0 ? (
        <Card className="py-12 text-center text-muted-foreground">All caught up. 🎯</Card>
      ) : (
        <div className="space-y-2">
          {items.map((f) => {
            const overdue = !f.completed && f.due_date < today;
            return (
              <Card key={f.id} className={`p-4 ${overdue ? "border-l-4 border-l-destructive" : ""}`}>
                <div className="flex items-start gap-3">
                  <Checkbox checked={f.completed} onCheckedChange={(v) => toggle(f.id, !!v)} className="mt-1" />
                  <div className="flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`font-semibold ${f.completed ? "text-muted-foreground line-through" : "text-primary"}`}>
                        {f.clients?.company_name ?? "Unassigned"}
                      </span>
                      <Badge variant="secondary"><PhoneCall className="mr-1 h-3 w-3" />{f.type}</Badge>
                      {overdue && <Badge variant="destructive">Overdue</Badge>}
                    </div>
                    <div className="mt-1 text-xs text-muted-foreground">Due {new Date(f.due_date).toLocaleDateString()}</div>
                    {f.notes && <p className="mt-2 text-sm">{f.notes}</p>}
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
