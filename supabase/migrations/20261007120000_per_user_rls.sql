-- Per-user ownership. user_id defaults to the caller; existing rows stay NULL
-- (and therefore invisible) until the owner backfills them:
--   UPDATE public.<table> SET user_id = '<owner-uuid>' WHERE user_id IS NULL;
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['ideas','baby_memories','calendar_events','push_subscriptions'] LOOP
    EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS user_id uuid DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE', t);
    EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON public.%I (user_id)', 'idx_' || t || '_user_id', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'Authenticated full access ' || t, t);
    EXECUTE format('CREATE POLICY %I ON public.%I AS PERMISSIVE FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id)', 'Owner full access ' || t, t);
  END LOOP;
END $$;
