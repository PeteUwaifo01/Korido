-- Korido 0001_init — schema from korido-production-spec.md §3.
-- Additions beyond the spec DDL are limited to §7 checklist items that
-- live at the schema layer: pgcrypto, RLS on user-adjacent tables, seeds.

create extension if not exists pgcrypto;

-- Verticals and corridors are data, not code
create table verticals (
  id text primary key            -- 'send' | 'topup' | 'call'
);

create table corridors (
  id text primary key,           -- 'US-NG'
  source_country text not null,  -- 'US'
  dest_country text not null,    -- 'NG'
  dest_currency text not null,   -- 'NGN'
  dest_symbol text not null,
  active boolean default true
);

create table providers (
  id text primary key,           -- 'lemfi'
  name text not null,
  homepage text not null
);

-- A provider's participation in a vertical+corridor, incl. affiliate link
create table offers (
  id bigint generated always as identity primary key,
  provider_id text references providers(id),
  vertical_id text references verticals(id),
  corridor_id text references corridors(id),
  affiliate_url text,            -- network tracking link template ({subid})
  network text,                  -- 'impact' | 'flexoffers' | 'direct' | null
  speed_label text,
  active boolean default true,
  unique (provider_id, vertical_id, corridor_id)
);

-- Timestamped quotes — the compounding data asset
create table quotes (
  id bigint generated always as identity primary key,
  offer_id bigint references offers(id),
  collected_at timestamptz not null default now(),
  fx_rate numeric,               -- dest currency per USD
  fee_flat numeric,
  fee_pct numeric,
  bonus_pct numeric,             -- top-up promos
  raw jsonb                      -- adapter payload for audit
);
create index on quotes (offer_id, collected_at desc);

create table mid_rates (
  corridor_id text references corridors(id),
  collected_at timestamptz default now(),
  rate numeric not null,
  primary key (corridor_id, collected_at)
);

-- Attribution
create table clicks (
  id uuid primary key default gen_random_uuid(),
  offer_id bigint references offers(id),
  clicked_at timestamptz default now(),
  session_hash text,             -- salted hash, no raw IP retained
  landing_path text
);

create table conversions (
  id bigint generated always as identity primary key,
  click_id uuid references clicks(id),
  network text,
  reported_at timestamptz,
  payout_usd numeric,
  status text                    -- 'pending' | 'approved' | 'reversed'
);

-- Alerts (email pgcrypto-encrypted at column level)
create table alert_subscribers (
  id uuid primary key default gen_random_uuid(),
  email_enc bytea not null,
  email_hash text unique not null,  -- dedupe/unsubscribe lookup
  created_at timestamptz default now(),
  confirmed_at timestamptz,          -- double opt-in
  unsubscribed_at timestamptz
);

create table alerts (
  id bigint generated always as identity primary key,
  subscriber_id uuid references alert_subscribers(id),
  corridor_id text references corridors(id),
  target_rate numeric not null,
  fired_at timestamptz,
  created_at timestamptz default now()
);

-- ————————————————————————————————————————————————
-- Row Level Security (spec §7). RLS is enabled with NO policies on
-- user-adjacent tables: the anon key can read/write nothing; only the
-- service role (server-side, bypasses RLS) touches them. Public catalog
-- tables get read-only anon access for the app's provider board.
-- ————————————————————————————————————————————————

alter table alert_subscribers enable row level security;
alter table alerts            enable row level security;
alter table clicks            enable row level security;
alter table conversions       enable row level security;

alter table verticals enable row level security;
alter table corridors enable row level security;
alter table providers enable row level security;
alter table offers    enable row level security;
alter table quotes    enable row level security;
alter table mid_rates enable row level security;

create policy "public read" on verticals for select using (true);
create policy "public read" on corridors for select using (true);
create policy "public read" on providers for select using (true);
create policy "public read active" on offers for select using (active);
create policy "public read" on quotes    for select using (true);
create policy "public read" on mid_rates for select using (true);

-- ————————————————————————————————————————————————
-- Seed data — v1 scope: send vertical, three corridors (spec §1)
-- ————————————————————————————————————————————————

insert into verticals (id) values ('send'), ('topup'), ('call');

insert into corridors (id, source_country, dest_country, dest_currency, dest_symbol) values
  ('US-NG', 'US', 'NG', 'NGN', '₦'),
  ('US-GH', 'US', 'GH', 'GHS', 'GH₵'),
  ('US-KE', 'US', 'KE', 'KES', 'KSh');

insert into providers (id, name, homepage) values
  ('wise',       'Wise',         'https://wise.com'),
  ('lemfi',      'LemFi',        'https://lemfi.com'),
  ('taptap',     'Taptap Send',  'https://taptapsend.com'),
  ('sendwave',   'Sendwave',     'https://sendwave.com'),
  ('remitly',    'Remitly',      'https://remitly.com'),
  ('worldremit', 'WorldRemit',   'https://worldremit.com'),
  ('xe',         'Xe',           'https://xe.com');

-- affiliate_url stays null until network approvals land (spec §8, week 3).
-- The /go/ layer falls back to the provider homepage when it is null.
insert into offers (provider_id, vertical_id, corridor_id, speed_label)
select p.id, 'send', c.id,
  case p.id when 'wise' then 'Minutes–hrs' when 'xe' then 'Hours' else 'Minutes' end
from providers p cross join corridors c;
