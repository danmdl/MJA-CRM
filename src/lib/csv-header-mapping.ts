// Auto-maps CSV headers to contact fields. Each header can be claimed by
// one field. Exact matches for EVERY field are resolved before any
// substring match: otherwise a generic alias of an earlier field steals a
// more specific header (Seguimiento's 'estado' ate "Estado civil", which
// left estado_civil empty and estado_seguimiento full of marital values).

const norm = (s: string) =>
  s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');

// Field key -> header spellings. Most specific first.
export const CSV_HEADER_ALIASES: Record<string, string[]> = {
  first_name:         ['nombre', 'name', 'primer nombre', 'nombres'],
  last_name:          ['apellido', 'apellidos', 'last name', 'surname'],
  phone:              ['telefono', 'celular', 'cel', 'phone', 'tel', 'movil', 'mobile', 'whatsapp', 'nro telefono', 'numero telefono', 'numero celular'],
  address:            ['direccion', 'domicilio', 'address', 'calle'],
  apartment_number:   ['departamento', 'depto', 'dpto', 'piso', 'apartment', 'nro depto'],
  barrio:             ['barrio', 'localidad', 'neighborhood', 'zona barrio'],
  numero_cuerda:      ['cuerda', 'nro cuerda', 'numero cuerda', 'num cuerda'],
  zona:               ['zona'],
  leader_assigned:    ['lider', 'lider de celula', 'leader', 'lider asignado'],
  conector:           ['conector', 'connector', 'quien contacto', 'quien lo contacto'],
  estado_seguimiento: ['seguimiento', 'estado seguimiento', 'estado', 'follow up', 'status'],
  fecha_contacto:     ['fecha contacto', 'fecha de contacto', 'fecha', 'date', 'fecha ingreso'],
  date_of_birth:      ['nacimiento', 'fecha nacimiento', 'fecha de nacimiento', 'cumpleanos', 'birthday', 'date of birth', 'fdn'],
  edad:               ['edad', 'age', 'anos'],
  sexo:               ['sexo', 'genero', 'gender', 'sex', 'm/f'],
  estado_civil:       ['estado civil', 'civil', 'marital'],
  observaciones:      ['observaciones', 'observacion', 'notas', 'nota', 'notes', 'comentarios', 'comments'],
  pedido_de_oracion:  ['pedido de oracion', 'oracion', 'prayer', 'pedido oracion', 'prayer request'],
};

export function autoMapCsvHeaders(
  headers: string[],
  fields: { key: string; label: string }[],
  aliases: Record<string, string[]> = CSV_HEADER_ALIASES,
): Record<string, string | null> {
  const mapping: Record<string, string | null> = {};
  const claimed = new Set<string>();
  const aliasesFor = (f: { key: string; label: string }) =>
    (aliases[f.key] || [f.label.toLowerCase(), f.key]).map(norm).filter(Boolean);

  for (const f of fields) {
    const al = aliasesFor(f);
    const hit = headers.find(h => !claimed.has(h) && al.includes(norm(h)));
    mapping[f.key] = hit ?? null;
    if (hit) claimed.add(hit);
  }

  // Substring pass: the longest matching alias wins across all fields, so
  // 'estadocivil' beats Seguimiento's 'estado' for "Estado civil (opc.)".
  const candidates: { key: string; header: string; score: number; order: number }[] = [];
  fields.forEach((f, order) => {
    if (mapping[f.key]) return;
    const al = aliasesFor(f);
    for (const h of headers) {
      if (claimed.has(h)) continue;
      const nh = norm(h);
      if (!nh) continue;
      const score = Math.max(0, ...al.filter(a => nh.includes(a) || a.includes(nh)).map(a => Math.min(a.length, nh.length)));
      if (score > 0) candidates.push({ key: f.key, header: h, score, order });
    }
  });
  candidates.sort((a, b) => b.score - a.score || a.order - b.order);
  for (const c of candidates) {
    if (mapping[c.key] || claimed.has(c.header)) continue;
    mapping[c.key] = c.header;
    claimed.add(c.header);
  }
  return mapping;
}
