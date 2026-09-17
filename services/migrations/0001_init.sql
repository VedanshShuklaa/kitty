create table if not exists gas_grants (
  id bigserial primary key,
  circle text not null,
  seat integer not null,
  recipient text not null,
  tx_hash text not null,
  created_at timestamptz not null default now(),
  unique (circle, seat)
);

create table if not exists reminders_sent (
  id bigserial primary key,
  circle text not null,
  round integer not null,
  member text not null,
  kind text not null,
  sent_at timestamptz not null default now(),
  unique (circle, round, member, kind)
);

create table if not exists push_tokens (
  address text primary key,
  expo_push_token text not null,
  updated_at timestamptz not null default now()
);
