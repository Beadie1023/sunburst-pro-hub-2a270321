-- Normalize hex values in staging
UPDATE public.palette_import
SET hex = '#' || upper(regexp_replace(hex, '^#', ''));

-- Upsert all official colors
INSERT INTO public.paint_colors (code, name, hex, collection, recommended_use, active, in_stock)
SELECT code, name, hex, collection, recommended_use, true, true
FROM public.palette_import
ON CONFLICT (code) DO UPDATE SET
  name = EXCLUDED.name,
  hex = EXCLUDED.hex,
  collection = EXCLUDED.collection,
  recommended_use = EXCLUDED.recommended_use,
  active = true;

-- Remove mock/seed colors not in the official palette and not referenced anywhere
DELETE FROM public.paint_colors p
WHERE p.code NOT IN (SELECT code FROM public.palette_import)
  AND NOT EXISTS (SELECT 1 FROM public.project_colors pc WHERE pc.paint_color_id = p.id)
  AND NOT EXISTS (SELECT 1 FROM public.room_visualizations rv WHERE rv.paint_color_id = p.id);

-- Drop staging table
DROP TABLE public.palette_import;