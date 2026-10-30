import { describe, expect, it } from 'vitest';
import levelJson from '../data/level01.json';
import { validateLevel } from '../src/core/level';
import type { LevelData } from '../src/core/types';

const level = levelJson as LevelData;

describe('рівень level01', () => {
  it('не має помилок', () => {
    expect(validateLevel(level)).toEqual([]);
  });

  it('має близько 20 каменів і по клітинці на кожен камінь', () => {
    expect(level.rocks.length).toBeGreaterThanOrEqual(18);
    expect(level.rocks.length).toBeLessThanOrEqual(22);
    expect(level.cells.length).toBe(level.rocks.length);
  });

  it('має 5 ліній огляду, 4 деталі й 1 патрон', () => {
    expect(level.lanes.length).toBe(5);
    expect(level.items.filter((i) => i.kind === 'part').length).toBe(4);
    expect(level.items.filter((i) => i.kind === 'cartridge').length).toBe(1);
  });
});

describe('validateLevel', () => {
  it('помічає камені, що налазять один на одного', () => {
    const broken: LevelData = structuredClone(level);
    broken.rocks[1].x = broken.rocks[0].x;
    broken.rocks[1].z = broken.rocks[0].z;
    const codes = validateLevel(broken).map((p) => p.code);
    expect(codes).toContain('rocksOverlap');
  });

  it('помічає посилання на неіснуючу клітинку', () => {
    const broken: LevelData = structuredClone(level);
    broken.turretCell = 'cell_999';
    expect(validateLevel(broken)).toContainEqual({ code: 'unknownCell', id: 'turretCell' });
  });
});
