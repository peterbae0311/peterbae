-- Migration: 001_create_alert_tables
-- Purpose: Create tables for US stock market alert sessions

-- ── alert_sessions ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS alert_sessions (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_type   varchar(20)  NOT NULL
                   CHECK (session_type IN ('daymarket', 'premarket', 'regular', 'aftermarket')),
  trade_date     date         NOT NULL,
  sent_at        timestamptz,
  status         varchar(10)  NOT NULL
                   CHECK (status IN ('success', 'failed', 'skipped')),
  telegram_msg_id bigint,
  created_at     timestamptz  NOT NULL DEFAULT now()
);

-- Prevent duplicate alerts for the same session on the same trade date
CREATE UNIQUE INDEX IF NOT EXISTS ux_alert_sessions_type_date
  ON alert_sessions (session_type, trade_date)
  WHERE status IN ('success', 'skipped');

-- ── sector_snapshots ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS sector_snapshots (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id   uuid         NOT NULL REFERENCES alert_sessions(id) ON DELETE CASCADE,
  sector_name  varchar(100) NOT NULL,
  change_pct   decimal(5,2) NOT NULL,
  rank         smallint     NOT NULL,
  raw_data     jsonb        NOT NULL DEFAULT '{}',
  created_at   timestamptz  NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sector_snapshots_session
  ON sector_snapshots (session_id);

-- ── stock_summaries ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS stock_summaries (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id    uuid          NOT NULL REFERENCES alert_sessions(id) ON DELETE CASCADE,
  ticker        varchar(10)   NOT NULL,
  company_name  varchar(200)  NOT NULL DEFAULT '',
  sector_name   varchar(100)  NOT NULL DEFAULT '',
  change_pct    decimal(5,2)  NOT NULL DEFAULT 0,
  price_change  decimal(10,2) NOT NULL DEFAULT 0,
  close_price   decimal(10,2) NOT NULL DEFAULT 0,
  llm_summary   text,
  created_at    timestamptz   NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_stock_summaries_session
  ON stock_summaries (session_id);

CREATE INDEX IF NOT EXISTS idx_stock_summaries_ticker
  ON stock_summaries (ticker);
