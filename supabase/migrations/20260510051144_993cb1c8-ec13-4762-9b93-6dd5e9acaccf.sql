DROP POLICY IF EXISTS "Authenticated full access baby_memories" ON public.baby_memories;
CREATE POLICY "Authenticated full access baby_memories" ON public.baby_memories
AS PERMISSIVE FOR ALL TO authenticated
USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "Authenticated full access calendar_events" ON public.calendar_events;
CREATE POLICY "Authenticated full access calendar_events" ON public.calendar_events
AS PERMISSIVE FOR ALL TO authenticated
USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "Authenticated full access ideas" ON public.ideas;
CREATE POLICY "Authenticated full access ideas" ON public.ideas
AS PERMISSIVE FOR ALL TO authenticated
USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "Authenticated full access push_subscriptions" ON public.push_subscriptions;
CREATE POLICY "Authenticated full access push_subscriptions" ON public.push_subscriptions
AS PERMISSIVE FOR ALL TO authenticated
USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);
