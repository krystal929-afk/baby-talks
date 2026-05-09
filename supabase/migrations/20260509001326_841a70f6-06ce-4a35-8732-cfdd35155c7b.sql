CREATE TABLE public.push_subscriptions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  endpoint TEXT NOT NULL UNIQUE,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  label TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  last_used_at TIMESTAMP WITH TIME ZONE
);

ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read push_subscriptions" ON public.push_subscriptions FOR SELECT USING (true);
CREATE POLICY "Public insert push_subscriptions" ON public.push_subscriptions FOR INSERT WITH CHECK (true);
CREATE POLICY "Public delete push_subscriptions" ON public.push_subscriptions FOR DELETE USING (true);
CREATE POLICY "Public update push_subscriptions" ON public.push_subscriptions FOR UPDATE USING (true);

CREATE INDEX idx_calendar_events_remind_due ON public.calendar_events (remind_at) WHERE reminded = false AND remind_at IS NOT NULL;