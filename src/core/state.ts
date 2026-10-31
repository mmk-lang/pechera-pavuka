// Стан гри: усе, що змінюється під час партії (раунд, солдати, предмети, павук, кокони),
// плюс посилання на незмінний світ.
// Стан ніколи не змінюється «на місці»: кожна дія створює новий об'єкт стану (див. rules.ts).
// Так легко зробити «Скасувати дію» і писати тести.

import type { Balance } from './balance';
import { buildCellGraph } from './graph';
import { randomInt, randomSeed } from './rng';
import type { Cell, Cocoon, Item, LevelData, Soldier } from './types';

// Світ — те, що не змінюється протягом партії: рівень і граф клітинок
export interface World {
  level: LevelData;
  cells: Record<string, Cell>;
}

// Як іде партія: ще граємо, перемогли або програли
export type Outcome = 'playing' | 'won' | 'lost';

// Павук нерухомий; змінюється лише лінія, на яку він дивиться
export interface SpiderState {
  activeLane: number; // куди дивиться зараз (суцільний червоний клин)
  nextLane: number; // куди повернеться наприкінці раунду (пунктирний клин)
}

export interface GameState {
  readonly world: World;
  readonly balance: Balance;
  readonly round: number; // номер раунду, починаємо з 1
  readonly soldiers: readonly Soldier[];
  readonly items: readonly Item[];
  readonly cocoons: readonly Cocoon[];
  readonly spider: SpiderState;
  readonly outcome: Outcome;
  readonly seed: number; // з якого seed почалась партія (показуємо на екрані)
  readonly rng: number; // поточний стан генератора випадкових чисел (див. rng.ts)
}

export function createWorld(level: LevelData, balance: Balance): World {
  return { level, cells: buildCellGraph(level.cells, balance.neighborsCount) };
}

// Початковий стан: солдати біля старту, у кожного повні AP; предмети лежать там, де вказано в рівні;
// павук дивиться на випадкову лінію. seed — зерно випадковості (за замовчуванням з balance.json або випадкове).
export function createInitialState(level: LevelData, balance: Balance, seed = balance.seed ?? randomSeed()): GameState {
  const world = createWorld(level, balance);
  const startCells = startPlacement(world, balance.soldiers, balance.maxSoldiersPerCell);
  const soldiers: Soldier[] = startCells.map((cellId, i) => ({
    id: `soldier_${i + 1}`,
    cellId,
    ap: balance.apPerTurn,
    status: 'free',
    held: null,
    carriedBy: null,
  }));
  const items: Item[] = level.items.map((item) => ({
    id: item.id,
    kind: item.kind,
    cellId: item.cellId,
    carriedBy: null,
    installed: false,
  }));
  // Павук: випадкова активна лінія і випадкова наступна (інша, якщо allowSameLane = false)
  const first = randomInt(seed, level.lanes.length);
  const next = pickNextLane(first.rng, first.value, level.lanes.length, balance.allowSameLane);
  return {
    world,
    balance,
    round: 1,
    soldiers,
    items,
    cocoons: [],
    spider: { activeLane: first.value, nextLane: next.value },
    outcome: 'playing',
    seed,
    rng: next.rng,
  };
}

// Випадкова наступна лінія. Якщо allowSameLane = false, вона завжди відрізняється від активної:
// вибираємо серед решти ліній (їх на одну менше) і «перестрибуємо» через активну.
export function pickNextLane(rng: number, active: number, laneCount: number, allowSameLane: boolean) {
  if (allowSameLane || laneCount < 2) return randomInt(rng, laneCount);
  const r = randomInt(rng, laneCount - 1);
  return { value: r.value >= active ? r.value + 1 : r.value, rng: r.rng };
}

// Куди поставити солдатів на старті. У клітинці можна стояти не більше ніж maxPerCell,
// тому заповнюємо стартову клітинку, а решту ставимо в найближчі до неї (за кроками графа),
// спершу — у ті, яких павук не бачить з жодної лінії.
// ПРИПУЩЕННЯ (перевірити з Колею): у ТЗ одна стартова клітинка, а солдатів четверо.
export function startPlacement(world: World, count: number, maxPerCell: number): string[] {
  const placement: string[] = [];
  const visited = new Set<string>([world.level.startCell]);
  const queue = [world.level.startCell];
  while (placement.length < count && queue.length > 0) {
    const cellId = queue.shift()!;
    for (let i = 0; i < maxPerCell && placement.length < count; i++) placement.push(cellId);
    const safeFirst = [...world.cells[cellId].neighbors].sort(
      (a, b) => world.cells[a].exposedTo.length - world.cells[b].exposedTo.length,
    );
    for (const next of safeFirst) {
      if (!visited.has(next)) {
        visited.add(next);
        queue.push(next);
      }
    }
  }
  return placement;
}

// Скільки вільних солдатів стоїть у клітинці (кокони й ті, кого несуть, місця не займають)
export function freeSoldiersInCell(state: GameState, cellId: string): number {
  return state.soldiers.filter((s) => s.cellId === cellId && s.status === 'free' && s.carriedBy === null).length;
}

export function getSoldier(state: GameState, soldierId: string): Soldier | undefined {
  return state.soldiers.find((s) => s.id === soldierId);
}

export function getItem(state: GameState, itemId: string): Item | undefined {
  return state.items.find((i) => i.id === itemId);
}

export function getCocoon(state: GameState, cocoonId: string): Cocoon | undefined {
  return state.cocoons.find((c) => c.id === cocoonId);
}

// Клітинки, які павук бачить зараз (під активною лінією). Павучат додамо на етапі 5.
export function seenCells(state: GameState): Set<string> {
  return cellsUnderLane(state, state.spider.activeLane);
}

export function cellsUnderLane(state: GameState, lane: number): Set<string> {
  return new Set(Object.values(state.world.cells).filter((c) => c.exposedTo.includes(lane)).map((c) => c.id));
}

// Скільки солдатів ще можуть діяти (вільні — не в коконі й не мертві). Нуль — поразка.
export function freeSoldiersCount(state: GameState): number {
  return state.soldiers.filter((s) => s.status === 'free').length;
}

// У якій клітинці зараз предмет: якщо його несуть — там, де той, хто несе
export function itemCell(state: GameState, item: Item): string {
  if (item.carriedBy) return getSoldier(state, item.carriedBy)!.cellId;
  return item.cellId!;
}

// Стан турелі для панелі мети й для «Вогню»
export interface TurretStatus {
  partsInstalled: number;
  partsNeeded: number;
  repaired: boolean; // усі деталі на місці
  loaded: boolean; // патрон встановлено
  operatorReady: boolean; // у клітинці турелі є вільний солдат
}

export function turretStatus(state: GameState): TurretStatus {
  const parts = state.items.filter((i) => i.kind === 'part');
  const partsInstalled = parts.filter((i) => i.installed).length;
  return {
    partsInstalled,
    partsNeeded: parts.length,
    repaired: partsInstalled === parts.length,
    loaded: state.items.some((i) => i.kind === 'cartridge' && i.installed),
    operatorReady: freeSoldiersInCell(state, state.world.level.turretCell) > 0,
  };
}

// Клітинки, до яких не більше range кроків від from (сама from теж входить) — для кидка
export function cellsWithin(world: World, from: string, range: number): string[] {
  const dist = new Map<string, number>([[from, 0]]);
  const queue = [from];
  while (queue.length > 0) {
    const current = queue.shift()!;
    const d = dist.get(current)!;
    if (d === range) continue;
    for (const next of world.cells[current].neighbors) {
      if (!dist.has(next)) {
        dist.set(next, d + 1);
        queue.push(next);
      }
    }
  }
  return [...dist.keys()];
}
