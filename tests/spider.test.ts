import { describe, expect, it } from 'vitest';
import balanceJson from '../data/balance.json';
import levelJson from '../data/level01.json';
import type { Balance } from '../src/core/balance';
import { validateLevel } from '../src/core/level';
import { apply, unwrapOptions, validate } from '../src/core/rules';
import { createInitialState, getCocoon, getItem, getSoldier, type GameState } from '../src/core/state';
import type { Action, Cocoon, LevelData } from '../src/core/types';
import { computeExposure } from '../src/core/visibility';

const level = levelJson as LevelData;
const balance = balanceJson as Balance;

// Клітинки рівня, яких павук не бачить з жодної лінії
const SAFE = level.cells.filter((c) => c.exposedTo.length === 0).map((c) => c.id);
const [S1, S2, S3, S4] = ['cell_13', 'cell_15', 'cell_07', 'cell_08']; // безпечні, сусідять між собою
// cell_10 видно лише з лінії 1, а cell_15 — її безпечна сусідка
const EXPOSED = 'cell_10';
const EXPOSED_LANE = 1;

// Стан для тестів: солдати в заданих клітинках, павук дивиться на задані лінії
function setup(soldierCells: string[], active = 0, next = 2, extra: Partial<GameState> = {}): GameState {
  const state = createInitialState(level, balance, 123);
  return {
    ...state,
    soldiers: state.soldiers.map((s, i) => ({ ...s, cellId: soldierCells[i] })),
    spider: { activeLane: active, nextLane: next },
    ...extra,
  };
}

function run(state: GameState, ...actions: Action[]): GameState {
  for (const action of actions) state = apply(state, action).state;
  return state;
}

const endTurn: Action = { type: 'endTurn' };

describe('видимість', () => {
  // Маленький «рівень» для перевірки геометрії: павук у (0, 0), одна лінія прямо вперед
  const tiny: LevelData = {
    ...level,
    spider: { x: 0, z: 0 },
    lanes: [{ id: 0, angleDeg: 0, halfWidthDeg: 30 }],
    rocks: [{ id: 'r', x: 2, z: 5, radius: 1, height: 1 }],
    cells: [
      { id: 'behind', x: 4, z: 10, rockId: 'r', exposedTo: [] }, // у секторі, прямо за каменем
      { id: 'open', x: -3, z: 10, rockId: 'r', exposedTo: [] }, // у секторі, камінь не заважає
      { id: 'aside', x: 10, z: 4, rockId: 'r', exposedTo: [] }, // поза сектором (~68°)
    ],
  };

  it('клітинка за каменем не під оглядом, відкрита в секторі — під оглядом, поза сектором — ні', () => {
    expect(computeExposure(tiny)).toEqual({ behind: [], open: [0], aside: [] });
  });

  it('exposedTo у level01 збігається з геометрією, і кожна клітинка видна не більше ніж з двох ліній', () => {
    expect(validateLevel(level).filter((p) => p.code === 'exposedMismatch')).toEqual([]);
    for (const cell of level.cells) expect(cell.exposedTo.length).toBeLessThanOrEqual(2);
  });

  it('стартова клітинка й турель — безпечні', () => {
    expect(SAFE).toContain(level.startCell);
    expect(SAFE).toContain(level.turretCell);
  });
});

describe('павук', () => {
  it('після раунду активною стає показана лінія, а нова наступна — інша', () => {
    let state = setup([S1, S1, S2, S2]);
    for (let i = 0; i < 30; i++) {
      const shown = state.spider.nextLane;
      state = run(state, endTurn);
      expect(state.spider.activeLane).toBe(shown);
      expect(state.spider.nextLane).not.toBe(state.spider.activeLane);
    }
  });

  it('з тим самим seed послідовність ліній повторюється', () => {
    const lanes = (seed: number) => {
      let state = createInitialState(level, balance, seed);
      state = { ...state, soldiers: state.soldiers.map((s, i) => ({ ...s, cellId: [S1, S1, S2, S2][i] })) };
      const seq = [state.spider.activeLane, state.spider.nextLane];
      for (let i = 0; i < 20; i++) seq.push((state = run(state, endTurn)).spider.nextLane);
      return seq;
    };
    expect(lanes(777)).toEqual(lanes(777));
    expect(lanes(777)).not.toEqual(lanes(778));
  });
});

describe('виявлення', () => {
  it('солдат, що посеред ходу зайшов під активну лінію, одразу стає коконом; предмет падає, AP згорає', () => {
    let state = setup([S2, S1, S3, S4], EXPOSED_LANE, 0);
    state = { ...state, items: state.items.map((it) => (it.id === 'part_1' ? { ...it, cellId: S2 } : it)) };
    state = run(
      state,
      { type: 'pickup', soldierId: 'soldier_1', target: { kind: 'item', id: 'part_1' } },
      { type: 'move', soldierId: 'soldier_1', toCell: EXPOSED },
    );
    expect(getSoldier(state, 'soldier_1')).toMatchObject({ status: 'cocooned', ap: 0, held: null, cellId: EXPOSED });
    expect(getCocoon(state, 'cocoon_soldier_1')).toMatchObject({ cellId: EXPOSED, turnsLeft: 3, fresh: true });
    expect(getItem(state, 'part_1')).toMatchObject({ cellId: EXPOSED, carriedBy: null });
    // Солдат у коконі не діє
    expect(validate(state, { type: 'move', soldierId: 'soldier_1', toCell: S2 })).toEqual({
      ok: false,
      reason: 'soldierNotFree',
    });
  });

  it('у ворожій фазі павук замотує солдата, якого побачила нова лінія', () => {
    let state = setup([EXPOSED, S1, S3, S4], 0, EXPOSED_LANE);
    state = run(state, endTurn);
    expect(getSoldier(state, 'soldier_1')!.status).toBe('cocooned');
    expect(getCocoon(state, 'cocoon_soldier_1')).toMatchObject({ turnsLeft: 3, fresh: false });
  });

  it('солдат, якого несуть, теж стає коконом разом із носієм', () => {
    let state = setup([S2, S2, S3, S4], EXPOSED_LANE, 0);
    state = run(
      state,
      { type: 'pickup', soldierId: 'soldier_1', target: { kind: 'soldier', id: 'soldier_2' } },
      { type: 'move', soldierId: 'soldier_1', toCell: EXPOSED },
    );
    expect(getSoldier(state, 'soldier_1')!.status).toBe('cocooned');
    expect(getSoldier(state, 'soldier_2')).toMatchObject({ status: 'cocooned', carriedBy: null });
  });
});

describe('кокони', () => {
  // Кокон із солдатом 1 у клітинці cellId (fresh — з'явився в цьому ході гравця)
  function withCocoon(state: GameState, cellId: string, turnsLeft = 3, fresh = true): GameState {
    const cocoon: Cocoon = { id: 'cocoon_soldier_1', soldierId: 'soldier_1', cellId, turnsLeft, carriedBy: null, fresh };
    return {
      ...state,
      soldiers: state.soldiers.map((s) => (s.id === 'soldier_1' ? { ...s, status: 'cocooned', ap: 0, cellId } : s)),
      cocoons: [cocoon],
    };
  }
  const unwrap: Action = { type: 'unwrap', soldierId: 'soldier_2', cocoonId: 'cocoon_soldier_1' };

  it('розмотування коштує 1 AP і не потребує піднімання; врятований одразу має 3 AP', () => {
    let state = withCocoon(setup([S1, S1, S3, S4]), S1);
    expect(unwrapOptions(state, 'soldier_2')).toEqual(['cocoon_soldier_1']);
    state = run(state, unwrap);
    expect(state.cocoons).toEqual([]);
    expect(getSoldier(state, 'soldier_1')).toMatchObject({ status: 'free', ap: 3, cellId: S1 });
    expect(getSoldier(state, 'soldier_2')!.ap).toBe(2);
  });

  it('розмотати не можна, якщо в клітинці вже двоє вільних солдатів', () => {
    const state = withCocoon(setup([S1, S1, S1, S4]), S1);
    expect(validate(state, unwrap)).toEqual({ ok: false, reason: 'cellFull' });
  });

  it('якщо unwrapRequiresPickup = true — спершу треба підняти кокон', () => {
    const base = withCocoon(setup([S1, S1, S3, S4]), S1);
    const state = { ...base, balance: { ...base.balance, unwrapRequiresPickup: true } };
    expect(validate(state, unwrap)).toEqual({ ok: false, reason: 'mustPickUp' });
    const holding = run(state, { type: 'pickup', soldierId: 'soldier_2', target: { kind: 'cocoon', id: 'cocoon_soldier_1' } });
    expect(validate(holding, unwrap)).toEqual({ ok: true });
  });

  it('кокон можна підняти й перенести: солдат усередині переміщується разом із ним', () => {
    let state = withCocoon(setup([S1, S1, S3, S4]), S1);
    state = run(
      state,
      { type: 'pickup', soldierId: 'soldier_2', target: { kind: 'cocoon', id: 'cocoon_soldier_1' } },
      { type: 'move', soldierId: 'soldier_2', toCell: S2 },
    );
    expect(getCocoon(state, 'cocoon_soldier_1')).toMatchObject({ cellId: S2, carriedBy: 'soldier_2' });
    expect(getSoldier(state, 'soldier_1')!.cellId).toBe(S2);
  });

  // Раунд N — коли замотали. Солдат 1 у коконі, решта стоять у безпечних клітинках.
  it('замотаний посеред ходу N гине наприкінці раунду N+3, якщо його не врятувати', () => {
    let state = withCocoon(setup([S1, S1, S3, S4]), S1); // раунд 1 = N
    state = run(state, endTurn, endTurn, endTurn); // кінці раундів N, N+1, N+2
    expect(state.round).toBe(4); // раунд N+3
    expect(getSoldier(state, 'soldier_1')!.status).toBe('cocooned');
    expect(getCocoon(state, 'cocoon_soldier_1')!.turnsLeft).toBe(1);
    const result = apply(state, endTurn); // кінець раунду N+3
    expect(getSoldier(result.state, 'soldier_1')!.status).toBe('dead');
    expect(result.state.cocoons).toEqual([]);
    expect(result.events).toContainEqual({ type: 'died', soldierId: 'soldier_1' });
  });

  it('порятунок у раунді N+3 (до «Кінця ходу») встигає', () => {
    let state = withCocoon(setup([S1, S1, S3, S4]), S1);
    state = run(state, endTurn, endTurn, endTurn, unwrap, endTurn);
    expect(getSoldier(state, 'soldier_1')!.status).toBe('free');
  });

  it('замотаний у ворожій фазі раунду N теж гине наприкінці N+3', () => {
    let state = setup([EXPOSED, S1, S3, S4], 0, EXPOSED_LANE);
    state = run(state, endTurn); // ворожа фаза раунду N=1 → кокон; тепер раунд 2
    state = run(state, endTurn, endTurn); // кінці раундів 2, 3
    expect(getSoldier(state, 'soldier_1')!.status).toBe('cocooned');
    state = run(state, endTurn); // кінець раунду 4 = N+3
    expect(getSoldier(state, 'soldier_1')!.status).toBe('dead');
  });
});

describe('поразка', () => {
  it('коли не лишилось жодного вільного солдата — поразка', () => {
    const base = setup([EXPOSED, S1, S3, S4], EXPOSED_LANE, 0);
    // Троє вже мертві, останній іде під погляд павука
    let state: GameState = {
      ...base,
      soldiers: base.soldiers.map((s, i) => (i === 0 ? { ...s, cellId: S2 } : { ...s, status: 'dead' as const })),
    };
    const result = apply(state, { type: 'move', soldierId: 'soldier_1', toCell: EXPOSED });
    state = result.state;
    expect(state.outcome).toBe('lost');
    expect(result.events).toContainEqual({ type: 'lost' });
    expect(validate(state, endTurn)).toEqual({ ok: false, reason: 'gameOver' });
  });

  it('поки є хоч один вільний солдат — гра триває', () => {
    const state = run(setup([S1, S1, S3, S4]), endTurn);
    expect(state.outcome).toBe('playing');
  });
});
