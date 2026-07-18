import { createFileRoute } from "@tanstack/react-router";
import { ColorMatcherTool } from "../components/ColorMatcherTool";

export const Route = createFileRoute("/admin/color-matcher")({
  component: AdminColorMatcherPage,
});

function AdminColorMatcherPage() {
  return (
    <section aria-labelledby="admin-color-matcher-heading" className="p-6">
      <h1 id="admin-color-matcher-heading" className="text-2xl font-bold mb-2">Color Matcher (Admin)</h1>
      <p className="mb-4">Preview competitor color matches against the active Sunburst palette.</p>
      <ColorMatcherTool />
    </section>
  );
}
