/**
 * Physics Engine & Spatial Hash Grid
 * Implements:
 * - SpatialHashGrid for O(1) broadphase collision queries
 * - Sub-stepped Capsule/Circle-vs-AABB collision with smooth wall sliding
 * - Gravity, Jump + Coyote time, Crouch height interpolation, Stair/Terrain step-up
 * - Water wading drag, splash detection & buoyancy in Poolrooms / Fountains
 * - Dynamic pushable props (chairs, beach balls, pool rings) with momentum & restitution
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.LiminalPhysics = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  class SpatialHashGrid {
    constructor(cellSize = 6.0) {
      this.cellSize = cellSize;
      this.cells = new Map();
      this.collidersById = new Map();
    }

    clear() {
      this.cells.clear();
      this.collidersById.clear();
    }

    _key(cx, cz) {
      return `${cx},${cz}`;
    }

    insertAABB(collider) {
      if (!collider || !collider.id) return;
      const item = {
        id: collider.id,
        x: collider.x,
        y: collider.y || 0,
        z: collider.z,
        w: collider.w || 1,
        h: collider.h || 2,
        d: collider.d || 1,
        minX: collider.x - (collider.w || 1) * 0.5,
        maxX: collider.x + (collider.w || 1) * 0.5,
        minY: (collider.y || 0) - (collider.h || 2) * 0.5,
        maxY: (collider.y || 0) + (collider.h || 2) * 0.5,
        minZ: collider.z - (collider.d || 1) * 0.5,
        maxZ: collider.z + (collider.d || 1) * 0.5,
        active: collider.active !== false,
        isDoor: Boolean(collider.isDoor),
        blocksLight: collider.blocksLight !== false
      };
      this.collidersById.set(item.id, item);

      const minCX = Math.floor(item.minX / this.cellSize);
      const maxCX = Math.floor(item.maxX / this.cellSize);
      const minCZ = Math.floor(item.minZ / this.cellSize);
      const maxCZ = Math.floor(item.maxZ / this.cellSize);

      for (let cx = minCX; cx <= maxCX; cx++) {
        for (let cz = minCZ; cz <= maxCZ; cz++) {
          const k = this._key(cx, cz);
          let bucket = this.cells.get(k);
          if (!bucket) {
            bucket = [];
            this.cells.set(k, bucket);
          }
          bucket.push(item);
        }
      }
    }

    setColliderActive(id, active) {
      const col = this.collidersById.get(id);
      if (col) {
        col.active = Boolean(active);
        return true;
      }
      return false;
    }

    queryNear(x, z, radius) {
      const minCX = Math.floor((x - radius) / this.cellSize);
      const maxCX = Math.floor((x + radius) / this.cellSize);
      const minCZ = Math.floor((z - radius) / this.cellSize);
      const maxCZ = Math.floor((z + radius) / this.cellSize);

      const result = [];
      const seen = new Set();

      for (let cx = minCX; cx <= maxCX; cx++) {
        for (let cz = minCZ; cz <= maxCZ; cz++) {
          const bucket = this.cells.get(this._key(cx, cz));
          if (!bucket) continue;
          for (let i = 0; i < bucket.length; i++) {
            const col = bucket[i];
            if (!col.active || seen.has(col.id)) continue;
            seen.add(col.id);
            result.push(col);
          }
        }
      }
      return result;
    }
  }

  class PhysicsEngine {
    constructor(world, soundEngine = null) {
      this.sound = soundEngine;
      this.grid = new SpatialHashGrid(6.0);
      this.gravity = -21.0;
      this.stepHeight = 0.46;
      this.player = {
        x: 0,
        y: 0,
        z: 0,
        vx: 0,
        vy: 0,
        vz: 0,
        yaw: 0,
        pitch: 0,
        radius: 0.38,
        standingHeight: 1.72,
        crouchHeight: 1.02,
        height: 1.72,
        eyeHeight: 1.56,
        walkSpeed: 4.4,
        sprintSpeed: 7.4,
        crouchSpeed: 2.35,
        jumpSpeed: 7.6,
        onGround: true,
        isCrouching: false,
        isSprinting: false,
        inWater: false,
        waterSubmersion: 0,
        coyoteTimer: 0,
        headBobPhase: 0,
        stepAccum: 0,
        stamina: 100,
        sanity: 100,
        flashlightOn: true,
        collisionsCountLastFrame: 0
      };
      if (world) {
        this.bindWorld(world);
      }
    }

    bindWorld(world) {
      this.world = world;
      this.grid.clear();

      for (let i = 0; i < world.walls.length; i++) {
        const w = world.walls[i];
        this.grid.insertAABB({
          id: w.id,
          x: w.x,
          y: w.y,
          z: w.z,
          w: w.w,
          h: w.h,
          d: w.d,
          active: !w.isOpen,
          isDoor: Boolean(w.isDoor),
          blocksLight: w.blocksLight !== false
        });
      }

      for (let i = 0; i < world.props.length; i++) {
        const p = world.props[i];
        if (!p.collides) continue;
        this.grid.insertAABB({
          id: p.id,
          x: p.x,
          y: p.y + (p.h || 1) * 0.5,
          z: p.z,
          w: p.w || 0.8,
          h: p.h || 1.2,
          d: p.d || 0.8,
          active: true,
          isDoor: false,
          blocksLight: false
        });
      }

      // Reset player at world spawn
      this.player.x = world.spawn.x;
      this.player.z = world.spawn.z;
      this.player.y = world.getTerrainHeight(world.spawn.x, world.spawn.z);
      this.player.vx = 0;
      this.player.vy = 0;
      this.player.vz = 0;
      this.player.onGround = true;
      this._updateWaterState();
    }

    _updateWaterState() {
      if (!this.world || !this.world.waterZones) {
        this.player.inWater = false;
        this.player.waterSubmersion = 0;
        return;
      }
      const px = this.player.x;
      const pz = this.player.z;
      const py = this.player.y;
      for (let i = 0; i < this.world.waterZones.length; i++) {
        const wz = this.world.waterZones[i];
        if (px >= wz.minX && px <= wz.maxX && pz >= wz.minZ && pz <= wz.maxZ) {
          const depth = wz.surfaceY - py;
          if (depth > 0.05) {
            this.player.inWater = true;
            this.player.waterSubmersion = Math.min(1, depth / 1.2);
            return;
          }
        }
      }
      this.player.inWater = false;
      this.player.waterSubmersion = 0;
    }

    /**
     * Step physics simulation forward by dt seconds.
     * input: { moveX (-1..1), moveZ (-1..1), sprint (bool), crouch (bool), jump (bool) }
     */
    update(dt, input = {}) {
      const clampedDt = Math.min(Math.max(dt, 0.001), 0.1);
      const p = this.player;
      p.collisionsCountLastFrame = 0;

      // 1. Crouch state & smooth collider height interpolation
      p.isCrouching = Boolean(input.crouch);
      const targetHeight = p.isCrouching ? p.crouchHeight : p.standingHeight;
      p.height += (targetHeight - p.height) * Math.min(1, clampedDt * 14);
      p.eyeHeight = p.height * 0.91;

      // 2. Water check
      const wasInWater = p.inWater;
      this._updateWaterState();
      if (!wasInWater && p.inWater && this.sound) {
        this.sound.playFootstep('water', true);
      }

      // 3. Stamina & Sprint
      const moveMag = Math.hypot(input.moveX || 0, input.moveZ || 0);
      const wantsSprint = Boolean(input.sprint) && !p.isCrouching && moveMag > 0.15 && p.stamina > 5;
      p.isSprinting = wantsSprint;
      if (p.isSprinting) {
        p.stamina = Math.max(0, p.stamina - clampedDt * 11);
      } else {
        p.stamina = Math.min(100, p.stamina + clampedDt * 14);
      }

      // Slow ambient sanity drift & recovery near lights
      p.sanity = Math.max(15, Math.min(100, p.sanity - clampedDt * 0.18));

      // 4. Compute desired horizontal velocity in world space
      let baseSpeed = p.walkSpeed;
      if (p.isCrouching) baseSpeed = p.crouchSpeed;
      else if (p.isSprinting) baseSpeed = p.sprintSpeed;
      if (p.inWater) baseSpeed *= 0.76; // Water wading resistance

      const forwardX = -Math.sin(p.yaw);
      const forwardZ = -Math.cos(p.yaw);
      const rightX = Math.cos(p.yaw);
      const rightZ = -Math.sin(p.yaw);

      const inX = Math.max(-1, Math.min(1, input.moveX || 0));
      const inZ = Math.max(-1, Math.min(1, input.moveZ || 0));
      const norm = Math.hypot(inX, inZ) > 1 ? 1 / Math.hypot(inX, inZ) : 1;

      let targetVX = 0;
      let targetVZ = 0;

      if (input.arcade2D) {
        // Top-down 2D Arcade screen-aligned movement + auto-facing
        targetVX = inX * norm * baseSpeed;
        targetVZ = inZ * norm * baseSpeed;
        if (Math.hypot(inX, inZ) > 0.15 && !input.manualLookActive) {
          const desiredYaw = Math.atan2(-inX, -inZ);
          let diff = desiredYaw - p.yaw;
          while (diff > Math.PI) diff -= Math.PI * 2;
          while (diff < -Math.PI) diff += Math.PI * 2;
          p.yaw += diff * Math.min(1, clampedDt * 12);
        }
      } else {
        // 3D Camera-relative movement
        targetVX = (rightX * inX + forwardX * (-inZ)) * norm * baseSpeed;
        targetVZ = (rightZ * inX + forwardZ * (-inZ)) * norm * baseSpeed;
      }

      const accel = p.onGround ? (p.inWater ? 9.0 : 16.0) : 6.5;
      const blend = Math.min(1, clampedDt * accel);
      p.vx += (targetVX - p.vx) * blend;
      p.vz += (targetVZ - p.vz) * blend;

      // 5. Sub-stepped horizontal motion & wall sliding
      const totalHorizDist = Math.hypot(p.vx * clampedDt, p.vz * clampedDt);
      const substeps = Math.max(1, Math.min(8, Math.ceil(totalHorizDist / 0.14)));
      const subDt = clampedDt / substeps;

      for (let s = 0; s < substeps; s++) {
        p.x += p.vx * subDt;
        p.z += p.vz * subDt;
        this._resolveHorizontalCollisions();
      }

      // 6. Vertical physics (Gravity, Buoyancy, Jump, Terrain follow)
      if (p.onGround) {
        p.coyoteTimer = 0.12;
      } else {
        p.coyoteTimer = Math.max(0, p.coyoteTimer - clampedDt);
      }

      if (input.jump) {
        if (p.onGround || p.coyoteTimer > 0) {
          p.vy = p.inWater ? p.jumpSpeed * 0.82 : p.jumpSpeed;
          p.onGround = false;
          p.coyoteTimer = 0;
          if (this.sound) this.sound.playSFX('jump');
        } else if (p.inWater && p.vy < 2.5) {
          // Swim boost in water
          p.vy = 4.2;
        }
      }

      const effGravity = p.inWater ? this.gravity * 0.45 : this.gravity;
      p.vy += effGravity * clampedDt;
      if (p.inWater) {
        p.vy *= Math.pow(0.85, clampedDt * 10);
      }
      p.y += p.vy * clampedDt;

      // Ground / terrain height resolution
      const groundY = this.world ? this.world.getTerrainHeight(p.x, p.z) : 0;
      if (p.y <= groundY) {
        p.y = groundY;
        p.vy = 0;
        p.onGround = true;
      } else {
        p.onGround = false;
      }

      // Ceiling clamp
      if (this.world && this.world.ceilingHeight) {
        const maxTop = this.world.ceilingHeight - p.height;
        if (p.y > maxTop) {
          p.y = maxTop;
          if (p.vy > 0) p.vy = 0;
        }
      }

      // 7. Headbob & Footsteps
      const actualSpeed = Math.hypot(p.vx, p.vz);
      if (p.onGround && actualSpeed > 0.35) {
        const freq = p.isSprinting ? 11.5 : p.isCrouching ? 5.5 : 8.2;
        p.headBobPhase += clampedDt * freq;
        p.stepAccum += actualSpeed * clampedDt;
        const stepThreshold = p.isSprinting ? 2.15 : 1.75;
        if (p.stepAccum >= stepThreshold) {
          p.stepAccum = 0;
          if (this.sound && this.world) {
            const surf = p.inWater ? 'water' : this.world.biome.footstepSurface;
            this.sound.playFootstep(surf, p.isSprinting);
          }
        }
      } else {
        p.headBobPhase *= Math.pow(0.2, clampedDt);
      }

      // 8. Update Dynamic Props & Player-Prop collisions
      this._updateDynamicProps(clampedDt);
    }

    _resolveHorizontalCollisions() {
      const p = this.player;
      const candidates = this.grid.queryNear(p.x, p.z, p.radius + 1.5);

      for (let i = 0; i < candidates.length; i++) {
        const col = candidates[i];
        if (!col.active) continue;

        // Vertical overlap check (allow stepping over low curbs < stepHeight)
        const playerBottom = p.y;
        const playerTop = p.y + p.height;
        if (playerBottom >= col.maxY - 0.05 || playerTop <= col.minY + 0.05) {
          continue;
        }
        if (col.maxY - playerBottom <= this.stepHeight && p.vy <= 0) {
          // Step up onto low ledge
          p.y = col.maxY;
          p.onGround = true;
          continue;
        }

        // Closest point on AABB to player circle center (p.x, p.z)
        const closestX = Math.max(col.minX, Math.min(p.x, col.maxX));
        const closestZ = Math.max(col.minZ, Math.min(p.z, col.maxZ));

        const dx = p.x - closestX;
        const dz = p.z - closestZ;
        const distSq = dx * dx + dz * dz;

        if (distSq < p.radius * p.radius) {
          p.collisionsCountLastFrame++;
          const dist = Math.sqrt(distSq);

          if (dist > 1e-5) {
            const overlap = p.radius - dist;
            const nx = dx / dist;
            const nz = dz / dist;
            p.x += nx * overlap;
            p.z += nz * overlap;

            // Remove inward velocity component for smooth wall sliding
            const vn = p.vx * nx + p.vz * nz;
            if (vn < 0) {
              p.vx -= vn * nx;
              p.vz -= vn * nz;
            }
          } else {
            // Player center is inside AABB: push out along minimum penetration axis
            const leftPen = Math.abs(p.x - col.minX);
            const rightPen = Math.abs(col.maxX - p.x);
            const topPen = Math.abs(p.z - col.minZ);
            const botPen = Math.abs(col.maxZ - p.z);
            const minPen = Math.min(leftPen, rightPen, topPen, botPen);

            if (minPen === leftPen) {
              p.x = col.minX - p.radius;
              if (p.vx > 0) p.vx = 0;
            } else if (minPen === rightPen) {
              p.x = col.maxX + p.radius;
              if (p.vx < 0) p.vx = 0;
            } else if (minPen === topPen) {
              p.z = col.minZ - p.radius;
              if (p.vz > 0) p.vz = 0;
            } else {
              p.z = col.maxZ + p.radius;
              if (p.vz < 0) p.vz = 0;
            }
          }
        }
      }

      // World outer safety clamp
      if (this.world) {
        const limit = this.world.worldHalfSize - p.radius - 0.6;
        p.x = Math.max(-limit, Math.min(limit, p.x));
        p.z = Math.max(-limit, Math.min(limit, p.z));
      }
    }

    _updateDynamicProps(dt) {
      if (!this.world || !this.world.dynamicProps) return;
      const p = this.player;
      const props = this.world.dynamicProps;

      for (let i = 0; i < props.length; i++) {
        const dp = props[i];

        // Player-vs-Prop push interaction
        const dx = dp.x - p.x;
        const dz = dp.z - p.z;
        const minDist = p.radius + dp.radius;
        const dist = Math.hypot(dx, dz);

        if (dist < minDist && dist > 1e-4 && Math.abs(dp.y - p.y) < p.height) {
          const nx = dx / dist;
          const nz = dz / dist;
          const overlap = minDist - dist;
          dp.x += nx * overlap * 0.85;
          dp.z += nz * overlap * 0.85;
          const pushSpeed = Math.max(2.6, Math.hypot(p.vx, p.vz) * 1.25);
          dp.vx += nx * pushSpeed;
          dp.vz += nz * pushSpeed;
        }

        // Integrate velocity
        dp.x += dp.vx * dt;
        dp.z += dp.vz * dt;

        // Friction
        const drag = dp.buoyant ? 2.4 : 4.2;
        dp.vx *= Math.exp(-drag * dt);
        dp.vz *= Math.exp(-drag * dt);

        // Vertical / Buoyancy
        const groundY = this.world.getTerrainHeight(dp.x, dp.z);
        let waterSurface = null;
        for (let w = 0; w < this.world.waterZones.length; w++) {
          const wz = this.world.waterZones[w];
          if (dp.x >= wz.minX && dp.x <= wz.maxX && dp.z >= wz.minZ && dp.z <= wz.maxZ) {
            waterSurface = wz.surfaceY;
            break;
          }
        }

        if (waterSurface !== null && dp.buoyant) {
          const targetY = waterSurface - dp.height * 0.25;
          dp.vy += (targetY - dp.y) * 18 * dt;
          dp.vy *= Math.exp(-4.0 * dt);
          dp.y += dp.vy * dt;
        } else {
          dp.vy += this.gravity * dt;
          dp.y += dp.vy * dt;
          if (dp.y < groundY) {
            dp.y = groundY;
            dp.vy = -dp.vy * (dp.restitution || 0.4);
            if (Math.abs(dp.vy) < 0.4) dp.vy = 0;
          }
        }

        // Wall collision for dynamic prop
        const nearWalls = this.grid.queryNear(dp.x, dp.z, dp.radius + 0.8);
        for (let w = 0; w < nearWalls.length; w++) {
          const col = nearWalls[w];
          if (!col.active) continue;
          const cx = Math.max(col.minX, Math.min(dp.x, col.maxX));
          const cz = Math.max(col.minZ, Math.min(dp.z, col.maxZ));
          const pdx = dp.x - cx;
          const pdz = dp.z - cz;
          const pDist = Math.hypot(pdx, pdz);
          if (pDist < dp.radius && pDist > 1e-5) {
            const pnx = pdx / pDist;
            const pnz = pdz / pDist;
            dp.x += pnx * (dp.radius - pDist);
            dp.z += pnz * (dp.radius - pDist);
            const vn = dp.vx * pnx + dp.vz * pnz;
            if (vn < 0) {
              dp.vx -= (1 + (dp.restitution || 0.5)) * vn * pnx;
              dp.vz -= (1 + (dp.restitution || 0.5)) * vn * pnz;
            }
          }
        }

        // Keep inside perimeter
        const limit = this.world.worldHalfSize - dp.radius - 0.8;
        dp.x = Math.max(-limit, Math.min(limit, dp.x));
        dp.z = Math.max(-limit, Math.min(limit, dp.z));
      }
    }

    kickNearestProp(force = 6.5) {
      if (!this.world || !this.world.dynamicProps) return null;
      const p = this.player;
      let best = null;
      let bestDist = 2.6;

      for (let i = 0; i < this.world.dynamicProps.length; i++) {
        const dp = this.world.dynamicProps[i];
        const d = Math.hypot(dp.x - p.x, dp.z - p.z);
        if (d < bestDist) {
          bestDist = d;
          best = dp;
        }
      }

      if (best) {
        const fx = -Math.sin(p.yaw);
        const fz = -Math.cos(p.yaw);
        best.vx += fx * force;
        best.vz += fz * force;
        best.vy += 2.6;
        if (this.sound) this.sound.playSFX('kick');
        return best;
      }
      return null;
    }
  }

  return {
    SpatialHashGrid,
    PhysicsEngine
  };
});
