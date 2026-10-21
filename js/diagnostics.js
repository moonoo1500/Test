/**
 * 10-Step Automated Bug Verification & Diagnostics Suite
 * Can be executed both inside the browser UI and via Node.js CLI (`tests/bug_check_10_steps.js`).
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(
      require('./prng.js'),
      require('./textures.js'),
      require('./world_gen.js'),
      require('./physics.js'),
      require('./interaction.js'),
      require('./input.js')
    );
  } else {
    root.LiminalDiagnostics = factory(
      root.LiminalPRNG,
      root.LiminalTextures,
      root.LiminalWorldGen,
      root.LiminalPhysics,
      root.LiminalInteraction,
      root.LiminalInput
    );
  }
})(typeof self !== 'undefined' ? self : this, function (
  PRNG,
  Textures,
  WorldGen,
  Physics,
  Interaction,
  Input
) {
  'use strict';

  function runTenStepBugCheck() {
    const steps = [];
    const startTime = Date.now();

    function recordStep(stepNumber, name, fn) {
      const t0 = Date.now();
      try {
        const detail = fn();
        steps.push({
          step: stepNumber,
          name,
          passed: true,
          durationMs: Date.now() - t0,
          detail
        });
      } catch (err) {
        steps.push({
          step: stepNumber,
          name,
          passed: false,
          durationMs: Date.now() - t0,
          detail: err && err.message ? err.message : String(err)
        });
      }
    }

    // STEP 1: Seed & PRNG Determinism
    recordStep(1, 'Детерминированность PRNG и генерации Сидов', () => {
      const w1 = WorldGen.WorldGenerator.generate('DREAM-1997');
      const w2 = WorldGen.WorldGenerator.generate('  dream-1997  ');
      const w3 = WorldGen.WorldGenerator.generate('POOL-808');

      if (w1.seed !== w2.seed || w1.numericSeed !== w2.numericSeed) {
        throw new Error('Нормализация сида нарушена');
      }
      if (w1.walls.length !== w2.walls.length || w1.props.length !== w2.props.length) {
        throw new Error('Несовпадение объектов при одинаковом сиде');
      }
      if (w1.numericSeed === w3.numericSeed) {
        throw new Error('Разные сиды дали одинаковый хэш');
      }
      // Edge-case empty seed fallback
      const wEmpty = WorldGen.WorldGenerator.generate('');
      if (!wEmpty.seed || wEmpty.walls.length === 0) {
        throw new Error('Пустой сид не обработан корректно');
      }
      return `Сид "${w1.seed}" стабилен (${w1.walls.length} стен, ${w1.props.length} деталей). Пустой сид → "${wEmpty.seed}".`;
    });

    // STEP 2: Multi-Biome Generation & Spawn Safety
    recordStep(2, 'Генерация всех 5 биомов и безопасность зоны Спавна', () => {
      const biomeIds = PRNG.BIOME_TYPES.map((b) => b.id);
      for (const bId of biomeIds) {
        const world = WorldGen.WorldGenerator.generate(`TEST-${bId}`, bId);
        if (world.biome.id !== bId) {
          throw new Error(`Биом ${bId} не применился`);
        }
        const phys = new Physics.PhysicsEngine(world);
        const nearSpawn = phys.grid.queryNear(world.spawn.x, world.spawn.z, phys.player.radius);
        for (const col of nearSpawn) {
          const cx = Math.max(col.minX, Math.min(world.spawn.x, col.maxX));
          const cz = Math.max(col.minZ, Math.min(world.spawn.z, col.maxZ));
          if (Math.hypot(world.spawn.x - cx, world.spawn.z - cz) < phys.player.radius) {
            throw new Error(`Спавн игрока заблокирован коллайдером ${col.id} в биоме ${bId}`);
          }
        }
      }
      return `Проверены все ${biomeIds.length} биомов: спавн свободен от препятствий, высотные карты активны.`;
    });

    // STEP 3: Detail Placement & Anti-Overlap Rules
    recordStep(3, 'Расположение деталей и отсутствие выхода за границы', () => {
      const world = WorldGen.WorldGenerator.generate('YELLOW-404', 'YELLOW_COMPLEX');
      const limit = world.worldHalfSize;
      for (const pr of world.props) {
        if (Math.abs(pr.x) > limit || Math.abs(pr.z) > limit) {
          throw new Error(`Объект ${pr.id} вышел за границы мира`);
        }
        if (Number.isNaN(pr.x) || Number.isNaN(pr.y) || Number.isNaN(pr.z)) {
          throw new Error(`Некорректные координаты NaN у объекта ${pr.id}`);
        }
      }
      const vhsCount = world.interactables.filter((i) => i.type === 'VHS_TAPE').length;
      const portalCount = world.interactables.filter((i) => i.type === 'PORTAL').length;
      if (vhsCount < 3 || portalCount < 2) {
        throw new Error(`Недостаточно ключевых объектов: VHS=${vhsCount}, Portals=${portalCount}`);
      }
      return `Детали размещены внутри сектора ±${limit}м (VHS-кассет: ${vhsCount}, Разломов: ${portalCount}).`;
    });

    // STEP 4: Player Gravity, Jump, Crouch & Terrain Following
    recordStep(4, 'Физика игрока: гравитация, прыжок, приседание и рельеф', () => {
      const meadow = WorldGen.WorldGenerator.generate('DREAM-HILLS', 'DREAMCORE_MEADOW');
      const phys = new Physics.PhysicsEngine(meadow);

      // Test jump impulse
      phys.update(0.016, { jump: true });
      if (phys.player.vy <= 0 || phys.player.onGround) {
        throw new Error('Прыжок не создал вертикальный импульс');
      }

      // Simulate landing back on terrain
      for (let i = 0; i < 80; i++) {
        phys.update(0.02, {});
      }
      const expectedGround = meadow.getTerrainHeight(phys.player.x, phys.player.z);
      if (!phys.player.onGround || Math.abs(phys.player.y - expectedGround) > 0.05) {
        throw new Error('Игрок не приземлился корректно на рельеф холма');
      }

      // Test crouch height reduction
      for (let i = 0; i < 20; i++) {
        phys.update(0.03, { crouch: true });
      }
      if (phys.player.height >= phys.player.standingHeight - 0.3) {
        throw new Error('Высота коллайдера при приседании не уменьшилась');
      }
      return `Прыжок, приземление на рельеф (y=${expectedGround.toFixed(2)}м) и приседание (h=${phys.player.height.toFixed(2)}м) исправны.`;
    });

    // STEP 5: Sub-stepped Wall Collision & Anti-Tunneling
    recordStep(5, 'Коллизии со стенами и защита от прохождения сквозь стены', () => {
      const world = WorldGen.WorldGenerator.generate('WALL-TEST', 'YELLOW_COMPLEX');
      // Place a solid test wall directly in front of spawn at z = -2.2
      world.walls.push({
        id: 'test_solid_barrier',
        x: 0,
        y: 1.5,
        z: -2.2,
        w: 8.0,
        h: 3.0,
        d: 0.6,
        tex: 'wallpaper_yellow',
        blocksLight: true
      });
      const phys = new Physics.PhysicsEngine(world);
      phys.player.yaw = 0; // Looking toward -Z

      // Sprint full speed into wall with large frame delta (0.09s)
      for (let i = 0; i < 45; i++) {
        phys.update(0.05, { moveX: 0, moveZ: -1, sprint: true });
      }

      // Wall front face is at z = -2.2 + 0.3 = -1.9. Player center must stay >= -1.9 + radius (0.38) = -1.52
      const minAllowedZ = -2.2 + 0.3 + phys.player.radius - 0.03;
      if (phys.player.z < minAllowedZ) {
        throw new Error(`Прохождение сквозь стену: z=${phys.player.z.toFixed(3)} < ${minAllowedZ.toFixed(3)}`);
      }
      return `Sub-stepped коллизия удержала игрока перед стеной (z=${phys.player.z.toFixed(2)}м, порог=${minAllowedZ.toFixed(2)}м).`;
    });

    // STEP 6: Water Buoyancy & Dynamic Physics Props
    recordStep(6, 'Водная физика Poolrooms и плавучесть динамических объектов', () => {
      const poolWorld = WorldGen.WorldGenerator.generate('POOL-37', 'POOLROOMS');
      const phys = new Physics.PhysicsEngine(poolWorld);

      // Move player into sunken pool zone (e.g. x=0, z=-12)
      const wz = poolWorld.waterZones[0];
      phys.player.x = (wz.minX + wz.maxX) * 0.5;
      phys.player.z = (wz.minZ + wz.maxZ) * 0.5;
      phys.player.y = poolWorld.getTerrainHeight(phys.player.x, phys.player.z);
      phys.update(0.02, {});

      if (!phys.player.inWater) {
        throw new Error('Не зафиксировано состояние воды в бассейне Poolrooms');
      }

      // Place dynamic prop near player and kick it
      const prop = poolWorld.dynamicProps[0];
      prop.x = phys.player.x;
      prop.z = phys.player.z - 1.0;
      const kicked = phys.kickNearestProp(7.0);
      if (!kicked || Math.hypot(kicked.vx, kicked.vz) < 1.0) {
        throw new Error('Динамический объект не получил импульс при толчке');
      }
      return `Состояние воды активно (погружение ${(phys.player.waterSubmersion * 100).toFixed(0)}%), физический импульс пропа = ${Math.hypot(kicked.vx, kicked.vz).toFixed(1)} м/с.`;
    });

    // STEP 7: World Interaction System (Doors, Switches, Vending, VHS, Portals)
    recordStep(7, 'Взаимодействие с миром: двери, свет, автоматы, VHS и порталы', () => {
      const world = WorldGen.WorldGenerator.generate('INTERACT-99', 'YELLOW_COMPLEX');
      const phys = new Physics.PhysicsEngine(world);
      let warpedSeed = null;
      const inter = new Interaction.InteractionSystem({
        world,
        physics: phys,
        onPortalEnter: (seed) => {
          warpedSeed = seed;
        }
      });

      // 7a. Door open/close & collider update
      const doorIt = world.interactables.find((i) => i.type === 'DOOR');
      phys.player.x = doorIt.x;
      phys.player.z = doorIt.z + 1.0;
      phys.player.yaw = 0;
      const doorRes = inter.interact();
      if (!doorRes.triggered || !doorIt.isOpen) {
        throw new Error('Дверь не открылась при взаимодействии');
      }
      const doorCol = phys.grid.collidersById.get(doorIt.doorWallId);
      if (doorCol && doorCol.active) {
        throw new Error('Коллайдер открытой двери остался активным');
      }

      // 7b. VHS collection & Journal entry
      const vhsIt = world.interactables.find((i) => i.type === 'VHS_TAPE');
      phys.player.x = vhsIt.x;
      phys.player.z = vhsIt.z + 0.8;
      const vhsRes = inter.interact();
      if (!vhsRes.triggered || inter.journal.length !== 1) {
        throw new Error('VHS-кассета не добавилась в Дневник');
      }

      // 7c. Portal transition
      const portalIt = world.interactables.find((i) => i.type === 'PORTAL');
      phys.player.x = portalIt.x;
      phys.player.z = portalIt.z + 0.8;
      inter.interact();
      if (!warpedSeed) {
        throw new Error('Портал не вызвал переход в новый сид');
      }
      return `Дверь (коллайдер снят), VHS-кассета в Дневнике и Портал (→ ${warpedSeed}) отработали без ошибок.`;
    });

    // STEP 8: Procedural Texture Generator & Cache
    recordStep(8, 'Процедурные текстуры и кэширование памяти', () => {
      const tm = new Textures.TextureManager();
      const texNames = [
        'wallpaper_yellow',
        'carpet_damp',
        'ceiling_tile',
        'pool_tile_white',
        'pool_tile_cyan',
        'water_surface',
        'meadow_grass',
        'mall_checker',
        'mall_wall',
        'asphalt_wet',
        'suburb_wall',
        'wood_door',
        'crt_screen',
        'liminal_poster',
        'sky_eye',
        'vending_front',
        'portal_rift'
      ];
      for (const name of texNames) {
        const t1 = tm.getTexture(name, { size: 64, seed: 'CACHE-TEST' });
        const t2 = tm.getTexture(name, { size: 64, seed: 'CACHE-TEST' });
        if (!t1 || t1 !== t2) {
          throw new Error(`Сбой кэширования текстуры ${name}`);
        }
      }
      const cachedCount = tm.cache.size;
      tm.disposeAll();
      if (tm.cache.size !== 0) {
        throw new Error('disposeAll() не очистил кэш текстур');
      }
      return `Сгенерировано и закэшировано ${cachedCount} процедурных текстур; очистка памяти успешна.`;
    });

    // STEP 9: Mobile Touch Controls (Joystick, Look Pad, Pitch Clamp & Buttons)
    recordStep(9, 'Мобильное сенсорное управление (джойстик, тач-камера, кнопки)', () => {
      const inp = new Input.InputController();
      const dummyPlayer = { yaw: 0, pitch: 0 };

      // Test deadzone
      inp.setVirtualJoystick(0.05, 0.05);
      inp._updateJoystickFromPoint(inp.joystick.originX + 2, inp.joystick.originY + 2);
      if (inp.joystick.x !== 0 || inp.joystick.y !== 0) {
        throw new Error('Мёртвая зона виртуального джойстика не отфильтровала микро-сдвиг');
      }

      // Test full deflection & auto-sprint
      inp.setVirtualJoystick(0, -0.95);
      const frame1 = inp.sampleFrameInput(dummyPlayer);
      if (frame1.moveZ >= -0.9 || !frame1.sprint) {
        throw new Error('Полное отклонение стика не включило движение вперёд и авто-спринт');
      }

      // Test camera look swipe & pitch clamp preventing gimbal flip
      inp.addLookDelta(0.5, 99.0);
      inp.sampleFrameInput(dummyPlayer);
      if (dummyPlayer.pitch > Math.PI * 0.45 || Math.abs(dummyPlayer.yaw - 0.5) > 0.001) {
        throw new Error('Угол наклона камеры pitch не ограничен безопасным диапазоном');
      }
      return `Сенсорный джойстик, авто-спринт и ограничение вертикального обзора (pitch=${dummyPlayer.pitch.toFixed(2)} рад) проверены.`;
    });

    // STEP 10: 3D/2D Mode Parity & Optimization / Spatial Hash Scaling
    recordStep(10, 'Синхронизация 3D/2D режимов и оптимизация SpatialHashGrid', () => {
      const world = WorldGen.WorldGenerator.generate('OPTIMIZE-777', 'DEAD_MALL');
      const phys = new Physics.PhysicsEngine(world);

      // Verify SpatialHashGrid broadphase returns only local subset of colliders
      const nearCols = phys.grid.queryNear(0, 0, 2.0);
      const totalCols = phys.grid.collidersById.size;
      if (nearCols.length >= totalCols) {
        throw new Error('SpatialHashGrid не отсекает дальние коллайдеры');
      }

      // Verify 2D Arcade auto-facing movement
      phys.player.x = 0;
      phys.player.z = 0;
      phys.player.yaw = 0;
      phys.update(0.05, { moveX: 1, moveZ: 0, arcade2D: true });
      if (phys.player.vx <= 0 || phys.player.yaw === 0) {
        throw new Error('В режиме 2D-Аркады персонаж не повернулся по вектору движения');
      }

      // Verify extreme delta-time spike (e.g. tab switch 2.5s) is clamped safely
      phys.player.x = 0;
      phys.player.z = 0;
      phys.update(2.5, { moveX: 1, moveZ: 0 });
      if (Math.hypot(phys.player.x, phys.player.z) > 1.5) {
        throw new Error('Скачок delta-time привёл к телепортации игрока');
      }

      return `SpatialHashGrid отсекает ${totalCols - nearCols.length} из ${totalCols} коллайдеров; 2D-автоповорот и защита от скачков FPS активны.`;
    });

    const passedCount = steps.filter((s) => s.passed).length;
    return {
      allPassed: passedCount === steps.length,
      passedCount,
      totalSteps: steps.length,
      totalDurationMs: Date.now() - startTime,
      steps
    };
  }

  return { runTenStepBugCheck };
});
