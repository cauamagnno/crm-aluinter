-- Vendedor (agent) sees and edits only their deals and conversations.
-- Gestora / owner (admin+) see the whole account. DELETE of those
-- records is manager-only; viewers stay read-only.

CREATE OR REPLACE FUNCTION is_team_manager(target_account_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT is_account_member(target_account_id, 'admin');
$$;

ALTER FUNCTION is_team_manager(UUID) OWNER TO postgres;
GRANT EXECUTE ON FUNCTION is_team_manager(UUID) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION can_access_deal(deal_account UUID, deal_assignee UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT is_team_manager(deal_account)
    OR (
      deal_assignee IS NOT NULL
      AND EXISTS (
        SELECT 1
        FROM profiles p
        WHERE p.user_id = auth.uid()
          AND p.account_id = deal_account
          AND p.id = deal_assignee
      )
    );
$$;

ALTER FUNCTION can_access_deal(UUID, UUID) OWNER TO postgres;
GRANT EXECUTE ON FUNCTION can_access_deal(UUID, UUID) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION can_access_conversation(conv_account UUID, conv_agent UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT is_team_manager(conv_account)
    OR (
      conv_agent IS NOT NULL
      AND conv_agent = auth.uid()
      AND is_account_member(conv_account)
    );
$$;

ALTER FUNCTION can_access_conversation(UUID, UUID) OWNER TO postgres;
GRANT EXECUTE ON FUNCTION can_access_conversation(UUID, UUID) TO authenticated, service_role;

-- ---- deals ------------------------------------------------------
DROP POLICY IF EXISTS deals_select ON deals;
DROP POLICY IF EXISTS deals_update ON deals;
DROP POLICY IF EXISTS deals_delete ON deals;

CREATE POLICY deals_select ON deals
  FOR SELECT USING (can_access_deal(account_id, assigned_to));

CREATE POLICY deals_update ON deals
  FOR UPDATE
  USING (
    is_account_member(account_id, 'agent')
    AND can_access_deal(account_id, assigned_to)
  )
  WITH CHECK (is_account_member(account_id, 'agent'));

CREATE POLICY deals_delete ON deals
  FOR DELETE USING (is_team_manager(account_id));

-- ---- conversations ---------------------------------------------
DROP POLICY IF EXISTS conversations_select ON conversations;
DROP POLICY IF EXISTS conversations_update ON conversations;
DROP POLICY IF EXISTS conversations_delete ON conversations;

CREATE POLICY conversations_select ON conversations
  FOR SELECT USING (can_access_conversation(account_id, assigned_agent_id));

CREATE POLICY conversations_update ON conversations
  FOR UPDATE
  USING (
    is_account_member(account_id, 'agent')
    AND can_access_conversation(account_id, assigned_agent_id)
  )
  WITH CHECK (is_account_member(account_id, 'agent'));

CREATE POLICY conversations_delete ON conversations
  FOR DELETE USING (is_team_manager(account_id));

-- ---- messages --------------------------------------------------
DROP POLICY IF EXISTS messages_select ON messages;
DROP POLICY IF EXISTS messages_modify ON messages;

CREATE POLICY messages_select ON messages FOR SELECT USING (
  EXISTS (
    SELECT 1
    FROM conversations c
    WHERE c.id = messages.conversation_id
      AND can_access_conversation(c.account_id, c.assigned_agent_id)
  )
);

CREATE POLICY messages_modify ON messages FOR ALL USING (
  EXISTS (
    SELECT 1
    FROM conversations c
    WHERE c.id = messages.conversation_id
      AND is_account_member(c.account_id, 'agent')
      AND can_access_conversation(c.account_id, c.assigned_agent_id)
  )
) WITH CHECK (
  EXISTS (
    SELECT 1
    FROM conversations c
    WHERE c.id = messages.conversation_id
      AND is_account_member(c.account_id, 'agent')
      AND can_access_conversation(c.account_id, c.assigned_agent_id)
  )
);

-- ---- message reactions (same conversation visibility) ----------
DROP POLICY IF EXISTS message_reactions_select ON message_reactions;
DROP POLICY IF EXISTS message_reactions_modify ON message_reactions;

CREATE POLICY message_reactions_select ON message_reactions FOR SELECT USING (
  EXISTS (
    SELECT 1
    FROM messages m
    JOIN conversations c ON c.id = m.conversation_id
    WHERE m.id = message_reactions.message_id
      AND can_access_conversation(c.account_id, c.assigned_agent_id)
  )
);

CREATE POLICY message_reactions_modify ON message_reactions FOR ALL USING (
  EXISTS (
    SELECT 1
    FROM messages m
    JOIN conversations c ON c.id = m.conversation_id
    WHERE m.id = message_reactions.message_id
      AND is_account_member(c.account_id, 'agent')
      AND can_access_conversation(c.account_id, c.assigned_agent_id)
  )
) WITH CHECK (
  EXISTS (
    SELECT 1
    FROM messages m
    JOIN conversations c ON c.id = m.conversation_id
    WHERE m.id = message_reactions.message_id
      AND is_account_member(c.account_id, 'agent')
      AND can_access_conversation(c.account_id, c.assigned_agent_id)
  )
);

-- ---- deal tasks ------------------------------------------------
DROP POLICY IF EXISTS deal_tasks_select ON deal_tasks;
DROP POLICY IF EXISTS deal_tasks_insert ON deal_tasks;
DROP POLICY IF EXISTS deal_tasks_update ON deal_tasks;
DROP POLICY IF EXISTS deal_tasks_delete ON deal_tasks;

CREATE POLICY deal_tasks_select ON deal_tasks
  FOR SELECT USING (
    EXISTS (
      SELECT 1
      FROM deals d
      WHERE d.id = deal_tasks.deal_id
        AND can_access_deal(d.account_id, d.assigned_to)
    )
  );

CREATE POLICY deal_tasks_insert ON deal_tasks
  FOR INSERT WITH CHECK (
    is_account_member(account_id, 'agent')
    AND EXISTS (
      SELECT 1
      FROM deals d
      WHERE d.id = deal_tasks.deal_id
        AND can_access_deal(d.account_id, d.assigned_to)
    )
  );

CREATE POLICY deal_tasks_update ON deal_tasks
  FOR UPDATE
  USING (
    is_account_member(account_id, 'agent')
    AND EXISTS (
      SELECT 1
      FROM deals d
      WHERE d.id = deal_tasks.deal_id
        AND can_access_deal(d.account_id, d.assigned_to)
    )
  )
  WITH CHECK (is_account_member(account_id, 'agent'));

CREATE POLICY deal_tasks_delete ON deal_tasks
  FOR DELETE USING (is_team_manager(account_id));
