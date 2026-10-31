// Екрани кінця гри: перемога й поразка. Обидва мають кнопку «Грати знову».

import { t } from '../i18n';

export function showVictory(parent: HTMLElement, rounds: number): void {
  showEndScreen(parent, 'victory', rounds);
}

export function showDefeat(parent: HTMLElement, rounds: number): void {
  showEndScreen(parent, 'defeat', rounds);
}

// kind — ключ у uk.json: victory.title / defeat.title тощо
function showEndScreen(parent: HTMLElement, kind: 'victory' | 'defeat', rounds: number): void {
  const overlay = document.createElement('div');
  overlay.className = `end-screen ${kind}`;

  const box = document.createElement('div');
  box.className = 'end-box';
  const title = document.createElement('h2');
  title.textContent = t(`${kind}.title`);
  const text = document.createElement('p');
  text.textContent = t(`${kind}.text`);
  const stats = document.createElement('p');
  stats.textContent = t('roundsPlayed', { n: rounds });

  const again = document.createElement('button');
  again.textContent = t('playAgain');
  // Найпростіший спосіб почати спочатку — перезавантажити сторінку
  again.addEventListener('click', () => window.location.reload());

  box.append(title, text, stats, again);
  overlay.append(box);
  parent.append(overlay);
}
