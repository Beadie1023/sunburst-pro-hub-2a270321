import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { ColorMatcherTool, type MatchedColor } from "../components/ColorMatcherTool";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

const searchSchema = z.object({
  projectId: z.string().optional(),
});

export const Route = createFileRoute("/pro-hub/color-matcher")({
  validateSearch: searchSchema,
  component: ColorMatcherPage,
});

function ColorMatcherPage() {
  const { projectId } = Route.useSearch();

  const handleAddToProject = async (color: MatchedColor) => {
    if (!projectId) {
      toast.error("Open this matcher from a project to save colors.");
      return;
    }
    
    // Fixed: Changed "matcher_color_id" to "paint_color_id" to satisfy database constraints
    const { error } = await supabase.from("project_colors").insert({
      project_id: projectId,
      paint_color_id: color.id, 
      matcher_color_name: color.name,
      matcher_color_hex: color.hex,
      matcher_sku: color.product_sku,
    } as any);

    if (error) {
      toast.error("Could not save color: " + error.message);
      return;
    }
    toast.success(`${color.name} added to project.`);
  };

  return (
    <section aria-labelledby="color-matcher-heading" className="p-6">
      <h1 id="color-matcher-heading" className="text-2xl font-bold mb-2">Color Matcher</h1>
      <p className="mb-4">Match a competitor color to the closest Sunburst equivalents.</p>
      {!projectId && (
        <p className="text-sm text-muted-foreground mb-4">
          Tip: open the matcher from a project page to save colors directly.
        </p>
      )}
      <ColorMatcherTool onAddToProject={handleAddToProject} />
    </section>
  );
}
