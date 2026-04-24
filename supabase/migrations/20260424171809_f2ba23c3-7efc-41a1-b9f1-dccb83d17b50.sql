
-- Bernice ideas table (single-user personal app, no auth)
CREATE TABLE public.ideas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  transcript TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'parking_lot' CHECK (status IN ('grow','rethink','trash','parking_lot')),
  topic TEXT NOT NULL DEFAULT 'Other',
  dev_pack JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.ideas ENABLE ROW LEVEL SECURITY;

-- Single-user personal notebook: open access (no auth in app).
CREATE POLICY "Public read ideas" ON public.ideas FOR SELECT USING (true);
CREATE POLICY "Public insert ideas" ON public.ideas FOR INSERT WITH CHECK (true);
CREATE POLICY "Public update ideas" ON public.ideas FOR UPDATE USING (true);
CREATE POLICY "Public delete ideas" ON public.ideas FOR DELETE USING (true);

CREATE INDEX ideas_created_at_idx ON public.ideas (created_at DESC);

-- updated_at trigger
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER ideas_set_updated_at
BEFORE UPDATE ON public.ideas
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
