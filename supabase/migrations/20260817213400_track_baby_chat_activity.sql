create or replace function public.touch_baby_contact_state_from_message()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.role = 'user' then
    insert into public.baby_contact_state (
      owner_id,
      last_heard_at,
      last_inactivity_push_at,
      updated_at
    )
    values (
      new.owner_id,
      coalesce(new.created_at, now()),
      null,
      now()
    )
    on conflict (owner_id) do update
    set last_heard_at = greatest(public.baby_contact_state.last_heard_at, excluded.last_heard_at),
        last_inactivity_push_at = null,
        updated_at = now();
  end if;

  return new;
end;
$$;

drop trigger if exists baby_messages_touch_contact_state on public.baby_messages;

create trigger baby_messages_touch_contact_state
after insert on public.baby_messages
for each row
execute function public.touch_baby_contact_state_from_message();
