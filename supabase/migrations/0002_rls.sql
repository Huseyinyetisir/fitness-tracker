-- Fit Tracker 0002: row level security.
-- The anon key ships inside the APK and is extractable. RLS is what actually
-- protects the data; revoking anon grants is the second layer.

do $$
declare t text;
begin
  foreach t in array array[
    'exercises','workout_templates','workout_template_items','week_plans',
    'week_plan_days','sessions','session_exercises','set_entries','runs',
    'run_splits','body_metrics','user_prefs'
  ] loop
    execute format('alter table %I enable row level security', t);

    execute format(
      'create policy own_select on %I for select using (auth.uid() = user_id)', t);
    execute format(
      'create policy own_insert on %I for insert with check (auth.uid() = user_id)', t);
    -- The WITH CHECK on update is not optional: without it a row's user_id
    -- can be reassigned to another account.
    execute format(
      'create policy own_update on %I for update
         using (auth.uid() = user_id) with check (auth.uid() = user_id)', t);
    -- DELETE exists solely for Settings -> "Delete all data".
    execute format(
      'create policy own_delete on %I for delete using (auth.uid() = user_id)', t);

    execute format('revoke all on %I from anon', t);
  end loop;
end $$;
