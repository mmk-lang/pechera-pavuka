// Інтерфейс поверх гри:
//   зліва вгорі — назва, номер раунду, підказка з керування, помилки рівня;
//   унизу — картки солдатів (з очками дій) і кнопка «Кінець ходу»;
//   посередині внизу — коротке повідомлення («Немає очок дій» тощо).

import type { LevelProblem } from '../core/level';
import type { GameState } from '../core/state';
import { t } from '../i18n';
import { SOLDIER_COLORS } from '../render/units';

export interface HudHandlers {
  onSelectSoldier(soldierId: string): void;
  onEndTurn(): void;
}

export interface Hud {
  update(state: GameState, selectedId: string | null, allApSpent: boolean): void;
  message(text: string): void;
}

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
  info.append(el('h1', 'hud-title', t('title')));
  const roundLine = el('div', 'hud-round');
  info.append(roundLine);
  const isTouch = window.matchMedia('(pointer: coarse)').matches;
  info.append(el('div', 'hud-controls', t(isTouch ? 'controlsTouch' : 'controlsDesktop')));

  if (problems.length > 0) {
    const box = el('div', 'hud-errors', t('levelErrors'));
    for (const p of problems) box.append(el('div', '', t(`problem.${p.code}`, { id: p.id })));
    info.append(box);
  }

  // --- Нижня панель: картки солдатів і кнопка ---
  const bar = el('div', 'bottom-bar');
  const cards = new Map<string, { card: HTMLButtonElement; dots: HTMLSpanElement[] }>();
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
    card.addEventListener('click', () => handlers.onSelectSoldier(soldier.id));
    cards.set(soldier.id, { card, dots });
    bar.append(card);
  });

  const endTurn = el('button', 'end-turn', t('endTurn'));
  endTurn.addEventListener('click', () => handlers.onEndTurn());
  bar.append(endTurn);

  // --- Повідомлення ---
  const toast = el('div', 'toast');
  let toastTimer = 0;

  root.append(info, bar, toast);

  return {
    update(state, selectedId, allApSpent) {
      roundLine.textContent = t('round', { n: state.round });
      for (const soldier of state.soldiers) {
        const { card, dots } = cards.get(soldier.id)!;
        card.classList.toggle('selected', soldier.id === selectedId);
        card.disabled = soldier.status !== 'free';
        dots.forEach((dot, i) => dot.classList.toggle('spent', i >= soldier.ap));
      }
      // Коли всі AP витрачені, кнопка «Кінець ходу» пульсує
      endTurn.classList.toggle('pulse', allApSpent);
    },
    message(text) {
      toast.textContent = text;
      toast.classList.add('visible');
      window.clearTimeout(toastTimer);
      toastTimer = window.setTimeout(() => toast.classList.remove('visible'), 2200);
    },
  };
}
