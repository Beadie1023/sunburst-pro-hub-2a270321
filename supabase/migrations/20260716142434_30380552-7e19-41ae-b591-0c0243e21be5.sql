CREATE TABLE IF NOT EXISTS public.palette_import (
  code text PRIMARY KEY,
  name text NOT NULL,
  hex text NOT NULL,
  collection text NOT NULL,
  recommended_use text
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.palette_import TO authenticated;
GRANT ALL ON public.palette_import TO service_role;
ALTER TABLE public.palette_import ENABLE ROW LEVEL SECURITY;