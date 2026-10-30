// Камера, що дивиться на печеру згори під кутом.
// Камера «прив'язана» до точки на підлозі (target) і дивиться на неї з відстані distance.
// Рух камери = рух цієї точки; масштаб = зміна відстані; поворот = кут yaw навколо вертикалі.

import * as THREE from 'three';
import type { CameraBalance } from '../core/balance';
import type { CaveSize } from '../core/types';

const DEG = Math.PI / 180;

export class CameraRig {
  readonly camera: THREE.PerspectiveCamera;
  private target = new THREE.Vector2(0, 0); // x і z точки, на яку дивимось
  private distance: number;
  private yaw = 0; // поворот у радіанах; 0 — камера стоїть з боку гравця (+z) і дивиться на павука
  private readonly pitch: number;

  constructor(
    private readonly settings: CameraBalance,
    private readonly cave: CaveSize,
  ) {
    this.camera = new THREE.PerspectiveCamera(50, 1, 0.1, 500);
    this.pitch = settings.pitchDeg * DEG;
    this.distance = settings.startDistance;
    this.update();
  }

  // Рух у «екранних» напрямках: right — праворуч по екрану, forward — вгору по екрану.
  pan(right: number, forward: number): void {
    const sin = Math.sin(this.yaw);
    const cos = Math.cos(this.yaw);
    this.target.x += right * cos - forward * sin;
    this.target.y += -right * sin - forward * cos;
    this.update();
  }

  // Рух на задану кількість пікселів (для перетягування мишею чи пальцем).
  // Підлога «їде» за курсором, тому знаки мінус.
  panByPixels(dxPixels: number, dyPixels: number, viewportHeight: number): void {
    // Скільки метрів підлоги вміщається в один піксель на цій відстані
    const visibleHeight = 2 * this.distance * Math.tan((this.camera.fov * DEG) / 2);
    const metersPerPixel = visibleHeight / viewportHeight;
    // Камера дивиться під кутом, тому вертикальний рух на екрані трохи «розтягнутий»
    this.pan(-dxPixels * metersPerPixel, (dyPixels * metersPerPixel) / Math.sin(this.pitch));
  }

  // Масштаб: factor > 1 — віддалити, factor < 1 — наблизити
  zoom(factor: number): void {
    this.distance *= factor;
    this.update();
  }

  // Поворот навколо вертикальної осі (у градусах)
  rotate(deltaDeg: number): void {
    this.yaw += deltaDeg * DEG;
    this.update();
  }

  // Підганяємо камеру під нові розміри вікна
  resize(width: number, height: number): void {
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
  }

  // Обмежуємо значення й ставимо камеру в потрібне місце
  private update(): void {
    const { minDistance, maxDistance } = this.settings;
    this.distance = THREE.MathUtils.clamp(this.distance, minDistance, maxDistance);
    // Точка, на яку дивимось, не виходить за стіни печери
    this.target.x = THREE.MathUtils.clamp(this.target.x, -this.cave.width / 2, this.cave.width / 2);
    this.target.y = THREE.MathUtils.clamp(this.target.y, -this.cave.depth / 2, this.cave.depth / 2);

    // Розкладаємо відстань на висоту й горизонтальний відступ
    const height = this.distance * Math.sin(this.pitch);
    const back = this.distance * Math.cos(this.pitch);
    this.camera.position.set(
      this.target.x + Math.sin(this.yaw) * back,
      height,
      this.target.y + Math.cos(this.yaw) * back,
    );
    this.camera.lookAt(this.target.x, 0, this.target.y);
  }
}
