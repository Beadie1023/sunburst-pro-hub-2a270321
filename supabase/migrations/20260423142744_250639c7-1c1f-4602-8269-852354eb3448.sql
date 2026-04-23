-- Add VAT columns to orders
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS vat_amount numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS vat_rate numeric NOT NULL DEFAULT 0.10;

-- Promote Mallory to admin (and remove pending role if present)
DO $$
DECLARE
  uid uuid;
BEGIN
  SELECT id INTO uid FROM auth.users WHERE lower(email) = 'malloryjohnson045@gmail.com' LIMIT 1;
  IF uid IS NOT NULL THEN
    DELETE FROM public.user_roles WHERE user_id = uid AND role = 'pending';
    INSERT INTO public.user_roles (user_id, role)
    VALUES (uid, 'admin')
    ON CONFLICT DO NOTHING;
    UPDATE public.profiles SET approved = true WHERE id = uid;
  END IF;
END $$;