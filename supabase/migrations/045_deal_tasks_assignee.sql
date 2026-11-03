-- A salesperson must read and complete tasks assigned to them,
-- including tasks on a deal they do not own. The list still filters
-- to the signed-in profile, so other people's tasks stay hidden.

DROP POLICY IF EXISTS deal_tasks_select ON deal_tasks;
CREATE POLICY deal_tasks_select ON deal_tasks
  FOR SELECT USING (
    EXISTS (
      SELECT 1
      FROM deals d
      WHERE d.id = deal_tasks.deal_id
        AND can_access_deal(d.account_id, d.assigned_to)
    )
    OR assignee_id IN (
      SELECT id FROM profiles WHERE user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS deal_tasks_update ON deal_tasks;
CREATE POLICY deal_tasks_update ON deal_tasks
  FOR UPDATE
  USING (
    is_account_member(account_id, 'agent')
    AND (
      EXISTS (
        SELECT 1
        FROM deals d
        WHERE d.id = deal_tasks.deal_id
          AND can_access_deal(d.account_id, d.assigned_to)
      )
      OR assignee_id IN (
        SELECT id FROM profiles WHERE user_id = auth.uid()
      )
    )
  )
  WITH CHECK (is_account_member(account_id, 'agent'));
