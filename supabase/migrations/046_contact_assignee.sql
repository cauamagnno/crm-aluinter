-- The vendor who registered the company stays on the contact
-- so the list can show who owns the account.

ALTER TABLE contacts
  ADD COLUMN IF NOT EXISTS assigned_to UUID REFERENCES profiles(id) ON DELETE SET NULL;

UPDATE contacts c
SET assigned_to = (
  SELECT p.id
  FROM profiles p
  WHERE p.user_id = c.user_id
  ORDER BY p.created_at
  LIMIT 1
)
WHERE c.assigned_to IS NULL;

CREATE INDEX IF NOT EXISTS idx_contacts_assigned_to ON contacts (assigned_to);
