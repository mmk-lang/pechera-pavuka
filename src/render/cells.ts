// Клітинки на підлозі й лінії між сусідніми клітинками.
// Клітинки, куди вибраний солдат може піти, підсвічуються.

import * as THREE from 'three';
import type { World } from '../core/state';

const COLOR_CELL = 0x3fa7a0; // звичайна клітинка — бірюзова
const COLOR_START = 0x5fd35f; // старт — зелений
const COLOR_TURRET = 0x4f7cff; // турель — синя
const COLOR_REACHABLE = 0xffd24a; // сюди можна піти — жовта

export class CellsView {
  readonly group = new THREE.Group();
  private discs = new Map<string, THREE.Mesh<THREE.CircleGeometry, THREE.MeshBasicMaterial>>();
  private baseColors = new Map<string, number>();

  constructor(world: World) {
    const geometry = new THREE.CircleGeometry(0.7, 28);

    for (const cell of Object.values(world.cells)) {
      let color = COLOR_CELL;
      if (cell.id === world.level.startCell) color = COLOR_START;
      if (cell.id === world.level.turretCell) color = COLOR_TURRET;
      this.baseColors.set(cell.id, color);

      const material = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.5, depthWrite: false });
      const disc = new THREE.Mesh(geometry, material);
      disc.rotation.x = -Math.PI / 2;
      disc.position.set(cell.x, 0.02, cell.z); // трохи над підлогою, щоб не мерехтіло
      disc.userData.cellId = cell.id; // за цим id клік знає, по якій клітинці влучили
      this.discs.set(cell.id, disc);
      this.group.add(disc);
    }

    this.group.add(createLinks(world));
  }

  // Об'єкти, по яких можна клікнути
  get pickables(): THREE.Object3D[] {
    return [...this.discs.values()];
  }

  // Підсвічуємо клітинки, куди можна піти; решта — звичайного кольору
  setReachable(cellIds: string[]): void {
    const reachable = new Set(cellIds);
    for (const [id, disc] of this.discs) {
      const on = reachable.has(id);
      disc.material.color.setHex(on ? COLOR_REACHABLE : this.baseColors.get(id)!);
      disc.material.opacity = on ? 0.85 : 0.5;
    }
  }
}

// Тонкі лінії між сусідніми клітинками — видно, куди можна ходити
function createLinks(world: World): THREE.LineSegments {
  const points: THREE.Vector3[] = [];
  for (const cell of Object.values(world.cells)) {
    for (const nId of cell.neighbors) {
      if (nId < cell.id) continue; // кожну лінію малюємо один раз, а не двічі
      const n = world.cells[nId];
      points.push(new THREE.Vector3(cell.x, 0.03, cell.z), new THREE.Vector3(n.x, 0.03, n.z));
    }
  }
  const geometry = new THREE.BufferGeometry().setFromPoints(points);
  const material = new THREE.LineBasicMaterial({ color: 0x8fd0c8, transparent: true, opacity: 0.25 });
  return new THREE.LineSegments(geometry, material);
}
