// Налаштування партії, які гравець обирає на стартовому екрані.
// Вони зберігаються в адресі сторінки (наприклад, ?seed=123&cave=level03&next=1&risk=0&hints=1&play=1),
// тому «Грати знову» просто перезавантажує сторінку з потрібною адресою.
// За замовчуванням беремо значення з data/balance.json.

import type { Balance } from '../core/balance';

export interface GameOptions {
  seed: number | null; // null — випадковий seed
  cave: string; // id рівня (level01…level06) або 'random' — печера з генератора (з того самого seed)
  telegraphNextLane: boolean; // показувати наступну лінію павука
  showRisk: boolean; // показувати ризик клітинок
  showHints: boolean; // показувати підказки
  play: boolean; // одразу почати гру, без стартового екрана
}

export function readOptions(search: string, balance: Balance): GameOptions {
  const params = new URLSearchParams(search);
  const flag = (name: string, fallback: boolean) => (params.has(name) ? params.get(name) === '1' : fallback);
  const seed = Number.parseInt(params.get('seed') ?? '', 10);
  return {
    seed: Number.isFinite(seed) ? seed : balance.seed,
    cave: params.get('cave') ?? 'level01',
    telegraphNextLane: flag('next', balance.telegraphNextLane),
    showRisk: flag('risk', balance.showRisk),
    showHints: flag('hints', balance.showHints),
    play: flag('play', false),
  };
}

export function optionsToSearch(options: GameOptions): string {
  const params = new URLSearchParams();
  if (options.seed !== null) params.set('seed', String(options.seed));
  params.set('cave', options.cave);
  params.set('next', options.telegraphNextLane ? '1' : '0');
  params.set('risk', options.showRisk ? '1' : '0');
  params.set('hints', options.showHints ? '1' : '0');
  if (options.play) params.set('play', '1');
  return `?${params}`;
}

// Баланс із урахуванням вибору гравця
export function applyOptions(balance: Balance, options: GameOptions): Balance {
  return {
    ...balance,
    telegraphNextLane: options.telegraphNextLane,
    showRisk: options.showRisk,
    showHints: options.showHints,
  };
}

// Перезавантажити сторінку з новими налаштуваннями (так найпростіше почати гру заново)
export function restartWith(options: GameOptions): void {
  window.location.search = optionsToSearch(options);
}
