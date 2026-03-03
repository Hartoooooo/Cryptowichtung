-- Add positions column to portfolio_snapshots for "Größte Positionen" data
-- Run this in Supabase SQL Editor if you use portfolio_snapshots

ALTER TABLE portfolio_snapshots ADD COLUMN IF NOT EXISTS positions jsonb;
