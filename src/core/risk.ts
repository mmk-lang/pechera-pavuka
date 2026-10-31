// Ризик клітинок (опція showRisk): яка ймовірність, що ворог бачитиме клітинку після ворожої фази,
// тобто на початку наступного раунду. Саме тоді важливо, де стоять солдати, коли гравець натискає «Кінець ходу».
//
// Ризик складається з двох частин:
//   1) павук: якщо наступну лінію показано (telegraphNextLane) — відомо точно (0 або 1);
//      якщо ні — рахуємо, зі скількох можливих ліній видно клітинку (наприклад, «1 з 4»);
//   2) павучата: кожне перебігає на випадкову сусідню клітинку й дивиться на випадкову сусідню.
// Ймовірності незалежні, тому «клітинку не побачить ніхто» = добуток (1 − p) для кожного ворога.

import type { GameState } from './state';

// Ймовірність, що павук після повороту бачитиме клітинку
function laneRisk(state: GameState, exposedTo: number[]): number {
  const { activeLane, nextLane } = state.spider;
  if (state.balance.telegraphNextLane) return exposedTo.includes(nextLane) ? 1 : 0;
  // Наступну лінію не показано: вона випадкова серед усіх (або всіх, крім активної)
  const lanes = state.world.level.lanes.map((l) => l.id);
  const possible = state.balance.allowSameLane ? lanes : lanes.filter((id) => id !== activeLane);
  if (possible.length === 0) return 0;
  return possible.filter((id) => exposedTo.includes(id)).length / possible.length;
}

// Ймовірність, що одне павуча після свого ходу бачитиме клітинку target
function spiderlingRisk(state: GameState, fromCell: string, target: string): number {
  const cells = state.world.cells;
  const moves = cells[fromCell].neighbors;
  let p = 0;
  for (const to of moves) {
    // Павуча перейде в «to» з імовірністю 1 / (кількість сусідів)
    const facing = cells[to].neighbors;
    const seesTarget = to === target ? 1 : facing.includes(target) ? 1 / facing.length : 0;
    p += seesTarget / moves.length;
  }
  return p;
}

// Ризик для кожної клітинки (від 0 до 1)
export function cellRisks(state: GameState): Map<string, number> {
  const risks = new Map<string, number>();
  for (const cell of Object.values(state.world.cells)) {
    let safe = 1 - laneRisk(state, cell.exposedTo);
    for (const s of state.spiderlings) safe *= 1 - spiderlingRisk(state, s.cellId, cell.id);
    risks.set(cell.id, 1 - safe);
  }
  return risks;
}

// Підпис ризику: «1 з 4» для невеликих імовірностей, відсотки — для великих
export function riskText(p: number): string {
  if (p >= 0.995) return '100%';
  if (p > 0.5) return `${Math.round(p * 100)}%`;
  return `1 з ${Math.round(1 / p)}`;
}
