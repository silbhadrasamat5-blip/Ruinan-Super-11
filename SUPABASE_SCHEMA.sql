-- ============================================================
-- RUINAN SUPER 11 — Supabase SQL Schema
-- Paste this entire file into the Supabase SQL Editor and run.
-- ============================================================

-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- ============================================================
-- TABLES
-- ============================================================

-- Players
create table if not exists players (
  id            uuid default uuid_generate_v4() primary key,
  name          text not null,
  role          text not null default 'Midfielder',
  jersey_number integer,
  phone         text,
  avatar_url    text,
  is_available  boolean not null default true,
  created_at    timestamptz default now()
);

-- Matches (official = vs opponent / friendly = internal)
create table if not exists matches (
  id             uuid default uuid_generate_v4() primary key,
  type           text not null check (type in ('official','friendly')),
  opponent_name  text,                          -- filled for official matches
  match_date     date not null default current_date,
  status         text not null default 'upcoming'
                   check (status in ('upcoming','live','completed')),
  score_home     integer not null default 0,    -- our team score (official)
  score_away     integer not null default 0,    -- opponent score (official)
  team_a_score   integer not null default 0,    -- friendly Team A
  team_b_score   integer not null default 0,    -- friendly Team B
  mvp_player_id  uuid references players(id) on delete set null,
  notes          text,
  created_at     timestamptz default now()
);

-- Which players participated in a match and which side they were on
create table if not exists match_players (
  id          uuid default uuid_generate_v4() primary key,
  match_id    uuid not null references matches(id)  on delete cascade,
  player_id   uuid not null references players(id)  on delete cascade,
  team_side   text check (team_side in ('home','away','team_a','team_b')),
  created_at  timestamptz default now(),
  unique (match_id, player_id)
);

-- Per-player match fee records (admin creates; anyone can see totals)
create table if not exists match_fees (
  id         uuid default uuid_generate_v4() primary key,
  match_id   uuid not null references matches(id)  on delete cascade,
  player_id  uuid not null references players(id)  on delete cascade,
  amount     numeric(10,2) not null default 100,
  status     text not null default 'pending'
               check (status in ('paid','pending')),
  created_at timestamptz default now(),
  unique (match_id, player_id)
);

-- Team kitty — income and expenses
create table if not exists kitty_transactions (
  id          uuid default uuid_generate_v4() primary key,
  type        text not null check (type in ('income','expense')),
  description text not null,
  amount      numeric(10,2) not null,
  match_id    uuid references matches(id) on delete set null,
  date        date not null default current_date,
  created_at  timestamptz default now()
);

-- ============================================================
-- INDEXES
-- ============================================================

create index if not exists idx_matches_date        on matches(match_date desc);
create index if not exists idx_match_players_match  on match_players(match_id);
create index if not exists idx_match_players_player on match_players(player_id);
create index if not exists idx_match_fees_match     on match_fees(match_id);
create index if not exists idx_match_fees_player    on match_fees(player_id);
create index if not exists idx_kitty_date           on kitty_transactions(date desc);

-- ============================================================
-- ROW LEVEL SECURITY
-- (Security is enforced by the Admin PIN on the client side.
--  All rows are publicly readable/writable via the anon key
--  so teammates can toggle availability and upload photos.)
-- ============================================================

alter table players              enable row level security;
alter table matches              enable row level security;
alter table match_players        enable row level security;
alter table match_fees           enable row level security;
alter table kitty_transactions   enable row level security;

-- players
create policy "public_select_players" on players for select using (true);
create policy "public_insert_players" on players for insert with check (true);
create policy "public_update_players" on players for update using (true);
create policy "public_delete_players" on players for delete using (true);

-- matches
create policy "public_select_matches" on matches for select using (true);
create policy "public_insert_matches" on matches for insert with check (true);
create policy "public_update_matches" on matches for update using (true);
create policy "public_delete_matches" on matches for delete using (true);

-- match_players
create policy "public_select_mp" on match_players for select using (true);
create policy "public_insert_mp" on match_players for insert with check (true);
create policy "public_update_mp" on match_players for update using (true);
create policy "public_delete_mp" on match_players for delete using (true);

-- match_fees
create policy "public_select_mf" on match_fees for select using (true);
create policy "public_insert_mf" on match_fees for insert with check (true);
create policy "public_update_mf" on match_fees for update using (true);
create policy "public_delete_mf" on match_fees for delete using (true);

-- kitty_transactions
create policy "public_select_kitty" on kitty_transactions for select using (true);
create policy "public_insert_kitty" on kitty_transactions for insert with check (true);
create policy "public_update_kitty" on kitty_transactions for update using (true);
create policy "public_delete_kitty" on kitty_transactions for delete using (true);

-- ============================================================
-- STORAGE BUCKET  (avatars — public)
-- ============================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'avatars',
  'avatars',
  true,
  5242880,   -- 5 MB hard limit (client compresses to ~300 KB before upload)
  array['image/jpeg','image/png','image/webp','image/gif']
)
on conflict (id) do nothing;

-- Allow anyone to read, upload, replace, or delete avatars
create policy "avatars_public_select" on storage.objects
  for select using (bucket_id = 'avatars');

create policy "avatars_public_insert" on storage.objects
  for insert with check (bucket_id = 'avatars');

create policy "avatars_public_update" on storage.objects
  for update using (bucket_id = 'avatars');

create policy "avatars_public_delete" on storage.objects
  for delete using (bucket_id = 'avatars');
