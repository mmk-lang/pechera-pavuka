// Керування камерою мишею, клавіатурою та пальцями.
//   Миша: перетягування — рух, колесо — масштаб.
//   Клавіатура: WASD або стрілки — рух, Q/E — поворот, +/- — масштаб.
//   Телефон: один палець — рух, два пальці — масштаб (щипок) і поворот.

import type { CameraBalance } from '../core/balance';
import type { CameraRig } from '../render/camera';

export class CameraInput {
  private keys = new Set<string>(); // клавіші, затиснуті зараз
  private pointers = new Map<number, { x: number; y: number }>(); // пальці / миша на екрані

  constructor(
    private readonly rig: CameraRig,
    private readonly element: HTMLElement,
    private readonly settings: CameraBalance,
  ) {
    element.addEventListener('pointerdown', this.onPointerDown);
    element.addEventListener('pointermove', this.onPointerMove);
    element.addEventListener('pointerup', this.onPointerUp);
    element.addEventListener('pointercancel', this.onPointerUp);
    element.addEventListener('wheel', this.onWheel, { passive: false });
    window.addEventListener('keydown', (e) => this.keys.add(e.code));
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    // Якщо вікно втратило фокус, «відпускаємо» всі клавіші, щоб камера не їхала сама
    window.addEventListener('blur', () => this.keys.clear());
  }

  // Викликається щокадру: dt — скільки секунд минуло з попереднього кадру
  update(dt: number): void {
    const has = (...codes: string[]) => codes.some((c) => this.keys.has(c));
    let right = 0;
    let forward = 0;
    if (has('KeyD', 'ArrowRight')) right += 1;
    if (has('KeyA', 'ArrowLeft')) right -= 1;
    if (has('KeyW', 'ArrowUp')) forward += 1;
    if (has('KeyS', 'ArrowDown')) forward -= 1;
    if (right !== 0 || forward !== 0) {
      const step = this.settings.panSpeed * dt;
      this.rig.pan(right * step, forward * step);
    }

    if (has('KeyQ')) this.rig.rotate(-this.settings.rotateSpeedDeg * dt);
    if (has('KeyE')) this.rig.rotate(this.settings.rotateSpeedDeg * dt);

    // Плавний масштаб клавішами: за секунду — приблизно у два «клаци» колеса
    const zoomPerSecond = Math.pow(this.settings.zoomStep, 4 * dt);
    if (has('Equal', 'NumpadAdd')) this.rig.zoom(1 / zoomPerSecond);
    if (has('Minus', 'NumpadSubtract')) this.rig.zoom(zoomPerSecond);
  }

  private onWheel = (e: WheelEvent): void => {
    e.preventDefault(); // щоб сторінка не прокручувалась
    // Колесо від себе (deltaY < 0) — наблизити
    this.rig.zoom(e.deltaY > 0 ? this.settings.zoomStep : 1 / this.settings.zoomStep);
  };

  private onPointerDown = (e: PointerEvent): void => {
    this.element.setPointerCapture(e.pointerId);
    this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  };

  private onPointerUp = (e: PointerEvent): void => {
    this.pointers.delete(e.pointerId);
  };

  private onPointerMove = (e: PointerEvent): void => {
    const prev = this.pointers.get(e.pointerId);
    if (!prev) return; // кнопка не натиснута — нічого не робимо

    if (this.pointers.size === 1) {
      // Один палець або миша: тягнемо підлогу
      this.rig.panByPixels(e.clientX - prev.x, e.clientY - prev.y, this.element.clientHeight);
    } else if (this.pointers.size === 2) {
      // Два пальці: порівнюємо відстань і кут між ними до й після руху
      const other = [...this.pointers.entries()].find(([id]) => id !== e.pointerId)![1];
      const before = { dx: prev.x - other.x, dy: prev.y - other.y };
      const after = { dx: e.clientX - other.x, dy: e.clientY - other.y };

      const lenBefore = Math.hypot(before.dx, before.dy);
      const lenAfter = Math.hypot(after.dx, after.dy);
      if (lenBefore > 0 && lenAfter > 0) this.rig.zoom(lenBefore / lenAfter); // розвели пальці — наблизили

      const angleBefore = Math.atan2(before.dy, before.dx);
      const angleAfter = Math.atan2(after.dy, after.dx);
      this.rig.rotate(((angleAfter - angleBefore) * 180) / Math.PI);
    }

    this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  };
}
