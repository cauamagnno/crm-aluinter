-- Products selected on a negotiation.

ALTER TABLE deals
  ADD COLUMN IF NOT EXISTS products text[] NOT NULL DEFAULT '{}';
