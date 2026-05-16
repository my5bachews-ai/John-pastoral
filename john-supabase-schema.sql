-- ══════════════════════════════════════════════
-- JOHN PASTORAL AI — Supabase Schema
-- Run this entire file in Supabase SQL Editor
-- ══════════════════════════════════════════════

-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- ── Waitlist ──────────────────────────────────
create table if not exists waitlist (
  id uuid primary key default uuid_generate_v4(),
  email text not null unique,
  source text default 'landing',
  created_at timestamptz default now()
);

-- ── Users / Pastors ───────────────────────────
create table if not exists users (
  id uuid primary key default uuid_generate_v4(),
  first text not null,
  last text,
  title text default 'Pastor',
  role text default 'senior',
  email text unique,
  pin_hash text,
  created_at timestamptz default now()
);

-- ── Church Profiles ───────────────────────────
create table if not exists profiles (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid references users(id) on delete cascade,
  church text,
  city text,
  denom text default 'Assemblies of God',
  size text,
  title text,
  name text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- ── Members ───────────────────────────────────
create table if not exists members (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid references users(id) on delete cascade,
  first text not null,
  last text,
  phone text,
  email text,
  address text,
  birthday date,
  salvation_date date,
  joined_date date,
  last_seen date,
  status text default 'visitor' check (status in ('visitor','new','active','inactive')),
  notes jsonb default '[]',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- ── Conversations ─────────────────────────────
create table if not exists conversations (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid references users(id) on delete cascade,
  title text,
  started_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- ── Messages ──────────────────────────────────
create table if not exists messages (
  id uuid primary key default uuid_generate_v4(),
  conversation_id uuid references conversations(id) on delete cascade,
  user_id uuid references users(id) on delete cascade,
  role text check (role in ('user','assistant')),
  content text not null,
  created_at timestamptz default now()
);

-- ── Prayer Requests ───────────────────────────
create table if not exists prayer_requests (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid references users(id) on delete cascade,
  member_id uuid references members(id) on delete set null,
  name text not null,
  category text default 'general',
  request text not null,
  emergency boolean default false,
  resolved boolean default false,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- ── Notifications Log ─────────────────────────
create table if not exists notifications_log (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid references users(id) on delete cascade,
  type text,
  title text,
  body text,
  delivered_at timestamptz default now()
);

-- ── Travel Vault ──────────────────────────────
create table if not exists travel_vault (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid references users(id) on delete cascade unique,
  preferences jsonb default '{}',
  loyalty jsonb default '{}',
  payment_token text,
  auto_mode boolean default false,
  updated_at timestamptz default now()
);

-- ── Trip History ──────────────────────────────
create table if not exists trips (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid references users(id) on delete cascade,
  destination text,
  depart_date date,
  return_date date,
  flight_conf text,
  hotel_conf text,
  car_conf text,
  total_cost numeric,
  status text default 'upcoming',
  created_at timestamptz default now()
);

-- ══════════════════════════════════════════════
-- ROW LEVEL SECURITY
-- Each pastor only sees their own data
-- ══════════════════════════════════════════════

alter table users enable row level security;
alter table profiles enable row level security;
alter table members enable row level security;
alter table conversations enable row level security;
alter table messages enable row level security;
alter table prayer_requests enable row level security;
alter table notifications_log enable row level security;
alter table travel_vault enable row level security;
alter table trips enable row level security;
alter table waitlist enable row level security;

-- Waitlist: anyone can insert, only service role reads
create policy "Anyone can join waitlist"
  on waitlist for insert with check (true);

-- Users: can read/update own record
create policy "Users read own record"
  on users for select using (id = auth.uid());
create policy "Users update own record"
  on users for update using (id = auth.uid());

-- Profiles: own data only
create policy "Own profiles"
  on profiles for all using (user_id = auth.uid());

-- Members: own data only
create policy "Own members"
  on members for all using (user_id = auth.uid());

-- Conversations: own data only
create policy "Own conversations"
  on conversations for all using (user_id = auth.uid());

-- Messages: own data only
create policy "Own messages"
  on messages for all using (user_id = auth.uid());

-- Prayer requests: own data only
create policy "Own prayer requests"
  on prayer_requests for all using (user_id = auth.uid());

-- Notifications: own data only
create policy "Own notifications"
  on notifications_log for all using (user_id = auth.uid());

-- Travel vault: own data only
create policy "Own travel vault"
  on travel_vault for all using (user_id = auth.uid());

-- Trips: own data only
create policy "Own trips"
  on trips for all using (user_id = auth.uid());

-- ══════════════════════════════════════════════
-- INDEXES for performance
-- ══════════════════════════════════════════════

create index if not exists idx_members_user on members(user_id);
create index if not exists idx_conversations_user on conversations(user_id);
create index if not exists idx_messages_conversation on messages(conversation_id);
create index if not exists idx_prayer_user on prayer_requests(user_id);
create index if not exists idx_trips_user on trips(user_id);

-- ══════════════════════════════════════════════
-- UPDATED_AT trigger function
-- ══════════════════════════════════════════════

create or replace function update_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger members_updated_at
  before update on members
  for each row execute function update_updated_at();

create trigger profiles_updated_at
  before update on profiles
  for each row execute function update_updated_at();

create trigger prayer_updated_at
  before update on prayer_requests
  for each row execute function update_updated_at();

create trigger travel_updated_at
  before update on travel_vault
  for each row execute function update_updated_at();
