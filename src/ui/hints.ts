// Підказки для нового гравця: одна коротка порада «що робити зараз».
// Тут лише вибір підказки за станом гри (без HTML) — тому її легко перевірити тестом.
// Порядок перевірок = пріоритет: спершу найтерміновіше (кокон), потім мета, потім загальні поради.

import { anyApLeft, pickupOptions } from '../core/rules';
import { getSoldier, turretStatus, type GameState } from '../core/state';

export interface Hint {
  key: string; // ключ у uk.json, розділ "hint"
  params?: Record<string, string | number>;
}

export function currentHint(state: GameState, selectedId: string | null, actionsDone: number): Hint | null {
  if (state.outcome !== 'playing') return null;
  const number = (soldierId: string) => state.soldiers.findIndex((s) => s.id === soldierId) + 1;

  // 1. Кокон — найтерміновіше: солдат загине, якщо його не врятувати
  const cocoon = [...state.cocoons].sort((a, b) => a.turnsLeft - b.turnsLeft)[0];
  if (cocoon) return { key: 'hint.cocoon', params: { n: number(cocoon.soldierId), turns: cocoon.turnsLeft } };

  // 2. Турель готова — лишилось вистрілити
  const turret = turretStatus(state);
  if (turret.repaired && turret.loaded) return { key: turret.operatorReady ? 'hint.fire' : 'hint.operator' };

  // 3. Очки дій закінчились
  if (!anyApLeft(state)) return { key: 'hint.endTurn' };

  const selected = selectedId ? getSoldier(state, selectedId) : undefined;
  if (selected) {
    // 4. Вибраний солдат несе предмет — неси до турелі
    if (selected.held?.kind === 'item') return { key: 'hint.carry' };
    // 5. Поруч є що підняти
    if (pickupOptions(state, selected.id).some((t) => t.kind === 'item')) return { key: 'hint.pickup' };
  }

  // 6. Самий початок гри
  if (state.round === 1 && actionsDone === 0) return { key: 'hint.firstMove' };

  // 7. Загальна порада: як знайти мету й уникати небезпеки (по черзі, щоб не набридало)
  const general = ['hint.findParts', 'hint.danger', 'hint.spiderlings', 'hint.throwKill'];
  return { key: general[(state.round - 1) % general.length] };
}
