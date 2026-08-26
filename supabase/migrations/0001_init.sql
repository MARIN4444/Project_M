-- Project_M: shared schema for syncing matches between the devices of one group.
--
-- Two ideas shape everything here:
--
--   1. The phones are the system of record. This database is a relay, so it
--      holds no state the devices cannot rebuild. That is why there is no
--      derived data, no totals, no rankings: only the raw log.
--
--   2. Score entries are append-only. That is not a convention documented in a
--      comment somewhere -- it is enforced below by simply never granting
--      UPDATE on the table. A correction writes a newer entry and the fold
--      decides which one counts, exactly as it does on the device.
--
-- Ids are the application's own sortable ULIDs rather than uuids, so a row
-- keeps the same identity on the phone and on the server.

-- ---------------------------------------------------------------------------
-- Membership
-- ---------------------------------------------------------------------------

create table public.profiles (
  id uuid primary key references auth.users on delete cascade,
  display_name text not null default 'Jugador',
  created_at timestamptz not null default now()
);

create table public.groups (
  id text primary key,
  name text not null,
  join_code text not null unique,
  created_by uuid not null references auth.users on delete cascade,
  created_at timestamptz not null default now(),
  synced_at timestamptz not null default now()
);

create table public.group_members (
  group_id text not null references public.groups on delete cascade,
  user_id uuid not null references auth.users on delete cascade,
  role text not null default 'member',
  joined_at timestamptz not null default now(),
  primary key (group_id, user_id)
);

create index group_members_user_idx on public.group_members (user_id);

-- ---------------------------------------------------------------------------
-- Game data
--
-- group_id is repeated on every table on purpose. It could be reached by
-- joining through matches, but carrying it directly keeps each row's access
-- rule to a single indexed column, which is what makes the policies below both
-- simple to read and cheap to evaluate.
-- ---------------------------------------------------------------------------

create table public.players (
  id text primary key,
  group_id text not null references public.groups on delete cascade,
  name text not null,
  color text,
  created_at timestamptz not null default now(),
  synced_at timestamptz not null default now()
);

create index players_group_idx on public.players (group_id, synced_at);

create table public.matches (
  id text primary key,
  group_id text not null references public.groups on delete cascade,
  template_id text not null,
  game_name text not null,
  bgg_id integer,
  join_code text not null,
  status text not null check (status in ('setup', 'live', 'finished')),
  round integer not null default 0,
  started_at timestamptz not null,
  finished_at timestamptz,
  notes text,
  synced_at timestamptz not null default now()
);

create index matches_group_idx on public.matches (group_id, synced_at);

create table public.seats (
  id text primary key,
  group_id text not null references public.groups on delete cascade,
  match_id text not null references public.matches on delete cascade,
  player_id text not null,
  player_name text not null,
  seat_order integer not null,
  color text,
  claimed_by text,
  synced_at timestamptz not null default now()
);

create index seats_group_idx on public.seats (group_id, synced_at);
create index seats_match_idx on public.seats (match_id, seat_order);

-- Append-only. See the grants at the bottom: UPDATE is never handed out.
create table public.score_entries (
  id text primary key,
  group_id text not null references public.groups on delete cascade,
  match_id text not null references public.matches on delete cascade,
  seat_id text not null,
  category_key text not null,
  round integer not null default 0,
  value integer not null,
  recorded_at bigint not null,
  device_id text not null,
  synced_at timestamptz not null default now()
);

create index score_entries_group_idx on public.score_entries (group_id, synced_at);
create index score_entries_match_idx on public.score_entries (match_id);

-- ---------------------------------------------------------------------------
-- Who belongs where
--
-- Every policy below reduces to one question: is the caller a member of this
-- row's group? The check lives in a SECURITY DEFINER function for a specific
-- reason -- a policy on group_members that queried group_members directly
-- would recurse forever. Running the lookup as the definer bypasses RLS inside
-- the function and breaks the cycle.
--
-- The empty search_path is not decoration: without it, a caller could create a
-- table in their own schema and shadow the one this function means to read.
-- ---------------------------------------------------------------------------

create or replace function public.is_group_member(gid text)
returns boolean
language sql
security definer
stable
set search_path = ''
as $$
  select exists (
    select 1
    from public.group_members
    where group_id = gid
      and user_id = (select auth.uid())
  );
$$;

-- ---------------------------------------------------------------------------
-- Joining
--
-- Groups are created and joined through functions rather than direct inserts.
-- A plain INSERT policy on group_members would let anyone add themselves to
-- any group whose id they could name; routing it through a function means the
-- join code is the only way in, and the code is checked by the server.
-- ---------------------------------------------------------------------------

create or replace function public.create_group(group_id text, group_name text, code text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
begin
  if uid is null then
    raise exception 'Not signed in';
  end if;

  insert into public.groups (id, name, join_code, created_by)
  values (group_id, group_name, upper(code), uid);

  insert into public.group_members (group_id, user_id, role)
  values (group_id, uid, 'owner');

  return group_id;
end;
$$;

create or replace function public.join_group(code text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  target text;
begin
  if uid is null then
    raise exception 'Not signed in';
  end if;

  select id into target from public.groups where join_code = upper(trim(code));

  if target is null then
    raise exception 'No group has that code';
  end if;

  insert into public.group_members (group_id, user_id, role)
  values (target, uid, 'member')
  on conflict (group_id, user_id) do nothing;

  return target;
end;
$$;

-- ---------------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------------

alter table public.profiles       enable row level security;
alter table public.groups         enable row level security;
alter table public.group_members  enable row level security;
alter table public.players        enable row level security;
alter table public.matches        enable row level security;
alter table public.seats          enable row level security;
alter table public.score_entries  enable row level security;

-- Profiles: yours is yours; you can also read the profiles of people you play
-- with, so their names can be shown.
create policy "read own profile" on public.profiles
  for select using (id = (select auth.uid()));

create policy "write own profile" on public.profiles
  for insert with check (id = (select auth.uid()));

create policy "update own profile" on public.profiles
  for update using (id = (select auth.uid()));

-- Groups: visible to members. Created only through create_group().
create policy "members read group" on public.groups
  for select using (public.is_group_member(id));

create policy "owner updates group" on public.groups
  for update using (created_by = (select auth.uid()));

-- Membership rows are visible to fellow members, and you may remove yourself.
create policy "members read membership" on public.group_members
  for select using (public.is_group_member(group_id));

create policy "leave group" on public.group_members
  for delete using (user_id = (select auth.uid()));

-- Game data: one rule, applied everywhere.
create policy "members read players" on public.players
  for select using (public.is_group_member(group_id));
create policy "members write players" on public.players
  for insert with check (public.is_group_member(group_id));
create policy "members update players" on public.players
  for update using (public.is_group_member(group_id));

create policy "members read matches" on public.matches
  for select using (public.is_group_member(group_id));
create policy "members write matches" on public.matches
  for insert with check (public.is_group_member(group_id));
create policy "members update matches" on public.matches
  for update using (public.is_group_member(group_id));
create policy "members delete matches" on public.matches
  for delete using (public.is_group_member(group_id));

create policy "members read seats" on public.seats
  for select using (public.is_group_member(group_id));
create policy "members write seats" on public.seats
  for insert with check (public.is_group_member(group_id));
create policy "members update seats" on public.seats
  for update using (public.is_group_member(group_id));

-- Score entries get SELECT, INSERT and DELETE, and deliberately no UPDATE
-- policy. Correcting a score appends a newer entry; deleting is how undo steps
-- back one write. With no UPDATE policy and no UPDATE grant, the append-only
-- rule is something the database enforces rather than something we remember.
create policy "members read scores" on public.score_entries
  for select using (public.is_group_member(group_id));
create policy "members write scores" on public.score_entries
  for insert with check (public.is_group_member(group_id));
create policy "members delete scores" on public.score_entries
  for delete using (public.is_group_member(group_id));

-- ---------------------------------------------------------------------------
-- Privileges
--
-- The project was created with "automatically expose new tables" off, so
-- nothing is reachable until it is granted here. Everything goes to
-- `authenticated` only: anonymous sign-in still produces an authenticated JWT,
-- while the `anon` role -- a caller with no session at all -- gets nothing.
-- ---------------------------------------------------------------------------

grant usage on schema public to authenticated;

grant select, insert, update on public.profiles to authenticated;
grant select, update on public.groups to authenticated;
grant select, delete on public.group_members to authenticated;
grant select, insert, update on public.players to authenticated;
grant select, insert, update, delete on public.matches to authenticated;
grant select, insert, update on public.seats to authenticated;
grant select, insert, delete on public.score_entries to authenticated;

grant execute on function public.create_group(text, text, text) to authenticated;
grant execute on function public.join_group(text) to authenticated;
grant execute on function public.is_group_member(text) to authenticated;

-- ---------------------------------------------------------------------------
-- Live updates
--
-- Only the tables a scoreboard watches while a game is in progress.
-- ---------------------------------------------------------------------------

alter publication supabase_realtime add table public.score_entries;
alter publication supabase_realtime add table public.matches;
alter publication supabase_realtime add table public.seats;
