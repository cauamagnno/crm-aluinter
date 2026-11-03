-- When a deal is won or lost, closed_at is the sales date.
-- updated_at moves on any later edit, so it cannot date the sale.

ALTER TABLE deals
  ADD COLUMN IF NOT EXISTS closed_at TIMESTAMPTZ;

UPDATE deals
SET closed_at = updated_at
WHERE status IN ('won', 'lost')
  AND closed_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_deals_closed_at
  ON deals (closed_at)
  WHERE status IN ('won', 'lost');
