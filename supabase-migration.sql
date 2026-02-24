-- In Supabase SQL Editor ausführen (nur weight_results – Prisma erstellt IsinCache/FetchLog automatisch):
-- https://supabase.com/dashboard/project/DEIN_PROJECT/sql

create table if not exists weight_results (
  id uuid primary key default gen_random_uuid(),
  isin text not null,
  name text not null,
  constituents jsonb not null default '[]',
  created_at timestamptz default now()
);

create index if not exists idx_weight_results_isin on weight_results(isin);
