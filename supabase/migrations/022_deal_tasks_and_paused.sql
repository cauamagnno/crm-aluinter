-- Deal tasks + paused flag + default stage names for Negociações.

ALTER TABLE deals
  ADD COLUMN IF NOT EXISTS paused BOOLEAN NOT NULL DEFAULT FALSE;

CREATE TABLE IF NOT EXISTS deal_tasks (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  deal_id UUID NOT NULL REFERENCES deals(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  assignee_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  due_at TIMESTAMPTZ NOT NULL,
  kind TEXT NOT NULL DEFAULT 'tarefa',
  done_at TIMESTAMPTZ,
  created_by UUID NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_deal_tasks_deal ON deal_tasks(deal_id);
CREATE INDEX IF NOT EXISTS idx_deal_tasks_account ON deal_tasks(account_id);
CREATE INDEX IF NOT EXISTS idx_deal_tasks_due ON deal_tasks(due_at)
  WHERE done_at IS NULL;

ALTER TABLE deal_tasks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS deal_tasks_select ON deal_tasks;
DROP POLICY IF EXISTS deal_tasks_insert ON deal_tasks;
DROP POLICY IF EXISTS deal_tasks_update ON deal_tasks;
DROP POLICY IF EXISTS deal_tasks_delete ON deal_tasks;

CREATE POLICY deal_tasks_select ON deal_tasks
  FOR SELECT USING (is_account_member(account_id));
CREATE POLICY deal_tasks_insert ON deal_tasks
  FOR INSERT WITH CHECK (is_account_member(account_id, 'agent'));
CREATE POLICY deal_tasks_update ON deal_tasks
  FOR UPDATE USING (is_account_member(account_id, 'agent'));
CREATE POLICY deal_tasks_delete ON deal_tasks
  FOR DELETE USING (is_account_member(account_id, 'agent'));

GRANT ALL ON TABLE deal_tasks TO authenticated, service_role;
GRANT SELECT ON TABLE deal_tasks TO anon;

-- Realign existing funnels that still use the old English defaults.
DO $$
DECLARE
  p RECORD;
BEGIN
  FOR p IN SELECT id FROM pipelines LOOP
    IF EXISTS (
      SELECT 1 FROM pipeline_stages
      WHERE pipeline_id = p.id AND name = 'Prospecção'
    ) THEN
      CONTINUE;
    END IF;

    UPDATE pipeline_stages
       SET position = position + 1
     WHERE pipeline_id = p.id
       AND position >= 2;

    INSERT INTO pipeline_stages (pipeline_id, name, color, position)
    VALUES (p.id, 'Levantamento de oportunidades', '#8b5cf6', 2);

    UPDATE pipeline_stages SET name = 'Prospecção', color = '#64748b'
      WHERE pipeline_id = p.id AND position = 0;
    UPDATE pipeline_stages SET name = 'Qualificação', color = '#0ea5e9'
      WHERE pipeline_id = p.id AND position = 1;
    UPDATE pipeline_stages SET name = 'Envio do orçamento', color = '#f97316'
      WHERE pipeline_id = p.id AND position = 3;
    UPDATE pipeline_stages SET name = 'Negociação', color = '#eab308'
      WHERE pipeline_id = p.id AND position = 4;
    UPDATE pipeline_stages SET name = 'Fechamento', color = '#22c55e'
      WHERE pipeline_id = p.id AND position = 5;
  END LOOP;
END $$;
