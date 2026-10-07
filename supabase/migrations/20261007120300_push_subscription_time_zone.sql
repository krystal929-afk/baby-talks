-- Lets the reminder cron format event times in each subscriber's local time zone.
ALTER TABLE public.push_subscriptions ADD COLUMN IF NOT EXISTS time_zone text;
