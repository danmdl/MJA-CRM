export type RoleKey = 'admin' | 'general' | 'pastor' | 'reference' | 'encargado_de_celula' | 'user';

export const ROLE_LABELS: Record<RoleKey, string> = {
  admin: 'Admin',
  general: 'General',
  pastor: 'Pastor',
  reference: 'Referente',
  encargado_de_celula: 'Encargado de Célula',
  user: 'Usuario',
};

// Get the role label
export const getRoleLabel = (role: string): string => {
  return ROLE_LABELS[role as RoleKey] || role;
};