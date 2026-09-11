ALTER TABLE public.secrets ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.secrets FROM anon, authenticated;
GRANT ALL ON TABLE public.secrets TO service_role;

DROP POLICY IF EXISTS "public can read order by id" ON public.orders;

DROP POLICY IF EXISTS "Admin can view orders" ON public.orders;
CREATE POLICY "Admin can view orders"
ON public.orders
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'::public.app_role));

DROP POLICY IF EXISTS "Admin can update orders" ON public.orders;
CREATE POLICY "Admin can update orders"
ON public.orders
FOR UPDATE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'::public.app_role))
WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

DROP POLICY IF EXISTS "Admin can delete products" ON public.products;
CREATE POLICY "Admin can delete products"
ON public.products
FOR DELETE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'::public.app_role));

DROP POLICY IF EXISTS "Superuser full override products" ON public.products;
DROP POLICY IF EXISTS "Superuser full override orders" ON public.orders;

CREATE OR REPLACE FUNCTION public.prevent_profile_self_approval()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  IF NEW.approved IS DISTINCT FROM OLD.approved
     AND auth.uid() = OLD.id
     AND NOT public.has_role(auth.uid(), 'admin'::public.app_role) THEN
    RAISE EXCEPTION 'Only administrators can change account approval status';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS profiles_prevent_self_approval ON public.profiles;
CREATE TRIGGER profiles_prevent_self_approval
BEFORE UPDATE ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.prevent_profile_self_approval();