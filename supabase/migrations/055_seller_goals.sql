-- Individual goals per salesperson. A NULL column means "use the account
-- default" from account_dashboard_goals; 0 means "no goal for this person".
-- Gestor, admin and owner write and read every row. A salesperson reads
-- only their own row.

CREATE TABLE IF NOT EXISTS seller_goals (
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  profile_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  calls_per_day INTEGER CHECK (calls_per_day >= 0 AND calls_per_day <= 1000),
  whatsapp_per_day INTEGER CHECK (whatsapp_per_day >= 0 AND whatsapp_per_day <= 1000),
  emails_per_day INTEGER CHECK (emails_per_day >= 0 AND emails_per_day <= 1000),
  revenue_per_month NUMERIC CHECK (revenue_per_month >= 0),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (account_id, profile_id)
);

DROP TRIGGER IF EXISTS set_updated_at ON seller_goals;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON seller_goals
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE seller_goals ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS seller_goals_select ON seller_goals;
DROP POLICY IF EXISTS seller_goals_insert ON seller_goals;
DROP POLICY IF EXISTS seller_goals_update ON seller_goals;
DROP POLICY IF EXISTS seller_goals_delete ON seller_goals;

CREATE POLICY seller_goals_select ON seller_goals
  FOR SELECT USING (
    is_account_member(account_id, 'gestor')
    OR profile_id IN (SELECT id FROM profiles WHERE user_id = auth.uid())
  );

CREATE POLICY seller_goals_insert ON seller_goals
  FOR INSERT WITH CHECK (
    is_account_member(account_id, 'gestor')
    AND EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = seller_goals.profile_id AND p.account_id = seller_goals.account_id
    )
  );

CREATE POLICY seller_goals_update ON seller_goals
  FOR UPDATE
  USING (is_account_member(account_id, 'gestor'))
  WITH CHECK (is_account_member(account_id, 'gestor'));

CREATE POLICY seller_goals_delete ON seller_goals
  FOR DELETE USING (is_account_member(account_id, 'gestor'));

GRANT SELECT, INSERT, UPDATE, DELETE ON seller_goals TO authenticated;
GRANT ALL ON seller_goals TO service_role;
