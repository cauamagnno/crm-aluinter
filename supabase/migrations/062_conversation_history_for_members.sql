-- Every account member can read the WhatsApp history of any conversation.
-- Sending, assigning and updating a conversation keep their existing rules
-- (conversations_update / messages_modify are not changed here).

DROP POLICY IF EXISTS conversations_select ON conversations;
CREATE POLICY conversations_select ON conversations
  FOR SELECT USING (is_account_member(account_id));

DROP POLICY IF EXISTS messages_select ON messages;
CREATE POLICY messages_select ON messages
  FOR SELECT USING (
    EXISTS (
      SELECT 1
      FROM conversations c
      WHERE c.id = messages.conversation_id
        AND is_account_member(c.account_id)
    )
  );
