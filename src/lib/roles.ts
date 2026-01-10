export type RoleKey = 'admin' | 'general' | 'pastor' | 'referente' | 'encargado_de_celula' | 'user';

export const ROLE_LABELS: Record<RoleKey, string> = {
  admin: 'Admin',
  general: 'General',
  pastor: 'Pastor',
  referente: 'Referente',
  encargado_de_celula: 'Encargado de Célula',
  user: 'Usuario',
};

// Get the role label
export const getRoleLabel = (role: string): string => {
  return ROLE_LABELS[role as RoleKey] || role;
};

// Check if role is a reference role
export const isReferenceRole = (role: string | undefined): boolean => {
  if (!role) return false;
  return ['pastor', 'referente', 'encargado_de_celula'].includes(role);
};