-- Preserve an epoch after deletion; a deleted/recreated day cannot accept a stale editor.
alter table goal add column history_revision bigint not null default 0 check (history_revision >= 0);
create function advance_goal_history_revision() returns trigger language plpgsql as $$
begin
  if TG_OP = 'UPDATE' and new.status is not distinct from old.status and new.amount is not distinct from old.amount and new.local_date = old.local_date and new.goal_id = old.goal_id then
    return new;
  end if;
  if TG_OP = 'DELETE' then
    update goal set history_revision = history_revision + 1 where id = old.goal_id;
    return old;
  end if;
  update goal set history_revision = history_revision + 1 where id = new.goal_id;
  if TG_OP = 'UPDATE' and old.goal_id <> new.goal_id then
    update goal set history_revision = history_revision + 1 where id = old.goal_id;
  end if;
  return new;
end;
$$;
create trigger action_log_history_revision after insert or update or delete on action_log
for each row execute function advance_goal_history_revision();
