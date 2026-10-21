/**
 * Pixel-Art 2D Arcade Renderer ("Аркада (2D, пиксельный)")
 * Renders the procedural liminal world in crisp retro pixel-art style:
 * - Tiled floors, textured 2.5D top-down walls with roof/depth shading
 * - Animated pixel human explorer (walk, sprint, crouch, jump shadow, water ripples)
 * - Dynamic raycast flashlight cone & sector lighting
 * - Interactive object highlights, floating sky eyes, and VHS scanline aesthetic
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.LiminalRenderer2D = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  class Renderer2D {
    constructor(options = {}) {
      this.container = options.container || null;
      this.textureManager = options.textureManager || null;
      this.canvas = null;
      this.ctx = null;
      this.world = null;
      this.pixelsPerMeter = 18; // Retro pixel scale
      this.cameraX = 0;
      this.cameraZ = 0;

      this._initCanvas();
    }

    _initCanvas() {
      if (!this.container || typeof document === 'undefined') {
        this._isHeadless = true;
        return;
      }
      this.canvas = document.createElement('canvas');
      this.canvas.className = 'canvas-2d';
      this.ctx = this.canvas.getContext('2d');
      this.container.appendChild(this.canvas);
      this.resize();
    }

    resize(width, height) {
      if (!this.canvas) return;
      const w = width || (this.container ? this.container.clientWidth : 800) || 800;
      const h = height || (this.container ? this.container.clientHeight : 600) || 600;
      // Render at retro internal resolution for authentic chunky pixel-art
      const targetW = Math.max(320, Math.min(640, Math.floor(w * 0.52)));
      const targetH = Math.max(200, Math.min(480, Math.floor(h * 0.52)));
      this.canvas.width = targetW;
      this.canvas.height = targetH;
      if (this.ctx) {
        this.ctx.imageSmoothingEnabled = false;
      }
    }

    buildWorld(world) {
      this.world = world;
      if (world && world.spawn) {
        this.cameraX = world.spawn.x;
        this.cameraZ = world.spawn.z;
      }
    }

    render(physics, interaction, timeSec) {
      if (this._isHeadless || !this.ctx || !this.canvas || !physics || !this.world) {
        return;
      }

      const ctx = this.ctx;
      const W = this.canvas.width;
      const H = this.canvas.height;
      const ppm = this.pixelsPerMeter;
      const p = physics.player;
      const world = this.world;
      const biome = world.biome;

      // Smooth camera follow
      this.cameraX += (p.x - this.cameraX) * 0.18;
      this.cameraZ += (p.z - this.cameraZ) * 0.18;

      const worldToScreenX = (wx) => Math.round(W * 0.5 + (wx - this.cameraX) * ppm);
      const worldToScreenY = (wz) => Math.round(H * 0.5 + (wz - this.cameraZ) * ppm);

      // 1. Background / Floor base color
      const bgColors = {
        YELLOW_COMPLEX: '#86733b',
        DREAMCORE_MEADOW: '#44b24c',
        POOLROOMS: '#2f9e99',
        DEAD_MALL: '#32204f',
        ETERNAL_SUBURBIA: '#1d212b'
      };
      ctx.fillStyle = bgColors[biome.id] || '#333';
      ctx.fillRect(0, 0, W, H);

      // 2. Pixel grid tiles on floor
      const gridStep = 2.0;
      const startGX = Math.floor((this.cameraX - W / (2 * ppm)) / gridStep) * gridStep;
      const endGX = Math.ceil((this.cameraX + W / (2 * ppm)) / gridStep) * gridStep;
      const startGZ = Math.floor((this.cameraZ - H / (2 * ppm)) / gridStep) * gridStep;
      const endGZ = Math.ceil((this.cameraZ + H / (2 * ppm)) / gridStep) * gridStep;

      for (let gx = startGX; gx <= endGX; gx += gridStep) {
        for (let gz = startGZ; gz <= endGZ; gz += gridStep) {
          const sx = worldToScreenX(gx);
          const sy = worldToScreenY(gz);
          const cellPx = Math.ceil(gridStep * ppm);
          const isAlt = (Math.round(gx / gridStep) + Math.round(gz / gridStep)) % 2 === 0;

          if (biome.id === 'DEAD_MALL') {
            ctx.fillStyle = isAlt ? '#ece2f4' : '#2d1c47';
            ctx.fillRect(sx, sy, cellPx, cellPx);
          } else if (biome.id === 'POOLROOMS') {
            ctx.strokeStyle = 'rgba(215, 252, 248, 0.24)';
            ctx.strokeRect(sx, sy, cellPx, cellPx);
          } else if (biome.id === 'DREAMCORE_MEADOW') {
            const elev = world.getTerrainHeight(gx, gz);
            if (elev > 0.45) {
              ctx.fillStyle = 'rgba(130, 235, 115, 0.22)';
              ctx.fillRect(sx, sy, cellPx, cellPx);
            }
            if (isAlt) {
              ctx.fillStyle = '#fff37a';
              ctx.fillRect(sx + 6, sy + 6, 2, 2);
            }
          } else if (biome.id === 'YELLOW_COMPLEX') {
            ctx.strokeStyle = 'rgba(55, 44, 16, 0.22)';
            ctx.strokeRect(sx, sy, cellPx, cellPx);
          } else {
            ctx.strokeStyle = 'rgba(255, 185, 90, 0.12)';
            ctx.strokeRect(sx, sy, cellPx, cellPx);
          }
        }
      }

      // 3. Water Zones with animated pixel ripples
      if (world.waterZones) {
        for (const wz of world.waterZones) {
          const x1 = worldToScreenX(wz.minX);
          const y1 = worldToScreenY(wz.minZ);
          const ww = Math.round((wz.maxX - wz.minX) * ppm);
          const hh = Math.round((wz.maxZ - wz.minZ) * ppm);
          ctx.fillStyle = 'rgba(56, 226, 218, 0.52)';
          ctx.fillRect(x1, y1, ww, hh);

          ctx.fillStyle = 'rgba(220, 255, 255, 0.45)';
          const waveOffset = Math.floor(timeSec * 12) % 16;
          for (let rx = x1 + waveOffset; rx < x1 + ww - 6; rx += 18) {
            for (let ry = y1 + 6; ry < y1 + hh - 4; ry += 18) {
              ctx.fillRect(rx, ry, 6, 2);
            }
          }
        }
      }

      // 4. Static & Interactive Props
      for (const pr of world.props) {
        if (pr.hidden) continue;
        const sx = worldToScreenX(pr.x);
        const sy = worldToScreenY(pr.z);
        const pw = Math.max(6, Math.round((pr.w || 0.8) * ppm));
        const pd = Math.max(6, Math.round((pr.d || 0.8) * ppm));

        if (pr.type === 'vhs_tape') {
          const pulse = Math.sin(timeSec * 5) * 2;
          ctx.fillStyle = '#ffe652';
          ctx.fillRect(sx - 5, sy - 4 + pulse, 10, 7);
          ctx.strokeStyle = '#ffffff';
          ctx.strokeRect(sx - 6, sy - 5 + pulse, 12, 9);
        } else if (pr.type === 'portal_rift') {
          ctx.fillStyle = '#b94bff';
          ctx.fillRect(sx - pw * 0.5, sy - pd * 0.5, pw, pd);
          ctx.fillStyle = '#75fbff';
          ctx.fillRect(sx - pw * 0.3, sy - pd * 0.3, pw * 0.6, pd * 0.6);
        } else if (pr.type === 'dream_tree') {
          ctx.fillStyle = '#227a34';
          ctx.beginPath();
          ctx.arc(sx, sy, Math.max(8, pw * 0.7), 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = '#4be368';
          ctx.beginPath();
          ctx.arc(sx - 2, sy - 2, Math.max(5, pw * 0.48), 0, Math.PI * 2);
          ctx.fill();
        } else if (pr.type === 'vending_machine') {
          ctx.fillStyle = '#24426b';
          ctx.fillRect(sx - pw * 0.5, sy - pd * 0.5, pw, pd);
          ctx.fillStyle = '#6ef7ff';
          ctx.fillRect(sx - pw * 0.35, sy - pd * 0.35, pw * 0.7, pd * 0.5);
        } else if (pr.type !== 'light_shaft') {
          ctx.fillStyle = '#75593b';
          ctx.fillRect(sx - pw * 0.5, sy - pd * 0.5, pw, pd);
        }
      }

      // 5. Dynamic Physics Props
      if (world.dynamicProps) {
        for (const dp of world.dynamicProps) {
          const sx = worldToScreenX(dp.x);
          const sy = worldToScreenY(dp.z);
          const rPx = Math.max(5, Math.round(dp.radius * ppm));
          ctx.fillStyle = dp.type === 'pool_ring' ? '#ff6ad5' : '#4ee8ff';
          ctx.beginPath();
          ctx.arc(sx, sy, rPx, 0, Math.PI * 2);
          ctx.fill();
          if (dp.type === 'pool_ring') {
            ctx.fillStyle = '#2f9e99';
            ctx.beginPath();
            ctx.arc(sx, sy, Math.max(2, rPx * 0.45), 0, Math.PI * 2);
            ctx.fill();
          }
        }
      }

      // 6. 2.5D Pixel Walls & Doors (with top roof bevel & drop shadow)
      const wallTopColors = {
        YELLOW_COMPLEX: '#d4be62',
        DREAMCORE_MEADOW: '#d96b75',
        POOLROOMS: '#e6f7f5',
        DEAD_MALL: '#df99f7',
        ETERNAL_SUBURBIA: '#6f7891'
      };
      const wallSideColors = {
        YELLOW_COMPLEX: '#877530',
        DREAMCORE_MEADOW: '#963f48',
        POOLROOMS: '#95bfb9',
        DEAD_MALL: '#773b91',
        ETERNAL_SUBURBIA: '#3c4254'
      };

      for (const w of world.walls) {
        if (w.isDoor && w.isOpen) {
          // Draw open door frame outline
          const dx = worldToScreenX(w.x - w.w * 0.5);
          const dy = worldToScreenY(w.z - w.d * 0.5);
          ctx.strokeStyle = '#ffd25a';
          ctx.strokeRect(dx, dy, Math.max(4, w.w * ppm), Math.max(4, w.d * ppm));
          continue;
        }
        const x1 = worldToScreenX(w.x - w.w * 0.5);
        const y1 = worldToScreenY(w.z - w.d * 0.5);
        const ww = Math.max(4, Math.round(w.w * ppm));
        const dd = Math.max(4, Math.round(w.d * ppm));

        // Shadow
        ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
        ctx.fillRect(x1 + 3, y1 + 4, ww, dd);

        // Extruded 2.5D side face
        ctx.fillStyle = w.isDoor ? '#6e4726' : wallSideColors[biome.id] || '#555';
        ctx.fillRect(x1, y1, ww, dd);

        // Top face shifted up by 4px for 2.5D depth
        ctx.fillStyle = w.isDoor ? '#a86e3b' : wallTopColors[biome.id] || '#999';
        ctx.fillRect(x1, y1 - 4, ww, dd);
      }

      // 7. Animated Pixel Human Character at screen center
      const px = worldToScreenX(p.x);
      const py = worldToScreenY(p.z);
      const jumpOffset = Math.max(0, Math.round((p.y - world.getTerrainHeight(p.x, p.z)) * 12));

      // Water ripple ring or ground shadow under player
      if (p.inWater) {
        ctx.strokeStyle = '#bffcff';
        ctx.beginPath();
        ctx.arc(px, py, 8 + Math.sin(timeSec * 6) * 2, 0, Math.PI * 2);
        ctx.stroke();
      } else {
        ctx.fillStyle = 'rgba(0,0,0,0.42)';
        ctx.fillRect(px - 5, py + 4, 10, 4);
      }

      // Legs animation
      const speed = Math.hypot(p.vx, p.vz);
      const legStride = speed > 0.25 ? Math.round(Math.sin(p.headBobPhase) * 3) : 0;
      ctx.fillStyle = '#1f2433';
      ctx.fillRect(px - 4, py + 1 - jumpOffset + legStride, 3, 5);
      ctx.fillRect(px + 1, py + 1 - jumpOffset - legStride, 3, 5);

      // Hoodie torso & backpack
      ctx.fillStyle = '#3b659c';
      const bodyH = p.isCrouching ? 5 : 7;
      ctx.fillRect(px - 5, py - 4 - jumpOffset, 10, bodyH);

      // Pixel head
      ctx.fillStyle = '#f5cba7';
      ctx.fillRect(px - 4, py - 9 - jumpOffset + (p.isCrouching ? 2 : 0), 8, 6);
      // Hair
      ctx.fillStyle = '#2d1e18';
      ctx.fillRect(px - 4, py - 10 - jumpOffset + (p.isCrouching ? 2 : 0), 8, 3);

      // 8. Flashlight directional beam & atmospheric vignette
      const lookX = -Math.sin(p.yaw);
      const lookZ = -Math.cos(p.yaw);
      const beamAngle = Math.atan2(lookZ, lookX);

      if (p.flashlightOn) {
        ctx.save();
        ctx.beginPath();
        ctx.moveTo(px, py - jumpOffset);
        ctx.arc(px, py - jumpOffset, 135, beamAngle - 0.48, beamAngle + 0.48);
        ctx.closePath();
        const beamGrad = ctx.createRadialGradient(px, py - jumpOffset, 6, px, py - jumpOffset, 135);
        beamGrad.addColorStop(0, 'rgba(255, 250, 210, 0.34)');
        beamGrad.addColorStop(1, 'rgba(255, 250, 210, 0.0)');
        ctx.fillStyle = beamGrad;
        ctx.fill();
        ctx.restore();
      }

      // 9. Highlight focused interactable object
      if (interaction && interaction.focusedTarget) {
        const ft = interaction.focusedTarget;
        const tx = worldToScreenX(ft.x);
        const ty = worldToScreenY(ft.z);
        ctx.strokeStyle = '#52ff9a';
        ctx.lineWidth = 1.5;
        ctx.strokeRect(tx - 9, ty - 9, 18, 18);
      }

      // 10. Retro CRT Scanlines & Liminal Vignette
      ctx.fillStyle = 'rgba(0, 0, 0, 0.16)';
      for (let sy = 0; sy < H; sy += 3) {
        ctx.fillRect(0, sy, W, 1);
      }
    }
  }

  return { Renderer2D };
});
