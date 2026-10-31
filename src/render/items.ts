// Предмети: 4 деталі турелі (жовті шестерні) і патрон (латунний набій).
// Предмет лежить біля клітинки або висить над головою солдата, який його несе.
// Встановлені в турель предмети ховаємо — їх показує сама турель.

import * as THREE from 'three';
import type { GameState } from '../core/state';
import type { UnitsView } from './units';

const HELD_HEIGHT = 1.75; // над головою, вище точок AP
const MOVE_TIME = 0.3;

interface ItemView {
  mesh: THREE.Object3D;
  target: THREE.Vector3;
  carriedBy: string | null;
}

export class ItemsView {
  readonly group = new THREE.Group();
  private views = new Map<string, ItemView>();
  private time = 0;

  constructor(state: GameState) {
    for (const item of state.items) {
      const mesh = item.kind === 'part' ? createPart() : createCartridge();
      this.views.set(item.id, { mesh, target: new THREE.Vector3(), carriedBy: null });
      this.group.add(mesh);
    }
    this.sync(state, true);
  }

  sync(state: GameState, instant = false): void {
    // Скільки предметів лежить у кожній клітинці — щоб розкласти їх по колу, а не в купу
    const lying = new Map<string, string[]>();
    for (const item of state.items) {
      if (item.installed || item.carriedBy) continue;
      lying.set(item.cellId!, [...(lying.get(item.cellId!) ?? []), item.id]);
    }

    for (const item of state.items) {
      const view = this.views.get(item.id)!;
      view.mesh.visible = !item.installed;
      view.carriedBy = item.carriedBy;
      if (!item.carriedBy && !item.installed) {
        const cell = state.world.cells[item.cellId!];
        const here = lying.get(item.cellId!)!;
        // Розкладаємо по колу навколо центру клітинки (з боку, ближчого до камери)
        const angle = Math.PI / 2 + (here.indexOf(item.id) - (here.length - 1) / 2) * 0.9;
        view.target.set(cell.x + Math.cos(angle) * 0.75, 0.15, cell.z + Math.sin(angle) * 0.75);
      }
      if (instant) view.mesh.position.copy(view.target);
    }
  }

  update(dt: number, units: UnitsView): void {
    this.time += dt;
    const t = Math.min(1, (dt / MOVE_TIME) * 4);
    for (const view of this.views.values()) {
      if (view.carriedBy) {
        view.target.copy(units.displayPosition(view.carriedBy));
        view.target.y += HELD_HEIGHT;
      }
      view.mesh.position.lerp(view.target, t);
      view.mesh.rotation.y = this.time * 1.5; // повільно крутиться — так предмет помітніший
    }
  }
}

// Деталь турелі: жовта «шестерня» — диск із зубцями
function createPart(): THREE.Group {
  const group = new THREE.Group();
  const material = new THREE.MeshStandardMaterial({ color: 0xffc23d, metalness: 0.4, roughness: 0.4, flatShading: true });
  const disc = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.1, 10), material);
  group.add(disc);
  for (let i = 0; i < 6; i++) {
    const tooth = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 0.1), material);
    const a = (i / 6) * Math.PI * 2;
    tooth.position.set(Math.cos(a) * 0.25, 0, Math.sin(a) * 0.25);
    tooth.rotation.y = -a;
    group.add(tooth);
  }
  group.traverse((obj) => (obj.castShadow = true));
  return group;
}

// Патрон: латунна гільза й мідна куля
function createCartridge(): THREE.Group {
  const group = new THREE.Group();
  const shell = new THREE.Mesh(
    new THREE.CylinderGeometry(0.11, 0.11, 0.36, 10),
    new THREE.MeshStandardMaterial({ color: 0xd9a441, metalness: 0.6, roughness: 0.3 }),
  );
  const tip = new THREE.Mesh(
    new THREE.ConeGeometry(0.11, 0.2, 10),
    new THREE.MeshStandardMaterial({ color: 0xc8643b, metalness: 0.5, roughness: 0.35 }),
  );
  shell.position.y = 0.08; // трохи піднімаємо, щоб не провалювався в підлогу
  tip.position.y = 0.36;
  group.add(shell, tip);
  group.traverse((obj) => (obj.castShadow = true));
  return group;
}
