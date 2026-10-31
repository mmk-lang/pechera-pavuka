// Лінії огляду павука: які клітинки він бачить з кожної лінії.
//
// Клітинка «під оглядом» лінії, якщо:
//   1) вона лежить у вузькому клині (секторі) цієї лінії;
//   2) між павуком і клітинкою немає каменя (промінь від павука до клітинки не перетинає жодного кола-каменя).
// Усе рахується на площині підлоги (x, z), висота каменів не важлива.

import type { Lane, LevelData, Rock } from './types';

type Point = { x: number; z: number };

// Кут напрямку від a до b у градусах. 0° — уздовж +z (вглиб печери), додатні — у бік +x.
export function angleDeg(from: Point, to: Point): number {
  return (Math.atan2(to.x - from.x, to.z - from.z) * 180) / Math.PI;
}

// Найкоротша різниця кутів: результат від -180 до 180
function angleDiff(a: number, b: number): number {
  return ((((a - b + 180) % 360) + 360) % 360) - 180;
}

export function inLaneSector(spider: Point, cell: Point, lane: Lane): boolean {
  return Math.abs(angleDiff(angleDeg(spider, cell), lane.angleDeg)) <= lane.halfWidthDeg;
}

// Відстань від точки p до відрізка a–b
function distanceToSegment(p: Point, a: Point, b: Point): number {
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  const lengthSq = dx * dx + dz * dz;
  // t — де на відрізку найближча до p точка (0 — у точці a, 1 — у точці b)
  const t = lengthSq === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.z - a.z) * dz) / lengthSq));
  return Math.hypot(a.x + t * dx - p.x, a.z + t * dz - p.z);
}

// Чи закриває якийсь камінь клітинку від павука
export function blockedByRock(spider: Point, cell: Point, rocks: Rock[]): boolean {
  return rocks.some((rock) => distanceToSegment(rock, spider, cell) < rock.radius);
}

// Для кожної клітинки рівня — список ліній, з яких її видно (те, що має бути в exposedTo)
export function computeExposure(level: LevelData): Record<string, number[]> {
  const result: Record<string, number[]> = {};
  for (const cell of level.cells) {
    result[cell.id] = level.lanes
      .filter((lane) => inLaneSector(level.spider, cell, lane) && !blockedByRock(level.spider, cell, level.rocks))
      .map((lane) => lane.id);
  }
  return result;
}
