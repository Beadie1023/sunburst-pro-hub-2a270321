/**
 * ColorMatcherPage.tsx (Admin)
 *
 * Route: /admin/color-matcher
 * Renders the shared ColorMatcherTool for Sunburst team admin accounts.
 *
 * No "Add to Project" action here — an admin isn't scoped to a single
 * contractor's active project, so onAddToProject is simply omitted and
 * ColorMatcherTool hides the button automatically.
 */

import { ColorMatcherTool } from "../../components/ColorMatcherTool";

export default function ColorMatcherPage() {
  return (
    <section aria-labelledby="color-matcher-heading">
      <h1 id="color-matcher-heading">Color Matcher</h1>
      <p>Match a competitor color to the closest Sunburst equivalents.</p>
      <ColorMatcherTool />
    </section>
  );
}
