-- csv_import_logs: persistent record of every CSV import session.
--
-- Problem: when a user's CSV import had failed rows, those failures were
-- only visible inside the open dialog. As soon as they closed it, the list
-- was gone. Micaela imported a large file with 34 duplicate_phone
-- rejections and had no way to revisit them later — the app surfaces the
-- live errors at import time but doesn't keep a session record.
--
-- Solution: one row per CSV import session. Stores the file name, totals
-- and the full failures array (raw row data + error message) as jsonb so
-- the user can later expand the session and download a CSV of failed rows.
-- Surfaced in the Historial tab via the new CsvImportLogsView component.
--
-- RLS:
--   - Each user reads their own imports (owner_select).
--   - Admin / general / pastor / supervisor read every import in their
--     church (supervisor_select), matching the cross-cuerda visibility
--     rule used elsewhere.
--   - Each user inserts only their own row (owner_insert) — the importer
--     writes one log per session.

CREATE TABLE IF NOT EXISTS csv_import_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  church_id uuid REFERENCES churches(id) ON DELETE CASCADE,
  entity_type text NOT NULL,
  filename text,
  total_rows integer NOT NULL DEFAULT 0,
  success_count integer NOT NULL DEFAULT 0,
  failure_count integer NOT NULL DEFAULT 0,
  failures jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS csv_import_logs_user_id_idx ON csv_import_logs (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS csv_import_logs_church_id_idx ON csv_import_logs (church_id, created_at DESC);

ALTER TABLE csv_import_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS csv_import_logs_owner_select ON csv_import_logs;
CREATE POLICY csv_import_logs_owner_select ON csv_import_logs
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS csv_import_logs_supervisor_select ON csv_import_logs;
CREATE POLICY csv_import_logs_supervisor_select ON csv_import_logs
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid()
        AND (
          p.role IN ('admin', 'general')
          OR (p.role IN ('pastor', 'supervisor') AND p.church_id = csv_import_logs.church_id)
        )
    )
  );

DROP POLICY IF EXISTS csv_import_logs_owner_insert ON csv_import_logs;
CREATE POLICY csv_import_logs_owner_insert ON csv_import_logs
  FOR INSERT WITH CHECK (auth.uid() = user_id);
