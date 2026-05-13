// Shared definitions for the Procesos kanban stages.
//
// Extracted from ProcesosPage so the Asistencias page (and anything
// else that needs to render stage names / colors) doesn't duplicate
// the array. Keep this file in sync with ProcesosPage if the stages
// list ever changes.

export const PROCESS_STAGES = [
  { key: 'nuevas_personas_domingos', label: 'Nuevas Personas Domingos', short: 'NP Dom',  color: '#3b82f6' },
  { key: 'nuevas_personas_celulas',  label: 'Nuevas Personas Células',  short: 'NP Cél',  color: '#60a5fa' },
  { key: 'liberacion',               label: 'Liberación',               short: 'Lib',     color: '#8b5cf6' },
  { key: 'pre_encuentro',            label: 'Pre-Encuentro',            short: 'Pre-E',   color: '#f59e0b' },
  { key: 'encuentro',                label: 'Encuentro',                short: 'Enc',     color: '#f97316' },
  { key: 'post_encuentro',           label: 'Post Encuentro',           short: 'PE',      color: '#ef4444' },
  { key: 'abc',                      label: 'ABC',                      short: 'ABC',     color: '#10b981' },
  { key: 'nivel_1',                  label: 'Nivel 1',                  short: 'N1',      color: '#06b6d4' },
  { key: 'nivel_2',                  label: 'Nivel 2',                  short: 'N2',      color: '#ec4899' },
] as const;

export type ProcessStageKey = typeof PROCESS_STAGES[number]['key'];

// Stages that store a course of 10 classes in
// contact_processes.metadata as clase_1..clase_10 (values 'P', 'A', or
// blank). The Asistencia "Clases" tab reads from these directly
// instead of from attendance_events, because ProcesosPage owns the
// editing surface for them.
export const COURSE_STAGES: ProcessStageKey[] = ['abc', 'nivel_1', 'nivel_2'];

export const stageLabel = (key: string): string => {
  const s = PROCESS_STAGES.find(s => s.key === key);
  return s ? s.label : key;
};

export const stageColor = (key: string): string => {
  const s = PROCESS_STAGES.find(s => s.key === key);
  return s ? s.color : '#71717a';
};

export const isCourseStage = (key: string): boolean =>
  (COURSE_STAGES as readonly string[]).includes(key);
