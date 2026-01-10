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