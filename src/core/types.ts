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

// Клітинка так, як вона записана в JSON рівня: місце біля каменя,
// де можуть стояти солдати, павучата й предмети.
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

// Клітинка в грі: те саме, що в JSON, плюс сусіди — куди з неї можна піти за один крок.
// Сусідів рахує graph.ts. Видимість (exposedTo) додамо на етапі 4.
export interface Cell extends LevelCell {
  neighbors: string[];
}

// Що солдат тримає в руках (знадобиться на етапі 3)
export type Held = { kind: 'item' | 'soldier' | 'cocoon'; id: string };

export type SoldierStatus = 'free' | 'cocooned' | 'dead';

export interface Soldier {
  id: string;
  cellId: string; // де стоїть
  ap: number; // скільки очок дій лишилось у цьому ході
  status: SoldierStatus;
  held: Held | null; // що тримає
  carriedBy: string | null; // id солдата, який його несе
}

// Предмет у грі: деталь турелі або патрон.
// Лежить у клітинці (cellId), або його несуть (carriedBy), або він уже встановлений у турель (installed).
export interface Item {
  id: string;
  kind: ItemKind;
  cellId: string | null; // null, поки предмет у когось у руках
  carriedBy: string | null; // id солдата, який несе
  installed: boolean;
}

// Дії гравця. «Розмотати» додамо на етапі 4.
export type Action =
  | { type: 'move'; soldierId: string; toCell: string }
  | { type: 'pickup'; soldierId: string; target: Held }
  | { type: 'throw'; soldierId: string; toCell: string }
  | { type: 'fire'; soldierId: string }
  | { type: 'endTurn' };
