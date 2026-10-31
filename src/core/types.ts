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
  exposedTo: number[]; // з яких ліній павука видно цю клітинку (перевіряє validateLevel)
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
// Сусідів рахує graph.ts.
export interface Cell extends LevelCell {
  neighbors: string[];
}

// Що солдат тримає в руках: предмет, іншого солдата або кокон
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

// Кокон: замотаний павуком солдат. Лежить у клітинці або його несуть.
// Якщо за turnsLeft ходів гравця його не розмотати — солдат гине.
export interface Cocoon {
  id: string;
  soldierId: string; // хто всередині
  cellId: string; // де лежить (якщо несуть — там, де носій)
  turnsLeft: number;
  carriedBy: string | null;
  // true — кокон з'явився під час ходу гравця: у кінці цього ж ходу таймер ще не зменшується
  // (так у гравця є цей хід плюс ще три — див. розділ 7 ТЗ)
  fresh: boolean;
}

// Дії гравця
export type Action =
  | { type: 'move'; soldierId: string; toCell: string }
  | { type: 'pickup'; soldierId: string; target: Held }
  | { type: 'throw'; soldierId: string; toCell: string }
  | { type: 'unwrap'; soldierId: string; cocoonId: string }
  | { type: 'fire'; soldierId: string }
  | { type: 'endTurn' };
