import { describe, expect, it } from 'vitest';
import balanceJson from '../data/balance.json';
import levelJson from '../data/level01.json';
import type { Balance } from '../src/core/balance';
import { apply, pickupOptions, throwTargets, validate } from '../src/core/rules';
import { createInitialState, getItem, getSoldier, turretStatus, type GameState } from '../src/core/state';
import type { Action, LevelData } from '../src/core/types';

const level = levelJson as LevelData;
const balance = balanceJson as Balance;
const TURRET = level.turretCell;

// Допоміжне: солдати в заданих клітинках, предмети — у заданих клітинках (або як у рівні)
function setup(soldierCells: string[], itemCells: Record<string, string> = {}): GameState {
  const state = createInitialState(level, balance, 42);
  return {
    ...state,
    soldiers: state.soldiers.map((s, i) => ({ ...s, cellId: soldierCells[i] ?? s.cellId })),
    items: state.items.map((it) => (itemCells[it.id] ? { ...it, cellId: itemCells[it.id] } : it)),
  };
}

// Виконати кілька дій поспіль (кожна має бути дозволена)
function run(state: GameState, ...actions: Action[]): GameState {
  for (const action of actions) state = apply(state, action).state;
  return state;
}

const A = 'cell_01';
const near = (cellId: string) => createInitialState(level, balance, 42).world.cells[cellId].neighbors;

describe('підняти й кинути предмет', () => {
  it('солдат піднімає предмет у своїй клітинці (1 AP) і кидає на сусідню', () => {
    let state = setup([A, 'cell_20', 'cell_20', 'cell_13'], { part_1: A });
    state = run(state, { type: 'pickup', soldierId: 'soldier_1', target: { kind: 'item', id: 'part_1' } });
    expect(getSoldier(state, 'soldier_1')!.held).toEqual({ kind: 'item', id: 'part_1' });
    expect(getItem(state, 'part_1')).toMatchObject({ cellId: null, carriedBy: 'soldier_1' });
    expect(getSoldier(state, 'soldier_1')!.ap).toBe(2);

    const to = near(A)[0];
    state = run(state, { type: 'throw', soldierId: 'soldier_1', toCell: to });
    expect(getSoldier(state, 'soldier_1')!.held).toBeNull();
    expect(getItem(state, 'part_1')).toMatchObject({ cellId: to, carriedBy: null });
    expect(getSoldier(state, 'soldier_1')!.ap).toBe(1);
  });

  it('предмет в іншій клітинці підняти не можна', () => {
    const state = setup([A, 'cell_20', 'cell_20', 'cell_13'], { part_1: 'cell_05' });
    expect(validate(state, { type: 'pickup', soldierId: 'soldier_1', target: { kind: 'item', id: 'part_1' } })).toEqual({
      ok: false,
      reason: 'targetNotHere',
    });
  });

  it('з повними руками піднімати не можна', () => {
    let state = setup([A, 'cell_20', 'cell_20', 'cell_13'], { part_1: A, part_2: A });
    state = run(state, { type: 'pickup', soldierId: 'soldier_1', target: { kind: 'item', id: 'part_1' } });
    expect(validate(state, { type: 'pickup', soldierId: 'soldier_1', target: { kind: 'item', id: 'part_2' } })).toEqual({
      ok: false,
      reason: 'handsFull',
    });
  });

  it('кидати нічого — відмова; далі сусідньої клітинки — відмова', () => {
    let state = setup([A, 'cell_20', 'cell_20', 'cell_13'], { part_1: A });
    expect(validate(state, { type: 'throw', soldierId: 'soldier_1', toCell: A })).toEqual({ ok: false, reason: 'handsEmpty' });
    state = run(state, { type: 'pickup', soldierId: 'soldier_1', target: { kind: 'item', id: 'part_1' } });
    const far = level.cells.find((c) => c.id !== A && !near(A).includes(c.id))!.id;
    expect(validate(state, { type: 'throw', soldierId: 'soldier_1', toCell: far })).toEqual({ ok: false, reason: 'tooFar' });
    // У межах кидка — власна клітинка й сусідні
    expect(throwTargets(state, 'soldier_1').sort()).toEqual([A, ...near(A)].sort());
  });

  it('предмет їде разом із солдатом, який його несе', () => {
    let state = setup([A, 'cell_20', 'cell_20', 'cell_13'], { part_1: A });
    const to = near(A)[0];
    state = run(
      state,
      { type: 'pickup', soldierId: 'soldier_1', target: { kind: 'item', id: 'part_1' } },
      { type: 'move', soldierId: 'soldier_1', toCell: to },
      { type: 'throw', soldierId: 'soldier_1', toCell: to },
    );
    expect(getItem(state, 'part_1')!.cellId).toBe(to);
  });
});

describe('підняти й кинути солдата', () => {
  it('солдата можна підняти разом із його предметом, він переміщується з носієм', () => {
    let state = setup([A, A, 'cell_20', 'cell_13'], { part_1: A });
    const to = near(A)[0];
    state = run(
      state,
      { type: 'pickup', soldierId: 'soldier_2', target: { kind: 'item', id: 'part_1' } },
      { type: 'pickup', soldierId: 'soldier_1', target: { kind: 'soldier', id: 'soldier_2' } },
      { type: 'move', soldierId: 'soldier_1', toCell: to },
    );
    expect(getSoldier(state, 'soldier_2')).toMatchObject({ carriedBy: 'soldier_1', cellId: to });
    expect(getItem(state, 'part_1')!.carriedBy).toBe('soldier_2'); // предмет досі в руках у солдата 2
  });

  it('солдат, якого несуть, не діє', () => {
    let state = setup([A, A, 'cell_20', 'cell_13']);
    state = run(state, { type: 'pickup', soldierId: 'soldier_1', target: { kind: 'soldier', id: 'soldier_2' } });
    expect(validate(state, { type: 'move', soldierId: 'soldier_2', toCell: near(A)[0] })).toEqual({
      ok: false,
      reason: 'soldierCarried',
    });
  });

  it('солдата, який сам несе солдата, піднімати не можна', () => {
    // 1 і 2 стоять разом, 1 піднімає 2. Потім 3 приходить у ту саму клітинку й пробує підняти 1.
    const from = near(A)[0];
    let state = setup([A, A, from, 'cell_13']);
    state = run(
      state,
      { type: 'pickup', soldierId: 'soldier_1', target: { kind: 'soldier', id: 'soldier_2' } },
      { type: 'move', soldierId: 'soldier_3', toCell: A },
    );
    expect(validate(state, { type: 'pickup', soldierId: 'soldier_3', target: { kind: 'soldier', id: 'soldier_1' } })).toEqual({
      ok: false,
      reason: 'targetCarrying',
    });
    expect(pickupOptions(state, 'soldier_3')).toEqual([]);
  });

  it('кинутий солдат приземляється живим, з тими самими AP і з місцем у клітинці', () => {
    const to = near(A)[0];
    let state = setup([A, A, 'cell_20', 'cell_13']);
    state = run(
      state,
      { type: 'pickup', soldierId: 'soldier_1', target: { kind: 'soldier', id: 'soldier_2' } },
      { type: 'throw', soldierId: 'soldier_1', toCell: to },
    );
    expect(getSoldier(state, 'soldier_2')).toMatchObject({ cellId: to, carriedBy: null, status: 'free', ap: 3 });
  });

  it('кинути солдата в заповнену клітинку не можна', () => {
    const to = near(A)[0];
    let state = setup([A, A, to, to]);
    state = run(state, { type: 'pickup', soldierId: 'soldier_1', target: { kind: 'soldier', id: 'soldier_2' } });
    expect(validate(state, { type: 'throw', soldierId: 'soldier_1', toCell: to })).toEqual({ ok: false, reason: 'cellFull' });
  });
});

describe('турель і вогонь', () => {
  const turretNeighbor = near(TURRET)[0];

  it('предмет, принесений у клітинку турелі, встановлюється сам і звільняє руки', () => {
    let state = setup([turretNeighbor, 'cell_20', 'cell_20', 'cell_13'], { part_1: turretNeighbor });
    state = run(
      state,
      { type: 'pickup', soldierId: 'soldier_1', target: { kind: 'item', id: 'part_1' } },
      { type: 'move', soldierId: 'soldier_1', toCell: TURRET },
    );
    expect(getItem(state, 'part_1')).toMatchObject({ installed: true, cellId: TURRET, carriedBy: null });
    expect(getSoldier(state, 'soldier_1')!.held).toBeNull();
    expect(turretStatus(state).partsInstalled).toBe(1);
  });

  it('предмет, кинутий у клітинку турелі, теж встановлюється; встановлений підняти не можна', () => {
    let state = setup([turretNeighbor, 'cell_20', 'cell_20', 'cell_13'], { cartridge: turretNeighbor });
    state = run(
      state,
      { type: 'pickup', soldierId: 'soldier_1', target: { kind: 'item', id: 'cartridge' } },
      { type: 'throw', soldierId: 'soldier_1', toCell: TURRET },
    );
    expect(turretStatus(state).loaded).toBe(true);
    expect(pickupOptions(state, 'soldier_1')).toEqual([]);
  });

  // Стан, де встановлено задані предмети, а солдат 1 стоїть у турелі
  function turretWith(installed: string[], operatorCell = TURRET): GameState {
    const state = setup([operatorCell, 'cell_20', 'cell_20', 'cell_13']);
    return {
      ...state,
      items: state.items.map((it) => (installed.includes(it.id) ? { ...it, installed: true, cellId: TURRET } : it)),
    };
  }
  const allParts = ['part_1', 'part_2', 'part_3', 'part_4'];
  const fire: Action = { type: 'fire', soldierId: 'soldier_1' };

  it('без 4 деталей — «Вогонь» відхиляється', () => {
    expect(validate(turretWith(['part_1', 'part_2', 'part_3', 'cartridge']), fire)).toEqual({
      ok: false,
      reason: 'turretNotRepaired',
    });
  });

  it('без патрона — «Вогонь» відхиляється', () => {
    expect(validate(turretWith(allParts), fire)).toEqual({ ok: false, reason: 'turretNotLoaded' });
  });

  it('без оператора в клітинці турелі — «Вогонь» відхиляється', () => {
    expect(validate(turretWith([...allParts, 'cartridge'], turretNeighbor), fire)).toEqual({
      ok: false,
      reason: 'notAtTurret',
    });
  });

  it('за повного комплекту — перемога, і більше нічого робити не можна', () => {
    const result = apply(turretWith([...allParts, 'cartridge']), fire);
    expect(result.state.outcome).toBe('won');
    expect(result.events).toContainEqual({ type: 'won' });
    expect(validate(result.state, { type: 'endTurn' })).toEqual({ ok: false, reason: 'gameOver' });
  });
});
