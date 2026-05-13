-- Attendance system tied to Procesos.
--
-- Two tables:
--   attendance_events  — one row per scheduled meeting. Tied to a
--                        stage (mirrors contact_processes.stage), an
--                        optional cuerda and cell (NULL = all of
--                        them), and a date.
--   contact_attendance — one row per contact per event. status is
--                        present / absent / justified.
--
-- The system intentionally COEXISTS with the per-class metadata that
-- ProcesosPage already stores under contact_processes.metadata
-- (clase_1..clase_10 for ABC / Nivel 1 / Nivel 2). The Asistencia UI
-- reads both:
--   - For event-based stages (Domingos, Células, Encuentros, etc.) it
--     uses these new tables.
--   - For course stages (ABC, Niveles) it surfaces the existing
--     metadata grid so the data already typed there shows up next to
--     the events.

CREATE TABLE IF NOT EXISTS attendance_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  church_id uuid NOT NULL REFERENCES churches(id) ON DELETE CASCADE,
  stage text NOT NULL,
  cuerda_id uuid REFERENCES cuerdas(id) ON DELETE SET NULL,
  cell_id uuid REFERENCES cells(id) ON DELETE SET NULL,
  event_date date NOT NULL,
  event_time time,
  title text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  deleted_at timestamptz
);

CREATE INDEX IF NOT EXISTS attendance_events_church_date_idx
  ON attendance_events (church_id, event_date DESC)
  WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS attendance_events_stage_idx
  ON attendance_events (church_id, stage, event_date DESC)
  WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS attendance_events_cuerda_idx
  ON attendance_events (cuerda_id)
  WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS contact_attendance (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES attendance_events(id) ON DELETE CASCADE,
  contact_id uuid NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  status text NOT NULL CHECK (status IN ('present', 'absent', 'justified')),
  notes text,
  recorded_at timestamptz NOT NULL DEFAULT now(),
  recorded_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  UNIQUE (event_id, contact_id)
);

CREATE INDEX IF NOT EXISTS contact_attendance_event_idx ON contact_attendance (event_id);
CREATE INDEX IF NOT EXISTS contact_attendance_contact_idx ON contact_attendance (contact_id, recorded_at DESC);

-- RLS — follow the pattern used elsewhere: globals see everything in
-- their church, referentes / encargados / consolidadores / etc. see
-- their own cuerda. Cross-cuerda church_id check keeps users out of
-- other churches entirely.

ALTER TABLE attendance_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE contact_attendance ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS attendance_events_select ON attendance_events;
CREATE POLICY attendance_events_select ON attendance_events
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid()
        AND (
          p.role IN ('admin', 'general')
          OR p.church_id = attendance_events.church_id
        )
    )
  );

DROP POLICY IF EXISTS attendance_events_insert ON attendance_events;
CREATE POLICY attendance_events_insert ON attendance_events
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid()
        AND (
          p.role IN ('admin', 'general')
          OR (p.church_id = attendance_events.church_id
              AND p.role IN ('pastor', 'supervisor', 'referente', 'encargado_de_celula', 'consolidador'))
        )
    )
  );

DROP POLICY IF EXISTS attendance_events_update ON attendance_events;
CREATE POLICY attendance_events_update ON attendance_events
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid()
        AND (
          p.role IN ('admin', 'general')
          OR (p.church_id = attendance_events.church_id
              AND p.role IN ('pastor', 'supervisor', 'referente', 'encargado_de_celula', 'consolidador'))
        )
    )
  );

DROP POLICY IF EXISTS attendance_events_delete ON attendance_events;
CREATE POLICY attendance_events_delete ON attendance_events
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid()
        AND (
          p.role IN ('admin', 'general')
          OR (p.church_id = attendance_events.church_id
              AND p.role IN ('pastor', 'supervisor'))
        )
    )
  );

DROP POLICY IF EXISTS contact_attendance_select ON contact_attendance;
CREATE POLICY contact_attendance_select ON contact_attendance
  FOR SELECT USING (
    EXISTS (
      SELECT 1
      FROM attendance_events e
      JOIN profiles p ON p.id = auth.uid()
      WHERE e.id = contact_attendance.event_id
        AND (
          p.role IN ('admin', 'general')
          OR p.church_id = e.church_id
        )
    )
  );

DROP POLICY IF EXISTS contact_attendance_insert ON contact_attendance;
CREATE POLICY contact_attendance_insert ON contact_attendance
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1
      FROM attendance_events e
      JOIN profiles p ON p.id = auth.uid()
      WHERE e.id = contact_attendance.event_id
        AND (
          p.role IN ('admin', 'general')
          OR (p.church_id = e.church_id
              AND p.role IN ('pastor', 'supervisor', 'referente', 'encargado_de_celula', 'consolidador'))
        )
    )
  );

DROP POLICY IF EXISTS contact_attendance_update ON contact_attendance;
CREATE POLICY contact_attendance_update ON contact_attendance
  FOR UPDATE USING (
    EXISTS (
      SELECT 1
      FROM attendance_events e
      JOIN profiles p ON p.id = auth.uid()
      WHERE e.id = contact_attendance.event_id
        AND (
          p.role IN ('admin', 'general')
          OR (p.church_id = e.church_id
              AND p.role IN ('pastor', 'supervisor', 'referente', 'encargado_de_celula', 'consolidador'))
        )
    )
  );

DROP POLICY IF EXISTS contact_attendance_delete ON contact_attendance;
CREATE POLICY contact_attendance_delete ON contact_attendance
  FOR DELETE USING (
    EXISTS (
      SELECT 1
      FROM attendance_events e
      JOIN profiles p ON p.id = auth.uid()
      WHERE e.id = contact_attendance.event_id
        AND (
          p.role IN ('admin', 'general')
          OR (p.church_id = e.church_id
              AND p.role IN ('pastor', 'supervisor', 'referente', 'encargado_de_celula', 'consolidador'))
        )
    )
  );
