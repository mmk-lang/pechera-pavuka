// Лінії огляду павука на підлозі:
//   активна (куди павук дивиться зараз) — суцільний червоний клин;
//   наступна (куди повернеться наприкінці раунду) — пунктирний клин.
// Клин — це трикутник від павука до стіни печери.

import * as THREE from 'three';
import type { Lane, LevelData } from '../core/types';

const DEG = Math.PI / 180;

interface LaneMeshes {
  fill: THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>;
  outline: THREE.Line<THREE.BufferGeometry, THREE.LineDashedMaterial>;
}

export class LanesView {
  readonly group = new THREE.Group();
  private lanes: LaneMeshes[] = [];

  constructor(level: LevelData) {
    for (const lane of level.lanes) {
      const points = wedgePoints(level, lane);
      // Заливка: віяло трикутників від павука
      const geometry = new THREE.BufferGeometry().setFromPoints(points);
      const index: number[] = [];
      for (let i = 1; i < points.length - 1; i++) index.push(0, i, i + 1);
      geometry.setIndex(index);
      const fill = new THREE.Mesh(
        geometry,
        new THREE.MeshBasicMaterial({ color: 0xff2a1a, transparent: true, opacity: 0.3, depthWrite: false, side: THREE.DoubleSide }),
      );
      // Контур: від павука по краю клину й назад до павука
      const outline = new THREE.Line(
        new THREE.BufferGeometry().setFromPoints([...points, points[0]]),
        new THREE.LineDashedMaterial({ color: 0xff5a3a, dashSize: 0.6, gapSize: 0.4, transparent: true }),
      );
      outline.computeLineDistances(); // потрібно, щоб пунктир працював
      fill.visible = outline.visible = false;
      this.lanes.push({ fill, outline });
      this.group.add(fill, outline);
    }
  }

  // Показати активну лінію (суцільну) і наступну (пунктирну, якщо showNext)
  sync(activeLane: number, nextLane: number, showNext: boolean): void {
    this.lanes.forEach(({ fill, outline }, id) => {
      const active = id === activeLane;
      const next = showNext && id === nextLane;
      fill.visible = active || next;
      fill.material.opacity = active ? 0.3 : 0.08;
      outline.visible = next; // пунктирний контур — лише в наступної
    });
  }
}

// Точки клину: павук, лівий край, середина, правий край (кожен край доходить до стіни)
function wedgePoints(level: LevelData, lane: Lane): THREE.Vector3[] {
  const y = 0.05;
  const origin = new THREE.Vector3(level.spider.x, y, level.spider.z);
  const points = [origin];
  for (const offset of [-lane.halfWidthDeg, -lane.halfWidthDeg / 2, 0, lane.halfWidthDeg / 2, lane.halfWidthDeg]) {
    const a = (lane.angleDeg + offset) * DEG;
    const dir = { x: Math.sin(a), z: Math.cos(a) };
    const length = distanceToWall(level, level.spider, dir);
    points.push(new THREE.Vector3(level.spider.x + dir.x * length, y, level.spider.z + dir.z * length));
  }
  return points;
}

// Скільки пройти від точки p у напрямку dir, щоб дійти до стіни печери
function distanceToWall(level: LevelData, p: { x: number; z: number }, dir: { x: number; z: number }): number {
  const halfW = level.cave.width / 2;
  const halfD = level.cave.depth / 2;
  const tx = dir.x > 0 ? (halfW - p.x) / dir.x : dir.x < 0 ? (-halfW - p.x) / dir.x : Infinity;
  const tz = dir.z > 0 ? (halfD - p.z) / dir.z : dir.z < 0 ? (-halfD - p.z) / dir.z : Infinity;
  return Math.min(tx, tz);
}
