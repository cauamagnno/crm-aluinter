-- Stage and status changes shown on the opportunity history.

CREATE TABLE IF NOT EXISTS deal_events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  deal_id UUID NOT NULL REFERENCES deals(id) ON DELETE CASCADE,
  actor_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  kind TEXT NOT NULL,
  message TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_deal_events_deal ON deal_events(deal_id, created_at DESC);

ALTER TABLE deal_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS deal_events_select ON deal_events;
DROP POLICY IF EXISTS deal_events_insert ON deal_events;

CREATE POLICY deal_events_select ON deal_events
  FOR SELECT USING (is_account_member(account_id));
CREATE POLICY deal_events_insert ON deal_events
  FOR INSERT WITH CHECK (is_account_member(account_id, 'agent'));
