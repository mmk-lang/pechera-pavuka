// Правила гри: що можна робити (validate) і що від цього змінюється (apply).
//
// validate(state, action) — перевіряє дію й, якщо її не можна виконати, повертає причину.
// apply(state, action)    — виконує дозволену дію: повертає НОВИЙ стан і список подій.
// Події (events) потрібні рендеру й інтерфейсу: «солдат перейшов», «деталь встановлено» тощо.

import {
  cellsWithin,
  freeSoldiersInCell,
  getItem,
  getSoldier,
  itemCell,
  turretStatus,
  type GameState,
} from './state';
import type { Action, Held, Item, Soldier } from './types';

// Причини відмови. Текст українською для кожної — у i18n/uk.json (розділ "reason").
export type RejectReason =
  | 'gameOver' // гра вже закінчилась
  | 'unknownSoldier' // такого солдата немає
  | 'soldierNotFree' // солдат у коконі або мертвий
  | 'soldierCarried' // солдата зараз несуть
  | 'noAp' // немає очок дій
  | 'unknownCell' // такої клітинки немає
  | 'notNeighbor' // клітинка не сусідня
  | 'cellFull' // у клітинці вже максимум вільних солдатів
  | 'handsFull' // руки зайняті — спершу кинь те, що тримаєш
  | 'handsEmpty' // нічого кидати
  | 'unknownTarget' // такого предмета чи солдата немає
  | 'targetNotHere' // ціль не в тій самій клітинці
  | 'cannotPickSelf' // себе підняти не можна
  | 'targetBusy' // предмет уже хтось несе або він встановлений; солдата вже несуть або він не вільний
  | 'targetCarrying' // цей солдат сам несе іншого солдата — вкладеного носіння немає
  | 'tooFar' // кинути так далеко не можна
  | 'notAtTurret' // солдат не в клітинці турелі
  | 'turretNotRepaired' // не всі деталі встановлено
  | 'turretNotLoaded'; // немає патрона

export type Validation = { ok: true } | { ok: false; reason: RejectReason };

export type GameEvent =
  | { type: 'moved'; soldierId: string; fromCell: string; toCell: string }
  | { type: 'pickedUp'; soldierId: string; target: Held }
  | { type: 'thrown'; soldierId: string; target: Held; toCell: string }
  | { type: 'installed'; itemId: string }
  | { type: 'fired'; soldierId: string }
  | { type: 'won' }
  | { type: 'roundStarted'; round: number };

export interface ApplyResult {
  state: GameState;
  events: GameEvent[];
}

const OK: Validation = { ok: true };
const reject = (reason: RejectReason): Validation => ({ ok: false, reason });

// Спільна перевірка для всіх дій солдата: він існує, вільний, його не несуть і в нього є AP
function checkActor(state: GameState, soldierId: string): Validation {
  const soldier = getSoldier(state, soldierId);
  if (!soldier) return reject('unknownSoldier');
  if (soldier.status !== 'free') return reject('soldierNotFree');
  if (soldier.carriedBy !== null) return reject('soldierCarried');
  if (soldier.ap <= 0) return reject('noAp');
  return OK;
}

export function validate(state: GameState, action: Action): Validation {
  if (state.outcome !== 'playing') return reject('gameOver');

  switch (action.type) {
    case 'move': {
      const actor = checkActor(state, action.soldierId);
      if (!actor.ok) return actor;
      const soldier = getSoldier(state, action.soldierId)!;
      if (!state.world.cells[action.toCell]) return reject('unknownCell');
      if (!state.world.cells[soldier.cellId].neighbors.includes(action.toCell)) return reject('notNeighbor');
      if (freeSoldiersInCell(state, action.toCell) >= state.balance.maxSoldiersPerCell) return reject('cellFull');
      return OK;
    }

    case 'pickup': {
      const actor = checkActor(state, action.soldierId);
      if (!actor.ok) return actor;
      const soldier = getSoldier(state, action.soldierId)!;
      if (soldier.held !== null) return reject('handsFull');
      return checkPickupTarget(state, soldier, action.target);
    }

    case 'throw': {
      const actor = checkActor(state, action.soldierId);
      if (!actor.ok) return actor;
      const soldier = getSoldier(state, action.soldierId)!;
      if (soldier.held === null) return reject('handsEmpty');
      if (!state.world.cells[action.toCell]) return reject('unknownCell');
      const inRange = cellsWithin(state.world, soldier.cellId, state.balance.throwRange);
      if (!inRange.includes(action.toCell)) return reject('tooFar');
      // Кинутий солдат приземляється в клітинку — там має бути вільне місце
      if (soldier.held.kind === 'soldier' && freeSoldiersInCell(state, action.toCell) >= state.balance.maxSoldiersPerCell) {
        return reject('cellFull');
      }
      return OK;
    }

    case 'fire': {
      const actor = checkActor(state, action.soldierId);
      if (!actor.ok) return actor;
      const soldier = getSoldier(state, action.soldierId)!;
      if (soldier.cellId !== state.world.level.turretCell) return reject('notAtTurret');
      const turret = turretStatus(state);
      if (!turret.repaired) return reject('turretNotRepaired');
      if (!turret.loaded) return reject('turretNotLoaded');
      return OK;
    }

    case 'endTurn':
      return OK; // закінчити хід можна завжди
  }
}

// Що можна підняти: предмет або вільного солдата в тій самій клітинці
function checkPickupTarget(state: GameState, soldier: Soldier, target: Held): Validation {
  if (target.kind === 'item') {
    const item = getItem(state, target.id);
    if (!item) return reject('unknownTarget');
    if (item.installed || item.carriedBy !== null) return reject('targetBusy');
    if (item.cellId !== soldier.cellId) return reject('targetNotHere');
    return OK;
  }
  if (target.kind === 'soldier') {
    const other = getSoldier(state, target.id);
    if (!other) return reject('unknownTarget');
    if (other.id === soldier.id) return reject('cannotPickSelf');
    if (other.status !== 'free' || other.carriedBy !== null) return reject('targetBusy');
    if (other.cellId !== soldier.cellId) return reject('targetNotHere');
    // Вкладеного носіння немає: солдата, який сам несе солдата чи кокон, піднімати не можна.
    // А от солдата з предметом у руках — можна (предмет «їде» разом із ним).
    if (other.held && other.held.kind !== 'item') return reject('targetCarrying');
    return OK;
  }
  return reject('unknownTarget'); // кокони — на етапі 4
}

export function apply(state: GameState, action: Action): ApplyResult {
  const check = validate(state, action);
  if (!check.ok) throw new Error(`Недопустима дія ${action.type}: ${check.reason}`);

  switch (action.type) {
    case 'move': {
      const soldier = getSoldier(state, action.soldierId)!;
      let next = updateSoldier(state, soldier.id, { ap: soldier.ap - 1 });
      next = placeSoldier(next, soldier.id, action.toCell);
      const events: GameEvent[] = [{ type: 'moved', soldierId: soldier.id, fromCell: soldier.cellId, toCell: action.toCell }];
      return installAtTurret(next, events);
    }

    case 'pickup': {
      const soldier = getSoldier(state, action.soldierId)!;
      let next = updateSoldier(state, soldier.id, { ap: soldier.ap - 1, held: action.target });
      if (action.target.kind === 'item') {
        next = updateItem(next, action.target.id, { cellId: null, carriedBy: soldier.id });
      } else {
        next = updateSoldier(next, action.target.id, { carriedBy: soldier.id });
      }
      return { state: next, events: [{ type: 'pickedUp', soldierId: soldier.id, target: action.target }] };
    }

    case 'throw': {
      const soldier = getSoldier(state, action.soldierId)!;
      const target = soldier.held!;
      let next = updateSoldier(state, soldier.id, { ap: soldier.ap - 1, held: null });
      if (target.kind === 'item') {
        next = updateItem(next, target.id, { cellId: action.toCell, carriedBy: null });
      } else {
        // Кинутий солдат приземляється живим, з тими AP, що мав (ПРИПУЩЕННЯ: «без втрат»)
        next = updateSoldier(next, target.id, { carriedBy: null });
        next = placeSoldier(next, target.id, action.toCell);
      }
      const events: GameEvent[] = [{ type: 'thrown', soldierId: soldier.id, target, toCell: action.toCell }];
      return installAtTurret(next, events);
    }

    case 'fire': {
      // Постріл завжди влучає й вбиває павука (рішення Колі) — перемога
      const soldier = getSoldier(state, action.soldierId)!;
      const next = updateSoldier(state, soldier.id, { ap: soldier.ap - 1 });
      return {
        state: { ...next, outcome: 'won' },
        events: [{ type: 'fired', soldierId: soldier.id }, { type: 'won' }],
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

// --- Допоміжні функції: змінюють одного солдата чи предмет і повертають новий стан ---

function updateSoldier(state: GameState, id: string, patch: Partial<Soldier>): GameState {
  return { ...state, soldiers: state.soldiers.map((s) => (s.id === id ? { ...s, ...patch } : s)) };
}

function updateItem(state: GameState, id: string, patch: Partial<Item>): GameState {
  return { ...state, items: state.items.map((i) => (i.id === id ? { ...i, ...patch } : i)) };
}

// Переставити солдата в клітинку. Солдат, якого він несе, переміщується разом із ним.
function placeSoldier(state: GameState, id: string, cellId: string): GameState {
  let next = updateSoldier(state, id, { cellId });
  const held = getSoldier(next, id)!.held;
  if (held?.kind === 'soldier') next = updateSoldier(next, held.id, { cellId });
  return next;
}

// Предмет, що опинився в клітинці турелі (принесли або кинули), встановлюється автоматично
function installAtTurret(state: GameState, events: GameEvent[]): ApplyResult {
  const turretCell = state.world.level.turretCell;
  let next = state;
  for (const item of state.items) {
    if (item.installed || itemCell(next, item) !== turretCell) continue;
    // Якщо предмет був у когось у руках — руки звільняються
    if (item.carriedBy) next = updateSoldier(next, item.carriedBy, { held: null });
    next = updateItem(next, item.id, { installed: true, cellId: turretCell, carriedBy: null });
    events.push({ type: 'installed', itemId: item.id });
  }
  return { state: next, events };
}

// --- Підказки для інтерфейсу ---

// Клітинки, куди солдат може піти зараз (для підсвічування)
export function reachableCells(state: GameState, soldierId: string): string[] {
  const soldier = getSoldier(state, soldierId);
  if (!soldier) return [];
  return state.world.cells[soldier.cellId].neighbors.filter(
    (cellId) => validate(state, { type: 'move', soldierId, toCell: cellId }).ok,
  );
}

// Клітинки, куди солдат може кинути те, що тримає
export function throwTargets(state: GameState, soldierId: string): string[] {
  const soldier = getSoldier(state, soldierId);
  if (!soldier) return [];
  return cellsWithin(state.world, soldier.cellId, state.balance.throwRange).filter(
    (cellId) => validate(state, { type: 'throw', soldierId, toCell: cellId }).ok,
  );
}

// Що солдат може підняти зараз (для кнопок «Підняти»)
export function pickupOptions(state: GameState, soldierId: string): Held[] {
  const soldier = getSoldier(state, soldierId);
  if (!soldier) return [];
  const candidates: Held[] = [
    ...state.items.filter((i) => i.cellId === soldier.cellId).map((i) => ({ kind: 'item' as const, id: i.id })),
    ...state.soldiers.filter((s) => s.cellId === soldier.cellId).map((s) => ({ kind: 'soldier' as const, id: s.id })),
  ];
  return candidates.filter((target) => validate(state, { type: 'pickup', soldierId, target }).ok);
}

// Чи лишились у когось AP (якщо ні — пора натискати «Кінець ходу»)
export function anyApLeft(state: GameState): boolean {
  return state.soldiers.some((s) => s.status === 'free' && s.carriedBy === null && s.ap > 0);
}
