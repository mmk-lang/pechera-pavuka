// Перевірка рівня: чи немає помилок у data/level01.json.
// Повертаємо не текст, а коди помилок — текст українською лежить у i18n/uk.json.

import type { LevelData } from './types';

export type LevelProblemCode =
  | 'duplicateId' // два об'єкти з однаковим id
  | 'unknownRock' // клітинка посилається на камінь, якого немає
  | 'unknownCell' // старт, турель чи предмет посилається на клітинку, якої немає
  | 'rocksOverlap' // камені налазять один на одного
  | 'cellInsideRock' // клітинка стоїть усередині каменя
  | 'outsideCave'; // камінь, клітинка чи павук поза стінами печери

export interface LevelProblem {
  code: LevelProblemCode;
  id: string; // id об'єкта, з яким проблема
}

// Відстань між двома точками на підлозі
function distance(a: { x: number; z: number }, b: { x: number; z: number }): number {
  return Math.hypot(a.x - b.x, a.z - b.z);
}

// Чи лежить точка всередині печери (з урахуванням відступу від стін)
function insideCave(level: LevelData, p: { x: number; z: number }, margin: number): boolean {
  const halfW = level.cave.width / 2 - margin;
  const halfD = level.cave.depth / 2 - margin;
  return Math.abs(p.x) <= halfW && Math.abs(p.z) <= halfD;
}

// Знаходить усі проблеми рівня. Порожній список — рівень правильний.
export function validateLevel(level: LevelData): LevelProblem[] {
  const problems: LevelProblem[] = [];

  // 1. Унікальні id серед каменів, клітинок і предметів
  const seen = new Set<string>();
  for (const obj of [...level.rocks, ...level.cells, ...level.items]) {
    if (seen.has(obj.id)) problems.push({ code: 'duplicateId', id: obj.id });
    seen.add(obj.id);
  }

  const rockIds = new Set(level.rocks.map((r) => r.id));
  const cellIds = new Set(level.cells.map((c) => c.id));

  // 2. Камені: у межах печери й не налазять один на одного
  level.rocks.forEach((rock, i) => {
    if (!insideCave(level, rock, rock.radius)) problems.push({ code: 'outsideCave', id: rock.id });
    for (const other of level.rocks.slice(i + 1)) {
      if (distance(rock, other) < rock.radius + other.radius) {
        problems.push({ code: 'rocksOverlap', id: `${rock.id} / ${other.id}` });
      }
    }
  });

  // 3. Клітинки: їхній камінь існує, вони в печері й не всередині жодного каменя
  for (const cell of level.cells) {
    if (!rockIds.has(cell.rockId)) problems.push({ code: 'unknownRock', id: cell.id });
    if (!insideCave(level, cell, 0)) problems.push({ code: 'outsideCave', id: cell.id });
    for (const rock of level.rocks) {
      if (distance(cell, rock) < rock.radius) problems.push({ code: 'cellInsideRock', id: cell.id });
    }
  }

  // 4. Старт, турель і предмети стоять на справжніх клітинках
  const refs = [
    { id: 'startCell', cellId: level.startCell },
    { id: 'turretCell', cellId: level.turretCell },
    ...level.items.map((item) => ({ id: item.id, cellId: item.cellId })),
  ];
  for (const ref of refs) {
    if (!cellIds.has(ref.cellId)) problems.push({ code: 'unknownCell', id: ref.id });
  }

  // 5. Павук теж має бути в печері
  if (!insideCave(level, level.spider, 0)) problems.push({ code: 'outsideCave', id: 'spider' });

  return problems;
}
