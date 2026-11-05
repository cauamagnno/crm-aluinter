-- Required justification when a negotiation is marked lost.

ALTER TABLE deals
  ADD COLUMN IF NOT EXISTS lost_reason text;
