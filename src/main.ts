// Точка входу: завантажуємо рівень і баланс, показуємо стартовий екран, створюємо гру, запускаємо цикл кадрів.

import balanceJson from '../data/balance.json';
import type { Balance } from './core/balance';
import { generateLevel } from './core/generator';
import { validateLevel } from './core/level';
import { randomSeed } from './core/rng';
import { createInitialState } from './core/state';
import { Game } from './game';
import { findLevel, LEVELS } from './levels';
import { applyOptions, optionsToSearch, readOptions, type GameOptions } from './ui/options';
import { showStartScreen } from './ui/screens';
import './style.css';

const balance = balanceJson as Balance;

const root = document.getElementById('app')!;

// Налаштування партії — з адреси сторінки (див. ui/options.ts). Якщо там немає play=1 — спершу стартовий екран.
const options = readOptions(window.location.search, balance);
if (options.play) startGame(options);
else showStartScreen(root, options, startGame);

function startGame(chosen: GameOptions): void {
  const seed = chosen.seed ?? randomSeed();
  // Випадкова печера будується з того самого seed — тож номер печери повторює і печеру, і партію.
  // Розміри печери, павука й лінії генератор бере з першого рівня.
  const caveLevel =
    chosen.cave === 'random' ? generateLevel(seed, LEVELS[0], balance.generator, balance.neighborsCount) : findLevel(chosen.cave);
  // Перевіряємо рівень. Помилки пишемо в консоль і показуємо на екрані, але гру не зупиняємо.
  const caveProblems = validateLevel(caveLevel);
  if (caveProblems.length > 0) console.error('Помилки в рівні:', caveProblems);
  const state = createInitialState(caveLevel, applyOptions(balance, chosen), seed);
  const game = new Game(root, state, caveProblems, chosen);
  // Записуємо налаштування й seed в адресу: оновлення сторінки почне цю саму печеру заново
  history.replaceState(null, '', optionsToSearch({ ...chosen, seed: state.seed, play: true }));

  // Лише під час розробки (npm run dev): гра доступна в консолі браузера як window.game — зручно для налагодження
  if (import.meta.env.DEV) Object.assign(window, { game });

  // Цикл кадрів: щокадру оновлюємо камеру й анімації та перемальовуємо сцену
  let lastTime = performance.now();
  function frame(now: number): void {
    const dt = Math.min((now - lastTime) / 1000, 0.1); // секунди; обмежуємо, якщо вкладка «спала»
    lastTime = now;
    game.frame(dt);
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}
