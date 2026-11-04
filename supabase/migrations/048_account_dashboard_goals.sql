-- Dashboard targets per account. Members read them; gestor+ write them.

CREATE TABLE IF NOT EXISTS account_dashboard_goals (
  account_id UUID PRIMARY KEY REFERENCES accounts(id) ON DELETE CASCADE,
  conversations_per_day INTEGER NOT NULL DEFAULT 15
    CHECK (conversations_per_day > 0 AND conversations_per_day <= 1000),
  calls_per_day INTEGER NOT NULL DEFAULT 15
    CHECK (calls_per_day > 0 AND calls_per_day <= 1000),
  whatsapp_per_day INTEGER NOT NULL DEFAULT 15
    CHECK (whatsapp_per_day > 0 AND whatsapp_per_day <= 1000),
  emails_per_day INTEGER NOT NULL DEFAULT 15
    CHECK (emails_per_day > 0 AND emails_per_day <= 1000),
  quotes_per_week INTEGER NOT NULL DEFAULT 12
    CHECK (quotes_per_week > 0 AND quotes_per_week <= 1000),
  curve_a_pct NUMERIC NOT NULL DEFAULT 100
    CHECK (curve_a_pct >= 0 AND curve_a_pct <= 100),
  follow_up_pct NUMERIC NOT NULL DEFAULT 90
    CHECK (follow_up_pct >= 0 AND follow_up_pct <= 100),
  revenue_per_month NUMERIC NOT NULL DEFAULT 400000
    CHECK (revenue_per_month >= 0),
  new_reactivated_per_month INTEGER NOT NULL DEFAULT 12
    CHECK (new_reactivated_per_month > 0 AND new_reactivated_per_month <= 10000),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

DROP TRIGGER IF EXISTS set_updated_at ON account_dashboard_goals;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON account_dashboard_goals
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE account_dashboard_goals ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS account_dashboard_goals_select ON account_dashboard_goals;
DROP POLICY IF EXISTS account_dashboard_goals_insert ON account_dashboard_goals;
DROP POLICY IF EXISTS account_dashboard_goals_update ON account_dashboard_goals;
DROP POLICY IF EXISTS account_dashboard_goals_delete ON account_dashboard_goals;

CREATE POLICY account_dashboard_goals_select ON account_dashboard_goals
  FOR SELECT USING (is_account_member(account_id));
CREATE POLICY account_dashboard_goals_insert ON account_dashboard_goals
  FOR INSERT WITH CHECK (is_account_member(account_id, 'gestor'));
CREATE POLICY account_dashboard_goals_update ON account_dashboard_goals
  FOR UPDATE USING (is_account_member(account_id, 'gestor'));
CREATE POLICY account_dashboard_goals_delete ON account_dashboard_goals
  FOR DELETE USING (is_account_member(account_id, 'admin'));

GRANT SELECT, INSERT, UPDATE, DELETE ON account_dashboard_goals TO authenticated;
GRANT ALL ON account_dashboard_goals TO service_role;
