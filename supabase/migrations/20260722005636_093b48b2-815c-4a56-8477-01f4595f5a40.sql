GRANT SELECT ON public.orders TO anon, authenticated;
CREATE POLICY "public can read order by id" ON public.orders FOR SELECT TO anon, authenticated USING (true);