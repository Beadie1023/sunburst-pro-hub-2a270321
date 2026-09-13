# Restore the Room Visualizer

## Goal
Turn the existing Room Visualizer entry into a working photo preview where a contractor can see Sunburst colors on a wall.

## What will change
- Add a dedicated Room Visualizer workspace to AI Design Tools.
- Let the user upload or take a room photo.
- Load real colors from the Sunburst catalog with name/code search.
- Let the user tap the wall to select the area to recolor.
- Apply the chosen paint color while preserving the wall's original light, shadows, and texture.
- Add tolerance and paint-strength controls for difficult wall boundaries.
- Provide before/after comparison, reset, and image download controls.
- Connect Room Visualizer links directly to this workspace instead of the color-match screen.

## Technical details
- Perform wall selection and rendering locally in the browser with a bounded flood-fill mask and luminance-preserving color blend; no photo is uploaded for visualization.
- Keep the existing server-side AI color recommendation flow unchanged.
- Use existing design tokens and controls, and verify desktop and mobile layouts plus the preview build.
