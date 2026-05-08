CREATE TABLE public.calendar_events (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  title TEXT NOT NULL,
  notes TEXT,
  starts_at TIMESTAMPTZ NOT NULL,
  ends_at TIMESTAMPTZ,
  all_day BOOLEAN NOT NULL DEFAULT false,
  location TEXT,
  remind_at TIMESTAMPTZ,
  reminded BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.calendar_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read calendar_events" ON public.calendar_events FOR SELECT USING (true);
CREATE POLICY "Public insert calendar_events" ON public.calendar_events FOR INSERT WITH CHECK (true);
CREATE POLICY "Public update calendar_events" ON public.calendar_events FOR UPDATE USING (true);
CREATE POLICY "Public delete calendar_events" ON public.calendar_events FOR DELETE USING (true);

CREATE TRIGGER set_calendar_events_updated_at
BEFORE UPDATE ON public.calendar_events
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX idx_calendar_events_starts_at ON public.calendar_events(starts_at);
CREATE INDEX idx_calendar_events_remind_at ON public.calendar_events(remind_at) WHERE reminded = false AND remind_at IS NOT NULL;