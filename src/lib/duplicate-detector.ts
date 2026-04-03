import { normalize } from '@/lib/normalize';

interface ContactForDupe {
  id: string;
  first_name: string;
  last_name: string | null;
  phone: string | null;
  address: string | null;
}

export interface DuplicateGroup {
  contacts: ContactForDupe[];
  reason: string; // "Mismo nombre y teléfono", "Nombre similar", etc.
  confidence: 'high' | 'medium';
}

/**
 * Find potential duplicate contacts.
 * High confidence: exact name + phone match
 * Medium confidence: very similar names (same first + last, ignoring accents)
 */
export const findDuplicates = (contacts: ContactForDupe[]): DuplicateGroup[] => {
  const groups: DuplicateGroup[] = [];
  const seen = new Set<string>();

  // Pass 1: exact name + phone match (high confidence)
  const byNamePhone = new Map<string, ContactForDupe[]>();
  contacts.forEach(c => {
    if (!c.phone) return;
    const key = `${normalize(c.first_name)}|${normalize(c.last_name || '')}|${c.phone.replace(/\D/g, '').slice(-8)}`;
    if (!byNamePhone.has(key)) byNamePhone.set(key, []);
    byNamePhone.get(key)!.push(c);
  });
  byNamePhone.forEach((group) => {
    if (group.length > 1) {
      groups.push({ contacts: group, reason: 'Mismo nombre y teléfono', confidence: 'high' });
      group.forEach(c => seen.add(c.id));
    }
  });

  // Pass 2: exact normalized name match without phone (medium confidence)
  const byName = new Map<string, ContactForDupe[]>();
  contacts.forEach(c => {
    if (seen.has(c.id)) return;
    const key = `${normalize(c.first_name)}|${normalize(c.last_name || '')}`;
    if (key === '|') return; // skip empty names
    if (!byName.has(key)) byName.set(key, []);
    byName.get(key)!.push(c);
  });
  byName.forEach((group) => {
    if (group.length > 1) {
      groups.push({ contacts: group, reason: 'Mismo nombre (posible duplicado)', confidence: 'medium' });
    }
  });

  return groups.sort((a, b) => (a.confidence === 'high' ? -1 : 1) - (b.confidence === 'high' ? -1 : 1));
};
