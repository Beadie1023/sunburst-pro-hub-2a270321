import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Card } from "@/components/ui/card";
import { Heart, Loader2 } from "lucide-react";

export const Route = createFileRoute("/pro-hub/saved")({
  component: SavedColorsPage,
});

interface Row {
  paint_color_id: string;
  paint_colors: { id: string; code: string; name: string; hex: string; collection: string; lrv: number | null } | null;
}

function SavedColorsPage() {
  const { user } = useAuth();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    supabase
      .from("saved_colors")
      .select("paint_color_id, paint_colors(id,code,name,hex,collection,lrv)")
      .eq("user_id", user.id)
      .then(({ data }) => {
        setRows((data ?? []) as Row[]);
        setLoading(false);
      });
  }, [user]);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-3xl font-bold text-primary">Saved Colors</h1>
        <p className="text-muted-foreground">Your favorite swatches at a glance.</p>
      </div>
      {loading ? (
        <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-accent" /></div>
      ) : rows.length === 0 ? (
        <Card className="p-12 text-center">
          <Heart className="mx-auto h-10 w-10 text-muted-foreground" />
          <p className="mt-3 text-muted-foreground">No saved colors yet.</p>
          <Link to="/pro-hub" className="mt-3 inline-block text-accent underline">Browse the catalog →</Link>
        </Card>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
          {rows.filter(r => r.paint_colors).map((r) => (
            <Card key={r.paint_color_id} className="overflow-hidden">
              <div className="h-24" style={{ backgroundColor: r.paint_colors!.hex }} />
              <div className="p-2.5">
                <div className="font-mono text-[10px] text-accent">{r.paint_colors!.code}</div>
                <div className="truncate font-semibold">{r.paint_colors!.name}</div>
                <div className="truncate text-xs text-muted-foreground">{r.paint_colors!.collection}</div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
