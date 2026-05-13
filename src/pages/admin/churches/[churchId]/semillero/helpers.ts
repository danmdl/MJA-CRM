// Pure helpers extracted from SemilleroPage to keep the main file focused
// on render/state. Each function takes its data dependencies as args
// (instead of closing over them) so they're trivially unit-testable.

import { normalize } from '@/lib/normalize';
import { isWithinGBA } from '@/lib/geo-validation';
import type { Barrio, Cell, Contact, Cuerda, Zona } from './types';

// Haversine distance in km between two lat/lng points on Earth.
export const haversine = (lat1: number, lng1: number, lat2: number, lng2: number): number => {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};

/**
 * Try to infer which zona a contact belongs to using their barrio /
 * address text. Falls through:
 *   1. Direct barrio name match against the barrios table.
 *   2. Substring match of the contact's text against any zona name.
 * Returns null when no signal is available.
 */
export const detectZonaForContact = (
  contact: Contact,
  zonas: Zona[] | undefined,
  barrios: Barrio[] | undefined,
): Zona | null => {
  if (!zonas?.length) return null;
  const text = normalize((contact.barrio || '') + ' ' + (contact.address || ''));
  if (!text.trim()) return null;
  if (barrios?.length) {
    for (const barrio of barrios) {
      if (text.includes(normalize(barrio.nombre))) return zonas.find(z => z.id === barrio.zona_id) || null;
    }
  }
  return zonas.find(z => text.includes(normalize(z.nombre))) || null;
};

export const getCuerdaNumero = (cell: Cell, cuerdas: Cuerda[] | undefined): string | null => {
  if (!cell.cuerda_id || !cuerdas?.length) return null;
  return cuerdas.find(c => c.id === cell.cuerda_id)?.numero || null;
};

/**
 * Filter cells by the contact's gender via cuerda-number prefix:
 *   1xx → masculino, 2xx → femenino, 3xx → mixed.
 * Cells with no cuerda are always included (we'd rather over-suggest
 * than block assignment because the cell is missing metadata).
 */
export const filterCellsByGender = (
  allCells: Cell[],
  sexo: string | null | undefined,
  cuerdas: Cuerda[] | undefined,
): Cell[] => {
  if (!sexo) return allCells;
  const isFemale = sexo.toLowerCase() === 'femenino';
  const isMale = sexo.toLowerCase() === 'masculino';
  if (!isFemale && !isMale) return allCells;

  return allCells.filter(cell => {
    const num = getCuerdaNumero(cell, cuerdas);
    if (!num) return true;
    const prefix = parseInt(num.charAt(0));
    if (prefix === 3) return true;
    if (isFemale) return prefix === 2;
    if (isMale) return prefix === 1;
    return true;
  });
};

/**
 * Rank cells for a contact's suggested assignment. Two paths:
 *   - Contact has valid coordinates inside GBA → pure haversine distance.
 *   - No coordinates → zona-filter then text-similarity score on the
 *     cell's address (shared word tokens > 2 chars).
 * Caller is expected to pass the result of filterCellsByGender first
 * to avoid suggesting cross-gender cells.
 */
export const getCellsByDistance = (
  contact: Contact,
  cells: Cell[] | undefined,
  cuerdas: Cuerda[] | undefined,
  filterZona: Zona | null | undefined,
): Cell[] => {
  if (!cells?.length) return [];
  const genderFiltered = filterCellsByGender(cells, contact.sexo, cuerdas);

  if (contact.lat != null && contact.lng != null && isWithinGBA(contact.lat, contact.lng)) {
    return genderFiltered
      .filter(c => c.lat != null && c.lng != null && isWithinGBA(c.lat, c.lng))
      .map(cell => ({ cell, dist: haversine(contact.lat!, contact.lng!, cell.lat!, cell.lng!) }))
      .sort((a, b) => a.dist - b.dist)
      .map(x => x.cell);
  }

  let candidates = genderFiltered;
  if (filterZona && cuerdas?.length) {
    const zonaCuerdaIds = cuerdas.filter(c => c.zona_id === filterZona.id).map(c => c.id);
    const zonaCells = genderFiltered.filter(c => c.cuerda_id && zonaCuerdaIds.includes(c.cuerda_id));
    if (zonaCells.length > 0) candidates = zonaCells;
  }

  return candidates
    .map(cell => {
      let score = 999;
      const contactText = normalize((contact.address || '') + ' ' + (contact.barrio || ''));
      const cellText = normalize(cell.address || '');
      if (cellText && contactText) {
        const contactWords = new Set(contactText.split(/\s+/).filter(w => w.length > 2));
        const cellWords = cellText.split(/\s+/).filter(w => w.length > 2);
        const shared = cellWords.filter(w => contactWords.has(w)).length;
        score = shared > 0 ? (100 - shared * 10) : 500;
      }
      return { cell, score };
    })
    .sort((a, b) => a.score - b.score)
    .map(x => x.cell);
};
