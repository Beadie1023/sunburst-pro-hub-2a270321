ALTER TABLE public.paint_colors
  ADD COLUMN IF NOT EXISTS technical_notes text,
  ADD COLUMN IF NOT EXISTS swatch_image_url text,
  ADD COLUMN IF NOT EXISTS in_stock boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

DROP TRIGGER IF EXISTS paint_colors_touch ON public.paint_colors;
CREATE TRIGGER paint_colors_touch BEFORE UPDATE ON public.paint_colors
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS must_change_password boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS paint_colors_collection_idx ON public.paint_colors(collection);
CREATE INDEX IF NOT EXISTS paint_colors_active_idx ON public.paint_colors(active);