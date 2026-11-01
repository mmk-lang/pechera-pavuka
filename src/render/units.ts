// Солдати: фігурки з циліндра й кулі, над головою — три точки AP, під ногами — кільце вибору.
// Рендер лише читає стан гри: метод sync() отримує новий стан і показує його.

import * as THREE from 'three';
import type { GameState } from '../core/state';
import type { Soldier } from '../core/types';
import { Hop } from './hop';

// Колір кожного солдата (такі самі кольори в картках унизу екрана — див. style.css)
export const SOLDIER_COLORS = [0xf28c28, 0xa66bff, 0xff6fa8, 0xf0e6c8];

const AP_ON = 0x7dff7a; // очко дії є
const AP_OFF = 0x333333; // очко дії витрачене
const MOVE_TIME = 0.3; // скільки секунд фігурка йде до нової клітинки

interface SoldierView {
  group: THREE.Group;
  apDots: THREE.Mesh<THREE.SphereGeometry, THREE.MeshBasicMaterial>[];
  ring: THREE.Mesh;
  base: THREE.Vector3; // де фігурка зараз «на землі» (без підскоку кидка)
  target: THREE.Vector3; // куди фігурка має прийти
  hop: Hop; // політ дугою, коли солдата кинули
  carriedBy: string | null; // якщо солдата несуть — він «лежить» на плечах у носія
}

const CARRY_HEIGHT = 1.05; // на якій висоті лежить солдат, якого несуть

export class UnitsView {
  readonly group = new THREE.Group();
  private views = new Map<string, SoldierView>();
  private pickMeshes: THREE.Object3D[] = [];

  constructor(state: GameState) {
    state.soldiers.forEach((soldier, i) => {
      const color = SOLDIER_COLORS[i % SOLDIER_COLORS.length];
      const view = createSoldier(soldier.id, color, state.balance.apPerTurn);
      this.views.set(soldier.id, view);
      this.group.add(view.group);
      view.group.traverse((obj) => {
        if (obj instanceof THREE.Mesh && obj.userData.soldierId) this.pickMeshes.push(obj);
      });
    });
    this.sync(state, null, true);
  }

  // Об'єкти, по яких можна клікнути (сховані, наприклад мертві, — не можна)
  get pickables(): THREE.Object3D[] {
    return this.pickMeshes.filter((mesh) => mesh.parent!.visible);
  }

  // Показати новий стан. instant = true — без анімації (на старті)
  sync(state: GameState, selectedId: string | null, instant = false): void {
    for (const soldier of state.soldiers) {
      const view = this.views.get(soldier.id)!;
      view.carriedBy = soldier.carriedBy;
      // Солдат, якого несуть, не займає місця в клітинці — його позицію рахує update()
      if (!soldier.carriedBy) view.target.copy(positionInCell(state, soldier));
      if (instant) {
        view.base.copy(view.target);
        view.group.position.copy(view.target);
      }

      // Точки AP: світяться ті, що ще лишились
      view.apDots.forEach((dot, i) => dot.material.color.setHex(i < soldier.ap ? AP_ON : AP_OFF));
      view.apDots.forEach((dot) => (dot.visible = !soldier.carriedBy)); // кого несуть, той не діє
      view.ring.visible = soldier.id === selectedId;
      view.group.visible = soldier.status === 'free'; // замотаного показує кокон, мертвого — ніхто
    }
  }

  // Щокадру плавно ведемо фігурки до їхніх клітинок
  update(dt: number): void {
    // Щокадру проходимо частку решти шляху: швидко на початку, м'яко в кінці
    const t = Math.min(1, (dt / MOVE_TIME) * 4);
    for (const view of this.views.values()) {
      if (view.carriedBy) {
        // Лежить на плечах у носія й рухається разом із ним
        view.target.copy(this.views.get(view.carriedBy)!.group.position).setY(CARRY_HEIGHT);
      }
      view.base.lerp(view.target, t);
      view.group.position.copy(view.base);
      view.group.position.y += view.hop.offset(dt);
      // Кого несуть — повертаємо горизонтально
      const lying = view.carriedBy ? Math.PI / 2 : 0;
      view.group.rotation.z += (lying - view.group.rotation.z) * t;
    }
  }

  // Де зараз фігурка солдата на екрані (щоб предмет у руках і панель дій були поруч)
  // Солдата кинули — він летить дугою
  throwSoldier(soldierId: string): void {
    this.views.get(soldierId)?.hop.start();
  }

  displayPosition(soldierId: string): THREE.Vector3 {
    return this.views.get(soldierId)!.group.position;
  }
}

// Де саме в клітинці стоїть солдат: якщо їх двоє — ставимо поруч, а не один в одному
function positionInCell(state: GameState, soldier: Soldier): THREE.Vector3 {
  const cell = state.world.cells[soldier.cellId];
  const together = state.soldiers.filter((s) => s.cellId === soldier.cellId && s.status !== 'dead' && !s.carriedBy);
  const index = together.indexOf(soldier);
  const offset = together.length > 1 ? (index - (together.length - 1) / 2) * 0.5 : 0;
  return new THREE.Vector3(cell.x + offset, 0, cell.z);
}

function createSoldier(id: string, color: number, apCount: number): SoldierView {
  const group = new THREE.Group();
  const material = new THREE.MeshStandardMaterial({ color, roughness: 0.6, flatShading: true });

  // Тіло — циліндр, голова — куля. userData.soldierId потрібен, щоб клік знав, кого вибрали
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.26, 0.8, 8), material);
  body.position.y = 0.4;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.2, 10, 8), material);
  head.position.y = 0.98;
  for (const mesh of [body, head]) {
    mesh.castShadow = true;
    mesh.userData.soldierId = id;
  }
  group.add(body, head);

  // Невидима «товста» капсула навколо фігурки — щоб по ній легко було влучити пальцем
  const hitBox = new THREE.Mesh(
    new THREE.CylinderGeometry(0.45, 0.45, 1.5, 8),
    new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false }),
  );
  hitBox.position.y = 0.75;
  hitBox.userData.soldierId = id;
  group.add(hitBox);

  // Точки AP над головою (стільки, скільки apPerTurn у balance.json)
  const apDots: SoldierView['apDots'] = [];
  for (let i = 0; i < apCount; i++) {
    const dot = new THREE.Mesh(new THREE.SphereGeometry(0.08, 8, 6), new THREE.MeshBasicMaterial({ color: AP_ON }));
    dot.position.set((i - (apCount - 1) / 2) * 0.22, 1.42, 0);
    apDots.push(dot);
    group.add(dot);
  }

  // Жовте кільце під ногами — «цей солдат вибраний»
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(0.38, 0.5, 28),
    new THREE.MeshBasicMaterial({ color: 0xffe14a, side: THREE.DoubleSide }),
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.04;
  ring.visible = false;
  group.add(ring);

  return { group, apDots, ring, base: new THREE.Vector3(), target: new THREE.Vector3(), hop: new Hop(), carriedBy: null };
}
