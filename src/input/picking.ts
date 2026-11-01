// Клік або тап по 3D-сцені: з'ясовуємо, по чому влучили — по солдату чи по клітинці.
// Щоб не плутати клік із перетягуванням камери, кліком вважаємо лише коротке натискання,
// під час якого курсор чи палець майже не зрушив.

import * as THREE from 'three';

const MAX_TAP_MOVE = 8; // пікселів: якщо зрушили більше — це було перетягування (мишею)
const MAX_TAP_MOVE_TOUCH = 14; // палець тремтить сильніше, тож для тапу допускаємо більше
// Промахнулись повз фігурку чи клітинку? Беремо найближчу до точки тапу на підлозі, якщо вона недалеко.
const SOLDIER_SNAP = 0.9; // одиниць печери
const CELL_SNAP = 1.6;
const MAX_TAP_TIME = 500; // мілісекунд: довше — це вже не тап

export interface PickHandlers {
  onSoldier(soldierId: string): void;
  onCell(cellId: string): void;
  onNothing(): void;
}

export class Picker {
  private raycaster = new THREE.Raycaster();
  private down: { x: number; y: number; time: number } | null = null;
  private pointersDown = 0;

  constructor(
    private readonly element: HTMLElement,
    private readonly camera: THREE.Camera,
    // Функції, що повертають об'єкти для перевірки (солдати перевіряються першими)
    private readonly soldiers: () => THREE.Object3D[],
    private readonly cells: () => THREE.Object3D[],
    private readonly handlers: PickHandlers,
  ) {
    element.addEventListener('pointerdown', (e) => {
      this.pointersDown++;
      // Якщо на екрані два пальці — це щипок, а не тап
      this.down = this.pointersDown === 1 ? { x: e.clientX, y: e.clientY, time: performance.now() } : null;
    });
    element.addEventListener('pointerup', (e) => {
      this.pointersDown = Math.max(0, this.pointersDown - 1);
      const down = this.down;
      this.down = null;
      if (!down) return;
      const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y);
      const maxMove = e.pointerType === 'touch' ? MAX_TAP_MOVE_TOUCH : MAX_TAP_MOVE;
      if (moved <= maxMove && performance.now() - down.time <= MAX_TAP_TIME) this.pick(e.clientX, e.clientY);
    });
    element.addEventListener('pointercancel', () => {
      this.pointersDown = Math.max(0, this.pointersDown - 1);
      this.down = null;
    });
  }

  private pick(clientX: number, clientY: number): void {
    // Переводимо пікселі в координати від -1 до 1, як хоче Raycaster
    const rect = this.element.getBoundingClientRect();
    const pointer = new THREE.Vector2(
      ((clientX - rect.left) / rect.width) * 2 - 1,
      -((clientY - rect.top) / rect.height) * 2 + 1,
    );
    this.raycaster.setFromCamera(pointer, this.camera);

    // Спершу солдати: вони стоять на клітинках і мають пріоритет
    const soldierHit = this.raycaster.intersectObjects(this.soldiers(), false)[0];
    if (soldierHit) return this.handlers.onSoldier(soldierHit.object.userData.soldierId);

    const cellHit = this.raycaster.intersectObjects(this.cells(), false)[0];
    if (cellHit) return this.handlers.onCell(cellHit.object.userData.cellId);

    // Точно не влучили (на телефоні фігурки маленькі) — шукаємо найближче до точки на підлозі
    const ground = this.raycaster.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), new THREE.Vector3());
    if (ground) {
      const soldier = nearest(this.soldiers(), ground, SOLDIER_SNAP, (o) => o.parent!.position);
      if (soldier) return this.handlers.onSoldier(soldier.userData.soldierId);
      const cell = nearest(this.cells(), ground, CELL_SNAP, (o) => o.position);
      if (cell) return this.handlers.onCell(cell.userData.cellId);
    }

    this.handlers.onNothing();
  }
}

// Найближчий до точки об'єкт (за позицією на підлозі), але не далі ніж maxDistance
function nearest(
  objects: THREE.Object3D[],
  point: THREE.Vector3,
  maxDistance: number,
  positionOf: (o: THREE.Object3D) => THREE.Vector3,
): THREE.Object3D | null {
  let best: THREE.Object3D | null = null;
  let bestDistance = maxDistance;
  for (const object of objects) {
    const p = positionOf(object);
    const d = Math.hypot(p.x - point.x, p.z - point.z);
    if (d < bestDistance) {
      best = object;
      bestDistance = d;
    }
  }
  return best;
}
