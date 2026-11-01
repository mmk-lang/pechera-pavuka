import { describe, expect, it } from 'vitest';
import balanceJson from '../data/balance.json';
import levelJson from '../data/level01.json';
import type { Balance } from '../src/core/balance';
import { cellRisks, riskText } from '../src/core/risk';
import { apply, isUndoable } from '../src/core/rules';
import { createInitialState, seenCells, type GameState } from '../src/core/state';
import type { Action, Cocoon, LevelData } from '../src/core/types';
import { currentHint } from '../src/ui/hints';
import { optionsToSearch, readOptions } from '../src/ui/options';

const level = levelJson as LevelData;
const balance: Balance = { ...(balanceJson as Balance), spiderlings: 0 };

// Солдати в безпечних клітинках (cell_07, cell_12, cell_14, cell_18), павук: активна лінія 0, наступна 2
function setup(extra: Partial<GameState> = {}): GameState {
  const state = createInitialState(level, balance, 42);
  return {
    ...state,
    soldiers: state.soldiers.map((s, i) => ({ ...s, cellId: ['cell_07', 'cell_12', 'cell_14', 'cell_18'][i] })),
    spider: { activeLane: 0, nextLane: 2 },
    ...extra,
  };
}
const withBalance = (state: GameState, patch: Partial<Balance>): GameState => ({ ...state, balance: { ...state.balance, ...patch } });

describe('ризик клітинок (showRisk)', () => {
  it('наступну лінію показано — ризик від павука точний: 1 під наступною лінією, 0 під іншими', () => {
    const risks = cellRisks(setup());
    expect(risks.get('cell_17')).toBe(1); // cell_17 видно з лінії 2
    expect(risks.get('cell_10')).toBe(0); // cell_10 видно лише з лінії 1
    expect(risks.get('cell_07')).toBe(0); // безпечна
  });

  it('наступну лінію не показано — «1 з 4»: лінія може бути будь-якою, крім активної', () => {
    const state = withBalance(setup(), { telegraphNextLane: false });
    expect(cellRisks(state).get('cell_10')).toBeCloseTo(1 / 4);
    // Якщо cell_10 під активною лінією, наступна точно інша — ризик 0
    expect(cellRisks({ ...state, spider: { activeLane: 1, nextLane: 3 } }).get('cell_10')).toBe(0);
  });

  it('павуча: рахуємо, куди воно може перебігти й подивитись', () => {
    // Павуча в cell_07 (сусіди 06, 08, 15). cell_06: перебіжить туди (1/3)
    // або в cell_08 і подивиться на cell_06 (1/3 · 1/3). Разом 4/9.
    const state = setup({ spiderlings: [{ id: 'spiderling_1', cellId: 'cell_07', facingCellId: 'cell_08' }] });
    expect(cellRisks(state).get('cell_06')).toBeCloseTo(4 / 9);
  });

  it('збігається з тим, що справді стається у ворожій фазі (перевірка на 3000 випробуваннях)', () => {
    // Павуча поруч із cell_06; лінія 2 (наступна) cell_06 не бачить — отже, весь ризик від павучати
    const base = setup({ spiderlings: [{ id: 'spiderling_1', cellId: 'cell_07', facingCellId: 'cell_08' }] });
    const expected = cellRisks(base).get('cell_06')!;
    let seen = 0;
    const trials = 3000;
    for (let rng = 1; rng <= trials; rng++) {
      const after = apply({ ...base, rng }, { type: 'endTurn' }).state;
      if (seenCells(after).has('cell_06')) seen++;
    }
    expect(Math.abs(seen / trials - expected)).toBeLessThan(0.03);
  });

  it('підпис: «1 з 4» для малого ризику, відсотки — для великого', () => {
    expect(riskText(0.25)).toBe('1 з 4');
    expect(riskText(4 / 9)).toBe('1 з 2');
    expect(riskText(0.75)).toBe('75%');
    expect(riskText(1)).toBe('100%');
  });
});

describe('«Скасувати дію»', () => {
  const move: Action = { type: 'move', soldierId: 'soldier_1', toCell: 'cell_08' };

  it('звичайний крок, підняти й кинути можна скасувати', () => {
    const result = apply(setup(), move);
    expect(isUndoable(move, result.events)).toBe(true);
    expect(isUndoable({ type: 'pickup', soldierId: 'soldier_1', target: { kind: 'item', id: 'part_1' } }, [])).toBe(true);
    expect(isUndoable({ type: 'throw', soldierId: 'soldier_1', toCell: 'cell_08' }, [])).toBe(true);
  });

  it('крок, після якого солдат став коконом, скасувати не можна', () => {
    const state = setup({ spiderlings: [{ id: 'spiderling_1', cellId: 'cell_08', facingCellId: 'cell_06' }] });
    const result = apply(state, move);
    expect(result.events.some((e) => e.type === 'captured')).toBe(true);
    expect(isUndoable(move, result.events)).toBe(false);
  });

  it('вбивство павучати, розмотування й кінець ходу не скасовуються', () => {
    const throwAction: Action = { type: 'throw', soldierId: 'soldier_1', toCell: 'cell_08' };
    expect(isUndoable(throwAction, [{ type: 'spiderlingKilled', spiderlingId: 's', cellId: 'cell_08', itemId: 'part_1' }])).toBe(false);
    expect(isUndoable({ type: 'unwrap', soldierId: 'soldier_1', cocoonId: 'c' }, [])).toBe(false);
    expect(isUndoable({ type: 'endTurn' }, [])).toBe(false);
  });
});

describe('підказки', () => {
  it('на самому початку — як зробити перший крок', () => {
    // Звичайний старт: біля солдатів немає предметів
    expect(currentHint(createInitialState(level, balance, 42), 'soldier_1', 0)?.key).toBe('hint.firstMove');
  });

  it('солдат стоїть біля предмета — підказка «Підняти»', () => {
    expect(currentHint(setup(), 'soldier_1', 0)?.key).toBe('hint.pickup'); // у cell_07 лежить деталь 1
  });

  it('кокон — найважливіша підказка', () => {
    const cocoon: Cocoon = { id: 'cocoon_soldier_2', soldierId: 'soldier_2', cellId: 'cell_12', turnsLeft: 2, carriedBy: null, fresh: false };
    const state = setup({ cocoons: [cocoon] });
    expect(currentHint(state, 'soldier_1', 5)).toEqual({ key: 'hint.cocoon', params: { n: 2, turns: 2 } });
  });

  it('коли очки дій закінчились — натиснути «Кінець ходу»', () => {
    const base = setup();
    const state = { ...base, soldiers: base.soldiers.map((s) => ({ ...s, ap: 0 })) };
    expect(currentHint(state, 'soldier_1', 5)?.key).toBe('hint.endTurn');
  });

  it('солдат несе предмет — нести до турелі', () => {
    const base = setup();
    const state = {
      ...base,
      soldiers: base.soldiers.map((s) => (s.id === 'soldier_1' ? { ...s, held: { kind: 'item' as const, id: 'part_1' } } : s)),
      items: base.items.map((i) => (i.id === 'part_1' ? { ...i, cellId: null, carriedBy: 'soldier_1' } : i)),
    };
    expect(currentHint(state, 'soldier_1', 5)?.key).toBe('hint.carry');
  });

  it('після кінця гри підказок немає', () => {
    expect(currentHint(setup({ outcome: 'won' }), null, 5)).toBeNull();
  });
});

describe('налаштування партії в адресі сторінки', () => {
  it('без параметрів — значення з balance.json і стартовий екран', () => {
    expect(readOptions('', balance)).toEqual({
      seed: balance.seed,
      cave: 'level01',
      telegraphNextLane: balance.telegraphNextLane,
      showRisk: balance.showRisk,
      showHints: balance.showHints,
      play: false,
    });
  });

  it('налаштування переживають перезапуск (у адресу й назад)', () => {
    const options = { seed: 1234, cave: 'random', telegraphNextLane: false, showRisk: true, showHints: false, play: true };
    expect(readOptions(optionsToSearch(options), balance)).toEqual(options);
  });
});
