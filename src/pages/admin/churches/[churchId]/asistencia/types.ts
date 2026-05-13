import type { ProcessStageKey } from '@/lib/process-stages';

export interface AttendanceEvent {
  id: string;
  church_id: string;
  stage: ProcessStageKey;
  cuerda_id: string | null;
  cell_id: string | null;
  event_date: string;
  event_time: string | null;
  title: string | null;
  notes: string | null;
  created_at: string;
}

export interface AttendanceRow {
  id: string;
  event_id: string;
  contact_id: string;
  status: 'present' | 'absent' | 'justified';
}

export interface ContactRow {
  id: string;
  first_name: string;
  last_name: string | null;
  numero_cuerda: string | null;
}

export interface ProcessRow {
  id: string;
  contact_id: string;
  stage: ProcessStageKey;
  moved_at: string;
  metadata: Record<string, any>;
  contacts: { first_name: string; last_name: string | null; numero_cuerda: string | null } | null;
}

/** 'todos' = aggregate across stages, 'resumen' = stats. All other tab
 *  keys map directly to ProcessStageKey. */
export type TabKey = 'todos' | ProcessStageKey | 'resumen';

export type AttendanceCounts = { present: number; absent: number; justified: number };

// Calendar setup — Monday-start, Spanish month/day names.
export const MONTH_NAMES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
export const WEEKDAYS = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];
