/**
 * Procedural Liminal & Dreamcore World Generator
 * Generates deterministic multi-biome worlds from any seed string:
 * - YELLOW_COMPLEX (Backrooms Level 0 office maze)
 * - DREAMCORE_MEADOW (Rolling hills, wooden houses, swings, floating sky eyes, CRT TVs in flowers)
 * - POOLROOMS (Tiled aquatic halls, sunken pools, skylights, floating rings)
 * - DEAD_MALL (1997 vaporwave atrium, checkerboard marble, neon signs, palm planters, arcade)
 * - ETERNAL_SUBURBIA (Night foggy street, repeating houses, orange streetlights, ringing payphones)
 */
(function (root, factory) {
  const prngMod =
    typeof module === 'object' && module.exports
      ? require('./prng.js')
      : root.LiminalPRNG;
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(prngMod);
  } else {
    root.LiminalWorldGen = factory(prngMod);
  }
})(typeof self !== 'undefined' ? self : this, function (PRNG) {
  'use strict';

  const LORE_MESSAGES = [
    {
      title: 'ЗАПИСЬ #01: ЖУЖЖАНИЕ ЛАМП',
      text: 'Люминесцентные панели здесь гудят на частоте 59.8 Гц. Если долго слушать, кажется, что они шепчут твоё детское имя.'
    },
    {
      title: 'ЗАПИСЬ #04: ПОЛЯНА ЗА ОКНОМ',
      text: 'На картине в коридоре был нарисован зелёный холм. Когда я моргнул, трава на картине качнулась от ветра.'
    },
    {
      title: 'ЗАПИСЬ #09: ТЁПЛАЯ ХЛОРИРОВАННАЯ ВОДА',
      text: 'В Аква-комплексе нет ни одного слива, но вода всегда чистая и тёплая (31°C). Откуда падает солнечный свет, если мы под землёй?'
    },
    {
      title: 'ЗАПИСЬ #12: ЗАКРЫТЫЙ ФУДКОРТ 1997',
      text: 'Музыка из динамиков торгового центра играет с пластинки, которую никто не менял двадцать девять лет.'
    },
    {
      title: 'ЗАПИСЬ #17: НЕ СМОТРИ ВВЕРХ',
      text: 'Глаза в небе над поляной не злые. Они просто проверяют, не проснулся ли ты раньше времени.'
    },
    {
      title: 'ЗАПИСЬ #23: НОЧНОЙ ТАКСОФОН',
      text: 'В трубке таксофона слышен шум прибоя и голос автоответчика: «Ваш абонент находится в предыдущем сне».'
    }
  ];

  const TERMINAL_TEXTS = [
    'СИСТЕМА DREAM-OS v1.97 // СТАТУС: СОН СТАБИЛЕН. НЕ ПЫТАЙТЕСЬ ВЫЙТИ ЧЕРЕЗ ОКНА.',
    'ВНИМАНИЕ: УРОВЕНЬ РЕАЛЬНОСТИ 64%. РЕКОМЕНДУЕТСЯ ВЫПИТЬ МИНДАЛЬНОЙ ВОДЫ.',
    'ВХОДЯЩИЙ ВЫЗОВ: «Алло? Ты тоже слышишь эхо шагов за соседней стеной?..»',
    'АРКАДНЫЙ АВТОМАТ «LIMINAL RUNNER 96»: РЕКОРД — ИГРОК [ТЫ], ОЧКОВ: ∞',
    'СООБЩЕНИЕ ПЕЙДЖЕРА: «Встретимся у двери с фиолетовым свечением на краю сектора».'
  ];

  class WorldGenerator {
    static generate(seedInput, forcedBiomeId = 'AUTO') {
      const seedString = PRNG.normalizeSeedString(seedInput);
      const biome = PRNG.resolveBiomeForSeed(seedString, forcedBiomeId);
      const rng = new PRNG.SeededRandom(seedString);

      const world = {
        seed: seedString,
        numericSeed: rng.numericSeed,
        biome,
        worldHalfSize: 36, // 72m x 72m playable sector
        ceilingHeight: biome.category === 'meadow' || biome.category === 'suburbia' ? null : 4.2,
        spawn: { x: 0, y: 0, z: 0, yaw: 0 },
        walls: [],
        props: [],
        dynamicProps: [],
        interactables: [],
        lights: [],
        waterZones: [],
        skyObjects: [],
        floorZones: [],
        _propFootprints: []
      };

      // Terrain elevation function
      const terrainRng = rng.fork('TERRAIN');
      world.getTerrainHeight = function (x, z) {
        if (biome.id === 'DREAMCORE_MEADOW') {
          // Flatten spawn clearing & pathways
          const distFromSpawn = Math.hypot(x, z);
          const spawnFlatten = Math.min(1, Math.max(0, (distFromSpawn - 5.5) / 6.0));
          const n1 = terrainRng.fbm2D(x * 0.045, z * 0.045, 3, 0.5, 2.0);
          const hill = (n1 * 1.65 + Math.sin(x * 0.08) * 0.35) * spawnFlatten;
          return Math.max(-0.4, hill);
        }
        if (biome.id === 'POOLROOMS') {
          // Check if inside sunken pool basin
          for (let i = 0; i < world.waterZones.length; i++) {
            const wz = world.waterZones[i];
            if (x >= wz.minX && x <= wz.maxX && z >= wz.minZ && z <= wz.maxZ) {
              return wz.surfaceY - wz.depth;
            }
          }
          return 0;
        }
        return 0;
      };

      // Helper to test if a position is clear of walls and other props
      world.canPlaceAt = function (x, z, radius = 0.8, allowNearSpawn = false) {
        if (!allowNearSpawn && Math.hypot(x, z) < 3.6) return false;
        const limit = world.worldHalfSize - 2.2;
        if (Math.abs(x) > limit || Math.abs(z) > limit) return false;

        for (let i = 0; i < world.walls.length; i++) {
          const w = world.walls[i];
          const halfW = w.w * 0.5 + radius;
          const halfD = w.d * 0.5 + radius;
          if (Math.abs(x - w.x) < halfW && Math.abs(z - w.z) < halfD) {
            return false;
          }
        }

        for (let i = 0; i < world._propFootprints.length; i++) {
          const fp = world._propFootprints[i];
          const minDist = fp.r + radius;
          if (Math.hypot(x - fp.x, z - fp.z) < minDist) {
            return false;
          }
        }
        return true;
      };

      world.registerFootprint = function (x, z, r) {
        world._propFootprints.push({ x, z, r });
      };

      // Build outer perimeter boundary
      WorldGenerator._buildPerimeter(world, rng);

      // Build biome-specific architecture & details
      if (biome.id === 'YELLOW_COMPLEX') {
        WorldGenerator._buildYellowComplex(world, rng);
      } else if (biome.id === 'DREAMCORE_MEADOW') {
        WorldGenerator._buildDreamcoreMeadow(world, rng);
      } else if (biome.id === 'POOLROOMS') {
        WorldGenerator._buildPoolrooms(world, rng);
      } else if (biome.id === 'DEAD_MALL') {
        WorldGenerator._buildDeadMall(world, rng);
      } else {
        WorldGenerator._buildEternalSuburbia(world, rng);
      }

      // Ensure common interactive collectibles, portals, and dynamic physics props exist
      WorldGenerator._populateInteractablesAndPortals(world, rng);

      // Set initial spawn height on terrain
      world.spawn.y = world.getTerrainHeight(world.spawn.x, world.spawn.z);

      return world;
    }

    static _buildPerimeter(world, rng) {
      const H = world.ceilingHeight || 5.0;
      const S = world.worldHalfSize;
      const wallTex =
        world.biome.id === 'YELLOW_COMPLEX'
          ? 'wallpaper_yellow'
          : world.biome.id === 'POOLROOMS'
          ? 'pool_tile_white'
          : world.biome.id === 'DEAD_MALL'
          ? 'mall_wall'
          : world.biome.id === 'ETERNAL_SUBURBIA'
          ? 'suburb_wall'
          : 'meadow_path';

      const isOutdoor = world.biome.id === 'DREAMCORE_MEADOW' || world.biome.id === 'ETERNAL_SUBURBIA';
      const perimHeight = isOutdoor ? 2.4 : H;

      const segments = [
        { id: 'bound_n', x: 0, z: -S, w: S * 2, d: 1.0 },
        { id: 'bound_s', x: 0, z: S, w: S * 2, d: 1.0 },
        { id: 'bound_w', x: -S, z: 0, w: 1.0, d: S * 2 },
        { id: 'bound_e', x: S, z: 0, w: 1.0, d: S * 2 }
      ];

      for (const seg of segments) {
        world.walls.push({
          id: seg.id,
          x: seg.x,
          y: perimHeight * 0.5 - 0.2,
          z: seg.z,
          w: seg.w,
          h: perimHeight,
          d: seg.d,
          tex: wallTex,
          isBoundary: true,
          blocksLight: !isOutdoor
        });
      }
      rng.next();
    }

    static _buildYellowComplex(world, rng) {
      const H = world.ceilingHeight;
      const gridStep = 6.0;
      const half = world.worldHalfSize - gridStep;
      let wallIdx = 0;

      // Generate interconnected Backrooms partition walls, pillars, and doorways
      for (let gx = -half; gx <= half; gx += gridStep) {
        for (let gz = -half; gz <= half; gz += gridStep) {
          // Leave central spawn lobby clear
          if (Math.hypot(gx, gz) < 5.5) continue;

          const roll = rng.next();
          if (roll < 0.36) {
            // Horizontal wall along X
            const hasDoor = rng.chance(0.32);
            if (hasDoor) {
              WorldGenerator._addWallWithDoor(world, gx, gz, gridStep, 0.45, H, 'X', 'wallpaper_yellow', wallIdx++);
            } else {
              world.walls.push({
                id: `yc_w_${wallIdx++}`,
                x: gx,
                y: H * 0.5,
                z: gz,
                w: gridStep,
                h: H,
                d: 0.45,
                tex: 'wallpaper_yellow',
                blocksLight: true
              });
            }
          } else if (roll < 0.72) {
            // Vertical wall along Z
            const hasDoor = rng.chance(0.32);
            if (hasDoor) {
              WorldGenerator._addWallWithDoor(world, gx, gz, 0.45, gridStep, H, 'Z', 'wallpaper_yellow', wallIdx++);
            } else {
              world.walls.push({
                id: `yc_w_${wallIdx++}`,
                x: gx,
                y: H * 0.5,
                z: gz,
                w: 0.45,
                h: H,
                d: gridStep,
                tex: 'wallpaper_yellow',
                blocksLight: true
              });
            }
          } else if (roll < 0.88) {
            // Structural Backrooms square pillar
            world.walls.push({
              id: `yc_pil_${wallIdx++}`,
              x: gx,
              y: H * 0.5,
              z: gz,
              w: 1.1,
              h: H,
              d: 1.1,
              tex: 'wallpaper_yellow',
              blocksLight: true
            });
          }
        }
      }

      // Ceiling fluorescent light grid
      let lightIdx = 0;
      for (let lx = -24; lx <= 24; lx += 8) {
        for (let lz = -24; lz <= 24; lz += 8) {
          const sectorId = `${Math.floor((lx + 32) / 16)}_${Math.floor((lz + 32) / 16)}`;
          const flicker = rng.chance(0.22);
          world.lights.push({
            id: `light_${lightIdx++}`,
            x: lx,
            y: H - 0.12,
            z: lz,
            color: 0xfff3b8,
            intensity: flicker ? 0.85 : 1.15,
            distance: 13,
            flicker,
            sectorId,
            isOn: true
          });
        }
      }

      // Office details: desks, CRT monitors, vending machines, wall posters, puddles
      for (let i = 0; i < 28; i++) {
        const px = rng.range(-28, 28);
        const pz = rng.range(-28, 28);
        if (!world.canPlaceAt(px, pz, 1.3)) continue;

        const kind = rng.pick(['desk_crt', 'vending', 'cabinet', 'puddle', 'chair']);
        if (kind === 'desk_crt') {
          world.registerFootprint(px, pz, 1.25);
          world.props.push({
            id: `prop_desk_${i}`,
            type: 'desk_crt',
            x: px,
            y: 0,
            z: pz,
            w: 1.5,
            h: 0.82,
            d: 0.85,
            rotY: rng.pick([0, Math.PI * 0.5, Math.PI, Math.PI * 1.5]),
            collides: true
          });
          world.interactables.push({
            id: `term_crt_${i}`,
            type: 'TERMINAL',
            x: px,
            y: 1.05,
            z: pz,
            radius: 2.1,
            title: 'ЭЛТ-ТЕРМИНАЛ IBM-84',
            prompt: 'Прочитать экран [E]',
            message: rng.pick(TERMINAL_TEXTS)
          });
        } else if (kind === 'vending') {
          world.registerFootprint(px, pz, 1.1);
          world.props.push({
            id: `prop_vend_${i}`,
            type: 'vending_machine',
            x: px,
            y: 0,
            z: pz,
            w: 1.1,
            h: 2.1,
            d: 0.9,
            rotY: rng.pick([0, Math.PI * 0.5, Math.PI]),
            collides: true
          });
          world.interactables.push({
            id: `inter_vend_${i}`,
            type: 'VENDING',
            x: px,
            y: 1.1,
            z: pz,
            radius: 2.2,
            usesLeft: 3,
            prompt: 'Взять Миндальную воду (+Рассудок) [E]'
          });
        } else if (kind === 'cabinet') {
          world.registerFootprint(px, pz, 0.85);
          world.props.push({
            id: `prop_cab_${i}`,
            type: 'filing_cabinet',
            x: px,
            y: 0,
            z: pz,
            w: 0.75,
            h: 1.45,
            d: 0.75,
            rotY: rng.range(0, Math.PI * 2),
            collides: true
          });
        } else if (kind === 'chair') {
          world.registerFootprint(px, pz, 0.65);
          world.dynamicProps.push({
            id: `dyn_chair_${i}`,
            type: 'office_chair',
            x: px,
            y: 0,
            z: pz,
            vx: 0,
            vy: 0,
            vz: 0,
            radius: 0.45,
            height: 0.95,
            mass: 1.4,
            restitution: 0.35,
            buoyant: false,
            color: 0x3a3528
          });
        } else {
          world.props.push({
            id: `prop_puddle_${i}`,
            type: 'floor_puddle',
            x: px,
            y: 0.01,
            z: pz,
            w: rng.range(1.4, 2.8),
            h: 0.02,
            d: rng.range(1.4, 2.8),
            rotY: rng.range(0, Math.PI),
            collides: false
          });
        }
      }
    }

    static _buildDreamcoreMeadow(world, rng) {
      // Giant floating eyes, monoliths, and rings in the Dreamcore sky
      for (let i = 0; i < 6; i++) {
        const angle = (i / 6) * Math.PI * 2 + rng.range(-0.3, 0.3);
        const dist = rng.range(26, 48);
        world.skyObjects.push({
          id: `sky_eye_${i}`,
          type: i % 2 === 0 ? 'GIANT_EYE' : 'FLOATING_FRAME',
          x: Math.cos(angle) * dist,
          y: rng.range(11, 21),
          z: Math.sin(angle) * dist,
          scale: rng.range(3.2, 6.2),
          phase: rng.range(0, Math.PI * 2)
        });
      }

      // Lonely Dreamcore wooden cottages with warm glowing windows
      const houseCoords = [
        { x: -16, z: -14 },
        { x: 18, z: -15 },
        { x: -15, z: 17 },
        { x: 16, z: 16 }
      ];
      houseCoords.forEach((hc, idx) => {
        const hx = hc.x + rng.range(-2.5, 2.5);
        const hz = hc.z + rng.range(-2.5, 2.5);
        const groundY = world.getTerrainHeight(hx, hz);
        const w = 5.4;
        const d = 5.4;
        const h = 3.8;
        world.registerFootprint(hx, hz, 4.2);

        world.walls.push({
          id: `meadow_house_${idx}`,
          x: hx,
          y: groundY + h * 0.5,
          z: hz,
          w,
          h,
          d,
          tex: 'suburb_wall',
          hasRoof: true,
          roofColor: idx % 2 === 0 ? 0xb83b48 : 0x3b628f,
          blocksLight: true
        });

        world.lights.push({
          id: `house_light_${idx}`,
          x: hx,
          y: groundY + 2.4,
          z: hz + d * 0.65,
          color: 0xffd571,
          intensity: 1.2,
          distance: 14,
          flicker: false,
          sectorId: 'meadow',
          isOn: true
        });
      });

      // Trees, playground swings, white picket fences, streetlamps in grass, CRT TVs in flowers
      for (let i = 0; i < 42; i++) {
        const px = rng.range(-30, 30);
        const pz = rng.range(-30, 30);
        if (!world.canPlaceAt(px, pz, 1.2)) continue;
        const py = world.getTerrainHeight(px, pz);

        const kind = rng.pick(['dream_tree', 'dream_tree', 'swing_set', 'white_fence', 'field_tv', 'streetlamp', 'beach_ball']);
        if (kind === 'dream_tree') {
          world.registerFootprint(px, pz, 0.9);
          world.props.push({
            id: `meadow_tree_${i}`,
            type: 'dream_tree',
            x: px,
            y: py,
            z: pz,
            w: 0.7,
            h: rng.range(3.4, 5.2),
            d: 0.7,
            rotY: rng.range(0, Math.PI * 2),
            collides: true
          });
        } else if (kind === 'swing_set') {
          world.registerFootprint(px, pz, 1.6);
          world.props.push({
            id: `meadow_swing_${i}`,
            type: 'swing_set',
            x: px,
            y: py,
            z: pz,
            w: 2.6,
            h: 2.5,
            d: 1.2,
            rotY: rng.range(0, Math.PI),
            collides: true
          });
        } else if (kind === 'white_fence') {
          world.registerFootprint(px, pz, 1.3);
          world.props.push({
            id: `meadow_fence_${i}`,
            type: 'white_fence',
            x: px,
            y: py,
            z: pz,
            w: 2.8,
            h: 1.05,
            d: 0.22,
            rotY: rng.pick([0, Math.PI * 0.5]),
            collides: true
          });
        } else if (kind === 'field_tv') {
          world.registerFootprint(px, pz, 0.9);
          world.props.push({
            id: `meadow_tv_${i}`,
            type: 'field_crt',
            x: px,
            y: py,
            z: pz,
            w: 0.9,
            h: 0.95,
            d: 0.8,
            rotY: rng.range(0, Math.PI * 2),
            collides: true
          });
          world.interactables.push({
            id: `inter_field_tv_${i}`,
            type: 'TERMINAL',
            x: px,
            y: py + 0.8,
            z: pz,
            radius: 2.2,
            title: 'ТЕЛЕВИЗОР В ТРАВЕ',
            prompt: 'Настроить частоту снов [E]',
            message: rng.pick(TERMINAL_TEXTS)
          });
        } else if (kind === 'streetlamp') {
          world.registerFootprint(px, pz, 0.6);
          world.props.push({
            id: `meadow_lamp_${i}`,
            type: 'streetlamp',
            x: px,
            y: py,
            z: pz,
            w: 0.35,
            h: 3.8,
            d: 0.35,
            rotY: 0,
            collides: true
          });
          world.lights.push({
            id: `meadow_lamplight_${i}`,
            x: px,
            y: py + 3.6,
            z: pz,
            color: 0xfff0aa,
            intensity: 0.95,
            distance: 12,
            flicker: false,
            sectorId: 'meadow',
            isOn: true
          });
        } else if (kind === 'beach_ball') {
          world.dynamicProps.push({
            id: `meadow_ball_${i}`,
            type: 'beach_ball',
            x: px,
            y: py + 0.5,
            z: pz,
            vx: 0,
            vy: 0,
            vz: 0,
            radius: 0.45,
            height: 0.9,
            mass: 0.6,
            restitution: 0.78,
            buoyant: true,
            color: 0xff5ca8
          });
        }
      }
    }

    static _buildPoolrooms(world, rng) {
      const H = world.ceilingHeight;
      // Sunken warm water pool zones across the hall
      world.waterZones.push(
        { minX: -32, maxX: 32, minZ: -32, maxZ: -6, surfaceY: 0.52, depth: 0.68 },
        { minX: -32, maxX: 32, minZ: 6, maxZ: 32, surfaceY: 0.52, depth: 0.68 },
        { minX: -32, maxX: -6, minZ: -6, maxZ: 6, surfaceY: 0.52, depth: 0.68 },
        { minX: 6, maxX: 32, minZ: -6, maxZ: 6, surfaceY: 0.52, depth: 0.68 }
      );

      // Tiled colonnades and partition walls with arched/open passages
      let wIdx = 0;
      for (let gx = -24; gx <= 24; gx += 8) {
        for (let gz = -24; gz <= 24; gz += 8) {
          if (Math.hypot(gx, gz) < 6.5) continue;
          const roll = rng.next();
          if (roll < 0.48) {
            // Tiled column
            world.walls.push({
              id: `pool_col_${wIdx++}`,
              x: gx,
              y: H * 0.5 - 0.3,
              z: gz,
              w: 1.4,
              h: H + 0.6,
              d: 1.4,
              tex: rng.chance(0.7) ? 'pool_tile_white' : 'pool_tile_cyan',
              blocksLight: true
            });
          } else if (roll < 0.75) {
            // Tiled divider wall
            const alongX = rng.chance(0.5);
            world.walls.push({
              id: `pool_wall_${wIdx++}`,
              x: gx,
              y: H * 0.5 - 0.3,
              z: gz,
              w: alongX ? 6.2 : 0.6,
              h: H + 0.6,
              d: alongX ? 0.6 : 6.2,
              tex: 'pool_tile_white',
              blocksLight: true
            });
          }
        }
      }

      // Skylight shafts & aqua reflections
      let lIdx = 0;
      for (let lx = -20; lx <= 20; lx += 10) {
        for (let lz = -20; lz <= 20; lz += 10) {
          world.lights.push({
            id: `pool_light_${lIdx++}`,
            x: lx,
            y: H - 0.2,
            z: lz,
            color: 0xd4fffc,
            intensity: 1.25,
            distance: 15,
            flicker: false,
            sectorId: 'pool',
            isOn: true
          });
          world.props.push({
            id: `pool_shaft_${lIdx}`,
            type: 'light_shaft',
            x: lx,
            y: 0,
            z: lz,
            w: 2.2,
            h: H,
            d: 2.2,
            rotY: 0,
            collides: false
          });
        }
      }

      // Floating pool rings & beach balls with buoyancy physics
      for (let i = 0; i < 16; i++) {
        const px = rng.range(-26, 26);
        const pz = rng.range(-26, 26);
        if (!world.canPlaceAt(px, pz, 0.9)) continue;
        world.dynamicProps.push({
          id: `pool_float_${i}`,
          type: i % 2 === 0 ? 'pool_ring' : 'beach_ball',
          x: px,
          y: 0.55,
          z: pz,
          vx: 0,
          vy: 0,
          vz: 0,
          radius: 0.52,
          height: 0.45,
          mass: 0.5,
          restitution: 0.72,
          buoyant: true,
          color: i % 2 === 0 ? 0xff6ad5 : 0x52f2ff
        });
      }
    }

    static _buildDeadMall(world, rng) {
      const H = world.ceilingHeight;
      // Central vaporwave fountain in the atrium (offset from spawn)
      world.waterZones.push({
        minX: 7,
        maxX: 15,
        minZ: -4,
        maxZ: 4,
        surfaceY: 0.38,
        depth: 0.45
      });

      let wIdx = 0;
      for (let gx = -24; gx <= 24; gx += 8) {
        for (let gz = -24; gz <= 24; gz += 8) {
          if (Math.hypot(gx, gz) < 6.5 || (gx >= 6 && gx <= 16 && Math.abs(gz) <= 5)) continue;
          const roll = rng.next();
          if (roll < 0.35) {
            world.walls.push({
              id: `mall_store_${wIdx++}`,
              x: gx,
              y: H * 0.5,
              z: gz,
              w: rng.chance(0.5) ? 6.5 : 0.7,
              h: H,
              d: rng.chance(0.5) ? 0.7 : 6.5,
              tex: 'mall_wall',
              blocksLight: true
            });
          } else if (roll < 0.65) {
            // Indoor palm planter or arcade cabinet
            if (world.canPlaceAt(gx, gz, 1.2)) {
              world.registerFootprint(gx, gz, 1.2);
              const isArcade = rng.chance(0.45);
              world.props.push({
                id: `mall_prop_${wIdx++}`,
                type: isArcade ? 'arcade_cabinet' : 'palm_planter',
                x: gx,
                y: 0,
                z: gz,
                w: isArcade ? 0.95 : 1.6,
                h: isArcade ? 1.95 : 2.9,
                d: isArcade ? 0.95 : 1.6,
                rotY: rng.range(0, Math.PI * 2),
                collides: true
              });
              if (isArcade) {
                world.interactables.push({
                  id: `mall_arc_${wIdx}`,
                  type: 'TERMINAL',
                  x: gx,
                  y: 1.2,
                  z: gz,
                  radius: 2.2,
                  title: 'АРКАДНЫЙ АВТОМАТ 1997',
                  prompt: 'Сыграть / Прочитать экран [E]',
                  message: rng.pick(TERMINAL_TEXTS)
                });
              }
            }
          }
        }
      }

      // Neon magenta & cyan atrium lights
      let lIdx = 0;
      for (let lx = -22; lx <= 22; lx += 11) {
        for (let lz = -22; lz <= 22; lz += 11) {
          world.lights.push({
            id: `mall_light_${lIdx++}`,
            x: lx,
            y: H - 0.25,
            z: lz,
            color: (lIdx % 2 === 0) ? 0xff66cc : 0x55f2ff,
            intensity: 1.15,
            distance: 15,
            flicker: rng.chance(0.15),
            sectorId: 'mall',
            isOn: true
          });
        }
      }
    }

    static _buildEternalSuburbia(world, rng) {
      // Repeating symmetrical suburban houses lining two foggy avenues
      let hIdx = 0;
      for (let z = -26; z <= 26; z += 10) {
        for (const sideX of [-15, 15]) {
          const hx = sideX + rng.range(-1.0, 1.0);
          const hz = z + rng.range(-1.0, 1.0);
          world.registerFootprint(hx, hz, 4.2);
          world.walls.push({
            id: `sub_house_${hIdx++}`,
            x: hx,
            y: 2.2,
            z: hz,
            w: 5.8,
            h: 4.4,
            d: 5.8,
            tex: 'suburb_wall',
            hasRoof: true,
            roofColor: 0x2b2d3c,
            blocksLight: true
          });
        }
      }

      // Sodium-vapor orange streetlights & ringing payphone booths along the street
      for (let z = -24; z <= 24; z += 12) {
        for (const lampX of [-5.5, 5.5]) {
          world.registerFootprint(lampX, z, 0.5);
          world.props.push({
            id: `sub_lamp_${lampX}_${z}`,
            type: 'streetlamp',
            x: lampX,
            y: 0,
            z,
            w: 0.4,
            h: 4.2,
            d: 0.4,
            rotY: 0,
            collides: true
          });
          world.lights.push({
            id: `sub_light_${lampX}_${z}`,
            x: lampX,
            y: 4.0,
            z,
            color: 0xff9d42,
            intensity: 1.3,
            distance: 14,
            flicker: rng.chance(0.2),
            sectorId: 'suburb',
            isOn: true
          });
        }
      }

      // Payphone booths & vending machines
      const boothCoords = [
        { x: -6.5, z: -6 },
        { x: 6.5, z: 8 },
        { x: -6.5, z: 18 }
      ];
      boothCoords.forEach((bc, idx) => {
        if (!world.canPlaceAt(bc.x, bc.z, 1.0)) return;
        world.registerFootprint(bc.x, bc.z, 1.0);
        world.props.push({
          id: `sub_phone_${idx}`,
          type: 'payphone_booth',
          x: bc.x,
          y: 0,
          z: bc.z,
          w: 1.0,
          h: 2.2,
          d: 1.0,
          rotY: bc.x < 0 ? Math.PI * 0.5 : -Math.PI * 0.5,
          collides: true
        });
        world.interactables.push({
          id: `inter_phone_${idx}`,
          type: 'TERMINAL',
          x: bc.x,
          y: 1.2,
          z: bc.z,
          radius: 2.3,
          title: 'НОЧНОЙ ТАКСОФОН',
          prompt: 'Снять трубку таксофона [E]',
          message: rng.pick(TERMINAL_TEXTS)
        });
      });
    }

    static _addWallWithDoor(world, cx, cz, w, d, h, axis, tex, idx) {
      const doorWidth = 1.6;
      if (axis === 'X') {
        const segW = (w - doorWidth) * 0.5;
        world.walls.push(
          {
            id: `door_wall_l_${idx}`,
            x: cx - doorWidth * 0.5 - segW * 0.5,
            y: h * 0.5,
            z: cz,
            w: segW,
            h,
            d,
            tex,
            blocksLight: true
          },
          {
            id: `door_wall_r_${idx}`,
            x: cx + doorWidth * 0.5 + segW * 0.5,
            y: h * 0.5,
            z: cz,
            w: segW,
            h,
            d,
            tex,
            blocksLight: true
          }
        );
      } else {
        const segD = (d - doorWidth) * 0.5;
        world.walls.push(
          {
            id: `door_wall_t_${idx}`,
            x: cx,
            y: h * 0.5,
            z: cz - doorWidth * 0.5 - segD * 0.5,
            w,
            h,
            d: segD,
            tex,
            blocksLight: true
          },
          {
            id: `door_wall_b_${idx}`,
            x: cx,
            y: h * 0.5,
            z: cz + doorWidth * 0.5 + segD * 0.5,
            w,
            h,
            d: segD,
            tex,
            blocksLight: true
          }
        );
      }

      const doorColliderId = `door_leaf_${idx}`;
      const doorH = 2.4;
      const doorWall = {
        id: doorColliderId,
        x: cx,
        y: doorH * 0.5,
        z: cz,
        w: axis === 'X' ? doorWidth : 0.22,
        h: doorH,
        d: axis === 'X' ? 0.22 : doorWidth,
        tex: 'wood_door',
        isDoor: true,
        isOpen: false,
        axis,
        blocksLight: true
      };
      world.walls.push(doorWall);

      world.interactables.push({
        id: `inter_door_${idx}`,
        type: 'DOOR',
        x: cx,
        y: 1.2,
        z: cz,
        radius: 2.5,
        doorWallId: doorColliderId,
        isOpen: false,
        axis,
        prompt: 'Открыть / Закрыть дверь [E]'
      });
    }

    static _populateInteractablesAndPortals(world, rng) {
      // 1. Place at least 1 interactive Door near spawn if none was generated yet
      const hasDoor = world.interactables.some((it) => it.type === 'DOOR');
      if (!hasDoor) {
        WorldGenerator._addWallWithDoor(world, 0, -7.5, 6.0, 0.4, 3.2, 'X', 'wood_door', 999);
      }

      // 2. Place Wall Light Switches on nearby interior/building walls
      let switchesPlaced = 0;
      for (let i = 0; i < world.walls.length && switchesPlaced < 4; i++) {
        const w = world.walls[i];
        if (w.isBoundary || w.isDoor) continue;
        const sx = w.x + (w.w > w.d ? 0 : w.w * 0.5 + 0.15);
        const sz = w.z + (w.w > w.d ? w.d * 0.5 + 0.15 : 0);
        const sy = world.getTerrainHeight(sx, sz) + 1.25;
        const nearestLight = world.lights[switchesPlaced % Math.max(1, world.lights.length)];
        const sectorId = nearestLight ? nearestLight.sectorId : 'main';

        world.props.push({
          id: `prop_switch_${switchesPlaced}`,
          type: 'light_switch',
          x: sx,
          y: sy,
          z: sz,
          w: 0.18,
          h: 0.26,
          d: 0.12,
          rotY: 0,
          collides: false
        });

        world.interactables.push({
          id: `inter_switch_${switchesPlaced}`,
          type: 'SWITCH',
          x: sx,
          y: sy,
          z: sz,
          radius: 2.4,
          sectorId,
          isOn: true,
          prompt: 'Переключить свет сектора [E]'
        });
        switchesPlaced++;
      }

      // 3. Ensure at least one Vending Machine / Almond Water Dispenser exists
      if (!world.interactables.some((it) => it.type === 'VENDING')) {
        const vx = 4.2;
        const vz = -3.8;
        const vy = world.getTerrainHeight(vx, vz);
        world.registerFootprint(vx, vz, 1.0);
        world.props.push({
          id: 'prop_vend_guaranteed',
          type: 'vending_machine',
          x: vx,
          y: vy,
          z: vz,
          w: 1.1,
          h: 2.1,
          d: 0.9,
          rotY: 0,
          collides: true
        });
        world.interactables.push({
          id: 'inter_vend_guaranteed',
          type: 'VENDING',
          x: vx,
          y: vy + 1.1,
          z: vz,
          radius: 2.4,
          usesLeft: 3,
          prompt: 'Взять Миндальную воду (+Рассудок) [E]'
        });
      }

      // 4. Place 4 Collectible VHS Memory Tapes across the world
      const vhsCandidates = [
        { x: -4.2, z: 4.2 },
        { x: -12, z: -9 },
        { x: 13, z: -11 },
        { x: -11, z: 14 },
        { x: 14, z: 12 },
        { x: 0, z: 16 }
      ];
      let vhsCount = 0;
      for (let i = 0; i < vhsCandidates.length && vhsCount < 4; i++) {
        let cx = vhsCandidates[i].x + rng.range(-1.5, 1.5);
        let cz = vhsCandidates[i].z + rng.range(-1.5, 1.5);
        if (!world.canPlaceAt(cx, cz, 0.7, i === 0)) {
          cx = vhsCandidates[i].x;
          cz = vhsCandidates[i].z;
        }
        const cy = world.getTerrainHeight(cx, cz) + 0.45;
        const lore = LORE_MESSAGES[(vhsCount + rng.int(0, 5)) % LORE_MESSAGES.length];
        const tapeId = `vhs_${world.seed}_${vhsCount}`;
        world.props.push({
          id: `prop_${tapeId}`,
          type: 'vhs_tape',
          x: cx,
          y: cy,
          z: cz,
          w: 0.45,
          h: 0.25,
          d: 0.3,
          rotY: rng.range(0, Math.PI * 2),
          collides: false
        });
        world.interactables.push({
          id: `inter_${tapeId}`,
          type: 'VHS_TAPE',
          tapeId,
          propId: `prop_${tapeId}`,
          x: cx,
          y: cy,
          z: cz,
          radius: 2.3,
          collected: false,
          title: lore.title,
          loreText: lore.text,
          prompt: `Забрать VHS-кассету «${lore.title}» [E]`
        });
        vhsCount++;
      }

      // 5. Ensure at least 2 pushable Dynamic Props near player & in world
      if (world.dynamicProps.length < 3) {
        const dpCoords = [
          { x: 2.8, z: 2.6, type: 'beach_ball', color: 0xff5ca8 },
          { x: -3.2, z: 2.4, type: 'office_chair', color: 0x4599ff }
        ];
        dpCoords.forEach((dc, idx) => {
          const py = world.getTerrainHeight(dc.x, dc.z) + 0.45;
          world.dynamicProps.push({
            id: `dyn_guaranteed_${idx}`,
            type: dc.type,
            x: dc.x,
            y: py,
            z: dc.z,
            vx: 0,
            vy: 0,
            vz: 0,
            radius: 0.46,
            height: 0.85,
            mass: 0.8,
            restitution: 0.65,
            buoyant: true,
            color: dc.color
          });
        });
      }

      // 6. Place 2 Liminal Portals / Reality Rifts to warp to new deterministic Seeds
      const portalSpots = [
        { x: 0, z: -21, label: 'РАЗЛОМ СНОВ [СЛЕДУЮЩИЙ МИР]' },
        { x: 20, z: 0, label: 'ДВЕРЬ ПЕРЕХОДА [СЛУЧАЙНЫЙ СИД]' }
      ];
      portalSpots.forEach((ps, idx) => {
        const px = ps.x;
        const pz = ps.z;
        const py = world.getTerrainHeight(px, pz);
        const childRng = rng.fork(`PORTAL_${idx}`);
        const nextBiome = PRNG.BIOME_TYPES[(PRNG.BIOME_TYPES.indexOf(world.biome) + idx + 1) % PRNG.BIOME_TYPES.length];
        const nextSeed = `${nextBiome.id.split('_')[0]}-${childRng.int(1000, 9999)}`;

        world.props.push({
          id: `prop_portal_${idx}`,
          type: 'portal_rift',
          x: px,
          y: py,
          z: pz,
          w: 1.8,
          h: 2.8,
          d: 0.45,
          rotY: idx === 0 ? 0 : Math.PI * 0.5,
          collides: false
        });
        world.interactables.push({
          id: `inter_portal_${idx}`,
          type: 'PORTAL',
          x: px,
          y: py + 1.4,
          z: pz,
          radius: 2.6,
          targetSeed: nextSeed,
          targetBiomeId: nextBiome.id,
          label: ps.label,
          prompt: `Войти в Разлом → Сид ${nextSeed} (${nextBiome.name}) [E]`
        });
        world.lights.push({
          id: `portal_light_${idx}`,
          x: px,
          y: py + 1.8,
          z: pz,
          color: 0xb74bff,
          intensity: 1.4,
          distance: 11,
          flicker: true,
          sectorId: 'portal',
          isOn: true
        });
      });
    }
  }

  return {
    WorldGenerator,
    LORE_MESSAGES,
    TERMINAL_TEXTS
  };
});
