import { describe, it, expect } from 'vitest';
import { autoMapCsvHeaders } from './csv-header-mapping';
import { CONTACT_FIELDS } from './contact-fields';

const fields = [{ key: 'first_name', label: 'Nombre' }, ...CONTACT_FIELDS];

describe('autoMapCsvHeaders', () => {
  it('maps "Estado civil" to estado_civil, not estado_seguimiento', () => {
    const m = autoMapCsvHeaders(['Nombre', 'Estado civil', 'Teléfono'], fields);
    expect(m.estado_civil).toBe('Estado civil');
    expect(m.estado_seguimiento).toBeNull();
    expect(m.phone).toBe('Teléfono');
  });

  it('prefers the longest alias in substring matches', () => {
    const m = autoMapCsvHeaders(['Estado civil (opcional)', 'Fecha de nacimiento del contacto'], fields);
    expect(m.estado_civil).toBe('Estado civil (opcional)');
    expect(m.estado_seguimiento).toBeNull();
    expect(m.date_of_birth).toBe('Fecha de nacimiento del contacto');
    expect(m.fecha_contacto).toBeNull();
  });

  it('still maps a bare "Estado" header to seguimiento when both exist', () => {
    const m = autoMapCsvHeaders(['Estado', 'Estado Civil'], fields);
    expect(m.estado_seguimiento).toBe('Estado');
    expect(m.estado_civil).toBe('Estado Civil');
  });

  it('never assigns one header to two fields', () => {
    const m = autoMapCsvHeaders(['Fecha'], fields);
    const used = Object.values(m).filter(Boolean);
    expect(used).toEqual(['Fecha']);
  });
});
