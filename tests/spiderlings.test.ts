import { describe, expect, it } from 'vitest';
import balanceJson from '../data/balance.json';
import levelJson from '../data/level01.json';
import type { Balance } from '../src/core/balance';
import { apply, validate } from '../src/core/rules';
import { moveSpiderlings } from '../src/core/spiderlings';
import { createInitialState, getItem, getSoldier, seenCells, type GameState } from '../src/core/state';
import type { Action, LevelData, Spiderling } from '../src/core/types';

const level = levelJson as LevelData;
const balance = balanceJson as Balance;

// Клітинки рівня, яких павук не бачить з жодної лінії. Сусіди (з графа level01):
//   cell_07 — cell_06, cell_08, cell_15;  cell_13 — cell_04, cell_10, cell_15
const HOME = 'cell_07'; // тут стоїть солдат 1
const PARK = ['cell_12', 'cell_14', 'cell_18']; // решта солдатів далеко від подій

function spiderling(cellId: string, facingCellId: string, id = 'spiderling_1'): Spiderling {
  return { id, cellId, facingCellId };
}

// Стан для тестів: солдат 1 у HOME, решта в PARK, павучата — задані, павук дивиться на лінію 0
function setup(spiderlings: Spiderling[], extra: Partial<GameState> = {}): GameState {
  const state = createInitialState(level, balance, 42);
  return {
    ...state,
    soldiers: state.soldiers.map((s, i) => ({ ...s, cellId: [HOME, ...PARK][i] })),
    spider: { activeLane: 0, nextLane: 2 },
    spiderlings,
    ...extra,
  };
}

function run(state: GameState, ...actions: Action[]): GameState {
  for (const action of actions) state = apply(state, action).state;
  return state;
}

const move = (toCell: string): Action => ({ type: 'move', soldierId: 'soldier_1', toCell });

describe('павучата: старт', () => {
  it('стоять не в стартовій клітинці, не в клітинці турелі, не біля солдатів і не дивляться на них', () => {
    for (let seed = 1; seed <= 50; seed++) {
      const state = createInitialState(level, balance, seed);
      expect(state.spiderlings.length).toBe(balance.spiderlings);
      const soldierCells = new Set(state.soldiers.map((s) => s.cellId));
      for (const s of state.spiderlings) {
        expect([level.startCell, level.turretCell]).not.toContain(s.cellId);
        expect(state.world.cells[s.cellId].neighbors).toContain(s.facingCellId);
        expect(soldierCells.has(s.cellId)).toBe(false);
        expect(soldierCells.has(s.facingCellId)).toBe(false);
      }
      // Кожне павуча в окремій клітинці
      expect(new Set(state.spiderlings.map((s) => s.cellId)).size).toBe(balance.spiderlings);
    }
  });
});

describe('павучата: рух', () => {
  it('завжди переходять на сусідню клітинку й дивляться на сусідню', () => {
    const world = createInitialState(level, balance, 42).world;
    let spiderlings = createInitialState(level, balance, 42).spiderlings;
    let rng = 7;
    for (let round = 0; round < 100; round++) {
      const result = moveSpiderlings(world, rng, spiderlings);
      result.spiderlings.forEach((s, i) => {
        expect(world.cells[spiderlings[i].cellId].neighbors).toContain(s.cellId);
        expect(world.cells[s.cellId].neighbors).toContain(s.facingCellId);
      });
      spiderlings = result.spiderlings;
      rng = result.rng;
    }
  });

  it('з тим самим seed павучата ходять однаково', () => {
    const path = (seed: number) => {
      const world = createInitialState(level, balance, seed).world;
      let { spiderlings } = createInitialState(level, balance, seed);
      let rng = seed;
      const cells: string[] = [];
      for (let i = 0; i < 10; i++) {
        ({ spiderlings, rng } = moveSpiderlings(world, rng, spiderlings));
        cells.push(...spiderlings.map((s) => `${s.cellId}>${s.facingCellId}`));
      }
      return cells;
    };
    expect(path(5)).toEqual(path(5));
    expect(path(5)).not.toEqual(path(6));
  });
});

describe('павучата: виявлення', () => {
  it('солдат, що зайшов у клітинку павучати, одразу стає коконом', () => {
    const state = run(setup([spiderling('cell_08', 'cell_06')]), move('cell_08'));
    expect(getSoldier(state, 'soldier_1')).toMatchObject({ status: 'cocooned', ap: 0, cellId: 'cell_08' });
  });

  it('солдат, що зайшов у клітинку, на яку дивиться павуча, одразу стає коконом; предмет падає', () => {
    let state = setup([spiderling('cell_13', 'cell_15')]);
    state = { ...state, items: state.items.map((it) => (it.id === 'part_1' ? { ...it, cellId: HOME } : it)) };
    state = run(state, { type: 'pickup', soldierId: 'soldier_1', target: { kind: 'item', id: 'part_1' } }, move('cell_15'));
    expect(getSoldier(state, 'soldier_1')).toMatchObject({ status: 'cocooned', ap: 0, held: null });
    expect(getItem(state, 'part_1')).toMatchObject({ cellId: 'cell_15', carriedBy: null });
  });

  it('павуча не бачить сусідню клітинку, на яку не дивиться', () => {
    const state = run(setup([spiderling('cell_13', 'cell_04')]), move('cell_15'));
    expect(getSoldier(state, 'soldier_1')!.status).toBe('free');
  });

  it('у ворожій фазі павучата спершу ходять, а потім перевірка: захоплено рівно тих, кого видно після ходу', () => {
    // Павуча поруч із солдатом; для різних seed воно то заходить до нього / дивиться на нього, то ні
    let captured = 0;
    let missed = 0;
    for (let rng = 1; rng <= 60; rng++) {
      const before = setup([spiderling('cell_08', 'cell_06')], { rng });
      const after = apply(before, { type: 'endTurn' }).state;
      const seen = seenCells(after).has(HOME);
      expect(getSoldier(after, 'soldier_1')!.status).toBe(seen ? 'cocooned' : 'free');
      if (seen) captured++;
      else missed++;
    }
    // Обидва випадки справді трапляються
    expect(captured).toBeGreaterThan(0);
    expect(missed).toBeGreaterThan(0);
  });
});

describe('павучата: вбивство предметом', () => {
  // Солдат 1 тримає деталь 1, павуча в сусідній клітинці дивиться не на нього
  function holding(extra: Partial<GameState> = {}): GameState {
    const base = setup([spiderling('cell_08', 'cell_06')], extra);
    const state = { ...base, items: base.items.map((it) => (it.id === 'part_1' ? { ...it, cellId: HOME } : it)) };
    return run(state, { type: 'pickup', soldierId: 'soldier_1', target: { kind: 'item', id: 'part_1' } });
  }

  it('предмет, кинутий у клітинку з павучам, вбиває його й лишається там', () => {
    const result = apply(holding(), { type: 'throw', soldierId: 'soldier_1', toCell: 'cell_08' });
    expect(result.state.spiderlings).toEqual([]);
    expect(getItem(result.state, 'part_1')).toMatchObject({ cellId: 'cell_08', carriedBy: null });
    expect(result.events).toContainEqual({
      type: 'spiderlingKilled',
      spiderlingId: 'spiderling_1',
      cellId: 'cell_08',
      itemId: 'part_1',
    });
    // Тепер туди можна безпечно піти
    const state = run(result.state, move('cell_08'));
    expect(getSoldier(state, 'soldier_1')!.status).toBe('free');
  });

  it('убите павуча не повертається в наступних раундах', () => {
    let state = run(holding(), { type: 'throw', soldierId: 'soldier_1', toCell: 'cell_08' });
    state = run(state, { type: 'endTurn' }, { type: 'endTurn' });
    expect(state.spiderlings).toEqual([]);
  });

  it('один предмет вбиває одне павуча, навіть якщо їх у клітинці двоє', () => {
    const state = run(
      holding({ spiderlings: [spiderling('cell_08', 'cell_06'), spiderling('cell_08', 'cell_06', 'spiderling_2')] }),
      { type: 'throw', soldierId: 'soldier_1', toCell: 'cell_08' },
    );
    expect(state.spiderlings.map((s) => s.id)).toEqual(['spiderling_2']);
  });

  it('якщо itemKillsSpiderling = false — павуча живе', () => {
    const base = holding();
    const state = run(
      { ...base, balance: { ...base.balance, itemKillsSpiderling: false } },
      { type: 'throw', soldierId: 'soldier_1', toCell: 'cell_08' },
    );
    expect(state.spiderlings.length).toBe(1);
  });

  it('кинутий у павуча солдат не вбиває його, а сам стає коконом', () => {
    let state = setup([spiderling('cell_08', 'cell_06')]);
    state = { ...state, soldiers: state.soldiers.map((s) => (s.id === 'soldier_2' ? { ...s, cellId: HOME } : s)) };
    state = run(
      state,
      { type: 'pickup', soldierId: 'soldier_1', target: { kind: 'soldier', id: 'soldier_2' } },
      { type: 'throw', soldierId: 'soldier_1', toCell: 'cell_08' },
    );
    expect(state.spiderlings.length).toBe(1);
    expect(getSoldier(state, 'soldier_2')!.status).toBe('cocooned');
  });
});

describe('ліміт клітинки', () => {
  it('павучата місця не займають: у клітинку з двома павучатами піти можна (хоч там і кокон)', () => {
    const state = setup([spiderling('cell_08', 'cell_06'), spiderling('cell_08', 'cell_06', 'spiderling_2')]);
    expect(validate(state, move('cell_08'))).toEqual({ ok: true });
  });
});
