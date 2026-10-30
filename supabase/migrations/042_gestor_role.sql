-- Gestor sees the whole team but cannot delete or export.
-- Admin and owner keep delete. Vendedor stays scoped to their own rows.

ALTER TYPE account_role_enum ADD VALUE IF NOT EXISTS 'gestor';

CREATE OR REPLACE FUNCTION is_account_member(
  target_account_id UUID,
  min_role account_role_enum DEFAULT 'viewer'
) RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM profiles p
    WHERE p.user_id = auth.uid()
      AND p.account_id = target_account_id
      AND CASE p.account_role
            WHEN 'owner'  THEN 5
            WHEN 'admin'  THEN 4
            WHEN 'gestor' THEN 3
            WHEN 'agent'  THEN 2
            WHEN 'viewer' THEN 1
          END
        >=
          CASE min_role
            WHEN 'owner'  THEN 5
            WHEN 'admin'  THEN 4
            WHEN 'gestor' THEN 3
            WHEN 'agent'  THEN 2
            WHEN 'viewer' THEN 1
          END
  );
$$;

ALTER FUNCTION is_account_member(UUID, account_role_enum) OWNER TO postgres;
GRANT EXECUTE ON FUNCTION is_account_member(UUID, account_role_enum) TO authenticated, service_role;

-- Visibility: gestor, admin, and owner.
CREATE OR REPLACE FUNCTION is_team_manager(target_account_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT is_account_member(target_account_id, 'gestor');
$$;

-- Deletes of customer records stay with admin and owner.
DROP POLICY IF EXISTS deals_delete ON deals;
CREATE POLICY deals_delete ON deals
  FOR DELETE USING (is_account_member(account_id, 'admin'));

DROP POLICY IF EXISTS conversations_delete ON conversations;
CREATE POLICY conversations_delete ON conversations
  FOR DELETE USING (is_account_member(account_id, 'admin'));

DROP POLICY IF EXISTS deal_tasks_delete ON deal_tasks;
CREATE POLICY deal_tasks_delete ON deal_tasks
  FOR DELETE USING (is_account_member(account_id, 'admin'));

DROP POLICY IF EXISTS contacts_delete ON contacts;
CREATE POLICY contacts_delete ON contacts
  FOR DELETE USING (is_account_member(account_id, 'admin'));

DROP POLICY IF EXISTS contact_notes_delete ON contact_notes;
CREATE POLICY contact_notes_delete ON contact_notes
  FOR DELETE USING (is_account_member(account_id, 'admin'));

DROP POLICY IF EXISTS broadcasts_delete ON broadcasts;
CREATE POLICY broadcasts_delete ON broadcasts
  FOR DELETE USING (is_account_member(account_id, 'admin'));
