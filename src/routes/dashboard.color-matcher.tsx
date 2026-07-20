import { createFileRoute } from "@tanstack/react-router";
import { ColorMatcherTool } from "@/components/ColorMatcherTool";

export const Route = createFileRoute("/dashboard/color-matcher")({
  component: DashboardColorMatcherPage,
});

function DashboardColorMatcherPage() {
  return (
    <section aria-labelledby="dashboard-color-matcher-heading" className="p-6">
      <h1 id="dashboard-color-matcher-heading" className="mb-2 text-2xl font-bold">
        Color Matcher
      </h1>
      <p className="mb-4 text-muted-foreground">
        Match a competitor color name, hex code, or RGB value to the closest Sunburst equivalents.
      </p>
      <ColorMatcherTool />
    </section>
  );
}