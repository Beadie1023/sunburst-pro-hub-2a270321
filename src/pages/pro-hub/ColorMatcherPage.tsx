/**
 * ColorMatcherPage.tsx (Pro Hub)
 *
 * Route: /pro-hub/color-matcher
 * Renders the shared ColorMatcherTool for logged-in contractors.
 *
 * ASSUMPTION: the brief doesn't define the contractor "active project"
 * data model or an existing project API, so onAddToProject is left as
 * an integration seam — wire it to whatever project-colors mutation
 * already exists in the contractor dashboard (e.g. a Supabase insert
 * into a `project_colors` table scoped to the current project).
 */

import { ColorMatcherTool } from "../../components/ColorMatcherTool";
import type { MatchResult } from "../../lib/colorMatching";

export default function ColorMatcherPage() {
  const handleAddToProject = (match: MatchResult) => {
    // TODO: wire to the contractor's active project mutation.
    // e.g. await addColorToActiveProject(currentProjectId, match.color.id)
    console.log("Add to project (contractor):", match.color);
  };

  return (
    <section aria-labelledby="color-matcher-heading">
      <h1 id="color-matcher-heading">Color Matcher</h1>
      <p>Match a competitor color to the closest Sunburst equivalents.</p>
      <ColorMatcherTool onAddToProject={handleAddToProject} />
    </section>
  );
}
