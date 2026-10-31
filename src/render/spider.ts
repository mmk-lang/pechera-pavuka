// Тимчасова модель павука з куль і циліндрів. Поки що він стоїть у гнізді, а після пострілу турелі —
// перевертається лапами догори.

import * as THREE from 'three';

export function createSpider(x: number, z: number): THREE.Group {
  const spider = new THREE.Group();
  const bodyMaterial = new THREE.MeshStandardMaterial({ color: 0x1c1416, roughness: 0.6, flatShading: true });
  const eyeMaterial = new THREE.MeshBasicMaterial({ color: 0xff3030 });

  // Черевце й голова
  const abdomen = new THREE.Mesh(new THREE.IcosahedronGeometry(1.4, 1), bodyMaterial);
  abdomen.position.set(0, 1.4, -1);
  const head = new THREE.Mesh(new THREE.IcosahedronGeometry(0.8, 1), bodyMaterial);
  head.position.set(0, 1.1, 0.6);
  spider.add(abdomen, head);

  // Червоні очі дивляться вглиб печери (+z)
  for (const ex of [-0.3, 0.3]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.15, 8, 8), eyeMaterial);
    eye.position.set(ex, 1.35, 1.3);
    spider.add(eye);
  }

  // Вісім ніг: по чотири з кожного боку, кожна — нахилений циліндр
  const legGeometry = new THREE.CylinderGeometry(0.08, 0.06, 2.6, 6);
  for (const side of [-1, 1]) {
    for (let i = 0; i < 4; i++) {
      const leg = new THREE.Mesh(legGeometry, bodyMaterial);
      leg.position.set(side * 1.3, 0.7, 0.9 - i * 0.6);
      leg.rotation.z = side * 1.0; // розводимо ноги в сторони
      leg.rotation.y = (i - 1.5) * 0.35 * side; // віялом вперед-назад
      spider.add(leg);
    }
  }

  spider.traverse((obj) => (obj.castShadow = true));
  spider.position.set(x, 0, z);
  return spider;
}

// Павук на сцені: модель + анімація загибелі
export class SpiderView {
  readonly group: THREE.Group;
  private dead = false;

  constructor(x: number, z: number) {
    this.group = createSpider(x, z);
  }

  die(): void {
    this.dead = true;
  }

  update(dt: number): void {
    if (!this.dead) return;
    // Плавно перевертаємо на спину й трохи опускаємо
    const t = Math.min(1, dt * 3);
    this.group.rotation.z += (Math.PI - this.group.rotation.z) * t;
    this.group.position.y += (2.2 - this.group.position.y) * t;
  }
}
