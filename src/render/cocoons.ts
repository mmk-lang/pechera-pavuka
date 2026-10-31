// Кокони: білі «коконо-яйця» з великим лічильником над ними (3 → 2 → 1, колір червоніє).
// Кокон лежить у клітинці або на плечах у солдата, який його несе.

import * as THREE from 'three';
import type { GameState } from '../core/state';
import type { Cocoon } from '../core/types';
import type { UnitsView } from './units';

const MOVE_TIME = 0.3;
const CARRY_HEIGHT = 1.05;
// Колір лічильника залежно від того, скільки ходів лишилось
const TIMER_COLORS: Record<number, string> = { 3: '#ffe14a', 2: '#ff9a2a', 1: '#ff3b2a' };

interface CocoonView {
  group: THREE.Group;
  label: THREE.Sprite;
  turnsShown: number;
  target: THREE.Vector3;
  carriedBy: string | null;
}

export class CocoonsView {
  readonly group = new THREE.Group();
  private views = new Map<string, CocoonView>();
  private geometry = new THREE.IcosahedronGeometry(1, 1);
  private material = new THREE.MeshStandardMaterial({ color: 0xe9e4d6, roughness: 0.9, flatShading: true });

  sync(state: GameState, instant = false): void {
    // Прибираємо кокони, яких уже немає (солдата врятували або він загинув)
    for (const [id, view] of this.views) {
      if (!state.cocoons.some((c) => c.id === id)) {
        this.group.remove(view.group);
        this.views.delete(id);
      }
    }
    for (const cocoon of state.cocoons) {
      let view = this.views.get(cocoon.id);
      const isNew = !view;
      if (!view) {
        view = this.create();
        this.views.set(cocoon.id, view);
      }
      view.carriedBy = cocoon.carriedBy;
      if (!cocoon.carriedBy) view.target.copy(positionInCell(state, cocoon));
      if (isNew || instant) view.group.position.copy(view.target);
      if (view.turnsShown !== cocoon.turnsLeft) setLabel(view, cocoon.turnsLeft);
    }
  }

  update(dt: number, units: UnitsView): void {
    const t = Math.min(1, (dt / MOVE_TIME) * 4);
    for (const view of this.views.values()) {
      if (view.carriedBy) view.target.copy(units.displayPosition(view.carriedBy)).setY(CARRY_HEIGHT);
      view.group.position.lerp(view.target, t);
    }
  }

  private create(): CocoonView {
    const group = new THREE.Group();
    const body = new THREE.Mesh(this.geometry, this.material);
    body.scale.set(0.32, 0.32, 0.6); // видовжений, лежить на боці
    body.position.y = 0.3;
    body.castShadow = true;
    // Кілька темніших «ниток» павутини навколо
    for (const z of [-0.3, 0, 0.3]) {
      const band = new THREE.Mesh(
        new THREE.TorusGeometry(0.31, 0.03, 4, 12),
        new THREE.MeshStandardMaterial({ color: 0xbdb5a2 }),
      );
      band.position.set(0, 0.3, z);
      group.add(band);
    }
    const label = new THREE.Sprite(new THREE.SpriteMaterial({ depthTest: false }));
    label.scale.set(0.75, 0.75, 1);
    label.position.set(0, 1.7, -0.3); // вище й трохи позаду, щоб не закривати сам кокон
    label.renderOrder = 10; // лічильник завжди видно, навіть крізь камінь
    group.add(body, label);
    this.group.add(group);
    return { group, label, turnsShown: -1, target: new THREE.Vector3(), carriedBy: null };
  }
}

// Кокон лежить трохи ближче до камери, ніж центр клітинки, щоб не ховатися за солдатами
function positionInCell(state: GameState, cocoon: Cocoon): THREE.Vector3 {
  const cell = state.world.cells[cocoon.cellId];
  const here = state.cocoons.filter((c) => c.cellId === cocoon.cellId && !c.carriedBy);
  const index = here.indexOf(cocoon);
  return new THREE.Vector3(cell.x + (index - (here.length - 1) / 2) * 0.7, 0, cell.z + 0.55);
}

// Малюємо число на маленькому «полотні» й робимо з нього текстуру для спрайта
function setLabel(view: CocoonView, turns: number): void {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 128;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = 'rgba(20, 14, 12, 0.85)';
  ctx.beginPath();
  ctx.arc(64, 64, 58, 0, Math.PI * 2);
  ctx.fill();
  ctx.lineWidth = 8;
  ctx.strokeStyle = TIMER_COLORS[turns] ?? '#ff3b2a';
  ctx.stroke();
  ctx.fillStyle = TIMER_COLORS[turns] ?? '#ff3b2a';
  ctx.font = 'bold 80px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(String(turns), 64, 70);
  view.label.material.map?.dispose();
  view.label.material.map = new THREE.CanvasTexture(canvas);
  view.label.material.needsUpdate = true;
  view.turnsShown = turns;
}
