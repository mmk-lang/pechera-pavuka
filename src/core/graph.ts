// Граф руху: які клітинки з'єднані між собою.
// Правило з ТЗ: кожна клітинка з'єднана з k найближчими сусідами (k = neighborsCount у balance.json),
// зв'язок двосторонній, і з будь-якої клітинки можна дійти до будь-якої іншої (граф зв'язний).

import type { Cell, LevelCell } from './types';

function distance(a: LevelCell, b: LevelCell): number {
  return Math.hypot(a.x - b.x, a.z - b.z);
}

export function buildCellGraph(levelCells: LevelCell[], neighborsCount: number): Record<string, Cell> {
  // Для кожної клітинки — набір сусідів (Set не дає додати того самого сусіда двічі)
  const links = new Map<string, Set<string>>();
  for (const cell of levelCells) links.set(cell.id, new Set());

  const connect = (a: string, b: string) => {
    links.get(a)!.add(b);
    links.get(b)!.add(a); // двосторонній зв'язок
  };

  // 1. Кожну клітинку з'єднуємо з k найближчими
  for (const cell of levelCells) {
    const nearest = levelCells
      .filter((other) => other.id !== cell.id)
      .sort((a, b) => distance(cell, a) - distance(cell, b))
      .slice(0, neighborsCount);
    for (const other of nearest) connect(cell.id, other.id);
  }

  // 2. Якщо граф розпався на кілька «островів», з'єднуємо найближчі клітинки різних островів,
  //    доки острів не лишиться один
  let groups = findGroups(levelCells, links);
  while (groups.length > 1) {
    const first = groups[0];
    let best: { a: LevelCell; b: LevelCell; d: number } | null = null;
    for (const a of levelCells.filter((c) => first.has(c.id))) {
      for (const b of levelCells.filter((c) => !first.has(c.id))) {
        const d = distance(a, b);
        if (!best || d < best.d) best = { a, b, d };
      }
    }
    connect(best!.a.id, best!.b.id);
    groups = findGroups(levelCells, links);
  }

  // 3. Збираємо результат: клітинка + відсортований список сусідів
  const cells: Record<string, Cell> = {};
  for (const cell of levelCells) {
    cells[cell.id] = { ...cell, neighbors: [...links.get(cell.id)!].sort() };
  }
  return cells;
}

// Розбиває клітинки на групи, всередині яких можна дійти одна до одної (пошук у ширину)
function findGroups(levelCells: LevelCell[], links: Map<string, Set<string>>): Set<string>[] {
  const groups: Set<string>[] = [];
  const visited = new Set<string>();
  for (const start of levelCells) {
    if (visited.has(start.id)) continue;
    const group = new Set<string>([start.id]);
    const queue = [start.id];
    visited.add(start.id);
    while (queue.length > 0) {
      const current = queue.shift()!;
      for (const next of links.get(current)!) {
        if (!visited.has(next)) {
          visited.add(next);
          group.add(next);
          queue.push(next);
        }
      }
    }
    groups.push(group);
  }
  return groups;
}
