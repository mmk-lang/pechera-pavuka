// Екрани кінця гри. Поки що лише перемога; екран поразки додамо, коли з'являться вороги.

import { t } from '../i18n';

export function showVictory(parent: HTMLElement, rounds: number): void {
  const overlay = document.createElement('div');
  overlay.className = 'end-screen';

  const box = document.createElement('div');
  box.className = 'end-box';
  const title = document.createElement('h2');
  title.textContent = t('victory.title');
  const text = document.createElement('p');
  text.textContent = t('victory.text');
  const stats = document.createElement('p');
  stats.textContent = t('victory.rounds', { n: rounds });

  const again = document.createElement('button');
  again.textContent = t('playAgain');
  // Найпростіший спосіб почати спочатку — перезавантажити сторінку
  again.addEventListener('click', () => window.location.reload());

  box.append(title, text, stats, again);
  overlay.append(box);
  parent.append(overlay);
}
