// Напис поверх гри: назва, підказка з керування, легенда кольорів клітинок і помилки рівня.

import type { LevelProblem } from '../core/level';
import type { LevelData } from '../core/types';
import { t } from '../i18n';

// Невеликий помічник: створює HTML-елемент із класом і текстом
function el(tag: string, className: string, text = ''): HTMLElement {
  const node = document.createElement(tag);
  node.className = className;
  node.textContent = text;
  return node;
}

export function createHud(root: HTMLElement, level: LevelData, problems: LevelProblem[]): void {
  const hud = el('div', 'hud');

  hud.append(el('h1', 'hud-title', t('title')));
  hud.append(el('div', 'hud-line', t('stage')));
  hud.append(el('div', 'hud-line', t('rocksCount', { count: level.rocks.length })));

  // Легенда: кольорові кружечки, як на підлозі
  const legend = el('div', 'hud-legend');
  for (const [cls, key] of [
    ['dot-start', 'legendStart'],
    ['dot-turret', 'legendTurret'],
    ['dot-cell', 'legendCell'],
  ]) {
    const item = el('span', 'legend-item');
    item.append(el('span', `dot ${cls}`), document.createTextNode(t(key)));
    legend.append(item);
  }
  hud.append(legend);

  // На телефоні показуємо підказку для пальців, на ПК — для миші й клавіатури
  const isTouch = window.matchMedia('(pointer: coarse)').matches;
  hud.append(el('div', 'hud-controls', t(isTouch ? 'controlsTouch' : 'controlsDesktop')));

  // Якщо в рівні є помилки — показуємо їх червоним
  if (problems.length > 0) {
    const box = el('div', 'hud-errors', t('levelErrors'));
    for (const p of problems) box.append(el('div', '', t(`problem.${p.code}`, { id: p.id })));
    hud.append(box);
  }

  root.append(hud);
}
