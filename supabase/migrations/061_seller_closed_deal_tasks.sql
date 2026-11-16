-- Sellers can read the tasks of closed (won/lost) deals of any colleague,
-- the same rule as deals_select (056). Editing a task stays with the
-- assignee or a manager (045 / 041 update policies, untouched here).

DROP POLICY IF EXISTS deal_tasks_select ON deal_tasks;
CREATE POLICY deal_tasks_select ON deal_tasks
  FOR SELECT USING (
    EXISTS (
      SELECT 1
      FROM deals d
      WHERE d.id = deal_tasks.deal_id
        AND (
          can_access_deal(d.account_id, d.assigned_to)
          OR (d.status IN ('won', 'lost') AND is_account_member(d.account_id))
        )
    )
    OR assignee_id IN (
      SELECT id FROM profiles WHERE user_id = auth.uid()
    )
  );
