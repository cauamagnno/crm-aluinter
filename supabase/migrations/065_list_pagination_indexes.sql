-- Indexes for the paginated inbox. Built one at a time, without blocking
-- inserts, and with the sort memory capped so a large messages table
-- cannot exhaust the host the way the old company backfill did.
--
-- CREATE INDEX CONCURRENTLY cannot run inside a transaction. The docker
-- migrator commits each statement on its own, and the Supabase CLI runs
-- this form outside its statement pipeline.

SET statement_timeout = 0;
SET lock_timeout = '30s';
SET maintenance_work_mem = '32MB';
SET max_parallel_maintenance_workers = 0;

-- A failed concurrent build leaves an invalid index behind. IF NOT EXISTS
-- would then skip it on the next deploy, so drop only an invalid one.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_class c
    JOIN pg_index i ON i.indexrelid = c.oid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relname = 'idx_messages_conversation_created'
      AND NOT i.indisvalid
  ) THEN
    EXECUTE 'DROP INDEX public.idx_messages_conversation_created';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_class c
    JOIN pg_index i ON i.indexrelid = c.oid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relname = 'idx_conversations_last_message'
      AND NOT i.indisvalid
  ) THEN
    EXECUTE 'DROP INDEX public.idx_conversations_last_message';
  END IF;
END $$;

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_messages_conversation_created
  ON messages (conversation_id, created_at DESC);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_conversations_last_message
  ON conversations (last_message_at DESC);
