INSERT INTO public.user_roles (user_id, role)
SELECT id, 'admin'::app_role FROM auth.users ORDER BY created_at DESC LIMIT 1
ON CONFLICT (user_id, role) DO NOTHING;