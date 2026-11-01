// Генератор випадкових печер. З того самого seed завжди виходить та сама печера.
//
// Як це працює (одна «спроба»):
//   1. Розкидаємо камені: не налазять один на одного, не біля стін і не біля гнізда павука.
//   2. Біля кожного каменя ставимо клітинку з випадкового боку.
//   3. Рахуємо, з яких ліній видно кожну клітинку (exposedTo).
//   4. Обираємо старт, турель і місця для деталей та патрона.
//   5. Перевіряємо печеру (розділ 3 ТЗ). Не пройшла — пробуємо знову з наступними випадковими числами.
//
// Розмір печери, гніздо, лінії павука й список предметів беремо з шаблону (data/level01.json).

import type { GeneratorBalance } from './balance';
import { buildCellGraph } from './graph';
import { validateLevel } from './level';
import { nextRandom } from './rng';
import type { Cell, LevelCell, LevelData, Rock } from './types';
import { computeExposure } from './visibility';

// Генератор випадкових чисел зі зручними методами. Стан — одне число, як у rng.ts.
class Random {
  constructor(private state: number) {}
  next(): number {
    const r = nextRandom(this.state);
    this.state = r.rng;
    return r.value;
  }
  range(min: number, max: number): number {
    return min + (max - min) * this.next();
  }
  pick<T>(list: readonly T[]): T {
    return list[Math.floor(this.next() * list.length)];
  }
}

const round2 = (n: number) => Math.round(n * 100) / 100;
const pad = (n: number) => String(n).padStart(2, '0');
const dist = (a: { x: number; z: number }, b: { x: number; z: number }) => Math.hypot(a.x - b.x, a.z - b.z);

// Що не так із печерою — для тестів і налагодження
export type GenerationProblem =
  | 'rocksDidNotFit' // не вдалось розкласти всі камені
  | 'cellDidNotFit' // біля якогось каменя немає місця для клітинки
  | 'tooManyLanes' // клітинку видно більш ніж з maxLanesPerCell ліній
  | 'tooFewSafe' // замало безпечних клітинок
  | 'tooFewExposed' // замало клітинок під лініями
  | 'noSafeNeighbor' // біля клітинки під лінією немає безпечної сусідньої — сховатись нікуди
  | 'noPlaceForItems' // не вистачає клітинок для старту, турелі й предметів
  | 'invalidLevel'; // validateLevel знайшов помилку

export function generateLevel(seed: number, template: LevelData, settings: GeneratorBalance, neighborsCount: number): LevelData {
  const random = new Random(seed);
  for (let attempt = 0; attempt < settings.maxAttempts; attempt++) {
    const result = tryGenerate(random, template, settings, neighborsCount);
    if ('level' in result) return { ...result.level, id: `cave_${seed}` };
  }
  throw new Error(`Не вдалося згенерувати печеру для seed ${seed}`);
}

// Одна спроба: або готова печера, або причина, чому не вийшло
export function tryGenerate(
  random: Random,
  template: LevelData,
  s: GeneratorBalance,
  neighborsCount: number,
): { level: LevelData } | { problem: GenerationProblem } {
  const { width, depth } = template.cave;

  // 1. Камені
  const rocks: Rock[] = [];
  for (let tries = 0; rocks.length < s.rocks && tries < s.rocks * 60; tries++) {
    const radius = round2(random.range(s.rockRadiusMin, s.rockRadiusMax));
    const margin = radius + s.wallMargin;
    const rock = {
      id: `rock_${pad(rocks.length + 1)}`,
      x: round2(random.range(-width / 2 + margin, width / 2 - margin)),
      z: round2(random.range(-depth / 2 + margin, depth / 2 - margin)),
      radius,
      height: round2(random.range(s.rockHeightMin, s.rockHeightMax)),
    };
    if (dist(rock, template.spider) < s.nestRadius + radius) continue;
    if (rocks.some((o) => dist(o, rock) < o.radius + rock.radius + s.rockGap)) continue;
    rocks.push(rock);
  }
  if (rocks.length < s.rocks) return { problem: 'rocksDidNotFit' };

  // 2. Клітинки: по одній біля кожного каменя, з випадкового боку
  const cells: LevelCell[] = [];
  for (const rock of rocks) {
    let placed: LevelCell | null = null;
    for (let tries = 0; tries < 16 && !placed; tries++) {
      const angle = random.range(0, Math.PI * 2);
      const r = rock.radius + s.cellGap;
      const cell = {
        id: `cell_${pad(cells.length + 1)}`,
        x: round2(rock.x + Math.sin(angle) * r),
        z: round2(rock.z + Math.cos(angle) * r),
        rockId: rock.id,
        exposedTo: [] as number[],
      };
      const inside = Math.abs(cell.x) <= width / 2 - 0.8 && Math.abs(cell.z) <= depth / 2 - 0.8;
      const clearOfRocks = rocks.every((o) => o === rock || dist(o, cell) > o.radius + 0.6);
      const clearOfCells = cells.every((o) => dist(o, cell) >= s.minCellDistance);
      const clearOfNest = dist(cell, template.spider) > 2.5;
      if (inside && clearOfRocks && clearOfCells && clearOfNest) placed = cell;
    }
    if (!placed) return { problem: 'cellDidNotFit' };
    cells.push(placed);
  }

  // 3. Хто кого бачить
  const draft: LevelData = { ...template, rocks, cells, startCell: '', turretCell: '', items: [] };
  const exposure = computeExposure(draft);
  for (const cell of cells) cell.exposedTo = exposure[cell.id];

  // Перевірки з розділу 3 ТЗ
  if (cells.some((c) => c.exposedTo.length > s.maxLanesPerCell)) return { problem: 'tooManyLanes' };
  const safe = cells.filter((c) => c.exposedTo.length === 0);
  if (safe.length < s.minSafeCells) return { problem: 'tooFewSafe' };
  if (cells.length - safe.length < s.minExposedCells) return { problem: 'tooFewExposed' };
  const graph = buildCellGraph(cells, neighborsCount); // граф завжди зв'язний (див. graph.ts)
  const isSafe = (id: string) => graph[id].exposedTo.length === 0;
  const exposedWithoutShelter = cells.some((c) => !isSafe(c.id) && !graph[c.id].neighbors.some(isSafe));
  if (exposedWithoutShelter) return { problem: 'noSafeNeighbor' };

  // 4. Старт — безпечна клітинка якнайдалі від павука, у якої є безпечний сусід (солдатів четверо)
  const startCandidates = safe.filter((c) => graph[c.id].neighbors.some(isSafe));
  if (startCandidates.length === 0) return { problem: 'noPlaceForItems' };
  const start = [...startCandidates].sort((a, b) => dist(b, template.spider) - dist(a, template.spider))[0];

  // Турель — безпечна клітинка, найближча до центру печери, не біля старту
  const steps = stepsFrom(graph, start.id);
  const turretCandidates = safe.filter((c) => steps.get(c.id)! >= 3);
  if (turretCandidates.length === 0) return { problem: 'noPlaceForItems' };
  const turret = [...turretCandidates].sort((a, b) => dist(a, { x: 0, z: 0 }) - dist(b, { x: 0, z: 0 }))[0];

  // Предмети — у різних клітинках, не на старті, не біля нього й не в турелі.
  // Патрон — у клітинці, найближчій до павука (як у рівні Колі), деталі — у випадкових.
  const free = cells.filter((c) => c.id !== turret.id && steps.get(c.id)! >= 2);
  if (free.length < template.items.length) return { problem: 'noPlaceForItems' };
  const used = new Set<string>();
  const items = template.items.map((item) => {
    const options = free.filter((c) => !used.has(c.id));
    const cell =
      item.kind === 'cartridge'
        ? [...options].sort((a, b) => dist(a, template.spider) - dist(b, template.spider))[0]
        : random.pick(options);
    used.add(cell.id);
    return { ...item, cellId: cell.id };
  });

  const level: LevelData = { ...draft, startCell: start.id, turretCell: turret.id, items };
  if (validateLevel(level).length > 0) return { problem: 'invalidLevel' };
  return { level };
}

// Скільки кроків від клітинки from до кожної іншої (пошук у ширину)
function stepsFrom(graph: Record<string, Cell>, from: string): Map<string, number> {
  const steps = new Map<string, number>([[from, 0]]);
  const queue = [from];
  while (queue.length > 0) {
    const current = queue.shift()!;
    for (const next of graph[current].neighbors) {
      if (!steps.has(next)) {
        steps.set(next, steps.get(current)! + 1);
        queue.push(next);
      }
    }
  }
  return steps;
}

export { Random };
