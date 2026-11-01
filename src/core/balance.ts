// Опис файлу data/balance.json. Усі числа гри живуть у тому файлі, а тут лише їхні типи.

export interface CameraBalance {
  pitchDeg: number; // кут нахилу камери до горизонту (60–70° за ТЗ)
  startDistance: number; // з якої відстані камера дивиться на старті
  minDistance: number; // найближчий масштаб
  maxDistance: number; // найдальший масштаб
  panSpeed: number; // швидкість руху клавішами WASD (одиниць за секунду)
  rotateSpeedDeg: number; // швидкість повороту клавішами Q/E (градусів за секунду)
  zoomStep: number; // у скільки разів змінюється відстань за один «клац» колеса
}

// Налаштування генератора випадкових печер (див. core/generator.ts)
export interface GeneratorBalance {
  rocks: number; // скільки каменів
  rockRadiusMin: number;
  rockRadiusMax: number;
  rockHeightMin: number;
  rockHeightMax: number;
  rockGap: number; // мінімальний проміжок між каменями (щоб між ними пройшла клітинка)
  wallMargin: number; // відступ каменів від стін
  nestRadius: number; // біля гнізда павука каменів немає
  cellGap: number; // на якій відстані від краю каменя стоїть його клітинка
  minCellDistance: number; // клітинки не ближче одна до одної
  maxLanesPerCell: number; // з будь-якої клітинки видно не більше ніж стільки ліній (ТЗ: 2)
  minSafeCells: number; // мінімум клітинок, яких павук не бачить ніколи
  minExposedCells: number; // мінімум клітинок під лініями — щоб було страшно
  maxAttempts: number; // скільки спроб, доки печера не пройде всі перевірки
}

export interface Balance {
  soldiers: number;
  apPerTurn: number;
  neighborsCount: number;
  throwRange: number;
  spiderlings: number;
  lanes: number;
  allowSameLane: boolean;
  telegraphNextLane: boolean;
  detectionMode: 'onEntry' | 'endOfTurn';
  cocoonTurns: number;
  unwrapRequiresPickup: boolean;
  rescuedSoldierAp: number;
  maxSoldiersPerCell: number;
  itemKillsSpiderling: boolean;
  capturesPerTurn: number | null; // null — без ліміту
  showRisk: boolean; // показувати ймовірність небезпеки для клітинок
  showHints: boolean; // показувати підказки для нового гравця
  soundVolume: number; // загальна гучність звуків від 0 до 1
  cellsPerRock: number;
  seed: number | null; // null — випадковий seed
  generator: GeneratorBalance;
  camera: CameraBalance;
}
