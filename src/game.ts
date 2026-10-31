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
  unwrapOptions,
  validate,
  type GameEvent,
} from './core/rules';
import { cellsUnderLane, getCocoon, getSoldier, seenCells, turretStatus, type GameState } from './core/state';
import type { Action, Held } from './core/types';
import { t } from './i18n';
import { CameraInput } from './input/cameraInput';
import { Picker } from './input/picking';
import { createGameScene, type GameScene } from './render/scene';
import { ActionPanel, type PanelButton } from './ui/actionPanel';
import { createHud, type Hud, type LogKind } from './ui/hud';
import { showDefeat, showVictory } from './ui/screens';

// Режим кліку по клітинці: звичайний (піти) або вибір, куди кинути
type Mode = 'move' | 'throw';

const END_SCREEN_DELAY = 1200; // мс: спершу показуємо постріл (або останній кокон), потім екран кінця гри

export class Game {
  private state: GameState;
  private selectedId: string | null = null;
  private mode: Mode = 'move';
  // Клітинка під поглядом павука, куди гравець клікнув один раз: другий клік — підтвердження
  private dangerConfirm: string | null = null;
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
    this.scene.spider.lookAtLane(this.laneAngle(initialState.spider.activeLane), true);

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
    if (!soldier || this.state.outcome !== 'playing') return;
    if (soldier.status !== 'free') {
      this.hud.message(t('reason.soldierNotFree'));
      return;
    }
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
    const move: Action = { type: 'move', soldierId: this.selectedId, toCell: cellId };
    // Крок під погляд павука чи павучати = миттєвий кокон. Щоб не зробити це випадково, просимо клікнути ще раз.
    if (seenCells(this.state).has(cellId) && validate(this.state, move).ok && this.dangerConfirm !== cellId) {
      this.dangerConfirm = cellId;
      this.hud.message(t('dangerConfirm'));
      return;
    }
    this.dangerConfirm = null;
    this.dispatch(move);
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
    this.dangerConfirm = null;
    this.showEvents(result.events);
    // Якщо вибраного солдата замотали — вибираємо іншого вільного
    const selected = this.selectedId ? getSoldier(this.state, this.selectedId) : undefined;
    if (selected && selected.status !== 'free' && this.state.outcome === 'playing') {
      this.selectedId = this.state.soldiers.find((s) => s.status === 'free' && !s.carriedBy)?.id ?? null;
    }
    // Щойно витратили останнє очко дії — підказуємо натиснути «Кінець ходу»
    if (hadAp && !anyApLeft(this.state) && this.state.outcome === 'playing') this.hud.message(t('allApSpent'));
    this.refresh();
  }

  // Події з ядра: підказка внизу (toast), рядок у списку подій і анімації на сцені
  private showEvents(events: GameEvent[]): void {
    // Ворожу фазу пишемо в список одним рядком, а не окремо для кожного павучати
    if (events.some((e) => e.type === 'spiderTurned')) this.hud.log(t('event.enemyPhase'));
    for (const event of events) {
      switch (event.type) {
        case 'roundStarted':
          this.hud.message(t('roundStarted', { n: event.round }));
          this.hud.log(t('event.round', { n: event.round }), 'round');
          break;
        case 'installed':
          this.hud.message(t('installed', { name: t(`item.${event.itemId}`) }));
          this.hud.log(t('event.installed', { name: t(`item.${event.itemId}`) }), 'good');
          break;
        case 'spiderlingKilled': {
          const text = t('event.spiderlingKilled', { item: t(`item.${event.itemId}`) });
          this.hud.message(text);
          this.hud.log(text, 'good');
          break;
        }
        case 'fired':
          this.scene.turret.fire();
          this.scene.spider.die();
          break;
        case 'unwrapped':
          this.say(t('event.unwrapped', { name: this.soldierName(event.soldierId) }), 'good');
          break;
        case 'captured':
          this.say(t('event.captured', { name: this.soldierName(event.soldierId) }), 'warn');
          break;
        case 'died':
          this.say(t('event.died', { name: this.soldierName(event.soldierId) }), 'bad');
          break;
        case 'spiderTurned':
          this.scene.spider.lookAtLane(this.laneAngle(event.activeLane));
          break;
        case 'won':
          this.selectedId = null;
          window.setTimeout(() => showVictory(this.root, this.state.round), END_SCREEN_DELAY);
          break;
        case 'lost':
          this.selectedId = null;
          window.setTimeout(() => showDefeat(this.root, this.state.round), END_SCREEN_DELAY);
          break;
      }
    }
  }

  // Важлива подія: і підказкою внизу, і рядком у списку подій
  private say(text: string, kind: LogKind): void {
    this.hud.message(text);
    this.hud.log(text, kind);
  }

  private laneAngle(laneId: number): number {
    return this.state.world.level.lanes.find((l) => l.id === laneId)!.angleDeg;
  }

  private soldierName(soldierId: string): string {
    return t('soldierName', { n: this.state.soldiers.findIndex((s) => s.id === soldierId) + 1 });
  }

  // Назва того, що солдат тримає або може підняти: «Деталь 2», «Солдат 3»…
  private nameOf(target: Held): string {
    if (target.kind === 'item') return t(`item.${target.id}`);
    if (target.kind === 'cocoon') return t('cocoonOf', { name: this.soldierName(getCocoon(this.state, target.id)!.soldierId) });
    return this.soldierName(target.id);
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
    for (const cocoonId of unwrapOptions(this.state, id)) {
      const name = this.soldierName(getCocoon(this.state, cocoonId)!.soldierId);
      buttons.push({
        label: t('action.unwrap', { name }),
        style: 'rescue',
        onClick: () => this.dispatch({ type: 'unwrap', soldierId: id, cocoonId }),
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
    this.scene.cocoons.sync(this.state);
    this.scene.spiderlings.sync(this.state);
    // Павук: активна лінія завжди видно; наступну — якщо telegraphNextLane = true (рішення Колі)
    const { activeLane, nextLane } = this.state.spider;
    const telegraph = this.state.balance.telegraphNextLane;
    this.scene.lanes.sync(activeLane, nextLane, telegraph);
    this.scene.cells.setDanger(seenCells(this.state), telegraph ? cellsUnderLane(this.state, nextLane) : new Set());
    const cells = !id ? [] : this.mode === 'throw' ? throwTargets(this.state, id) : reachableCells(this.state, id);
    this.scene.cells.setHighlight(cells, this.mode);
    this.hud.update(this.state, id, !anyApLeft(this.state), (target) => this.nameOf(target));
    this.panel.setButtons(this.panelButtons());
  }
}
