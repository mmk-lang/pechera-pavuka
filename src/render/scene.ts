// Збирає всю 3D-сцену: рендерер, світло, печеру, камені, клітинки, солдатів, предмети, турель, павука й павучат.
// Рендер лише читає дані рівня й малює — правил гри тут немає.

import * as THREE from 'three';
import type { GameState } from '../core/state';
import { CameraRig } from './camera';
import { createCave } from './cave';
import { CellsView } from './cells';
import { CocoonsView } from './cocoons';
import { createRocks } from './rocks';
import { ItemsView } from './items';
import { LanesView } from './lanes';
import { SpiderView } from './spider';
import { SpiderlingsView } from './spiderlings';
import { TurretView } from './turret';
import { UnitsView } from './units';

export interface GameScene {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  rig: CameraRig;
  cells: CellsView;
  units: UnitsView;
  items: ItemsView;
  turret: TurretView;
  spider: SpiderView;
  spiderlings: SpiderlingsView;
  lanes: LanesView;
  cocoons: CocoonsView;
  render(dt: number): void;
}

export function createGameScene(container: HTMLElement, state: GameState): GameScene {
  const level = state.world.level;
  // Рендерер малює в <canvas>, який ми додаємо на сторінку
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2)); // на телефонах не більше 2×, щоб не гальмувало
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0d0b0a);

  // Світло: слабке розсіяне + «лампа» згори з тінями + червонувате сяйво з гнізда павука
  scene.add(new THREE.HemisphereLight(0x8a9bb0, 0x2a1d14, 0.9));

  const sun = new THREE.DirectionalLight(0xfff1dc, 1.6);
  sun.position.set(-10, 30, 15);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  // Тіньова «коробка» має накривати всю печеру
  const half = Math.max(level.cave.width, level.cave.depth) / 2 + 2;
  Object.assign(sun.shadow.camera, { left: -half, right: half, top: half, bottom: -half, near: 1, far: 80 });
  scene.add(sun);

  const nestGlow = new THREE.PointLight(0xff4020, 40, 18);
  nestGlow.position.set(level.spider.x, 3, level.spider.z);
  scene.add(nestGlow);

  // Об'єкти рівня
  scene.add(createCave(level.cave));
  scene.add(createRocks(level));
  const cells = new CellsView(state.world);
  const units = new UnitsView(state);
  const items = new ItemsView(state);
  const turret = new TurretView(state.world);
  const spider = new SpiderView(level.spider.x, level.spider.z);
  const spiderlings = new SpiderlingsView(state);
  const lanes = new LanesView(level);
  const cocoons = new CocoonsView();
  scene.add(lanes.group, cells.group, units.group, items.group, cocoons.group, turret.group, spider.group, spiderlings.group);

  const rig = new CameraRig(state.balance.camera, level.cave);

  // Коли змінюється розмір вікна (або телефон повернули) — підлаштовуємось
  const resize = () => {
    const w = container.clientWidth;
    const h = container.clientHeight;
    renderer.setSize(w, h);
    rig.resize(w, h);
  };
  window.addEventListener('resize', resize);
  resize();
  rig.fitCave(); // на старті показуємо всю печеру

  return {
    renderer,
    scene,
    rig,
    cells,
    units,
    items,
    turret,
    spider,
    spiderlings,
    lanes,
    cocoons,
    render: (dt) => {
      units.update(dt);
      items.update(dt, units);
      cocoons.update(dt, units);
      turret.update(dt);
      spider.update(dt);
      spiderlings.update(dt);
      renderer.render(scene, rig.camera);
    },
  };
}
