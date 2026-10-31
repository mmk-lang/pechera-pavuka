import { describe, expect, it } from 'vitest';
import balanceJson from '../data/balance.json';
import levelJson from '../data/level01.json';
import type { Balance } from '../src/core/balance';
import { apply, validate } from '../src/core/rules';
import { cellsUnderLane, createInitialState, freeSoldiersInCell, getSoldier, type GameState } from '../src/core/state';
import type { Action, LevelData } from '../src/core/types';

const level = levelJson as LevelData;
const balance = balanceJson as Balance;

// Небезпечні зараз клітинки: під активною лінією (захоплять одразу)
// і під наступною (захоплять наприкінці раунду, якщо там лишитись)
function dangerous(state: GameState): Set<string> {
  return new Set([...cellsUnderLane(state, state.spider.activeLane), ...cellsUnderLane(state, state.spider.nextLane)]);
}

// Найкоротший безпечний шлях (пошук у ширину) в обхід небезпечних і заповнених клітинок.
// null — шляху зараз немає.
function safePath(state: GameState, from: string, to: string): string[] | null {
  const danger = dangerous(state);
  const prev = new Map<string, string>([[from, from]]);
  const queue = [from];
  while (queue.length) {
    const cur = queue.shift()!;
    if (cur === to) break;
    for (const n of state.world.cells[cur].neighbors) {
      if (prev.has(n) || danger.has(n) || freeSoldiersInCell(state, n) >= state.balance.maxSoldiersPerCell) continue;
      prev.set(n, cur);
      queue.push(n);
    }
  }
  if (!prev.has(to)) return null;
  const result: string[] = [];
  for (let c = to; c !== from; c = prev.get(c)!) result.unshift(c);
  return result;
}

describe('рівень level01 можна пройти, обходячи погляд павука', () => {
  // Кілька різних seed — щоб перевірити, що рівень проходиться за різних поворотів павука
  for (const seed of [1, 7, 42, 2026]) {
    it(`seed ${seed}: один солдат приносить усі предмети в турель і стріляє`, () => {
      // Решту солдатів відводимо в безпечні клітинки стартового кута, щоб не заступали прохід
      const start = createInitialState(level, balance, seed);
      let state: GameState = {
        ...start,
        soldiers: start.soldiers.map((s, i) => (i === 0 ? s : { ...s, cellId: ['cell_14', 'cell_14', 'cell_09'][i - 1] })),
      };
      const me = () => getSoldier(state, 'soldier_1')!;

      const act = (action: Action) => {
        expect(validate(state, action)).toEqual({ ok: true });
        state = apply(state, action).state;
        expect(me().status).toBe('free'); // павук нашого солдата так і не побачив
      };
      // Кінець ходу. Після ворожої фази нова наступна лінія може дивитись на клітинку солдата —
      // тоді одразу відходимо в безпечну сусідню (AP щойно поновились).
      const endTurn = () => {
        act({ type: 'endTurn' });
        if (dangerous(state).has(me().cellId)) {
          const escape = state.world.cells[me().cellId].neighbors.find(
            (n) => !dangerous(state).has(n) && freeSoldiersInCell(state, n) < state.balance.maxSoldiersPerCell,
          );
          expect(escape).toBeDefined();
          act({ type: 'move', soldierId: 'soldier_1', toCell: escape! });
        }
      };

      // Іти до клітинки крок за кроком. Якщо безпечного шляху немає або скінчились AP — чекаємо раунд.
      const walkTo = (cellId: string) => {
        for (let guard = 0; me().cellId !== cellId; guard++) {
          expect(guard).toBeLessThan(200);
          const path = safePath(state, me().cellId, cellId);
          if (!path || me().ap === 0) {
            endTurn();
            continue;
          }
          act({ type: 'move', soldierId: 'soldier_1', toCell: path[0] });
        }
      };
      const withAp = (action: Action) => {
        if (me().ap === 0) endTurn();
        act(action);
      };

      for (const item of level.items) {
        // Дійти до предмета й мати AP, щоб його підняти. Якщо на кінці ходу довелося відійти
        // (клітинку предмета от-от побачить павук) — повертаємось знову.
        do {
          walkTo(item.cellId);
          if (me().ap === 0) endTurn();
        } while (me().cellId !== item.cellId);
        act({ type: 'pickup', soldierId: 'soldier_1', target: { kind: 'item', id: item.id } });
        walkTo(level.turretCell); // предмет встановиться сам
      }
      withAp({ type: 'fire', soldierId: 'soldier_1' });

      expect(state.outcome).toBe('won');
      expect(state.items.every((i) => i.installed)).toBe(true);
    });
  }
});
