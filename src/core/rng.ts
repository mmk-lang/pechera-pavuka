// Генератор випадкових чисел із seed (зерном).
// Той самий seed завжди дає ту саму послідовність чисел — тому партію можна повторити,
// а тести стають стабільними. Math.random() у грі не використовуємо.
//
// Генератор «чистий»: замість того щоб змінювати себе, він повертає число і НОВИЙ стан.
// Стан генератора — просто ціле число, яке лежить у стані гри (GameState.rng).

export interface RandomResult {
  value: number; // число від 0 (включно) до 1 (не включно), як у Math.random()
  rng: number; // новий стан генератора — його треба зберегти й передати наступного разу
}

// Алгоритм mulberry32: короткий і достатньо випадковий для гри
export function nextRandom(rng: number): RandomResult {
  const next = (rng + 0x6d2b79f5) | 0;
  let t = next;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  const value = ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  return { value, rng: next };
}

// Випадкове ціле від 0 до count - 1
export function randomInt(rng: number, count: number): { value: number; rng: number } {
  const r = nextRandom(rng);
  return { value: Math.floor(r.value * count), rng: r.rng };
}

// Новий випадковий seed (коли в balance.json seed = null). Тут Math.random() можна —
// це лише вибір seed на старті, а далі все йде через nextRandom.
export function randomSeed(): number {
  return Math.floor(Math.random() * 1_000_000);
}
