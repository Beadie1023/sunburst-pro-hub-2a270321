import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { FolderKanban, Loader2, Plus } from "lucide-react";

export const Route = createFileRoute("/pro-hub/projects")({
  component: ProjectsPage,
});

interface Project {
  id: string; name: string; client_name: string | null; location: string | null;
  status: string; updated_at: string;
}

const STATUS_STYLE: Record<string, string> = {
  draft: "bg-muted text-foreground",
  quoted: "bg-warning/15 text-warning-foreground",
  ordered: "bg-teal/15 text-teal",
  in_progress: "bg-accent/15 text-accent",
  completed: "bg-success/15 text-success",
};

function ProjectsPage() {
  const { user } = useAuth();
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [client, setClient] = useState("");
  const [location, setLocation] = useState("");
  const [saving, setSaving] = useState(false);

  const refresh = async () => {
    if (!user) return;
    const { data } = await supabase
      .from("projects").select("*").eq("user_id", user.id)
      .order("updated_at", { ascending: false });
    setProjects((data ?? []) as Project[]);
    setLoading(false);
  };

  useEffect(() => { refresh(); /* eslint-disable-next-line */ }, [user]);

  const create = async () => {
    if (!user || !name.trim()) return;
    setSaving(true);
    const { error } = await supabase.from("projects").insert({
      user_id: user.id, name: name.trim(),
      client_name: client.trim() || null,
      location: location.trim() || null,
    });
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Project created");
    setName(""); setClient(""); setLocation(""); setOpen(false);
    refresh();
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold text-primary">My Projects</h1>
          <p className="text-muted-foreground">Plan, specify, and quote contractor jobs.</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button className="bg-accent text-accent-foreground hover:bg-accent/90">
              <Plus className="mr-1.5 h-4 w-4" /> New Project
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Create Project</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <Input placeholder="Project name (e.g. Cable Beach Villa)" value={name} onChange={(e) => setName(e.target.value)} />
              <Input placeholder="Client / company (optional)" value={client} onChange={(e) => setClient(e.target.value)} />
              <Input placeholder="Location (optional)" value={location} onChange={(e) => setLocation(e.target.value)} />
              <Button onClick={create} disabled={saving || !name.trim()} className="w-full bg-accent text-accent-foreground hover:bg-accent/90">
                {saving ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Plus className="mr-1.5 h-4 w-4" />}
                Create
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {loading ? (
        <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-accent" /></div>
      ) : projects.length === 0 ? (
        <Card className="p-12 text-center">
          <FolderKanban className="mx-auto h-10 w-10 text-muted-foreground" />
          <h3 className="mt-3 text-lg font-semibold">No projects yet</h3>
          <p className="mt-1 text-sm text-muted-foreground">Create your first project to start saving colors and quantities.</p>
        </Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {projects.map((p) => (
            <Link key={p.id} to="/pro-hub/projects/$projectId" params={{ projectId: p.id }}>
              <Card className="group h-full p-4 transition hover:-translate-y-0.5 hover:shadow-md">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <h3 className="truncate font-semibold text-foreground">{p.name}</h3>
                    {p.client_name && <p className="truncate text-xs text-muted-foreground">{p.client_name}</p>}
                  </div>
                  <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${STATUS_STYLE[p.status] ?? STATUS_STYLE.draft}`}>
                    {p.status.replace(/_/g, " ")}
                  </span>
                </div>
                {p.location && <div className="mt-2 text-xs text-muted-foreground">📍 {p.location}</div>}
                <div className="mt-3 text-[10px] uppercase tracking-wider text-muted-foreground">
                  Updated {new Date(p.updated_at).toLocaleDateString()}
                </div>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
