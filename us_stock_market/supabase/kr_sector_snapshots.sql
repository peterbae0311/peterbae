-- Migration: kr_sector_snapshots
-- Purpose: Accumulate Korean stock sector snapshots per trade date

CREATE TABLE IF NOT EXISTS kr_sector_snapshots (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  trade_date   date        NOT NULL,
  sector_no    text        NOT NULL,
  sector_name  text        NOT NULL,
  change_rate  numeric     NOT NULL,
  stocks       jsonb       NOT NULL DEFAULT '[]',
  created_at   timestamptz          DEFAULT now(),
  UNIQUE (trade_date, sector_no)
);

CREATE INDEX IF NOT EXISTS idx_kr_sector_snapshots_trade_date
  ON kr_sector_snapshots (trade_date DESC);
