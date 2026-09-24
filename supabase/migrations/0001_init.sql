-- Fit Tracker 0001: tables, trigger, indexes.
-- Apply by pasting into the Supabase SQL editor.

create or replace function touch_server_updated_at() returns trigger as $$
begin
  new.server_updated_at := now();
  new.user_id := coalesce(new.user_id, auth.uid());
  return new;
end $$ language plpgsql;

-- Deliberately does NOT touch updated_at: the client owns that value, which
-- is what makes last-write-wins deterministic for rows written offline.

create table exercises (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  server_updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  name text not null,
  muscle_group text,
  modality text not null check (modality in ('strength','cardio')),
  run_type text check (run_type in ('easy','tempo','intervals','long')),
  default_sets int,
  default_reps int,
  default_weight_kg numeric(6,2),
  default_duration_s int,
  default_distance_km numeric(6,2),
  sort_order int not null default 0
);

create table workout_templates (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  server_updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  name text not null,
  notes text
);

create table workout_template_items (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  server_updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  template_id uuid not null references workout_templates(id),
  exercise_id uuid not null references exercises(id),
  position int not null default 0,
  target_sets int,
  target_reps int,
  target_weight_kg numeric(6,2),
  target_duration_s int,
  target_distance_km numeric(6,2),
  target_rpe numeric(3,1),
  rest_seconds int,
  notes text
);

create table week_plans (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  server_updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  name text not null,
  active_from date not null
);

create table week_plan_days (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  server_updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  week_plan_id uuid not null references week_plans(id),
  weekday int not null check (weekday between 1 and 7),
  template_id uuid references workout_templates(id)
);

create table sessions (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  server_updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  date date not null,
  kind text not null check (kind in ('strength','run','mixed')),
  status text not null check (status in ('planned','done','partial','skipped')),
  template_id uuid references workout_templates(id),
  was_planned boolean not null default true,
  energy int check (energy between 1 and 5),
  notes text,
  started_at timestamptz,
  completed_at timestamptz
);

create table session_exercises (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  server_updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  session_id uuid not null references sessions(id),
  exercise_id uuid not null references exercises(id),
  position int not null default 0,
  notes text,
  target_sets int,
  target_reps int,
  target_weight_kg numeric(6,2)
);

create table set_entries (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  server_updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  session_exercise_id uuid not null references session_exercises(id),
  set_index int not null default 0,
  reps int not null,
  weight_kg numeric(6,2) not null,
  rpe numeric(3,1) not null check (rpe between 1 and 10),
  is_warmup boolean not null default false,
  notes text
);

create table runs (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  server_updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  session_id uuid not null references sessions(id),
  exercise_id uuid not null references exercises(id),
  run_type text not null check (run_type in ('easy','tempo','intervals','long')),
  distance_km numeric(6,2) not null,
  duration_s int not null,
  rpe numeric(3,1) not null check (rpe between 1 and 10),
  avg_hr int,
  weather text,
  route_note text
);

create table run_splits (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  server_updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  run_id uuid not null references runs(id),
  split_index int not null default 0,
  distance_km numeric(6,2) not null,
  duration_s int not null
);

create table body_metrics (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  server_updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  date date not null,
  weight_kg numeric(5,2),
  resting_hr int,
  note text
);

create table user_prefs (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  server_updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  rest_seconds_default int not null default 120,
  vibration boolean not null default true,
  theme text not null default 'dark'
);

-- Foreign keys between app tables intentionally omit ON DELETE CASCADE.
-- Soft delete is the only delete path during normal use; a cascade would
-- erase rows whose tombstones still need to reach the phone.

do $$
declare t text;
begin
  foreach t in array array[
    'exercises','workout_templates','workout_template_items','week_plans',
    'week_plan_days','sessions','session_exercises','set_entries','runs',
    'run_splits','body_metrics','user_prefs'
  ] loop
    execute format(
      'create trigger %I_touch before insert or update on %I
       for each row execute function touch_server_updated_at()', t, t);
    execute format(
      'create index %I on %I (user_id, server_updated_at)', t || '_pull_idx', t);
  end loop;
end $$;

create index sessions_date_idx on sessions (user_id, date);
create index body_metrics_date_idx on body_metrics (user_id, date);
create index set_entries_parent_idx on set_entries (session_exercise_id);
create index session_exercises_parent_idx on session_exercises (session_id);
create index run_splits_parent_idx on run_splits (run_id);
