-- A salesperson keeps their own open deals, and can also read the
-- closed history of any client in the account: won and lost.
-- Updates stay limited to deals assigned to them.

DROP POLICY IF EXISTS deals_select ON deals;
CREATE POLICY deals_select ON deals
  FOR SELECT USING (
    can_access_deal(account_id, assigned_to)
    OR (
      status IN ('won', 'lost')
      AND is_account_member(account_id)
    )
  );
