// Підлога й стіни печери з простих примітивів (без зовнішніх моделей).

import * as THREE from 'three';
import type { CaveSize } from '../core/types';

export function createCave(cave: CaveSize): THREE.Group {
  const group = new THREE.Group();

  // Підлога — велика пласка площина, повернута горизонтально
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(cave.width, cave.depth),
    new THREE.MeshStandardMaterial({ color: 0x3b3128, roughness: 1 }),
  );
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  group.add(floor);

  // Стіни — чотири товсті бокси навколо підлоги
  const wallMaterial = new THREE.MeshStandardMaterial({ color: 0x2a231d, roughness: 1, flatShading: true });
  const thickness = 1.5;
  const h = cave.wallHeight;
  const walls = [
    // [ширина, глибина, x, z]
    [cave.width + thickness * 2, thickness, 0, -cave.depth / 2 - thickness / 2], // дальня
    [cave.width + thickness * 2, thickness, 0, cave.depth / 2 + thickness / 2], // ближня
    [thickness, cave.depth, -cave.width / 2 - thickness / 2, 0], // ліва
    [thickness, cave.depth, cave.width / 2 + thickness / 2, 0], // права
  ];
  for (const [w, d, x, z] of walls) {
    const wall = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), wallMaterial);
    wall.position.set(x, h / 2, z);
    wall.castShadow = true;
    wall.receiveShadow = true;
    group.add(wall);
  }

  return group;
}
