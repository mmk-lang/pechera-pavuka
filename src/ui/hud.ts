// Інтерфейс поверх гри:
//   зліва вгорі — назва, номер раунду, підказка з керування, помилки рівня;
//   справа вгорі — панель мети: деталі 0/4, патрон, оператор; під нею — список подій;
//   унизу — картки солдатів (очки дій, що несе) і кнопка «Кінець ходу»;
//   посередині внизу — коротке повідомлення («Немає очок дій» тощо).

import type { LevelProblem } from '../core/level';
import { turretStatus, type GameState } from '../core/state';
import type { Held } from '../core/types';
import { t } from '../i18n';
import { SOLDIER_COLORS } from '../render/units';

export interface HudHandlers {
  onSelectSoldier(soldierId: string): void;
  onEndTurn(): void;
  onUndo(): void;
  onMenu(): void;
}

// Що ще показує HUD, крім стану гри
export interface HudExtras {
  allApSpent: boolean;
  canUndo: boolean;
  hint: string | null; // текст підказки або null — сховати
}

export interface Hud {
  // nameOf перетворює те, що солдат тримає, на назву («Деталь 2», «Солдат 3»)
  update(state: GameState, selectedId: string | null, extras: HudExtras, nameOf: (held: Held) => string): void;
  message(text: string): void;
  // Додати рядок у список подій. kind — колір: good (зелений), bad (червоний), warn (жовтий), round (роздільник)
  log(text: string, kind?: LogKind): void;
}

export type LogKind = 'good' | 'bad' | 'warn' | 'round' | 'info';
const LOG_SIZE = 6; // скільки останніх подій показуємо

// Невеликий помічник: створює HTML-елемент із класом і текстом
function el<K extends keyof HTMLElementTagNameMap>(tag: K, className: string, text = ''): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  node.className = className;
  node.textContent = text;
  return node;
}

const hex = (color: number) => `#${color.toString(16).padStart(6, '0')}`;

export function createHud(root: HTMLElement, state: GameState, problems: LevelProblem[], handlers: HudHandlers): Hud {
  // --- Панель зліва вгорі ---
  const info = el('div', 'hud');
  const titleRow = el('div', 'hud-title-row');
  titleRow.append(el('h1', 'hud-title', t('title')));
  // Кнопка «?» ховає/показує легенду й керування (на телефоні спершу сховані — менше закриває печеру)
  const helpButton = el('button', 'hud-small-button', '?');
  const menuButton = el('button', 'hud-small-button', t('menu'));
  menuButton.addEventListener('click', () => handlers.onMenu());
  titleRow.append(helpButton, menuButton);
  info.append(titleRow);
  const roundLine = el('div', 'hud-round');
  info.append(roundLine);
  // Підказка «що робити зараз»
  const hintLine = el('div', 'hud-hint');
  info.append(hintLine);
  const details = el('div', 'hud-details');
  info.append(details);
  const isTouch = window.matchMedia('(pointer: coarse)').matches;
  const narrow = window.matchMedia('(max-width: 600px)').matches;
  details.hidden = narrow;
  helpButton.addEventListener('click', () => (details.hidden = !details.hidden));
  // Легенда небезпеки: як позначені клітинки, які бачить павук
  const legend = el('div', 'hud-legend');
  for (const [cls, key] of [
    ['danger-now', 'legend.now'],
    ['danger-next', 'legend.next'],
  ]) {
    const item = el('span', 'legend-item');
    item.append(el('span', `ring ${cls}`), document.createTextNode(t(key)));
    legend.append(item);
  }
  // Павуча: стрілка показує, на яку клітинку воно дивиться
  const arrowItem = el('span', 'legend-item');
  arrowItem.append(el('span', 'legend-arrow', '➤'), document.createTextNode(t('legend.spiderling')));
  legend.append(arrowItem);
  details.append(legend);
  details.append(el('div', 'hud-controls', t(isTouch ? 'controlsTouch' : 'controlsDesktop')));

  if (problems.length > 0) {
    const box = el('div', 'hud-errors', t('levelErrors'));
    for (const p of problems) box.append(el('div', '', t(`problem.${p.code}`, { id: p.id, expected: p.expected ?? '' })));
    info.append(box);
  }

  // --- Панель мети справа вгорі ---
  const goal = el('div', 'goal');
  goal.append(el('div', 'goal-title', t('goal.title')));
  const goalParts = el('div', 'goal-line');
  const goalCartridge = el('div', 'goal-line');
  const goalOperator = el('div', 'goal-line');
  goal.append(goalParts, goalCartridge, goalOperator);

  // --- Список подій (під метою): нові зверху ---
  goal.append(el('div', 'goal-title events-title', t('events.title')));
  const eventList = el('div', 'event-list');
  goal.append(eventList);

  // --- Нижня панель: картки солдатів і кнопка ---
  const bar = el('div', 'bottom-bar');
  const cards = new Map<string, { card: HTMLButtonElement; dots: HTMLSpanElement[]; status: HTMLSpanElement }>();
  state.soldiers.forEach((soldier, i) => {
    const card = el('button', 'soldier-card');
    card.style.setProperty('--soldier-color', hex(SOLDIER_COLORS[i % SOLDIER_COLORS.length]));
    card.append(el('span', 'soldier-name', t('soldierName', { n: i + 1 })));
    const dotsBox = el('span', 'ap-dots');
    const dots: HTMLSpanElement[] = [];
    for (let d = 0; d < state.balance.apPerTurn; d++) {
      const dot = el('span', 'ap-dot');
      dots.push(dot);
      dotsBox.append(dot);
    }
    card.append(dotsBox);
    const status = el('span', 'soldier-status');
    card.append(status);
    card.addEventListener('click', () => handlers.onSelectSoldier(soldier.id));
    cards.set(soldier.id, { card, dots, status });
    bar.append(card);
  });

  const undo = el('button', 'undo', t('undo'));
  undo.title = t('undoTitle');
  undo.addEventListener('click', () => handlers.onUndo());
  bar.append(undo);

  const endTurn = el('button', 'end-turn', t('endTurn'));
  endTurn.addEventListener('click', () => handlers.onEndTurn());
  bar.append(endTurn);

  // --- Повідомлення ---
  const toast = el('div', 'toast');
  let toastTimer = 0;

  // Seed партії дрібно внизу панелі — щоб можна було повторити ту саму гру
  const seedLine = el('div', 'hud-seed', t('seed', { seed: state.seed }));
  details.append(seedLine);

  root.append(info, goal, bar, toast);

  return {
    update(state, selectedId, extras, nameOf) {
      roundLine.textContent = t('round', { n: state.round });
      hintLine.textContent = extras.hint ? `💡 ${extras.hint}` : '';
      hintLine.hidden = !extras.hint;
      undo.disabled = !extras.canUndo;

      // Мета: ✔ — виконано, ○ — ще ні
      const turret = turretStatus(state);
      const mark = (done: boolean) => (done ? '✔ ' : '○ ');
      goalParts.textContent = mark(turret.repaired) + t('goal.parts', { n: turret.partsInstalled, total: turret.partsNeeded });
      goalCartridge.textContent = mark(turret.loaded) + t('goal.cartridge');
      goalOperator.textContent = mark(turret.operatorReady) + t('goal.operator');
      goalParts.classList.toggle('done', turret.repaired);
      goalCartridge.classList.toggle('done', turret.loaded);
      goalOperator.classList.toggle('done', turret.operatorReady);

      for (const soldier of state.soldiers) {
        const { card, dots, status } = cards.get(soldier.id)!;
        card.classList.toggle('selected', soldier.id === selectedId);
        card.disabled = soldier.status !== 'free' || soldier.carriedBy !== null;
        card.classList.toggle('cocooned', soldier.status === 'cocooned');
        card.classList.toggle('dead', soldier.status === 'dead');
        dots.forEach((dot, i) => dot.classList.toggle('spent', i >= soldier.ap));
        // Під очками дій — що з солдатом: у коконі, загинув, його несуть або що він несе
        const cocoon = state.cocoons.find((c) => c.soldierId === soldier.id);
        status.textContent =
          soldier.status === 'dead'
            ? t('card.dead')
            : cocoon
              ? t('card.cocooned', { n: cocoon.turnsLeft })
              : soldier.carriedBy
                ? t('card.carried')
                : soldier.held
                  ? t('card.holding', { name: nameOf(soldier.held) })
                  : '';
      }
      // Коли всі AP витрачені, кнопка «Кінець ходу» пульсує
      endTurn.classList.toggle('pulse', extras.allApSpent);
    },
    message(text) {
      // Якщо попереднє повідомлення ще видно — додаємо новий рядок (останні три)
      const lines = toast.classList.contains('visible') ? [...toast.children].map((c) => c.textContent ?? '') : [];
      toast.replaceChildren(...[...lines, text].slice(-3).map((line) => el('div', '', line)));
      toast.classList.add('visible');
      window.clearTimeout(toastTimer);
      toastTimer = window.setTimeout(() => toast.classList.remove('visible'), 2200);
    },
    log(text, kind = 'info') {
      eventList.prepend(el('div', `event ${kind}`, text));
      while (eventList.children.length > LOG_SIZE) eventList.lastElementChild!.remove();
    },
  };
}
