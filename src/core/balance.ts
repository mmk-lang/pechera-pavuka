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
  showRisk: boolean;
  cellsPerRock: number;
  seed: number | null; // null — випадковий seed
  camera: CameraBalance;
}
