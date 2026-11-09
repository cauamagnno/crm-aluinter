-- One outbound URL per account. When enabled, every new inbound
-- WhatsApp message is POSTed there as JSON (the n8n body, not the
-- signed public-API envelope).

CREATE TABLE IF NOT EXISTS account_message_webhooks (
  account_id UUID PRIMARY KEY REFERENCES accounts(id) ON DELETE CASCADE,
  url TEXT,
  enabled BOOLEAN NOT NULL DEFAULT false,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

DROP TRIGGER IF EXISTS set_updated_at ON account_message_webhooks;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON account_message_webhooks
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE account_message_webhooks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS account_message_webhooks_select ON account_message_webhooks;
DROP POLICY IF EXISTS account_message_webhooks_insert ON account_message_webhooks;
DROP POLICY IF EXISTS account_message_webhooks_update ON account_message_webhooks;

CREATE POLICY account_message_webhooks_select ON account_message_webhooks
  FOR SELECT USING (is_account_member(account_id));

CREATE POLICY account_message_webhooks_insert ON account_message_webhooks
  FOR INSERT WITH CHECK (is_account_member(account_id, 'admin'));

CREATE POLICY account_message_webhooks_update ON account_message_webhooks
  FOR UPDATE USING (is_account_member(account_id, 'admin'));

GRANT SELECT, INSERT, UPDATE ON account_message_webhooks TO authenticated;
GRANT ALL ON account_message_webhooks TO service_role;
