
-- Add pricing tiers to products
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS retail_price numeric,
  ADD COLUMN IF NOT EXISTS contractor_price numeric,
  ADD CONSTRAINT products_sku_unique UNIQUE (sku);

-- Structured bundle items (replaces the JSONB items array going forward; old column kept for back-compat)
CREATE TABLE IF NOT EXISTS public.bundle_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bundle_id uuid NOT NULL REFERENCES public.bundles(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE RESTRICT,
  quantity integer NOT NULL DEFAULT 1 CHECK (quantity > 0),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS bundle_items_bundle_idx ON public.bundle_items(bundle_id);

ALTER TABLE public.bundles
  ADD COLUMN IF NOT EXISTS discount_pct numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS subtotal numeric;

ALTER TABLE public.bundle_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "anyone can view bundle items"
  ON public.bundle_items FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.bundles b WHERE b.id = bundle_id AND (b.active OR public.has_role(auth.uid(),'admin'))));

CREATE POLICY "admins manage bundle items"
  ON public.bundle_items FOR ALL
  USING (public.has_role(auth.uid(),'admin'));
