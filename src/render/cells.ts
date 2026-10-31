// Клітинки на підлозі й лінії між сусідніми клітинками.
// Клітинки, куди вибраний солдат може піти, підсвічуються.
// Червоне кільце — клітинку бачить павук зараз; пунктирне помаранчеве — побачить наприкінці раунду.
// Якщо увімкнено showRisk — над клітинкою підпис «1 з 4»: ймовірність, що її бачитимуть після ворожої фази.

import * as THREE from 'three';
import { riskText } from '../core/risk';
import type { World } from '../core/state';

const COLOR_CELL = 0x3fa7a0; // звичайна клітинка — бірюзова
const COLOR_START = 0x5fd35f; // старт — зелений
const COLOR_TURRET = 0x4f7cff; // турель — синя
const COLOR_REACHABLE = 0xffd24a; // сюди можна піти — жовта
const COLOR_THROW = 0xff7a2a; // сюди можна кинути — помаранчева
const COLOR_DANGER_NOW = 0xff2a1a; // павук бачить зараз
const COLOR_DANGER_NEXT = 0xff9a2a; // павук побачить наприкінці раунду

export class CellsView {
  readonly group = new THREE.Group();
  private discs = new Map<string, THREE.Mesh<THREE.CircleGeometry, THREE.MeshBasicMaterial>>();
  private baseColors = new Map<string, number>();
  private dangerRings = new Map<string, THREE.Mesh<THREE.RingGeometry, THREE.MeshBasicMaterial>>();
  private riskLabels = new Map<string, THREE.Sprite>();
  private riskTextures = new Map<string, THREE.CanvasTexture>(); // однакові підписи малюємо один раз

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

      // Кільце небезпеки навколо клітинки (спершу сховане)
      const ring = new THREE.Mesh(
        new THREE.RingGeometry(0.72, 0.9, 28),
        new THREE.MeshBasicMaterial({ color: COLOR_DANGER_NOW, transparent: true, depthWrite: false }),
      );
      ring.rotation.x = -Math.PI / 2;
      ring.position.set(cell.x, 0.04, cell.z);
      ring.visible = false;
      this.dangerRings.set(cell.id, ring);
      this.group.add(ring);

      // Підпис ризику (спершу схований); лежить біля краю клітинки, ближче до камери
      const label = new THREE.Sprite(new THREE.SpriteMaterial({ depthTest: false, transparent: true }));
      label.scale.set(2.1, 0.84, 1);
      label.position.set(cell.x, 0.3, cell.z + 1.2);
      label.renderOrder = 9;
      label.visible = false;
      this.riskLabels.set(cell.id, label);
      this.group.add(label);
    }

    this.group.add(createLinks(world));
  }

  // Об'єкти, по яких можна клікнути
  get pickables(): THREE.Object3D[] {
    return [...this.discs.values()];
  }

  // Підсвічуємо клітинки: 'move' — куди можна піти (жовті), 'throw' — куди можна кинути (помаранчеві).
  // Решта — звичайного кольору.
  setHighlight(cellIds: string[], kind: 'move' | 'throw'): void {
    const highlighted = new Set(cellIds);
    const color = kind === 'move' ? COLOR_REACHABLE : COLOR_THROW;
    for (const [id, disc] of this.discs) {
      const on = highlighted.has(id);
      disc.material.color.setHex(on ? color : this.baseColors.get(id)!);
      disc.material.opacity = on ? 0.85 : 0.5;
    }
  }

  // Позначити небезпечні клітинки: now — бачить павук зараз, next — побачить наприкінці раунду
  // Показати підписи ризику (null — сховати всі). Клітинки без ризику підпису не мають.
  setRisk(risks: Map<string, number> | null): void {
    for (const [id, label] of this.riskLabels) {
      const p = risks?.get(id) ?? 0;
      label.visible = p > 0.01;
      if (!label.visible) continue;
      const text = riskText(p);
      const key = `${text}|${p >= 0.5 ? 2 : p >= 0.25 ? 1 : 0}`;
      if (!this.riskTextures.has(key)) this.riskTextures.set(key, riskTexture(text, p));
      label.material.map = this.riskTextures.get(key)!;
      label.material.needsUpdate = true;
    }
  }

  setDanger(now: Set<string>, next: Set<string>): void {
    for (const [id, ring] of this.dangerRings) {
      ring.visible = now.has(id) || next.has(id);
      ring.material.color.setHex(now.has(id) ? COLOR_DANGER_NOW : COLOR_DANGER_NEXT);
      ring.material.opacity = now.has(id) ? 0.95 : 0.6;
    }
  }
}

function riskTexture(text: string, p: number): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 160;
  canvas.height = 64;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = 'rgba(20, 14, 12, 0.8)';
  ctx.beginPath();
  ctx.roundRect(4, 6, 152, 52, 18);
  ctx.fill();
  // Колір від жовтого (малий ризик) до червоного (великий)
  ctx.fillStyle = p >= 0.5 ? '#ff4a3a' : p >= 0.25 ? '#ff9a2a' : '#ffe14a';
  ctx.font = 'bold 34px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, 80, 34);
  return new THREE.CanvasTexture(canvas);
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
