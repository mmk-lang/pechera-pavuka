// Турель: стоїть поруч зі своєю клітинкою, ствол дивиться на павука.
// Чотири гнізда для деталей загоряються жовтим, коли деталь встановлено;
// лампа патрона — помаранчева, коли турель заряджена. Постріл — яскравий промінь до павука.

import * as THREE from 'three';
import type { TurretStatus, World } from '../core/state';

const SLOT_EMPTY = 0x3a3a3a;
const SLOT_FULL = 0xffc23d;
const BEAM_TIME = 0.5; // скільки секунд видно промінь пострілу

export class TurretView {
  readonly group = new THREE.Group();
  private slots: THREE.Mesh<THREE.BoxGeometry, THREE.MeshStandardMaterial>[] = [];
  private lamp: THREE.Mesh<THREE.SphereGeometry, THREE.MeshStandardMaterial>;
  private barrelMaterial: THREE.MeshStandardMaterial;
  private beam: THREE.Mesh<THREE.CylinderGeometry, THREE.MeshBasicMaterial>;
  private beamLeft = 0;

  constructor(world: World) {
    const cell = world.cells[world.level.turretCell];
    const spider = world.level.spider;

    // Напрямок від клітинки до павука й «убік» від нього — турель ставимо збоку від клітинки
    const toSpider = new THREE.Vector2(spider.x - cell.x, spider.z - cell.z).normalize();
    const side = new THREE.Vector2(-toSpider.y, toSpider.x);
    this.group.position.set(cell.x + side.x * 1.15, 0, cell.z + side.y * 1.15);
    // Повертаємо всю турель стволом до павука
    this.group.rotation.y = Math.atan2(spider.x - this.group.position.x, spider.z - this.group.position.z);

    const metal = new THREE.MeshStandardMaterial({ color: 0x55606b, metalness: 0.5, roughness: 0.5, flatShading: true });
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.6, 0.4, 8), metal);
    base.position.y = 0.2;
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.45, 0.8), metal);
    body.position.y = 0.62;

    // Ствол: сірий, поки турель зламана; синій, коли всі деталі на місці
    this.barrelMaterial = new THREE.MeshStandardMaterial({ color: 0x444444, metalness: 0.6, roughness: 0.4 });
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.12, 1.1, 10), this.barrelMaterial);
    barrel.rotation.x = Math.PI / 2; // кладемо циліндр горизонтально, уздовж осі z (на павука)
    barrel.position.set(0, 0.7, 0.85);
    this.group.add(base, body, barrel);

    // 4 гнізда для деталей — на боках корпусу
    for (let i = 0; i < 4; i++) {
      const slot = new THREE.Mesh(
        new THREE.BoxGeometry(0.16, 0.16, 0.16),
        new THREE.MeshStandardMaterial({ color: SLOT_EMPTY, emissive: 0x000000 }),
      );
      slot.position.set(i < 2 ? -0.38 : 0.38, 0.62, i % 2 === 0 ? -0.2 : 0.2);
      this.slots.push(slot);
      this.group.add(slot);
    }

    // Лампа патрона — зверху
    this.lamp = new THREE.Mesh(new THREE.SphereGeometry(0.12, 10, 8), new THREE.MeshStandardMaterial({ color: SLOT_EMPTY }));
    this.lamp.position.set(0, 0.95, -0.15);
    this.group.add(this.lamp);
    this.group.traverse((obj) => (obj.castShadow = true));

    // Промінь пострілу: довгий тонкий циліндр від ствола до павука, спершу схований
    const length = Math.hypot(spider.x - this.group.position.x, spider.z - this.group.position.z);
    this.beam = new THREE.Mesh(
      new THREE.CylinderGeometry(0.12, 0.12, length, 8),
      new THREE.MeshBasicMaterial({ color: 0xfff2a8, transparent: true, opacity: 0 }),
    );
    this.beam.rotation.x = Math.PI / 2;
    this.beam.position.set(0, 0.9, length / 2);
    this.group.add(this.beam);
  }

  sync(status: TurretStatus): void {
    this.slots.forEach((slot, i) => {
      const full = i < status.partsInstalled;
      slot.material.color.setHex(full ? SLOT_FULL : SLOT_EMPTY);
      slot.material.emissive.setHex(full ? 0x6b4a00 : 0x000000);
    });
    this.lamp.material.color.setHex(status.loaded ? 0xff8a2a : SLOT_EMPTY);
    this.lamp.material.emissive.setHex(status.loaded ? 0x803000 : 0x000000);
    this.barrelMaterial.color.setHex(status.repaired ? 0x4f7cff : 0x444444);
  }

  fire(): void {
    this.beamLeft = BEAM_TIME;
  }

  update(dt: number): void {
    this.beamLeft = Math.max(0, this.beamLeft - dt);
    this.beam.material.opacity = this.beamLeft / BEAM_TIME; // промінь поступово гасне
  }
}
