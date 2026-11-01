// «Підскок» для анімації кидка: предмет, солдат чи кокон летить дугою.
// Ми не рахуємо справжню фізику: просто піднімаємо об'єкт над землею за формою півкола (синус),
// поки він ковзає до нової клітинки.

const HOP_TIME = 0.4; // секунд (ТЗ: анімація дії — до 0,4 с)
const HOP_HEIGHT = 2.2; // наскільки високо летить

export class Hop {
  private elapsed = HOP_TIME; // HOP_TIME = зараз не летить

  start(): void {
    this.elapsed = 0;
  }

  // Викликати щокадру: повертає, на скільки підняти об'єкт над звичайним місцем
  offset(dt: number): number {
    if (this.elapsed >= HOP_TIME) return 0;
    this.elapsed = Math.min(HOP_TIME, this.elapsed + dt);
    return Math.sin((this.elapsed / HOP_TIME) * Math.PI) * HOP_HEIGHT;
  }
}
