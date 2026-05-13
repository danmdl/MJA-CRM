import { describe, it, expect } from 'vitest';
import { groupStopsByLocation, buildGroupLabel, buildGroupTitle } from './route-stops';

describe('groupStopsByLocation', () => {
  it('keeps stops at different coordinates separate', () => {
    const groups = groupStopsByLocation([
      { number: 1, lat: -34.5, lng: -58.5, title: 'A' },
      { number: 2, lat: -34.6, lng: -58.6, title: 'B' },
    ]);
    expect(groups).toHaveLength(2);
    expect(groups[0].numbers).toEqual([1]);
    expect(groups[1].numbers).toEqual([2]);
  });

  it('groups stops with identical lat/lng', () => {
    const groups = groupStopsByLocation([
      { number: 1, lat: -34.5, lng: -58.5, title: 'A' },
      { number: 2, lat: -34.6, lng: -58.6, title: 'B' },
      { number: 3, lat: -34.6, lng: -58.6, title: 'C' },
    ]);
    expect(groups).toHaveLength(2);
    expect(groups[1].numbers).toEqual([2, 3]);
    expect(groups[1].titles).toEqual(['B', 'C']);
  });

  it('treats coords that round to the same 5 decimals as the same group', () => {
    const groups = groupStopsByLocation([
      { number: 1, lat: -34.591234, lng: -58.501234, title: 'A' },
      { number: 2, lat: -34.5912344, lng: -58.5012344, title: 'B' },
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0].numbers).toEqual([1, 2]);
  });

  it('marks the group visited only when every member is visited', () => {
    const groups = groupStopsByLocation([
      { number: 1, lat: -34.5, lng: -58.5, title: 'A', visited: true },
      { number: 2, lat: -34.5, lng: -58.5, title: 'B', visited: false },
    ]);
    expect(groups[0].allVisited).toBe(false);
    const allDone = groupStopsByLocation([
      { number: 1, lat: -34.5, lng: -58.5, title: 'A', visited: true },
      { number: 2, lat: -34.5, lng: -58.5, title: 'B', visited: true },
    ]);
    expect(allDone[0].allVisited).toBe(true);
  });
});

describe('buildGroupLabel', () => {
  it('handles 1 / 2 / 3 / 4+ stops', () => {
    expect(buildGroupLabel([1])).toBe('1');
    expect(buildGroupLabel([2, 3])).toBe('2 y 3');
    expect(buildGroupLabel([2, 3, 4])).toBe('2, 3, 4');
    expect(buildGroupLabel([2, 3, 4, 5])).toBe('2-5');
    expect(buildGroupLabel([7, 8, 9, 10, 11])).toBe('7-11');
  });
});

describe('buildGroupTitle', () => {
  it('returns "N. Name" for a single stop', () => {
    expect(buildGroupTitle({ lat: 0, lng: 0, numbers: [3], titles: ['Ana'], allVisited: false }))
      .toBe('3. Ana');
  });
  it('lists every stop on its own line for a group', () => {
    expect(buildGroupTitle({ lat: 0, lng: 0, numbers: [2, 3], titles: ['Daiana', 'Camila'], allVisited: false }))
      .toBe('2. Daiana\n3. Camila');
  });
});
