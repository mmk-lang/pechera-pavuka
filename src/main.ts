// Точка входу: завантажуємо рівень і баланс, будуємо сцену, запускаємо цикл кадрів.

import balanceJson from '../data/balance.json';
import levelJson from '../data/level01.json';
import type { Balance } from './core/balance';
import { validateLevel } from './core/level';
import type { LevelData } from './core/types';
import { CameraInput } from './input/cameraInput';
import { createGameScene } from './render/scene';
import { createHud } from './ui/hud';
import './style.css';

const level = levelJson as LevelData;
const balance = balanceJson as Balance;

// Перевіряємо рівень. Помилки пишемо в консоль і показуємо на екрані, але гру не зупиняємо.
const problems = validateLevel(level);
if (problems.length > 0) console.error('Помилки в рівні:', problems);

const app = document.getElementById('app')!;
const game = createGameScene(app, level, balance.camera);
const input = new CameraInput(game.rig, game.renderer.domElement, balance.camera);
createHud(app, level, problems);

// Цикл кадрів: щокадру оновлюємо камеру з клавіатури й перемальовуємо сцену
let lastTime = performance.now();
function frame(now: number): void {
  const dt = Math.min((now - lastTime) / 1000, 0.1); // секунди; обмежуємо, якщо вкладка «спала»
  lastTime = now;
  input.update(dt);
  game.render();
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
