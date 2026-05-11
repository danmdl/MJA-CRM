import { describe, it, expect } from 'vitest';
import { normalize, normalizeName } from './normalize';

describe('normalize', () => {
  it('lowercases input', () => {
    expect(normalize('HOLA')).toBe('hola');
  });

  it('strips accents', () => {
    expect(normalize('Camila Próspero')).toBe('camila prospero');
    expect(normalize('Núñez')).toBe('nunez');
  });

  it('trims surrounding whitespace', () => {
    expect(normalize('  hola  ')).toBe('hola');
  });
});

describe('normalizeName', () => {
  it('returns empty string for null/undefined/empty input', () => {
    expect(normalizeName(null)).toBe('');
    expect(normalizeName(undefined)).toBe('');
    expect(normalizeName('')).toBe('');
    expect(normalizeName('   ')).toBe('');
  });

  it('title-cases each word and strips accents', () => {
    expect(normalizeName('guillermina')).toBe('Guillermina');
    expect(normalizeName('GUILLERMINA')).toBe('Guillermina');
    expect(normalizeName('Camila Próspero')).toBe('Camila Prospero');
  });

  it('collapses internal whitespace', () => {
    expect(normalizeName('  pamela  rodríguez  ')).toBe('Pamela Rodriguez');
  });

  it('handles single-letter words', () => {
    expect(normalizeName('a b c')).toBe('A B C');
  });
});
