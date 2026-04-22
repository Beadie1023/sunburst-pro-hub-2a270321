
-- Bundles
CREATE TABLE public.bundles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  category TEXT NOT NULL DEFAULT 'General',
  items JSONB NOT NULL DEFAULT '[]'::jsonb,
  price NUMERIC,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.bundles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "anyone can view active bundles" ON public.bundles FOR SELECT USING (active = true OR has_role(auth.uid(), 'admin'));
CREATE POLICY "admins manage bundles" ON public.bundles FOR ALL USING (has_role(auth.uid(), 'admin'));

-- Follow-ups (CRM)
CREATE TABLE public.follow_ups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID REFERENCES public.clients(id) ON DELETE CASCADE,
  due_date DATE NOT NULL DEFAULT (now()::date + 7),
  type TEXT NOT NULL DEFAULT 'call',
  notes TEXT,
  completed BOOLEAN NOT NULL DEFAULT false,
  completed_at TIMESTAMPTZ,
  assigned_to UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.follow_ups ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins manage follow_ups" ON public.follow_ups FOR ALL USING (has_role(auth.uid(), 'admin'));

-- Order status history
CREATE TABLE public.order_status_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  status TEXT NOT NULL,
  note TEXT,
  changed_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.order_status_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins manage status history" ON public.order_status_history FOR ALL USING (has_role(auth.uid(), 'admin'));
CREATE INDEX idx_status_history_order ON public.order_status_history(order_id);

-- Seed a few starter bundles using existing product categories
INSERT INTO public.bundles (name, description, category, items, price) VALUES
  ('Interior Repaint Starter', '9" rollers, brushes, tape, drop cloths — everything for a 1-bedroom interior repaint.', 'Interior',
    '[{"name":"9\" Roller Sleeve","qty":4},{"name":"2.5\" Angle Brush","qty":2},{"name":"Painter''s Tape 1.5\"","qty":3},{"name":"9\" Roller Frame","qty":2}]'::jsonb, 89.00),
  ('Exterior Prep Pack', 'Sandpaper, scrapers, joint tape, and prep tools for exterior jobs.', 'Exterior',
    '[{"name":"Sandpaper Assorted","qty":5},{"name":"Joint Tape","qty":3},{"name":"Scraper","qty":2}]'::jsonb, 64.00),
  ('Pro Brush Kit', 'Full set of contractor-grade brushes — 1", 2", 2.5", 3".', 'Tools',
    '[{"name":"1\" Angle Brush","qty":2},{"name":"2\" Angle Brush","qty":2},{"name":"2.5\" Angle Brush","qty":2},{"name":"3\" Wall Brush","qty":2}]'::jsonb, 72.00);
