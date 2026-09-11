CREATE POLICY "No client access to secrets"
ON public.secrets
FOR ALL
TO anon, authenticated
USING (false)
WITH CHECK (false);