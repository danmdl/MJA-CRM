export type RoleKey = 'admin' | 'general' | 'pastor' | 'piloto' | 'reference' | 'encargado_de_celula' | 'user';

export const ROLE_LABELS: Record<RoleKey, string> = {
  admin: 'Admin',
  general: 'General',
  pastor: 'Pastor',
  piloto: 'Piloto',
  reference: 'Referente',
  encargado_de_celula: 'Encargado de Célula',
  user: 'Usuario',
};

export const isReferenceRole = (role: string | undefined | null): boolean => {
  return role === 'piloto' || role === 'reference';
};

// Get the canonical role (normalize piloto to reference for new users, but keep piloto for existing)
export const getCanonicalRole = (role: string): string => {
  if (role === 'piloto') {
    return 'reference'; // For consistency in new code, but keep piloto in DB for existing users
  }
  return role;
};

// For display purposes, show the correct label
export const getRoleLabel = (role: string): string => {
  if (role === 'piloto') {
    return 'Piloto'; // Keep showing "Piloto" for existing users
  }
  return ROLE_LABELS[role as RoleKey] || role;
};