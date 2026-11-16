-- Conversations pasted by a seller inside a deal. The text is stored only
-- for the deal history; it is never sent to WhatsApp or to anyone else.

CREATE TABLE IF NOT EXISTS deal_conversations (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  account_id uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  deal_id uuid NOT NULL REFERENCES deals(id) ON DELETE CASCADE,
  contact_id uuid REFERENCES contacts(id) ON DELETE SET NULL,
  author_id uuid REFERENCES profiles(id) ON DELETE SET NULL,
  title text NOT NULL DEFAULT '',
  body text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_deal_conversations_deal
  ON deal_conversations (deal_id, created_at DESC);

ALTER TABLE deal_conversations ENABLE ROW LEVEL SECURITY;

-- Any member of the account can read the pasted conversations of a deal.
DROP POLICY IF EXISTS deal_conversations_select ON deal_conversations;
CREATE POLICY deal_conversations_select ON deal_conversations
  FOR SELECT USING (is_account_member(account_id));

-- Agents and above can paste a conversation.
DROP POLICY IF EXISTS deal_conversations_insert ON deal_conversations;
CREATE POLICY deal_conversations_insert ON deal_conversations
  FOR INSERT WITH CHECK (is_account_member(account_id, 'agent'));

-- Edit and delete: the author, or gestor and above.
DROP POLICY IF EXISTS deal_conversations_update ON deal_conversations;
CREATE POLICY deal_conversations_update ON deal_conversations
  FOR UPDATE USING (
    is_account_member(account_id, 'gestor')
    OR author_id IN (SELECT id FROM profiles WHERE user_id = auth.uid())
  );

DROP POLICY IF EXISTS deal_conversations_delete ON deal_conversations;
CREATE POLICY deal_conversations_delete ON deal_conversations
  FOR DELETE USING (
    is_account_member(account_id, 'gestor')
    OR author_id IN (SELECT id FROM profiles WHERE user_id = auth.uid())
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON deal_conversations TO authenticated;
GRANT ALL ON deal_conversations TO service_role;
