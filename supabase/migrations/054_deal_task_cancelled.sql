-- Tarefa cancelada sai da fila de pendentes sem contar como concluída.
ALTER TABLE deal_tasks
  ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ;
