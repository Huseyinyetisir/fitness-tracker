-- Fit Tracker 0003: enforce last-write-wins on the server.
--
-- The client's push path has no pre-read: it upserts every dirty row and lets
-- the database sort out ordering. Without this guard an older row silently
-- overwrites a newer one, which loses a logged session whenever one device has
-- been offline while another wrote the same row.
--
-- On a stale update the row is rewritten with its existing values and a fresh
-- server_updated_at. Rewriting rather than skipping matters: the stale pusher
-- cleared its dirty flag on the successful response, so it only learns it lost
-- by pulling the row back, and it only pulls rows whose server_updated_at is at
-- or beyond its watermark.

create or replace function touch_server_updated_at() returns trigger as $$
begin
  if tg_op = 'UPDATE' and new.updated_at < old.updated_at then
    new := old;
    new.server_updated_at := now();
    return new;
  end if;

  new.server_updated_at := now();
  new.user_id := coalesce(new.user_id, auth.uid());
  return new;
end $$ language plpgsql;
