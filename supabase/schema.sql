-- Run once in the Supabase SQL editor. Create your user in Authentication first,
-- then insert their UUID into admin_users using the SQL editor (never the browser).
begin;
create table public.admin_users (
  user_id uuid primary key references auth.users(id) on delete cascade
);
alter table public.admin_users enable row level security;
create policy admin_can_read_self on public.admin_users for select to authenticated using (user_id = (select auth.uid()));
revoke all on public.admin_users from anon, authenticated;
grant select on public.admin_users to authenticated;

create function public.is_rainei_admin() returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.admin_users where user_id = (select auth.uid()));
$$;
revoke all on function public.is_rainei_admin() from public;
grant execute on function public.is_rainei_admin() to authenticated;

create table public.entries (
  id text primary key check (length(id) between 1 and 250),
  kind text not null check (kind in ('series','song')),
  parent_id text references public.entries(id) on delete cascade,
  data jsonb not null check (jsonb_typeof(data) = 'object' and data ? 'title' and jsonb_typeof(data->'title') = 'string' and length(trim(data->>'title')) > 0),
  updated_at timestamptz not null default now(),
  check ((kind = 'series' and parent_id is null) or (kind = 'song' and parent_id is not null and parent_id <> id))
);
create unique index unique_anilist_series on public.entries ((data->>'anilistId')) where kind = 'series' and data->>'anilistId' is not null;
create index entries_parent on public.entries(parent_id);
alter table public.entries enable row level security;
create policy admin_entries on public.entries for all to authenticated using ((select public.is_rainei_admin())) with check ((select public.is_rainei_admin()));
revoke all on public.entries from anon, authenticated;
grant select, insert, update, delete on public.entries to authenticated;

create function public.validate_entry() returns trigger language plpgsql set search_path = '' as $$
begin
  if tg_op = 'UPDATE' and (new.id <> old.id or new.kind <> old.kind) then
    raise exception 'Entry ID and kind are immutable';
  end if;
  if new.kind = 'song' and not exists (select 1 from public.entries where id = new.parent_id and kind = 'series') then
    raise exception 'A song must belong to a series';
  end if;
  new.updated_at := now();
  return new;
end; $$;
revoke all on function public.validate_entry() from public;
create trigger validate_entry before insert or update on public.entries for each row execute function public.validate_entry();

-- This table contains ONLY public snapshots. Draft edits never mutate it.
create table public.published_entries (
  id text primary key references public.entries(id) on delete cascade,
  kind text not null check (kind in ('series','song')),
  parent_id text references public.published_entries(id) on delete cascade,
  data jsonb not null,
  updated_at timestamptz not null,
  check ((kind = 'series' and parent_id is null) or (kind = 'song' and parent_id is not null))
);
alter table public.published_entries enable row level security;
create policy public_snapshots on public.published_entries for select to anon, authenticated using (true);
revoke all on public.published_entries from anon, authenticated;
grant select on public.published_entries to anon, authenticated;

create function public.publish_entry(entry_id text) returns void language plpgsql security definer set search_path = '' as $$
declare item public.entries;
begin
  if not public.is_rainei_admin() then raise exception 'Admin access required' using errcode = '42501'; end if;
  select * into item from public.entries where id = entry_id for update;
  if not found then raise exception 'Entry not found'; end if;
  if item.kind = 'song' and not exists (select 1 from public.published_entries where id = item.parent_id and kind = 'series') then
    raise exception 'Publish the parent anime first';
  end if;
  insert into public.published_entries (id,kind,parent_id,data,updated_at)
    values (item.id,item.kind,item.parent_id,item.data,item.updated_at)
    on conflict (id) do update set parent_id = excluded.parent_id, data = excluded.data, updated_at = excluded.updated_at;
end; $$;
create function public.unpublish_entry(entry_id text) returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_rainei_admin() then raise exception 'Admin access required' using errcode = '42501'; end if;
  delete from public.published_entries where id = entry_id;
end; $$;
revoke all on function public.publish_entry(text), public.unpublish_entry(text) from public;
grant execute on function public.publish_entry(text), public.unpublish_entry(text) to authenticated;
commit;

-- Replace the UUID below with your admin user's actual UUID, then run separately:
-- insert into public.admin_users(user_id) values ('YOUR-USER-UUID');
