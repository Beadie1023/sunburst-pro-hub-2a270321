
-- 1. Hide contractor_price from public/anon and unauth users. Authenticated users keep access; admins via has_role still see everything.
REVOKE SELECT (contractor_price) ON public.products FROM anon;

-- 2. Tighten user_roles ALL policy: add explicit WITH CHECK so non-admins cannot INSERT/UPDATE a role row for themselves.
DROP POLICY IF EXISTS "admins manage roles" ON public.user_roles;
CREATE POLICY "admins manage roles"
ON public.user_roles
FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));
