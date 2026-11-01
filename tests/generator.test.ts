import { describe, expect, it } from 'vitest';
import balanceJson from '../data/balance.json';
import levelJson from '../data/level01.json';
import type { Balance } from '../src/core/balance';
import { generateLevel } from '../src/core/generator';
import { validateLevel } from '../src/core/level';
import { createWorld } from '../src/core/state';
import type { LevelData } from '../src/core/types';

const template = levelJson as LevelData;
const balance = balanceJson as Balance;
const generate = (seed: number) => generateLevel(seed, template, balance.generator, balance.neighborsCount);

describe('генератор печер', () => {
  it('той самий seed — та сама печера, інший seed — інша', () => {
    expect(generate(7)).toEqual(generate(7));
    expect(generate(7)).not.toEqual(generate(8));
  });

  // Перевірки з розділу 3 ТЗ для 100 різних печер
  it('кожна печера проходить усі перевірки', () => {
    const g = balance.generator;
    for (let seed = 1; seed <= 100; seed++) {
      const level = generate(seed);
      expect(validateLevel(level)).toEqual([]); // камені не налазять, exposedTo правильний тощо
      expect(level.rocks.length).toBe(g.rocks);
      expect(level.cells.length).toBe(g.rocks); // одна клітинка на камінь

      const world = createWorld(level, balance);
      const isSafe = (id: string) => world.cells[id].exposedTo.length === 0;
      // Кожну клітинку видно не більше ніж з двох ліній
      for (const cell of level.cells) expect(cell.exposedTo.length).toBeLessThanOrEqual(g.maxLanesPerCell);
      // Біля кожної клітинки під лінією є безпечна сусідня
      for (const cell of Object.values(world.cells)) {
        if (!isSafe(cell.id)) expect(cell.neighbors.some(isSafe)).toBe(true);
      }
      // Старт і турель безпечні, предмети — у різних клітинках, не на старті й не в турелі
      expect(isSafe(level.startCell)).toBe(true);
      expect(isSafe(level.turretCell)).toBe(true);
      const itemCells = level.items.map((i) => i.cellId);
      expect(new Set(itemCells).size).toBe(itemCells.length);
      expect(itemCells).not.toContain(level.startCell);
      expect(itemCells).not.toContain(level.turretCell);
      // Граф зв'язний: з будь-якої клітинки дійдеш до будь-якої (отже, усі предмети досяжні)
      const seen = new Set([level.startCell]);
      const queue = [level.startCell];
      while (queue.length) for (const n of world.cells[queue.shift()!].neighbors) if (!seen.has(n)) seen.add(n), queue.push(n);
      expect(seen.size).toBe(level.cells.length);
    }
  });
});
