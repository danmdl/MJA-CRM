import { describe, it, expect } from 'vitest';
import { isPointInTerritory, polygonLabelPoint } from './territory-utils';

const ring = (pts: [number, number][]) => pts.map(([lng, lat]) => ({ lat, lng }));

describe('polygonLabelPoint', () => {
  it('puts the label at the middle of a square', () => {
    const p = polygonLabelPoint([ring([[0, 0], [0.01, 0], [0.01, 0.01], [0, 0.01]])])!;
    expect(p.lat).toBeCloseTo(0.005, 3);
    expect(p.lng).toBeCloseTo(0.005, 3);
  });

  it('stays inside a C-shaped zone where the vertex average falls outside', () => {
    // A "C" opening to the right: the vertex average sits in the empty bay.
    const c = ring([[0, 0], [0.03, 0], [0.03, 0.005], [0.005, 0.005], [0.005, 0.025], [0.03, 0.025], [0.03, 0.03], [0, 0.03]]);
    const avg = { lat: c.reduce((s, p) => s + p.lat, 0) / c.length, lng: c.reduce((s, p) => s + p.lng, 0) / c.length };
    expect(isPointInTerritory(avg.lat, avg.lng, [c])).toBe(false);
    const p = polygonLabelPoint([c])!;
    expect(isPointInTerritory(p.lat, p.lng, [c])).toBe(true);
  });

  it('is not dragged toward an edge with many vertices', () => {
    // Square whose bottom edge is densely sampled.
    const dense: [number, number][] = [];
    for (let i = 0; i <= 50; i++) dense.push([i * 0.0002, 0]);
    const sq = ring([...dense, [0.01, 0.01], [0, 0.01]]);
    const avgLat = sq.reduce((s, p) => s + p.lat, 0) / sq.length;
    expect(avgLat).toBeLessThan(0.002); // the old method sank to the bottom
    expect(polygonLabelPoint([sq])!.lat).toBeCloseTo(0.005, 3);
  });

  it('avoids holes', () => {
    const outer = ring([[0, 0], [0.02, 0], [0.02, 0.02], [0, 0.02]]);
    const hole = ring([[0.006, 0.006], [0.014, 0.006], [0.014, 0.014], [0.006, 0.014]]);
    const p = polygonLabelPoint([outer, hole])!;
    expect(isPointInTerritory(p.lat, p.lng, [outer])).toBe(true);
    expect(isPointInTerritory(p.lat, p.lng, [hole])).toBe(false);
  });

  it('returns null for degenerate input', () => {
    expect(polygonLabelPoint([])).toBeNull();
    expect(polygonLabelPoint([ring([[0, 0], [1, 1]])])).toBeNull();
  });
});
