// Павучата: як вони з'являються на старті, як ходять у ворожій фазі й що бачать.
// Усі випадкові рішення йдуть через seeded RNG (rng.ts), тож з тим самим seed павучата ходять так само.

import { randomInt } from './rng';
import type { World } from './state';
import type { Spiderling } from './types';

// Випадковий елемент списку. Повертає вибраний елемент і новий стан генератора.
function pick<T>(rng: number, list: readonly T[]): { value: T; rng: number } {
  const r = randomInt(rng, list.length);
  return { value: list[r.value], rng: r.rng };
}

// Перемішати список (алгоритм Фішера — Єйтса) — для вибору різних клітинок на старті
function shuffle<T>(rng: number, list: readonly T[]): { value: T[]; rng: number } {
  const result = [...list];
  for (let i = result.length - 1; i > 0; i--) {
    const r = randomInt(rng, i + 1);
    rng = r.rng;
    [result[i], result[r.value]] = [result[r.value], result[i]];
  }
  return { value: result, rng };
}

// Куди дивитись із клітинки: випадкова сусідня. Якщо задано avoid — спершу пробуємо сусідів не з нього.
function pickFacing(world: World, rng: number, cellId: string, avoid: Set<string> = new Set()) {
  const neighbors = world.cells[cellId].neighbors;
  const preferred = neighbors.filter((n) => !avoid.has(n));
  return pick(rng, preferred.length > 0 ? preferred : neighbors);
}

// Розставити павучат на старті. За ТЗ — не в стартовій клітинці й не в клітинці турелі.
// ПРИПУЩЕННЯ (перевірити з Колею): щоб гра не закінчувалась з першого кроку, павучата
// стають якнайдалі від солдатів — не в їхніх клітинках і не поруч, і не дивляться на солдатів.
// Кожне павуча — в окремій клітинці, якщо клітинок вистачає.
export function placeSpiderlings(
  world: World,
  rng: number,
  count: number,
  soldierCells: readonly string[],
): { spiderlings: Spiderling[]; rng: number } {
  const level = world.level;
  const occupied = new Set(soldierCells);
  const nearSoldiers = new Set(soldierCells.flatMap((c) => world.cells[c].neighbors));
  const allowed = Object.keys(world.cells).filter(
    (id) => id !== level.startCell && id !== level.turretCell && !occupied.has(id),
  );
  // Спершу клітинки далеко від солдатів, потім — решта дозволених
  const far = shuffle(rng, allowed.filter((id) => !nearSoldiers.has(id)));
  const near = shuffle(far.rng, allowed.filter((id) => nearSoldiers.has(id)));
  rng = near.rng;
  const order = [...far.value, ...near.value];

  const spiderlings: Spiderling[] = [];
  for (let i = 0; i < count && order.length > 0; i++) {
    const cellId = order[i % order.length]; // якщо клітинок замало — по колу, по двоє в клітинці
    const facing = pickFacing(world, rng, cellId, occupied);
    rng = facing.rng;
    spiderlings.push({ id: `spiderling_${i + 1}`, cellId, facingCellId: facing.value });
  }
  return { spiderlings, rng };
}

// Подія руху павучати — для рендеру й списку подій
export interface SpiderlingStep {
  id: string;
  fromCell: string;
  toCell: string;
  facingCellId: string;
}

// Ворожа фаза, крок 1: кожне павуча переходить на випадкову сусідню клітинку,
// а потім випадково обирає сусідню клітинку, в бік якої дивиться.
export function moveSpiderlings(
  world: World,
  rng: number,
  spiderlings: readonly Spiderling[],
): { spiderlings: Spiderling[]; rng: number; steps: SpiderlingStep[] } {
  const moved: Spiderling[] = [];
  const steps: SpiderlingStep[] = [];
  for (const s of spiderlings) {
    const to = pick(rng, world.cells[s.cellId].neighbors);
    const facing = pickFacing(world, to.rng, to.value);
    rng = facing.rng;
    moved.push({ ...s, cellId: to.value, facingCellId: facing.value });
    steps.push({ id: s.id, fromCell: s.cellId, toCell: to.value, facingCellId: facing.value });
  }
  return { spiderlings: moved, rng, steps };
}

// Клітинки, які бачать павучата: свою й ту, на яку дивляться
export function cellsSeenBySpiderlings(spiderlings: readonly Spiderling[]): Set<string> {
  return new Set(spiderlings.flatMap((s) => [s.cellId, s.facingCellId]));
}
