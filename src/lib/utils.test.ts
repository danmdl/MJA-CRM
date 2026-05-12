import { describe, it, expect } from 'vitest';
import { cn } from './utils';

describe('cn', () => {
  it('joins truthy class names', () => {
    expect(cn('a', 'b')).toBe('a b');
  });

  it('skips falsy values', () => {
    expect(cn('a', false, null, undefined, 'b')).toBe('a b');
  });

  it('lets tailwind-merge dedupe conflicting classes', () => {
    // tailwind-merge keeps the LAST class when two affect the same property.
    expect(cn('p-2', 'p-4')).toBe('p-4');
    expect(cn('text-red-500', 'text-blue-500')).toBe('text-blue-500');
  });

  it('handles arrays and objects per clsx', () => {
    expect(cn(['a', 'b'], { c: true, d: false })).toBe('a b c');
  });
});
