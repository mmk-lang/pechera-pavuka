import { describe, expect, it } from 'vitest';
import balanceJson from '../data/balance.json';
import levelJson from '../data/level01.json';
import type { Balance } from '../src/core/balance';
import { buildCellGraph } from '../src/core/graph';
import { anyApLeft, apply, reachableCells, validate } from '../src/core/rules';
import { createInitialState, freeSoldiersInCell, type GameState } from '../src/core/state';
import type { LevelData } from '../src/core/types';

const level = levelJson as LevelData;
// Без павучат: тут перевіряємо інші правила (павучат — у spiderlings.test.ts)
const balance: Balance = { ...(balanceJson as Balance), spiderlings: 0 };

// Допоміжне: ставимо солдатів у потрібні клітинки (решта полів — як на старті)
function stateWith(cells: string[]): GameState {
  const state = createInitialState(level, balance, 42);
  return { ...state, soldiers: state.soldiers.map((s, i) => ({ ...s, cellId: cells[i] ?? s.cellId })) };
}

describe('граф клітинок', () => {
  const cells = buildCellGraph(level.cells, balance.neighborsCount);

  it('зв\'язки двосторонні й без петель', () => {
    for (const cell of Object.values(cells)) {
      expect(cell.neighbors).not.toContain(cell.id);
      for (const n of cell.neighbors) expect(cells[n].neighbors).toContain(cell.id);
    }
  });

  it('у кожної клітинки щонайменше neighborsCount сусідів', () => {
    for (const cell of Object.values(cells)) {
      expect(cell.neighbors.length).toBeGreaterThanOrEqual(balance.neighborsCount);
    }
  });

  it('граф зв\'язний: з першої клітинки можна дійти до всіх', () => {
    const seen = new Set([level.cells[0].id]);
    const queue = [level.cells[0].id];
    while (queue.length) for (const n of cells[queue.shift()!].neighbors) if (!seen.has(n)) seen.add(n), queue.push(n);
    expect(seen.size).toBe(level.cells.length);
  });

  it('острови з\'єднуються, навіть якщо k = 1', () => {
    const sparse = buildCellGraph(level.cells, 1);
    const seen = new Set([level.cells[0].id]);
    const queue = [level.cells[0].id];
    while (queue.length) for (const n of sparse[queue.shift()!].neighbors) if (!seen.has(n)) seen.add(n), queue.push(n);
    expect(seen.size).toBe(level.cells.length);
  });
});

describe('старт', () => {
  it('4 солдати з повними AP, не більше двох у клітинці, двоє — на старті', () => {
    const state = createInitialState(level, balance, 42);
    expect(state.soldiers.length).toBe(balance.soldiers);
    expect(state.soldiers.every((s) => s.ap === balance.apPerTurn)).toBe(true);
    for (const s of state.soldiers) {
      expect(freeSoldiersInCell(state, s.cellId)).toBeLessThanOrEqual(balance.maxSoldiersPerCell);
    }
    expect(freeSoldiersInCell(state, level.startCell)).toBe(balance.maxSoldiersPerCell);
  });
});

describe('рух', () => {
  it('на сусідню клітинку — можна, AP зменшується на 1', () => {
    const state = createInitialState(level, balance, 42);
    const s = state.soldiers[0];
    const to = state.world.cells[s.cellId].neighbors.find((c) => freeSoldiersInCell(state, c) === 0 && state.world.cells[c].exposedTo.length === 0)!;
    const result = apply(state, { type: 'move', soldierId: s.id, toCell: to });
    const moved = result.state.soldiers[0];
    expect(moved.cellId).toBe(to);
    expect(moved.ap).toBe(balance.apPerTurn - 1);
    expect(result.events).toEqual([{ type: 'moved', soldierId: s.id, fromCell: s.cellId, toCell: to }]);
  });

  it('старий стан не змінюється', () => {
    const state = createInitialState(level, balance, 42);
    const s = state.soldiers[0];
    const to = state.world.cells[s.cellId].neighbors.find((c) => freeSoldiersInCell(state, c) === 0 && state.world.cells[c].exposedTo.length === 0)!;
    apply(state, { type: 'move', soldierId: s.id, toCell: to });
    expect(state.soldiers[0].cellId).toBe(s.cellId);
    expect(state.soldiers[0].ap).toBe(balance.apPerTurn);
  });

  it('на не сусідню клітинку — відмова', () => {
    const state = createInitialState(level, balance, 42);
    const s = state.soldiers[0];
    const far = level.cells.find((c) => c.id !== s.cellId && !state.world.cells[s.cellId].neighbors.includes(c.id))!;
    expect(validate(state, { type: 'move', soldierId: s.id, toCell: far.id })).toEqual({
      ok: false,
      reason: 'notNeighbor',
    });
  });

  it('четверта дія за хід — відмова «немає AP»', () => {
    // Один солдат ходить туди-сюди між двома порожніми клітинками
    const a = 'cell_01';
    const b = createInitialState(level, balance, 42).world.cells[a].neighbors[0];
    let state = stateWith([a, 'cell_20', 'cell_13', 'cell_13']);
    for (const to of [b, a, b]) state = apply(state, { type: 'move', soldierId: 'soldier_1', toCell: to }).state;
    expect(state.soldiers[0].ap).toBe(0);
    expect(validate(state, { type: 'move', soldierId: 'soldier_1', toCell: a })).toEqual({ ok: false, reason: 'noAp' });
  });

  it('у клітинку, де вже двоє вільних солдатів, — відмова «клітинка заповнена»', () => {
    const base = createInitialState(level, balance, 42);
    const target = 'cell_01';
    const from = base.world.cells[target].neighbors[0];
    const state = stateWith([from, target, target, 'cell_20']);
    expect(validate(state, { type: 'move', soldierId: 'soldier_1', toCell: target })).toEqual({
      ok: false,
      reason: 'cellFull',
    });
    expect(reachableCells(state, 'soldier_1')).not.toContain(target);
  });

  it('солдат у коконі ходити не може', () => {
    const state = createInitialState(level, balance, 42);
    const cocooned = { ...state, soldiers: state.soldiers.map((s, i) => (i === 0 ? { ...s, status: 'cocooned' as const } : s)) };
    const to = state.world.cells[state.soldiers[0].cellId].neighbors[0];
    expect(validate(cocooned, { type: 'move', soldierId: 'soldier_1', toCell: to })).toEqual({
      ok: false,
      reason: 'soldierNotFree',
    });
  });
});

describe('кінець ходу', () => {
  it('новий раунд і повні AP усім вільним солдатам', () => {
    let state = stateWith(['cell_01', 'cell_20', 'cell_13', 'cell_13']);
    const to = state.world.cells.cell_01.neighbors[0];
    state = apply(state, { type: 'move', soldierId: 'soldier_1', toCell: to }).state;
    const result = apply(state, { type: 'endTurn' });
    expect(result.state.round).toBe(2);
    expect(result.state.soldiers.every((s) => s.ap === balance.apPerTurn)).toBe(true);
    expect(result.events).toContainEqual({ type: 'roundStarted', round: 2 });
  });

  it('anyApLeft бачить, що всі AP витрачені', () => {
    const state = createInitialState(level, balance, 42);
    expect(anyApLeft(state)).toBe(true);
    const spent = { ...state, soldiers: state.soldiers.map((s) => ({ ...s, ap: 0 })) };
    expect(anyApLeft(spent)).toBe(false);
  });
});
