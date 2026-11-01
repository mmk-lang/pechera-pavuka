// Короткі спецефекти: кільце, що розходиться по підлозі й зникає.
// Білий — павук замотав солдата, зелений — порятунок чи вбите павуча, жовтий — деталь у турелі.

import * as THREE from 'three';

const BURST_TIME = 0.6; // секунд
const BURST_SIZE = 2.6; // наскільки розходиться кільце

export const EFFECT_COLORS = {
  capture: 0xffffff,
  good: 0x7dff7a,
  install: 0xffd24a,
};

interface Burst {
  mesh: THREE.Mesh<THREE.RingGeometry, THREE.MeshBasicMaterial>;
  age: number;
}

export class EffectsView {
  readonly group = new THREE.Group();
  private bursts: Burst[] = [];
  private geometry = new THREE.RingGeometry(0.5, 0.65, 32);

  burst(x: number, z: number, color: number): void {
    const material = new THREE.MeshBasicMaterial({ color, transparent: true, depthWrite: false, side: THREE.DoubleSide });
    const mesh = new THREE.Mesh(this.geometry, material);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(x, 0.1, z);
    this.group.add(mesh);
    this.bursts.push({ mesh, age: 0 });
  }

  update(dt: number): void {
    for (const b of this.bursts) {
      b.age += dt;
      const k = Math.min(1, b.age / BURST_TIME);
      b.mesh.scale.setScalar(1 + k * BURST_SIZE);
      b.mesh.material.opacity = 1 - k;
    }
    // Прибираємо догорілі
    for (const b of this.bursts.filter((b) => b.age >= BURST_TIME)) {
      this.group.remove(b.mesh);
      b.mesh.material.dispose();
    }
    this.bursts = this.bursts.filter((b) => b.age < BURST_TIME);
  }
}
