export function formatDateAR(s: string): string {
  if (!s) return '';
  const parts = s.slice(0, 10).split('-');
  if (parts.length !== 3) return s;
  return `${parts[2]}/${parts[1]}/${parts[0].slice(2)}`;
}

export function isoDate(year: number, month: number, day: number): string {
  const m = String(month + 1).padStart(2, '0');
  const d = String(day).padStart(2, '0');
  return `${year}-${m}-${d}`;
}
