// Камені печери.

import * as THREE from 'three';
import type { LevelData } from '../core/types';

// Кілька відтінків каменю, щоб печера не була однаковою
const ROCK_COLORS = [0x6b6158, 0x5d564f, 0x756a5c, 0x625a52];

export function createRocks(level: LevelData): THREE.Group {
  const group = new THREE.Group();
  // Одна геометрія на всі камені: дванадцятигранник — виглядає як low-poly камінь
  const geometry = new THREE.DodecahedronGeometry(1, 0);

  level.rocks.forEach((rock, i) => {
    const material = new THREE.MeshStandardMaterial({
      color: ROCK_COLORS[i % ROCK_COLORS.length],
      roughness: 0.95,
      flatShading: true,
    });
    const mesh = new THREE.Mesh(geometry, material);
    // Розтягуємо до потрібного радіуса й висоти
    mesh.scale.set(rock.radius, rock.height / 2, rock.radius);
    // Трохи заглиблюємо в підлогу, щоб камінь «сидів», а не висів
    mesh.position.set(rock.x, rock.height / 2 - 0.15, rock.z);
    // Поворот залежить від номера каменя, тож щоразу однаковий (без Math.random)
    mesh.rotation.y = i * 1.7;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.name = rock.id;
    group.add(mesh);
  });

  return group;
}
