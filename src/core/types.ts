// Основні типи гри. Тут немає Three.js — лише дані.
// Координати: x — ліворуч/праворуч, z — вперед/назад, підлога печери на висоті y = 0.

// Камінь: коло на підлозі (x, z, radius) і висота. Блокує лінію огляду.
export interface Rock {
  id: string;
  x: number;
  z: number;
  radius: number;
  height: number;
}

// Клітинка — місце біля каменя, де можуть стояти солдати, павучата й предмети.
// Сусідів (neighbors) і видимість (exposedTo) додамо на етапах 2 і 4.
export interface LevelCell {
  id: string;
  x: number;
  z: number;
  rockId: string;
}

// Лінія огляду павука: вузький клин від павука під кутом angleDeg
// (0° — прямо вглиб печери, тобто в бік +z).
export interface Lane {
  id: number;
  angleDeg: number;
  halfWidthDeg: number;
}

export type ItemKind = 'part' | 'cartridge';

// Предмет на старті рівня: деталь турелі або патрон.
export interface LevelItem {
  id: string;
  kind: ItemKind;
  cellId: string;
}

// Розміри печери: підлога від -width/2 до +width/2 по x і від -depth/2 до +depth/2 по z.
export interface CaveSize {
  width: number;
  depth: number;
  wallHeight: number;
}

// Увесь рівень так, як він записаний у data/level01.json.
export interface LevelData {
  id: string;
  cave: CaveSize;
  spider: { x: number; z: number };
  lanes: Lane[];
  startCell: string;
  turretCell: string;
  items: LevelItem[];
  rocks: Rock[];
  cells: LevelCell[];
}
