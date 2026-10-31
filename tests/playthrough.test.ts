import { describe, expect, it } from 'vitest';
import balanceJson from '../data/balance.json';
import levelJson from '../data/level01.json';
import type { Balance } from '../src/core/balance';
import { apply, validate } from '../src/core/rules';
import { createInitialState, freeSoldiersInCell, getSoldier, type GameState } from '../src/core/state';
import type { Action, LevelData } from '../src/core/types';

const level = levelJson as LevelData;
const balance = balanceJson as Balance;

// Найкоротший шлях між клітинками (пошук у ширину), в обхід заповнених клітинок
function path(state: GameState, from: string, to: string): string[] {
  const prev = new Map<string, string | null>([[from, null]]);
  const queue = [from];
  while (queue.length) {
    const cur = queue.shift()!;
    if (cur === to) break;
    for (const n of state.world.cells[cur].neighbors) {
      if (prev.has(n) || freeSoldiersInCell(state, n) >= state.balance.maxSoldiersPerCell) continue;
      prev.set(n, cur);
      queue.push(n);
    }
  }
  if (!prev.has(to)) throw new Error(`Немає шляху з ${from} до ${to}`);
  const result: string[] = [];
  for (let c = to; c !== from; c = prev.get(c)!) result.unshift(c);
  return result;
}

describe('рівень level01 можна пройти (поки без ворогів)', () => {
  it('один солдат по черзі приносить усі предмети в турель і стріляє', () => {
    // Решту солдатів відводимо у стартовий кут, щоб не заступали прохід (cell_01 — єдиний вихід зі старту)
    const start = createInitialState(level, balance);
    let state: GameState = {
      ...start,
      soldiers: start.soldiers.map((s, i) => (i === 0 ? s : { ...s, cellId: ['cell_14', 'cell_14', 'cell_09'][i - 1] })),
    };
    let actions = 0;

    // Виконати дію; якщо закінчились AP — спершу «Кінець ходу»
    const act = (action: Action) => {
      if (getSoldier(state, 'soldier_1')!.ap === 0) state = apply(state, { type: 'endTurn' }).state;
      const check = validate(state, action);
      expect(check).toEqual({ ok: true });
      state = apply(state, action).state;
      actions++;
    };
    const walkTo = (cellId: string) => {
      for (const step of path(state, getSoldier(state, 'soldier_1')!.cellId, cellId)) {
        act({ type: 'move', soldierId: 'soldier_1', toCell: step });
      }
    };

    for (const item of level.items) {
      walkTo(item.cellId);
      act({ type: 'pickup', soldierId: 'soldier_1', target: { kind: 'item', id: item.id } });
      walkTo(level.turretCell); // предмет встановиться сам
    }
    act({ type: 'fire', soldierId: 'soldier_1' });

    expect(state.outcome).toBe('won');
    expect(state.items.every((i) => i.installed)).toBe(true);
    // Довідково: скільки дій і раундів знадобилось одному солдату
    expect(actions).toBeGreaterThan(5);
    expect(state.round).toBeGreaterThan(1);
  });
});
