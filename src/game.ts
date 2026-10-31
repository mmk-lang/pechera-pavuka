// Гра: зв'язує ядро (правила), 3D-сцену, керування й інтерфейс.
// Тут зберігається поточний стан і вибраний солдат. Кожна дія гравця йде через dispatch():
// спершу validate (можна чи ні), потім apply (новий стан), потім оновлюємо картинку.

import type { LevelProblem } from './core/level';
import {
  anyApLeft,
  apply,
  pickupOptions,
  reachableCells,
  throwTargets,
  validate,
  type GameEvent,
} from './core/rules';
import { getSoldier, turretStatus, type GameState } from './core/state';
import type { Action, Held } from './core/types';
import { t } from './i18n';
import { CameraInput } from './input/cameraInput';
import { Picker } from './input/picking';
import { createGameScene, type GameScene } from './render/scene';
import { ActionPanel, type PanelButton } from './ui/actionPanel';
import { createHud, type Hud } from './ui/hud';
import { showVictory } from './ui/screens';

// Режим кліку по клітинці: звичайний (піти) або вибір, куди кинути
type Mode = 'move' | 'throw';

const VICTORY_DELAY = 1200; // мс: спершу показуємо постріл і загибель павука, потім екран перемоги

export class Game {
  private state: GameState;
  private selectedId: string | null = null;
  private mode: Mode = 'move';
  private scene: GameScene;
  private hud: Hud;
  private panel: ActionPanel;
  private cameraInput: CameraInput;

  constructor(
    private readonly root: HTMLElement,
    initialState: GameState,
    problems: LevelProblem[],
  ) {
    this.state = initialState;
    this.scene = createGameScene(root, initialState);
    const canvas = this.scene.renderer.domElement;
    this.cameraInput = new CameraInput(this.scene.rig, canvas, initialState.balance.camera);

    new Picker(canvas, this.scene.rig.camera, () => this.scene.units.pickables, () => this.scene.cells.pickables, {
      onSoldier: (id) => this.select(id),
      onCell: (id) => this.clickCell(id),
      onNothing: () => {}, // клік у порожнечу нічого не робить — вибір лишається
    });

    this.hud = createHud(root, initialState, problems, {
      onSelectSoldier: (id) => this.select(id),
      onEndTurn: () => this.dispatch({ type: 'endTurn' }),
    });
    this.panel = new ActionPanel(root);

    // Клавіші: 1–4 — вибрати солдата, Enter — кінець ходу, Esc — скасувати кидок
    window.addEventListener('keydown', (e) => {
      // Якщо фокус на кнопці, Enter і так її натисне — не робимо дію двічі. Затиснуту клавішу теж ігноруємо.
      if (e.repeat || e.target instanceof HTMLButtonElement) return;
      const n = Number(e.key);
      if (n >= 1 && n <= this.state.soldiers.length) this.select(this.state.soldiers[n - 1].id);
      if (e.key === 'Enter') this.dispatch({ type: 'endTurn' });
      if (e.key === 'Escape') this.setMode('move');
    });

    // На старті вибираємо першого солдата, щоб одразу було видно, куди можна піти
    this.select(this.state.soldiers[0].id);
  }

  // Викликається щокадру з main.ts
  frame(dt: number): void {
    this.cameraInput.update(dt);
    this.scene.render(dt);
    this.placePanel();
  }

  private select(soldierId: string): void {
    const soldier = getSoldier(this.state, soldierId);
    if (!soldier || soldier.status !== 'free' || this.state.outcome !== 'playing') return;
    if (soldier.carriedBy) {
      this.hud.message(t('reason.soldierCarried'));
      return;
    }
    this.selectedId = soldierId;
    this.mode = 'move';
    this.refresh();
  }

  private setMode(mode: Mode): void {
    this.mode = mode;
    if (mode === 'throw') this.hud.message(t('throwHint'));
    this.refresh();
  }

  // Клік по клітинці: залежно від режиму — піти або кинути
  private clickCell(cellId: string): void {
    if (!this.selectedId) {
      this.hud.message(t('reason.noSelection'));
      return;
    }
    if (this.mode === 'throw') {
      this.dispatch({ type: 'throw', soldierId: this.selectedId, toCell: cellId });
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
    this.mode = 'move'; // після будь-якої дії повертаємось у звичайний режим
    this.showEvents(result.events);
    // Щойно витратили останнє очко дії — підказуємо натиснути «Кінець ходу»
    if (hadAp && !anyApLeft(this.state) && this.state.outcome === 'playing') this.hud.message(t('allApSpent'));
    this.refresh();
  }

  private showEvents(events: GameEvent[]): void {
    for (const event of events) {
      switch (event.type) {
        case 'roundStarted':
          this.hud.message(t('roundStarted', { n: event.round }));
          break;
        case 'installed':
          this.hud.message(t('installed', { name: t(`item.${event.itemId}`) }));
          break;
        case 'fired':
          this.scene.turret.fire();
          this.scene.spider.die();
          break;
        case 'won':
          this.selectedId = null;
          window.setTimeout(() => showVictory(this.root, this.state.round), VICTORY_DELAY);
          break;
      }
    }
  }

  // Назва того, що солдат тримає або може підняти: «Деталь 2», «Солдат 3»…
  private nameOf(target: Held): string {
    if (target.kind === 'item') return t(`item.${target.id}`);
    const index = this.state.soldiers.findIndex((s) => s.id === target.id);
    return t('soldierName', { n: index + 1 });
  }

  // Кнопки контекстної панелі для вибраного солдата
  private panelButtons(): PanelButton[] {
    const id = this.selectedId;
    if (!id || this.state.outcome !== 'playing') return [];
    if (this.mode === 'throw') return [{ label: t('action.cancel'), style: 'cancel', onClick: () => this.setMode('move') }];

    const buttons: PanelButton[] = [];
    for (const target of pickupOptions(this.state, id)) {
      buttons.push({
        label: t('action.pickup', { name: this.nameOf(target) }),
        onClick: () => this.dispatch({ type: 'pickup', soldierId: id, target }),
      });
    }
    const soldier = getSoldier(this.state, id)!;
    if (soldier.held && throwTargets(this.state, id).length > 0) {
      buttons.push({ label: t('action.throw', { name: this.nameOf(soldier.held) }), onClick: () => this.setMode('throw') });
    }
    if (validate(this.state, { type: 'fire', soldierId: id }).ok) {
      buttons.push({ label: t('action.fire'), style: 'fire', onClick: () => this.dispatch({ type: 'fire', soldierId: id }) });
    }
    return buttons;
  }

  // Панель дій стоїть над головою вибраного солдата
  private placePanel(): void {
    if (!this.selectedId) return;
    const point = this.scene.units.displayPosition(this.selectedId).clone();
    point.y += 2.1;
    const screen = point.project(this.scene.rig.camera); // координати від -1 до 1
    const canvas = this.scene.renderer.domElement;
    this.panel.moveTo(((screen.x + 1) / 2) * canvas.clientWidth, ((1 - screen.y) / 2) * canvas.clientHeight);
  }

  // Перемалювати все за поточним станом
  private refresh(): void {
    const id = this.selectedId;
    this.scene.units.sync(this.state, id);
    this.scene.items.sync(this.state);
    this.scene.turret.sync(turretStatus(this.state));
    const cells = !id ? [] : this.mode === 'throw' ? throwTargets(this.state, id) : reachableCells(this.state, id);
    this.scene.cells.setHighlight(cells, this.mode);
    this.hud.update(this.state, id, !anyApLeft(this.state), (target) => this.nameOf(target));
    this.panel.setButtons(this.panelButtons());
  }
}
