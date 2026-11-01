// Усі рівні гри. Щоб додати новий: поклади data/levelNN.json, допиши його сюди
// і дай йому назву в src/i18n/uk.json (розділ "levels").

import level01 from '../data/level01.json';
import level02 from '../data/level02.json';
import level03 from '../data/level03.json';
import level04 from '../data/level04.json';
import level05 from '../data/level05.json';
import level06 from '../data/level06.json';
import type { LevelData } from './core/types';
import { t } from './i18n';

export const LEVELS = [level01, level02, level03, level04, level05, level06] as LevelData[];

// Рівень за id; невідомий id — перший рівень
export function findLevel(id: string): LevelData {
  return LEVELS.find((level) => level.id === id) ?? LEVELS[0];
}

// Назва для екрана: «3. Широка зала» або «Випадкова печера»
export function levelName(id: string): string {
  const index = LEVELS.findIndex((level) => level.id === id);
  return index >= 0 ? `${index + 1}. ${t(`levels.${id}`)}` : t('levels.random');
}

// Наступний рівень після цього; null — це останній рівень або випадкова печера
export function nextLevelId(id: string): string | null {
  const index = LEVELS.findIndex((level) => level.id === id);
  return index >= 0 && index + 1 < LEVELS.length ? LEVELS[index + 1].id : null;
}
