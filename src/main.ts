// Точка входу: завантажуємо рівень і баланс, створюємо гру, запускаємо цикл кадрів.

import balanceJson from '../data/balance.json';
import levelJson from '../data/level01.json';
import type { Balance } from './core/balance';
import { validateLevel } from './core/level';
import { createInitialState } from './core/state';
import type { LevelData } from './core/types';
import { Game } from './game';
import './style.css';

const level = levelJson as LevelData;
const balance = balanceJson as Balance;

// Перевіряємо рівень. Помилки пишемо в консоль і показуємо на екрані, але гру не зупиняємо.
const problems = validateLevel(level);
if (problems.length > 0) console.error('Помилки в рівні:', problems);

const game = new Game(document.getElementById('app')!, createInitialState(level, balance), problems);

// Цикл кадрів: щокадру оновлюємо камеру й анімації та перемальовуємо сцену
let lastTime = performance.now();
function frame(now: number): void {
  const dt = Math.min((now - lastTime) / 1000, 0.1); // секунди; обмежуємо, якщо вкладка «спала»
  lastTime = now;
  game.frame(dt);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
