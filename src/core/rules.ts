// Правила гри: що можна робити (validate) і що від цього змінюється (apply).
//
// validate(state, action) — перевіряє дію й, якщо її не можна виконати, повертає причину.
// apply(state, action)    — виконує дозволену дію: повертає НОВИЙ стан і список подій.
// Події (events) потрібні рендеру й інтерфейсу: «солдат перейшов», «деталь встановлено» тощо.
//
// Порядок раунду (розділ 8 ТЗ): хід гравця → таймери коконів → ворожа фаза (павук повертається,
// перевірка виявлення) → перевірка поразки → новий раунд. Усе це робить дія «Кінець ходу».
// Виявлення під час ходу гравця (detectionMode = onEntry) перевіряється після кожної дії.

import {
  cellsWithin,
  freeSoldiersCount,
  freeSoldiersInCell,
  getCocoon,
  getItem,
  getSoldier,
  itemCell,
  pickNextLane,
  seenCells,
  turretStatus,
  type GameState,
} from './state';
import type { Action, Cocoon, Held, Item, Soldier } from './types';

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
  | 'turretNotLoaded' // немає патрона
  | 'mustPickUp'; // кокон треба спершу підняти (якщо unwrapRequiresPickup = true)

export type Validation = { ok: true } | { ok: false; reason: RejectReason };

export type GameEvent =
  | { type: 'moved'; soldierId: string; fromCell: string; toCell: string }
  | { type: 'pickedUp'; soldierId: string; target: Held }
  | { type: 'thrown'; soldierId: string; target: Held; toCell: string }
  | { type: 'installed'; itemId: string }
  | { type: 'fired'; soldierId: string }
  | { type: 'unwrapped'; soldierId: string; rescuerId: string }
  | { type: 'captured'; soldierId: string; cellId: string }
  | { type: 'died'; soldierId: string }
  | { type: 'spiderTurned'; activeLane: number; nextLane: number }
  | { type: 'won' }
  | { type: 'lost' }
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

    case 'unwrap': {
      const actor = checkActor(state, action.soldierId);
      if (!actor.ok) return actor;
      const soldier = getSoldier(state, action.soldierId)!;
      const cocoon = getCocoon(state, action.cocoonId);
      if (!cocoon) return reject('unknownTarget');
      if (cocoon.cellId !== soldier.cellId) return reject('targetNotHere');
      const heldByMe = cocoon.carriedBy === soldier.id;
      if (cocoon.carriedBy !== null && !heldByMe) return reject('targetBusy');
      if (state.balance.unwrapRequiresPickup && !heldByMe) return reject('mustPickUp');
      // Врятований стане вільним у цій клітинці — там має бути місце
      if (freeSoldiersInCell(state, soldier.cellId) >= state.balance.maxSoldiersPerCell) return reject('cellFull');
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
  // Кокон: лежить у тій самій клітинці й ніхто його не несе
  const cocoon = getCocoon(state, target.id);
  if (!cocoon) return reject('unknownTarget');
  if (cocoon.carriedBy !== null) return reject('targetBusy');
  if (cocoon.cellId !== soldier.cellId) return reject('targetNotHere');
  return OK;
}

export function apply(state: GameState, action: Action): ApplyResult {
  const check = validate(state, action);
  if (!check.ok) throw new Error(`Недопустима дія ${action.type}: ${check.reason}`);

  if (action.type === 'endTurn') return endTurn(state);

  const result = applyPlayerAction(state, action);
  // Виявлення одразу після дії гравця (рішення Колі: detectionMode = onEntry)
  if (state.balance.detectionMode === 'onEntry') captureSeen(result, true);
  checkDefeat(result);
  return result;
}

// Дії солдатів під час ходу гравця
function applyPlayerAction(state: GameState, action: Exclude<Action, { type: 'endTurn' }>): ApplyResult {
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
      } else if (action.target.kind === 'soldier') {
        next = updateSoldier(next, action.target.id, { carriedBy: soldier.id });
      } else {
        next = updateCocoon(next, action.target.id, { carriedBy: soldier.id });
      }
      return { state: next, events: [{ type: 'pickedUp', soldierId: soldier.id, target: action.target }] };
    }

    case 'throw': {
      const soldier = getSoldier(state, action.soldierId)!;
      const target = soldier.held!;
      let next = updateSoldier(state, soldier.id, { ap: soldier.ap - 1, held: null });
      if (target.kind === 'item') {
        next = updateItem(next, target.id, { cellId: action.toCell, carriedBy: null });
      } else if (target.kind === 'soldier') {
        // Кинутий солдат приземляється живим, з тими AP, що мав (ПРИПУЩЕННЯ: «без втрат»)
        next = updateSoldier(next, target.id, { carriedBy: null });
        next = placeSoldier(next, target.id, action.toCell);
      } else {
        next = placeCocoon(updateCocoon(next, target.id, { carriedBy: null }), target.id, action.toCell);
      }
      const events: GameEvent[] = [{ type: 'thrown', soldierId: soldier.id, target, toCell: action.toCell }];
      return installAtTurret(next, events);
    }

    case 'unwrap': {
      // Розмотати: кокон зникає, солдат стає вільним у клітинці рятівника й одразу має rescuedSoldierAp
      const rescuer = getSoldier(state, action.soldierId)!;
      const cocoon = getCocoon(state, action.cocoonId)!;
      let next = updateSoldier(state, rescuer.id, {
        ap: rescuer.ap - 1,
        held: rescuer.held?.kind === 'cocoon' && rescuer.held.id === cocoon.id ? null : rescuer.held,
      });
      next = { ...next, cocoons: next.cocoons.filter((c) => c.id !== cocoon.id) };
      next = updateSoldier(next, cocoon.soldierId, {
        status: 'free',
        ap: state.balance.rescuedSoldierAp,
        cellId: rescuer.cellId,
        carriedBy: null,
        held: null,
      });
      return { state: next, events: [{ type: 'unwrapped', soldierId: cocoon.soldierId, rescuerId: rescuer.id }] };
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
  }
}

// «Кінець ходу»: таймери коконів → ворожа фаза → перевірка поразки → новий раунд
function endTurn(state: GameState): ApplyResult {
  const result: ApplyResult = { state, events: [] };

  // 1. Таймери коконів. Кокон, що з'явився в цьому ході гравця (fresh), цього разу не зменшується.
  for (const cocoon of state.cocoons) {
    if (cocoon.fresh) {
      result.state = updateCocoon(result.state, cocoon.id, { fresh: false });
      continue;
    }
    const turnsLeft = cocoon.turnsLeft - 1;
    if (turnsLeft > 0) {
      result.state = updateCocoon(result.state, cocoon.id, { turnsLeft });
      continue;
    }
    // Час вийшов: солдат гине, кокон зникає (і з рук того, хто його ніс)
    let next = result.state;
    if (cocoon.carriedBy) next = updateSoldier(next, cocoon.carriedBy, { held: null });
    next = updateSoldier(next, cocoon.soldierId, { status: 'dead', ap: 0 });
    result.state = { ...next, cocoons: next.cocoons.filter((c) => c.id !== cocoon.id) };
    result.events.push({ type: 'died', soldierId: cocoon.soldierId });
  }

  // 2. Ворожа фаза: павук повертається до показаної заздалегідь лінії й обирає нову наступну
  //    (павучата з'являться на етапі 5)
  const s = result.state;
  const activeLane = s.spider.nextLane;
  const next = pickNextLane(s.rng, activeLane, s.world.level.lanes.length, s.balance.allowSameLane);
  result.state = { ...s, spider: { activeLane, nextLane: next.value }, rng: next.rng };
  result.events.push({ type: 'spiderTurned', activeLane, nextLane: next.value });

  // 3. Перевірка виявлення: кого тепер бачить павук, той стає коконом
  captureSeen(result, false);

  // 4. Поразка — якщо не лишилось жодного вільного солдата
  checkDefeat(result);
  if (result.state.outcome !== 'playing') return result;

  // 5. Новий раунд: усі вільні солдати отримують повні AP (невикористані не переносяться)
  const round = result.state.round + 1;
  const soldiers = result.state.soldiers.map((sol) =>
    sol.status === 'free' ? { ...sol, ap: result.state.balance.apPerTurn } : sol,
  );
  result.state = { ...result.state, round, soldiers };
  result.events.push({ type: 'roundStarted', round });
  return result;
}

// Захоплення: кожен вільний солдат у клітинці, яку бачить ворог, миттєво стає коконом.
// Решта його AP згорає, а те, що він тримав, лишається в тій самій клітинці.
// duringPlayerTurn — кокон з'явився під час ходу гравця (тоді в кінці цього ходу таймер ще не тікає).
function captureSeen(result: ApplyResult, duringPlayerTurn: boolean): void {
  const seen = seenCells(result.state);
  let victims = result.state.soldiers.filter((s) => s.status === 'free' && seen.has(s.cellId));
  const limit = result.state.balance.capturesPerTurn;
  if (limit !== null) victims = victims.slice(0, limit);

  for (const { id } of victims) {
    let next = result.state;
    const victim = getSoldier(next, id)!;
    // Якщо його хтось ніс — у носія звільняються руки
    if (victim.carriedBy) next = updateSoldier(next, victim.carriedBy, { held: null });
    // Те, що він тримав, падає в цю ж клітинку
    if (victim.held?.kind === 'item') next = updateItem(next, victim.held.id, { cellId: victim.cellId, carriedBy: null });
    if (victim.held?.kind === 'soldier') next = updateSoldier(next, victim.held.id, { carriedBy: null });
    if (victim.held?.kind === 'cocoon') next = updateCocoon(next, victim.held.id, { carriedBy: null });

    next = updateSoldier(next, id, { status: 'cocooned', ap: 0, held: null, carriedBy: null });
    const cocoon: Cocoon = {
      id: `cocoon_${id}`,
      soldierId: id,
      cellId: victim.cellId,
      turnsLeft: next.balance.cocoonTurns,
      carriedBy: null,
      fresh: duringPlayerTurn,
    };
    result.state = { ...next, cocoons: [...next.cocoons, cocoon] };
    result.events.push({ type: 'captured', soldierId: id, cellId: victim.cellId });
  }

  // Предмет, що випав у клітинці турелі, теж встановлюється
  if (victims.length > 0) Object.assign(result, installAtTurret(result.state, result.events));
}

function checkDefeat(result: ApplyResult): void {
  if (result.state.outcome === 'playing' && freeSoldiersCount(result.state) === 0) {
    result.state = { ...result.state, outcome: 'lost' };
    result.events.push({ type: 'lost' });
  }
}

// --- Допоміжні функції: змінюють одного солдата чи предмет і повертають новий стан ---

function updateSoldier(state: GameState, id: string, patch: Partial<Soldier>): GameState {
  return { ...state, soldiers: state.soldiers.map((s) => (s.id === id ? { ...s, ...patch } : s)) };
}

function updateItem(state: GameState, id: string, patch: Partial<Item>): GameState {
  return { ...state, items: state.items.map((i) => (i.id === id ? { ...i, ...patch } : i)) };
}

function updateCocoon(state: GameState, id: string, patch: Partial<Cocoon>): GameState {
  return { ...state, cocoons: state.cocoons.map((c) => (c.id === id ? { ...c, ...patch } : c)) };
}

// Переставити солдата в клітинку. Солдат чи кокон, якого він несе, переміщується разом із ним.
function placeSoldier(state: GameState, id: string, cellId: string): GameState {
  let next = updateSoldier(state, id, { cellId });
  const held = getSoldier(next, id)!.held;
  if (held?.kind === 'soldier') next = updateSoldier(next, held.id, { cellId });
  if (held?.kind === 'cocoon') next = placeCocoon(next, held.id, cellId);
  return next;
}

// Переставити кокон; солдат усередині «їде» разом із ним
function placeCocoon(state: GameState, id: string, cellId: string): GameState {
  const next = updateCocoon(state, id, { cellId });
  return updateSoldier(next, getCocoon(next, id)!.soldierId, { cellId });
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
    ...state.cocoons.filter((c) => c.cellId === soldier.cellId).map((c) => ({ kind: 'cocoon' as const, id: c.id })),
  ];
  return candidates.filter((target) => validate(state, { type: 'pickup', soldierId, target }).ok);
}

// Кокони, які солдат може розмотати зараз
export function unwrapOptions(state: GameState, soldierId: string): string[] {
  return state.cocoons
    .filter((c) => validate(state, { type: 'unwrap', soldierId, cocoonId: c.id }).ok)
    .map((c) => c.id);
}

// Чи лишились у когось AP (якщо ні — пора натискати «Кінець ходу»)
export function anyApLeft(state: GameState): boolean {
  return state.soldiers.some((s) => s.status === 'free' && s.carriedBy === null && s.ap > 0);
}
