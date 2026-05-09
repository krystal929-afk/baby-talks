-- Lock all tables to authenticated users only (shared single-account model)

-- baby_memories
DROP POLICY IF EXISTS "Public delete baby_memories" ON public.baby_memories;
DROP POLICY IF EXISTS "Public insert baby_memories" ON public.baby_memories;
DROP POLICY IF EXISTS "Public read baby_memories" ON public.baby_memories;
DROP POLICY IF EXISTS "Public update baby_memories" ON public.baby_memories;

CREATE POLICY "Authenticated full access baby_memories" ON public.baby_memories
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- calendar_events
DROP POLICY IF EXISTS "Public delete calendar_events" ON public.calendar_events;
DROP POLICY IF EXISTS "Public insert calendar_events" ON public.calendar_events;
DROP POLICY IF EXISTS "Public read calendar_events" ON public.calendar_events;
DROP POLICY IF EXISTS "Public update calendar_events" ON public.calendar_events;

CREATE POLICY "Authenticated full access calendar_events" ON public.calendar_events
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ideas
DROP POLICY IF EXISTS "Public delete ideas" ON public.ideas;
DROP POLICY IF EXISTS "Public insert ideas" ON public.ideas;
DROP POLICY IF EXISTS "Public read ideas" ON public.ideas;
DROP POLICY IF EXISTS "Public update ideas" ON public.ideas;

CREATE POLICY "Authenticated full access ideas" ON public.ideas
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- push_subscriptions
DROP POLICY IF EXISTS "Public delete push_subscriptions" ON public.push_subscriptions;
DROP POLICY IF EXISTS "Public insert push_subscriptions" ON public.push_subscriptions;
DROP POLICY IF EXISTS "Public read push_subscriptions" ON public.push_subscriptions;
DROP POLICY IF EXISTS "Public update push_subscriptions" ON public.push_subscriptions;

CREATE POLICY "Authenticated full access push_subscriptions" ON public.push_subscriptions
  FOR ALL TO authenticated USING (true) WITH CHECK (true);