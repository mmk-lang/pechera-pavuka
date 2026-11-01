// Екрани поверх гри: стартовий (правила й налаштування) і кінця гри (перемога / поразка).

import { t } from '../i18n';
import { LEVELS, levelName, nextLevelId } from '../levels';
import { restartWith, type GameOptions } from './options';

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className = '', text = ''): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  node.className = className;
  node.textContent = text;
  return node;
}

function button(text: string, className: string, onClick: () => void): HTMLButtonElement {
  const b = el('button', className, text);
  b.addEventListener('click', onClick);
  return b;
}

// --- Стартовий екран: коротко правила (щоб зрозуміти гру за 2 хвилини) і налаштування партії ---
export function showStartScreen(parent: HTMLElement, options: GameOptions, onPlay: (options: GameOptions) => void): void {
  const overlay = el('div', 'end-screen start-screen');
  const box = el('div', 'end-box start-box');
  box.append(el('h2', '', t('title')), el('p', 'start-subtitle', t('start.subtitle')));

  const rules = el('ul', 'start-rules');
  for (const key of ['goal', 'ap', 'danger', 'spiderlings', 'cocoon', 'defeat']) rules.append(el('li', '', t(`start.rules.${key}`)));
  box.append(rules);

  // Налаштування
  const settings = el('div', 'start-settings');
  // Яка печера: один із рівнів чи згенерована з номера печери
  const caveLabel = el('label', 'start-seed', t('start.cave'));
  const caveSelect = el('select');
  const caves = [...LEVELS.map((level) => [level.id, levelName(level.id)]), ['random', t('start.caveRandom')]];
  for (const [value, text] of caves) {
    const option = el('option', '', text);
    option.value = value;
    caveSelect.append(option);
  }
  caveSelect.value = caves.some(([value]) => value === options.cave) ? options.cave : LEVELS[0].id;
  caveLabel.append(caveSelect);
  settings.append(caveLabel);

  const seedLabel = el('label', 'start-seed', t('start.seed'));
  const seedInput = el('input');
  seedInput.type = 'number';
  seedInput.placeholder = t('start.seedRandom');
  if (options.seed !== null) seedInput.value = String(options.seed);
  seedLabel.append(seedInput);
  settings.append(seedLabel);

  const checkbox = (key: string, checked: boolean) => {
    const label = el('label', 'start-check');
    const input = el('input');
    input.type = 'checkbox';
    input.checked = checked;
    label.append(input, document.createTextNode(t(`start.${key}`)));
    settings.append(label);
    return input;
  };
  const next = checkbox('optNext', options.telegraphNextLane);
  const risk = checkbox('optRisk', options.showRisk);
  const hints = checkbox('optHints', options.showHints);
  box.append(settings);

  box.append(
    button(t('start.play'), '', () => {
      const seed = Number.parseInt(seedInput.value, 10);
      overlay.remove();
      onPlay({
        seed: Number.isFinite(seed) ? seed : null,
        cave: caveSelect.value,
        telegraphNextLane: next.checked,
        showRisk: risk.checked,
        showHints: hints.checked,
        play: true,
      });
    }),
  );
  overlay.append(box);
  parent.append(overlay);
}

// --- Екрани кінця гри ---
export function showVictory(parent: HTMLElement, rounds: number, seed: number, options: GameOptions): void {
  showEndScreen(parent, 'victory', rounds, seed, options);
}

export function showDefeat(parent: HTMLElement, rounds: number, seed: number, options: GameOptions): void {
  showEndScreen(parent, 'defeat', rounds, seed, options);
}

// kind — ключ у uk.json: victory.title / defeat.title тощо
function showEndScreen(parent: HTMLElement, kind: 'victory' | 'defeat', rounds: number, seed: number, options: GameOptions): void {
  const overlay = el('div', `end-screen ${kind}`);
  const box = el('div', 'end-box');
  box.append(
    el('h2', '', t(`${kind}.title`)),
    el('p', '', t(`${kind}.text`)),
    el('p', '', t('roundsPlayed', { n: rounds })),
    el('p', 'end-seed', t('seed', { seed })),
  );
  const buttons = el('div', 'end-buttons');
  // Після перемоги на рівні — одразу наступний рівень
  const next = kind === 'victory' ? nextLevelId(options.cave) : null;
  if (next) buttons.append(button(t('nextLevel', { name: levelName(next) }), '', () => restartWith({ ...options, cave: next, seed: null, play: true })));
  buttons.append(
    // Нова випадкова печера з тими самими налаштуваннями
    button(t('playAgain'), next ? 'secondary' : '', () => restartWith({ ...options, seed: null, play: true })),
    // Та сама печера (той самий seed) — спробувати ще раз
    button(t('sameSeed'), 'secondary', () => restartWith({ ...options, seed, play: true })),
    button(t('menu'), 'secondary', () => restartWith({ ...options, seed: null, play: false })),
  );
  box.append(buttons);
  overlay.append(box);
  parent.append(overlay);
}
