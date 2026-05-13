export type RoleKey = 'admin' | 'general' | 'pastor' | 'referente' | 'gestor_de_cuerda' | 'encargado_de_celula' | 'conector' | 'consolidador' | 'supervisor' | 'anfitrion';

export const ROLE_LABELS: Record<RoleKey, string> = {
  admin: 'Admin',
  general: 'General',
  pastor: 'Pastor',
  referente: 'Referente',
  gestor_de_cuerda: 'Gestor de Cuerda',
  encargado_de_celula: 'Encargado de Célula',
  consolidador: 'Consolidador',
  conector: 'Conector',
  supervisor: 'Supervisor',
  anfitrion: 'Anfitrión',
};

// Get the role label
export const getRoleLabel = (role: string): string => {
  return ROLE_LABELS[role as RoleKey] || role;
};

// Roles that occupy the "responsable de cuerda" tier — primary
// referente plus the helper-tier gestor_de_cuerda. Used by code
// branches that previously hardcoded `role === 'referente'` for
// cuerda-scoping decisions. Keep this list authoritative: every
// `role === 'referente'` check that's actually about "is this the
// person in charge of their own cuerda?" should call isReferenteLike
// instead so a future role of the same shape is one-line away.
const REFERENTE_LIKE_ROLES: RoleKey[] = ['referente', 'gestor_de_cuerda'];

export const isReferenteLike = (role: string | undefined): boolean => {
  if (!role) return false;
  return (REFERENTE_LIKE_ROLES as string[]).includes(role);
};

// Check if role is a church role (pastor + referente-like + encargado_de_celula)
export const isReferenceRole = (role: string | undefined): boolean => {
  if (!role) return false;
  return ['pastor', 'referente', 'gestor_de_cuerda', 'encargado_de_celula'].includes(role);
};
