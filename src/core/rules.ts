// Правила гри: що можна робити (validate) і що від цього змінюється (apply).
//
// validate(state, action) — перевіряє дію й, якщо її не можна виконати, повертає причину.
// apply(state, action)    — виконує дозволену дію: повертає НОВИЙ стан і список подій.
// Події (events) потрібні рендеру й інтерфейсу: «солдат перейшов», «почався раунд» тощо.

import { freeSoldiersInCell, getSoldier, type GameState } from './state';
import type { Action } from './types';

// Причини відмови. Текст українською для кожної — у i18n/uk.json (розділ "reason").
export type RejectReason =
  | 'unknownSoldier' // такого солдата немає
  | 'soldierNotFree' // солдат у коконі або мертвий
  | 'soldierCarried' // солдата зараз несуть
  | 'noAp' // немає очок дій
  | 'unknownCell' // такої клітинки немає
  | 'notNeighbor' // клітинка не сусідня
  | 'cellFull'; // у клітинці вже максимум вільних солдатів

export type Validation = { ok: true } | { ok: false; reason: RejectReason };

export type GameEvent =
  | { type: 'moved'; soldierId: string; fromCell: string; toCell: string }
  | { type: 'roundStarted'; round: number };

export interface ApplyResult {
  state: GameState;
  events: GameEvent[];
}

const OK: Validation = { ok: true };
const reject = (reason: RejectReason): Validation => ({ ok: false, reason });

export function validate(state: GameState, action: Action): Validation {
  switch (action.type) {
    case 'move': {
      const soldier = getSoldier(state, action.soldierId);
      if (!soldier) return reject('unknownSoldier');
      if (soldier.status !== 'free') return reject('soldierNotFree');
      if (soldier.carriedBy !== null) return reject('soldierCarried');
      if (soldier.ap <= 0) return reject('noAp');
      const from = state.world.cells[soldier.cellId];
      if (!state.world.cells[action.toCell]) return reject('unknownCell');
      if (!from.neighbors.includes(action.toCell)) return reject('notNeighbor');
      if (freeSoldiersInCell(state, action.toCell) >= state.balance.maxSoldiersPerCell) return reject('cellFull');
      return OK;
    }
    case 'endTurn':
      return OK; // закінчити хід можна завжди
  }
}

export function apply(state: GameState, action: Action): ApplyResult {
  const check = validate(state, action);
  if (!check.ok) throw new Error(`Недопустима дія ${action.type}: ${check.reason}`);

  switch (action.type) {
    case 'move': {
      const soldier = getSoldier(state, action.soldierId)!;
      // Новий список солдатів: міняємо лише того, хто ходить
      const soldiers = state.soldiers.map((s) =>
        s.id === soldier.id ? { ...s, cellId: action.toCell, ap: s.ap - 1 } : s,
      );
      return {
        state: { ...state, soldiers },
        events: [{ type: 'moved', soldierId: soldier.id, fromCell: soldier.cellId, toCell: action.toCell }],
      };
    }
    case 'endTurn': {
      // Новий раунд: усі вільні солдати отримують повні AP (невикористані не переносяться).
      // Ворожу фазу й таймери коконів додамо на етапі 4.
      const round = state.round + 1;
      const soldiers = state.soldiers.map((s) => (s.status === 'free' ? { ...s, ap: state.balance.apPerTurn } : s));
      return {
        state: { ...state, round, soldiers },
        events: [{ type: 'roundStarted', round }],
      };
    }
  }
}

// Клітинки, куди солдат може піти зараз (для підсвічування)
export function reachableCells(state: GameState, soldierId: string): string[] {
  const soldier = getSoldier(state, soldierId);
  if (!soldier) return [];
  return state.world.cells[soldier.cellId].neighbors.filter(
    (cellId) => validate(state, { type: 'move', soldierId, toCell: cellId }).ok,
  );
}

// Чи лишились у когось AP (якщо ні — пора натискати «Кінець ходу»)
export function anyApLeft(state: GameState): boolean {
  return state.soldiers.some((s) => s.status === 'free' && s.carriedBy === null && s.ap > 0);
}
