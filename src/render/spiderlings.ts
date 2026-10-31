// Павучата: маленькі павуки в клітинках. Кожне стоїть трохи ближче до клітинки, на яку дивиться,
// а під ним на підлозі — червона стрілка в той бік (напрям погляду завжди видно, як у ТЗ).
// Убите павуча перевертається й зникає.

import * as THREE from 'three';
import type { GameState } from '../core/state';
import type { Spiderling } from '../core/types';
import { createSpider } from './spider';

const MOVE_TIME = 0.3;
const SCALE = 0.32; // павуча — це павук, зменшений приблизно втричі
const OFFSET = 0.75; // наскільки павуча зсунуте від центру клітинки в бік погляду
const ARROW_LENGTH = 1.6;
const DIE_TIME = 0.6;

interface SpiderlingView {
  group: THREE.Group; // павуча + стрілка; повертається в бік погляду
  body: THREE.Group;
  target: THREE.Vector3;
  targetYaw: number;
  dying: number; // скільки секунд уже вмирає (0 — живе)
}

export class SpiderlingsView {
  readonly group = new THREE.Group();
  private views = new Map<string, SpiderlingView>();

  constructor(state: GameState) {
    this.sync(state, true);
  }

  sync(state: GameState, instant = false): void {
    // Павучат, яких більше немає в стані, позначаємо як «вмирають» — їх прибере update()
    for (const [id, view] of this.views) {
      if (!view.dying && !state.spiderlings.some((s) => s.id === id)) view.dying = 0.001;
    }
    for (const s of state.spiderlings) {
      let view = this.views.get(s.id);
      const isNew = !view;
      if (!view) {
        view = createSpiderlingView();
        this.views.set(s.id, view);
        this.group.add(view.group);
      }
      const { position, yaw } = placement(state, s);
      view.target.copy(position);
      view.targetYaw = nearestAngle(view.group.rotation.y, yaw);
      if (isNew || instant) {
        view.group.position.copy(position);
        view.group.rotation.y = view.targetYaw;
      }
    }
  }

  update(dt: number): void {
    const t = Math.min(1, (dt / MOVE_TIME) * 4);
    for (const [id, view] of this.views) {
      view.group.position.lerp(view.target, t);
      view.group.rotation.y += (view.targetYaw - view.group.rotation.y) * t;
      if (!view.dying) continue;
      // Перевертаємось лапами догори й зменшуємось до нуля
      view.dying += dt;
      const k = Math.min(1, view.dying / DIE_TIME);
      view.body.rotation.z = Math.PI * k;
      view.group.scale.setScalar(1 - k);
      if (k >= 1) {
        this.group.remove(view.group);
        this.views.delete(id);
      }
    }
  }
}

function createSpiderlingView(): SpiderlingView {
  const group = new THREE.Group();
  const body = createSpider(0, 0, 0x4a2a22);
  body.scale.setScalar(SCALE);
  // Стрілка на підлозі: дивиться вздовж +z (як очі павука), далі вся група повертається
  const arrow = createArrow();
  arrow.position.set(0, 0.06, 0.45);
  group.add(body, arrow);
  return { group, body, target: new THREE.Vector3(), targetYaw: 0, dying: 0 };
}

// Плоска стрілка: прямокутник-«древко» і трикутник-«наконечник»
function createArrow(): THREE.Mesh {
  const w = 0.12; // половина ширини древка
  const head = 0.55; // довжина наконечника
  const shape = new THREE.Shape();
  shape.moveTo(-w, 0);
  shape.lineTo(w, 0);
  shape.lineTo(w, ARROW_LENGTH - head);
  shape.lineTo(0.35, ARROW_LENGTH - head);
  shape.lineTo(0, ARROW_LENGTH);
  shape.lineTo(-0.35, ARROW_LENGTH - head);
  shape.lineTo(-w, ARROW_LENGTH - head);
  shape.closePath();
  const geometry = new THREE.ShapeGeometry(shape);
  geometry.rotateX(Math.PI / 2); // кладемо на підлогу: вісь y фігури стає віссю +z
  const material = new THREE.MeshBasicMaterial({ color: 0xff4a2a, transparent: true, opacity: 0.85, depthWrite: false, side: THREE.DoubleSide });
  return new THREE.Mesh(geometry, material);
}

// Де стоїть павуча і куди повернуте. Кілька павучат в одній клітинці трохи розсуваємо.
function placement(state: GameState, s: Spiderling): { position: THREE.Vector3; yaw: number } {
  const cell = state.world.cells[s.cellId];
  const facing = state.world.cells[s.facingCellId];
  const dx = facing.x - cell.x;
  const dz = facing.z - cell.z;
  const length = Math.hypot(dx, dz) || 1;
  const together = state.spiderlings.filter((o) => o.cellId === s.cellId);
  const spread = (together.indexOf(s) - (together.length - 1) / 2) * 0.6;
  // Зсув у бік погляду плюс розсування впоперек (перпендикуляр до напрямку)
  const x = cell.x + (dx / length) * OFFSET + (-dz / length) * spread;
  const z = cell.z + (dz / length) * OFFSET + (dx / length) * spread;
  return { position: new THREE.Vector3(x, 0, z), yaw: Math.atan2(dx, dz) };
}

// Обираємо кут, найближчий до поточного, щоб павуча не крутилось «через усе коло»
function nearestAngle(current: number, target: number): number {
  const full = Math.PI * 2;
  return target + Math.round((current - target) / full) * full;
}
