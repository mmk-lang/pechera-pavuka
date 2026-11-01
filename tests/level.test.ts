import { describe, expect, it } from 'vitest';
import levelJson from '../data/level01.json';
import { validateLevel } from '../src/core/level';
import type { LevelData } from '../src/core/types';
import { LEVELS, nextLevelId } from '../src/levels';
import uk from '../src/i18n/uk.json';

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

describe('усі рівні', () => {
  it('шість рівнів із різними id, кожен має назву', () => {
    expect(LEVELS.length).toBe(6);
    expect(new Set(LEVELS.map((l) => l.id)).size).toBe(6);
    for (const l of LEVELS) expect((uk.levels as Record<string, string>)[l.id]).toBeTruthy();
  });

  for (const l of LEVELS) {
    it(`${l.id}: без помилок, 5 ліній, кожну лінію видно хоч з однієї клітинки`, () => {
      expect(validateLevel(l)).toEqual([]);
      expect(l.lanes.length).toBe(5);
      expect(l.items.length).toBe(5);
      for (const lane of l.lanes) expect(l.cells.some((c) => c.exposedTo.includes(lane.id))).toBe(true);
    });
  }

  it('після рівня йде наступний, після останнього — нічого', () => {
    expect(nextLevelId('level01')).toBe('level02');
    expect(nextLevelId('level06')).toBeNull();
    expect(nextLevelId('cave_5')).toBeNull();
  });
});
