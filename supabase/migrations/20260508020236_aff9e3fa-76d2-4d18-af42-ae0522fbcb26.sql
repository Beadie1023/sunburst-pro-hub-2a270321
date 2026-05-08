
-- Paint colors catalog
CREATE TABLE public.paint_colors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  name text NOT NULL,
  hex text NOT NULL,
  collection text NOT NULL,
  lrv numeric,
  drying_time text,
  recommended_use text,
  finishes text[] NOT NULL DEFAULT ARRAY['Matte','Eggshell','Satin','Semi-Gloss']::text[],
  coverage_sqft numeric NOT NULL DEFAULT 350,
  technical_pdf_url text,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.paint_colors ENABLE ROW LEVEL SECURITY;
CREATE POLICY "anyone view active paint colors" ON public.paint_colors
  FOR SELECT USING (active OR has_role(auth.uid(),'admin'::app_role));
CREATE POLICY "admins manage paint colors" ON public.paint_colors
  FOR ALL USING (has_role(auth.uid(),'admin'::app_role));

-- Projects
CREATE TABLE public.projects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  name text NOT NULL,
  client_name text,
  location text,
  status text NOT NULL DEFAULT 'draft',
  notes text,
  wall_width numeric,
  wall_height numeric,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users manage own projects" ON public.projects
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "admins view all projects" ON public.projects
  FOR SELECT USING (has_role(auth.uid(),'admin'::app_role));

-- Project colors (saved swatches inside a project)
CREATE TABLE public.project_colors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  paint_color_id uuid NOT NULL REFERENCES public.paint_colors(id) ON DELETE RESTRICT,
  finish text NOT NULL DEFAULT 'Eggshell',
  gallons numeric NOT NULL DEFAULT 1,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.project_colors ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users manage own project_colors" ON public.project_colors
  FOR ALL USING (EXISTS (SELECT 1 FROM public.projects p WHERE p.id = project_id AND p.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.projects p WHERE p.id = project_id AND p.user_id = auth.uid()));

-- Project items (saved products)
CREATE TABLE public.project_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  product_id uuid NOT NULL,
  quantity integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.project_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users manage own project_items" ON public.project_items
  FOR ALL USING (EXISTS (SELECT 1 FROM public.projects p WHERE p.id = project_id AND p.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.projects p WHERE p.id = project_id AND p.user_id = auth.uid()));

-- Saved colors (favorites independent of projects)
CREATE TABLE public.saved_colors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  paint_color_id uuid NOT NULL REFERENCES public.paint_colors(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, paint_color_id)
);
ALTER TABLE public.saved_colors ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users manage own saved_colors" ON public.saved_colors
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Room visualizations placeholder
CREATE TABLE public.room_visualizations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  paint_color_id uuid REFERENCES public.paint_colors(id),
  finish text,
  original_image text,
  generated_image text,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.room_visualizations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users manage own visualizations" ON public.room_visualizations
  FOR ALL USING (EXISTS (SELECT 1 FROM public.projects p WHERE p.id = project_id AND p.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.projects p WHERE p.id = project_id AND p.user_id = auth.uid()));

-- updated_at trigger for projects
CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$;
CREATE TRIGGER projects_touch BEFORE UPDATE ON public.projects
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
