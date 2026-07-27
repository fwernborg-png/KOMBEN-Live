-- PLACE PUSH NOTIFICATIONS V1
-- Stores browser push subscriptions and idempotent T-3 notification deliveries.
-- Only the Cloudflare Worker service role should access these tables.

create table if not exists public.place_push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  endpoint text not null unique,
  expiration_time bigint,
  p256dh text not null,
  auth text not null,
  user_agent text,
  active boolean not null default true,
  failure_count int not null default 0,
  last_success_at timestamptz,
  last_failure_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_place_push_subscriptions_active
  on public.place_push_subscriptions (active, updated_at desc);

create table if not exists public.place_push_notification_log (
  id uuid primary key default gen_random_uuid(),
  notification_key text not null unique,
  notification_type text not null,
  rule_version text not null,
  race_id text not null,
  race_date text not null,
  track_id int not null,
  track_name text not null,
  race_number int not null,
  planned_start_time timestamptz not null,
  candidate_number int not null,
  candidate_name text not null,
  candidate_win_odds numeric(10,4) not null,
  candidate_strength int not null,
  status text not null default 'CLAIMED',
  subscriptions_attempted int not null default 0,
  subscriptions_sent int not null default 0,
  subscriptions_failed int not null default 0,
  payload_json jsonb not null,
  claimed_at timestamptz not null default now(),
  sent_at timestamptz,
  updated_at timestamptz not null default now()
);

create index if not exists idx_place_push_notification_log_race
  on public.place_push_notification_log
    (race_date, track_id, race_number, notification_type);

alter table public.place_push_subscriptions enable row level security;
alter table public.place_push_notification_log enable row level security;
