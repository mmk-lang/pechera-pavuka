// Стан гри: усе, що змінюється під час партії (раунд, солдати), плюс посилання на незмінний світ.
// Стан ніколи не змінюється «на місці»: кожна дія створює новий об'єкт стану (див. rules.ts).
// Так легко зробити «Скасувати дію» і писати тести.

import type { Balance } from './balance';
import { buildCellGraph } from './graph';
import type { Cell, LevelData, Soldier } from './types';

// Світ — те, що не змінюється протягом партії: рівень і граф клітинок
export interface World {
  level: LevelData;
  cells: Record<string, Cell>;
}

export interface GameState {
  readonly world: World;
  readonly balance: Balance;
  readonly round: number; // номер раунду, починаємо з 1
  readonly soldiers: readonly Soldier[];
}

export function createWorld(level: LevelData, balance: Balance): World {
  return { level, cells: buildCellGraph(level.cells, balance.neighborsCount) };
}

// Початковий стан: солдати біля старту, у кожного повні AP
export function createInitialState(level: LevelData, balance: Balance): GameState {
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
  return { world, balance, round: 1, soldiers };
}

// Куди поставити солдатів на старті. У клітинці можна стояти не більше ніж maxPerCell,
// тому заповнюємо стартову клітинку, а решту ставимо в найближчі до неї (за кроками графа).
// ПРИПУЩЕННЯ (перевірити з Колею): у ТЗ одна стартова клітинка, а солдатів четверо.
export function startPlacement(world: World, count: number, maxPerCell: number): string[] {
  const placement: string[] = [];
  const visited = new Set<string>([world.level.startCell]);
  const queue = [world.level.startCell];
  while (placement.length < count && queue.length > 0) {
    const cellId = queue.shift()!;
    for (let i = 0; i < maxPerCell && placement.length < count; i++) placement.push(cellId);
    for (const next of world.cells[cellId].neighbors) {
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
