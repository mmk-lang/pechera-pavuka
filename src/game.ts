// Гра: зв'язує ядро (правила), 3D-сцену, керування й інтерфейс.
// Тут зберігається поточний стан і вибраний солдат. Кожна дія гравця йде через dispatch():
// спершу validate (можна чи ні), потім apply (новий стан), потім оновлюємо картинку.

import type { LevelProblem } from './core/level';
import { anyApLeft, apply, reachableCells, validate, type GameEvent } from './core/rules';
import { getSoldier, type GameState } from './core/state';
import type { Action } from './core/types';
import { t } from './i18n';
import { CameraInput } from './input/cameraInput';
import { Picker } from './input/picking';
import { createGameScene, type GameScene } from './render/scene';
import { createHud, type Hud } from './ui/hud';

export class Game {
  private state: GameState;
  private selectedId: string | null = null;
  private scene: GameScene;
  private hud: Hud;
  private cameraInput: CameraInput;

  constructor(root: HTMLElement, initialState: GameState, problems: LevelProblem[]) {
    this.state = initialState;
    this.scene = createGameScene(root, initialState);
    const canvas = this.scene.renderer.domElement;
    this.cameraInput = new CameraInput(this.scene.rig, canvas, initialState.balance.camera);

    new Picker(canvas, this.scene.rig.camera, () => this.scene.units.pickables, () => this.scene.cells.pickables, {
      onSoldier: (id) => this.select(id),
      onCell: (id) => this.tryMove(id),
      onNothing: () => {}, // клік у порожнечу нічого не робить — вибір лишається
    });

    this.hud = createHud(root, initialState, problems, {
      onSelectSoldier: (id) => this.select(id),
      onEndTurn: () => this.dispatch({ type: 'endTurn' }),
    });

    // Клавіші: 1–4 — вибрати солдата, Enter — кінець ходу
    window.addEventListener('keydown', (e) => {
      // Якщо фокус на кнопці, Enter і так її натисне — не робимо дію двічі. Затиснуту клавішу теж ігноруємо.
      if (e.repeat || e.target instanceof HTMLButtonElement) return;
      const n = Number(e.key);
      if (n >= 1 && n <= this.state.soldiers.length) this.select(this.state.soldiers[n - 1].id);
      if (e.key === 'Enter') this.dispatch({ type: 'endTurn' });
    });

    // На старті вибираємо першого солдата, щоб одразу було видно, куди можна піти
    this.select(this.state.soldiers[0].id);
  }

  // Викликається щокадру з main.ts
  frame(dt: number): void {
    this.cameraInput.update(dt);
    this.scene.render(dt);
  }

  private select(soldierId: string): void {
    const soldier = getSoldier(this.state, soldierId);
    if (!soldier || soldier.status !== 'free') return;
    this.selectedId = soldierId;
    this.refresh();
  }

  private tryMove(cellId: string): void {
    if (!this.selectedId) {
      this.hud.message(t('reason.noSelection'));
      return;
    }
    const soldier = getSoldier(this.state, this.selectedId)!;
    if (soldier.cellId === cellId) return; // клік по своїй клітинці — нічого не робимо
    this.dispatch({ type: 'move', soldierId: this.selectedId, toCell: cellId });
  }

  // Єдиний вхід для всіх дій гравця
  private dispatch(action: Action): void {
    const check = validate(this.state, action);
    if (!check.ok) {
      this.hud.message(t(`reason.${check.reason}`));
      return;
    }
    const hadAp = anyApLeft(this.state);
    const result = apply(this.state, action);
    this.state = result.state;
    this.showEvents(result.events);
    // Щойно витратили останнє очко дії — підказуємо натиснути «Кінець ходу»
    if (hadAp && !anyApLeft(this.state)) this.hud.message(t('allApSpent'));
    this.refresh();
  }

  private showEvents(events: GameEvent[]): void {
    for (const event of events) {
      if (event.type === 'roundStarted') this.hud.message(t('roundStarted', { n: event.round }));
    }
  }

  // Перемалювати все за поточним станом
  private refresh(): void {
    const allSpent = !anyApLeft(this.state);
    this.scene.units.sync(this.state, this.selectedId);
    this.scene.cells.setReachable(this.selectedId ? reachableCells(this.state, this.selectedId) : []);
    this.hud.update(this.state, this.selectedId, allSpent);
  }
}
