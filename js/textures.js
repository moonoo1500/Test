/**
 * Procedural Texture Generator & Cache
 * Generates authentic Liminal / Dreamcore / Backrooms / Poolrooms textures via HTML5 Canvas.
 * Includes full caching and disposal for memory optimization, plus headless fallback for Node tests.
 */
(function (root, factory) {
  const prngMod =
    typeof module === 'object' && module.exports
      ? require('./prng.js')
      : root.LiminalPRNG;
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(prngMod, root.THREE || null);
  } else {
    root.LiminalTextures = factory(prngMod, root.THREE || null);
  }
})(typeof self !== 'undefined' ? self : this, function (PRNG, THREE_GLOBAL) {
  'use strict';

  function createCanvas2D(width, height) {
    if (typeof document !== 'undefined' && typeof document.createElement === 'function') {
      const c = document.createElement('canvas');
      c.width = width;
      c.height = height;
      return c;
    }
    // Lightweight mock canvas for Node.js verification tests
    const mockCtx = {
      fillStyle: '#000',
      strokeStyle: '#000',
      lineWidth: 1,
      globalAlpha: 1,
      font: '12px monospace',
      textAlign: 'left',
      textBaseline: 'alphabetic',
      opsCount: 0,
      fillRect() { this.opsCount++; },
      strokeRect() { this.opsCount++; },
      clearRect() { this.opsCount++; },
      beginPath() { this.opsCount++; },
      closePath() {},
      moveTo() {},
      lineTo() {},
      arc() { this.opsCount++; },
      ellipse() { this.opsCount++; },
      fill() { this.opsCount++; },
      stroke() { this.opsCount++; },
      fillText() { this.opsCount++; },
      createLinearGradient() {
        return { addColorStop() {} };
      },
      createRadialGradient() {
        return { addColorStop() {} };
      },
      save() {},
      restore() {},
      translate() {},
      rotate() {},
      scale() {}
    };
    return {
      width,
      height,
      _isMockCanvas: true,
      getContext() {
        return mockCtx;
      }
    };
  }

  class TextureManager {
    constructor(options = {}) {
      this.cache = new Map();
      this.canvasCache = new Map();
      this.retroFilter = Boolean(options.retroFilter);
      this.THREE = options.THREE || THREE_GLOBAL;
    }

    setRetroFilter(enabled) {
      this.retroFilter = Boolean(enabled);
      const T = this.THREE;
      if (!T) return;
      for (const tex of this.cache.values()) {
        if (tex && tex.isTexture) {
          tex.magFilter = this.retroFilter ? T.NearestFilter : T.LinearFilter;
          tex.minFilter = this.retroFilter ? T.NearestFilter : T.LinearMipmapLinearFilter;
          tex.needsUpdate = true;
        }
      }
    }

    getCanvas(name, size = 128, seed = 'TEX') {
      const key = `${name}:${size}:${seed}`;
      if (this.canvasCache.has(key)) {
        return this.canvasCache.get(key);
      }
      const canvas = createCanvas2D(size, size);
      const ctx = canvas.getContext('2d');
      const rng = new PRNG.SeededRandom(`${seed}::${name}`);

      switch (name) {
        case 'wallpaper_yellow':
          this._drawWallpaperYellow(ctx, size, rng);
          break;
        case 'carpet_damp':
          this._drawCarpetDamp(ctx, size, rng);
          break;
        case 'ceiling_tile':
          this._drawCeilingTile(ctx, size, rng);
          break;
        case 'pool_tile_white':
          this._drawPoolTile(ctx, size, rng, '#e9f5f3', '#b3d4cf', '#ffffff');
          break;
        case 'pool_tile_cyan':
          this._drawPoolTile(ctx, size, rng, '#49b6b0', '#277a76', '#8be8e2');
          break;
        case 'water_surface':
          this._drawWaterSurface(ctx, size, rng);
          break;
        case 'meadow_grass':
          this._drawMeadowGrass(ctx, size, rng);
          break;
        case 'meadow_path':
          this._drawMeadowPath(ctx, size, rng);
          break;
        case 'mall_checker':
          this._drawMallChecker(ctx, size, rng);
          break;
        case 'mall_wall':
          this._drawMallWall(ctx, size, rng);
          break;
        case 'asphalt_wet':
          this._drawAsphaltWet(ctx, size, rng);
          break;
        case 'suburb_wall':
          this._drawSuburbWall(ctx, size, rng);
          break;
        case 'wood_door':
          this._drawWoodDoor(ctx, size, rng);
          break;
        case 'crt_screen':
          this._drawCRTScreen(ctx, size, rng);
          break;
        case 'liminal_poster':
          this._drawLiminalPoster(ctx, size, rng);
          break;
        case 'sky_eye':
          this._drawSkyEye(ctx, size, rng);
          break;
        case 'vending_front':
          this._drawVendingFront(ctx, size, rng);
          break;
        case 'portal_rift':
          this._drawPortalRift(ctx, size, rng);
          break;
        default:
          this._drawFallbackGrid(ctx, size, rng);
          break;
      }

      this.canvasCache.set(key, canvas);
      return canvas;
    }

    getTexture(name, options = {}) {
      const size = options.size || 128;
      const repeatX = options.repeatX || 1;
      const repeatY = options.repeatY || 1;
      const seed = options.seed || 'TEX';
      const key = `${name}:${size}:${repeatX}x${repeatY}:${seed}`;

      if (this.cache.has(key)) {
        return this.cache.get(key);
      }

      const canvas = this.getCanvas(name, size, seed);
      const T = this.THREE || (typeof window !== 'undefined' ? window.THREE : null);

      if (!T || !T.CanvasTexture) {
        const mockTex = {
          name,
          key,
          image: canvas,
          repeat: { x: repeatX, y: repeatY, set(x, y) { this.x = x; this.y = y; } },
          dispose() {}
        };
        this.cache.set(key, mockTex);
        return mockTex;
      }

      const tex = new T.CanvasTexture(canvas);
      tex.wrapS = T.RepeatWrapping;
      tex.wrapT = T.RepeatWrapping;
      tex.repeat.set(repeatX, repeatY);
      tex.magFilter = this.retroFilter ? T.NearestFilter : T.LinearFilter;
      tex.minFilter = this.retroFilter ? T.NearestFilter : T.LinearMipmapLinearFilter;
      tex.needsUpdate = true;

      this.cache.set(key, tex);
      return tex;
    }

    _drawWallpaperYellow(ctx, s, rng) {
      // Base aged mono-yellow background
      const grad = ctx.createLinearGradient(0, 0, 0, s);
      grad.addColorStop(0, '#c8b55b');
      grad.addColorStop(0.82, '#bda84b');
      grad.addColorStop(0.93, '#8f7d32');
      grad.addColorStop(1, '#3b2e19');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, s, s);

      // Vertical wallpaper strip lines
      ctx.strokeStyle = 'rgba(90, 76, 22, 0.25)';
      ctx.lineWidth = 1;
      for (let x = 0; x < s; x += Math.max(8, s / 8)) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, s * 0.92);
        ctx.stroke();
      }

      // Damask / diamond ornamental motifs
      const step = Math.max(16, s / 4);
      ctx.strokeStyle = 'rgba(155, 134, 48, 0.55)';
      ctx.fillStyle = 'rgba(225, 206, 114, 0.32)';
      for (let y = step / 2; y < s * 0.9; y += step) {
        for (let x = step / 2; x < s; x += step) {
          const r = step * 0.28;
          ctx.beginPath();
          ctx.moveTo(x, y - r);
          ctx.lineTo(x + r * 0.75, y);
          ctx.lineTo(x, y + r);
          ctx.lineTo(x - r * 0.75, y);
          ctx.closePath();
          ctx.fill();
          ctx.stroke();
        }
      }

      // Damp water stains & mold spots
      for (let i = 0; i < 18; i++) {
        const cx = rng.range(0, s);
        const cy = rng.range(s * 0.45, s * 0.92);
        const rad = rng.range(s * 0.04, s * 0.14);
        ctx.fillStyle = 'rgba(88, 74, 24, 0.16)';
        ctx.beginPath();
        ctx.arc(cx, cy, rad, 0, Math.PI * 2);
        ctx.fill();
      }

      // Dark wood baseboard along the bottom
      ctx.fillStyle = '#47381d';
      ctx.fillRect(0, s * 0.92, s, s * 0.08);
      ctx.fillStyle = '#2d2210';
      ctx.fillRect(0, s * 0.915, s, s * 0.015);
    }

    _drawCarpetDamp(ctx, s, rng) {
      ctx.fillStyle = '#8b7740';
      ctx.fillRect(0, 0, s, s);
      const cell = Math.max(2, Math.floor(s / 32));
      for (let y = 0; y < s; y += cell) {
        for (let x = 0; x < s; x += cell) {
          const n = rng.noise2D(x * 0.12, y * 0.12);
          const v = Math.floor(125 + n * 24 + rng.range(-10, 10));
          const r = Math.min(255, Math.max(40, v + 18));
          const g = Math.min(255, Math.max(35, v + 2));
          const b = Math.min(255, Math.max(20, Math.floor(v * 0.52)));
          ctx.fillStyle = `rgb(${r},${g},${b})`;
          ctx.fillRect(x, y, cell, cell);
        }
      }
      // Damp dark patches
      for (let i = 0; i < 6; i++) {
        ctx.fillStyle = 'rgba(45, 36, 14, 0.18)';
        ctx.beginPath();
        ctx.arc(rng.range(0, s), rng.range(0, s), rng.range(s * 0.08, s * 0.22), 0, Math.PI * 2);
        ctx.fill();
      }
    }

    _drawCeilingTile(ctx, s, rng) {
      ctx.fillStyle = '#d8d5c5';
      ctx.fillRect(0, 0, s, s);
      const step = Math.max(32, s / 2);
      ctx.strokeStyle = '#7e7b6d';
      ctx.lineWidth = Math.max(2, s / 42);
      for (let x = 0; x <= s; x += step) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, s);
        ctx.stroke();
      }
      for (let y = 0; y <= s; y += step) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(s, y);
        ctx.stroke();
      }
      // Acoustic pinholes
      ctx.fillStyle = 'rgba(70, 68, 58, 0.45)';
      for (let i = 0; i < 140; i++) {
        ctx.fillRect(rng.int(2, s - 3), rng.int(2, s - 3), 2, 2);
      }
    }

    _drawPoolTile(ctx, s, rng, baseHex, groutHex, highlightHex) {
      ctx.fillStyle = groutHex;
      ctx.fillRect(0, 0, s, s);
      const tiles = 4;
      const cell = s / tiles;
      const pad = Math.max(1, Math.floor(s / 48));
      for (let ty = 0; ty < tiles; ty++) {
        for (let tx = 0; tx < tiles; tx++) {
          const x = tx * cell + pad;
          const y = ty * cell + pad;
          const w = cell - pad * 2;
          const h = cell - pad * 2;
          ctx.fillStyle = baseHex;
          ctx.fillRect(x, y, w, h);

          // Subtle variation
          if (rng.chance(0.35)) {
            ctx.fillStyle = 'rgba(0, 50, 55, 0.06)';
            ctx.fillRect(x, y, w, h);
          }

          // Ceramic bevel highlight
          ctx.fillStyle = highlightHex;
          ctx.globalAlpha = 0.35;
          ctx.fillRect(x + 1, y + 1, w - 2, Math.max(2, h * 0.14));
          ctx.fillRect(x + 1, y + 1, Math.max(2, w * 0.14), h - 2);
          ctx.globalAlpha = 1.0;
        }
      }
    }

    _drawWaterSurface(ctx, s, rng) {
      const grad = ctx.createLinearGradient(0, 0, s, s);
      grad.addColorStop(0, '#2ad1c9');
      grad.addColorStop(0.5, '#46e8dd');
      grad.addColorStop(1, '#1fa8a4');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, s, s);

      // Caustic cellular web lines
      ctx.strokeStyle = 'rgba(230, 255, 255, 0.55)';
      ctx.lineWidth = Math.max(1.5, s / 48);
      for (let i = 0; i < 16; i++) {
        const cx = rng.range(0, s);
        const cy = rng.range(0, s);
        const rx = rng.range(s * 0.1, s * 0.28);
        const ry = rng.range(s * 0.08, s * 0.24);
        ctx.beginPath();
        ctx.ellipse(cx, cy, rx, ry, rng.range(0, Math.PI), 0, Math.PI * 2);
        ctx.stroke();
      }
    }

    _drawMeadowGrass(ctx, s, rng) {
      ctx.fillStyle = '#47b84f';
      ctx.fillRect(0, 0, s, s);
      const cell = Math.max(2, Math.floor(s / 32));
      for (let y = 0; y < s; y += cell) {
        for (let x = 0; x < s; x += cell) {
          const n = rng.noise2D(x * 0.09, y * 0.09);
          const g = Math.floor(172 + n * 28 + rng.range(-8, 8));
          const r = Math.floor(62 + n * 18);
          const b = Math.floor(68 + n * 14);
          ctx.fillStyle = `rgb(${r},${g},${b})`;
          ctx.fillRect(x, y, cell, cell);
        }
      }
      // Dreamcore daisies and pastel wildflowers
      const flowerColors = ['#ffffff', '#fff275', '#ffb8e6', '#a8f9ff'];
      for (let i = 0; i < 24; i++) {
        ctx.fillStyle = rng.pick(flowerColors);
        const fx = rng.int(3, s - 4);
        const fy = rng.int(3, s - 4);
        ctx.fillRect(fx, fy, 3, 3);
      }
    }

    _drawMeadowPath(ctx, s, rng) {
      ctx.fillStyle = '#c9bfa3';
      ctx.fillRect(0, 0, s, s);
      for (let i = 0; i < 36; i++) {
        ctx.fillStyle = rng.chance(0.5) ? '#b5a888' : '#ded6be';
        ctx.beginPath();
        ctx.arc(rng.range(0, s), rng.range(0, s), rng.range(3, s * 0.1), 0, Math.PI * 2);
        ctx.fill();
      }
    }

    _drawMallChecker(ctx, s, rng) {
      const cells = 4;
      const cell = s / cells;
      for (let y = 0; y < cells; y++) {
        for (let x = 0; x < cells; x++) {
          const isDark = (x + y) % 2 === 1;
          ctx.fillStyle = isDark ? '#2d1e4a' : '#f2e9f7';
          ctx.fillRect(x * cell, y * cell, cell, cell);
          // Marble vein lines
          ctx.strokeStyle = isDark ? 'rgba(170, 120, 255, 0.25)' : 'rgba(120, 90, 150, 0.22)';
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(x * cell + rng.range(0, cell), y * cell);
          ctx.lineTo(x * cell + rng.range(0, cell), (y + 1) * cell);
          ctx.stroke();
        }
      }
    }

    _drawMallWall(ctx, s, rng) {
      const grad = ctx.createLinearGradient(0, 0, 0, s);
      grad.addColorStop(0, '#f3d9fa');
      grad.addColorStop(0.65, '#dec2f0');
      grad.addColorStop(0.7, '#00f0ff');
      grad.addColorStop(0.74, '#ff47b6');
      grad.addColorStop(0.75, '#422c63');
      grad.addColorStop(1, '#2a1a42');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, s, s);
      // Subtle vertical paneling
      ctx.strokeStyle = 'rgba(255,255,255,0.22)';
      for (let x = 0; x < s; x += s / 4) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, s);
        ctx.stroke();
      }
      rng.next();
    }

    _drawAsphaltWet(ctx, s, rng) {
      ctx.fillStyle = '#1d2029';
      ctx.fillRect(0, 0, s, s);
      const cell = Math.max(2, Math.floor(s / 32));
      for (let y = 0; y < s; y += cell) {
        for (let x = 0; x < s; x += cell) {
          const v = rng.int(22, 44);
          ctx.fillStyle = `rgb(${v},${v + 2},${v + 8})`;
          ctx.fillRect(x, y, cell, cell);
        }
      }
      // Wet puddle sheen
      ctx.fillStyle = 'rgba(255, 175, 90, 0.12)';
      ctx.beginPath();
      ctx.arc(s * 0.5, s * 0.5, s * 0.28, 0, Math.PI * 2);
      ctx.fill();
    }

    _drawSuburbWall(ctx, s, rng) {
      ctx.fillStyle = '#d9d4c7';
      ctx.fillRect(0, 0, s, s);
      // Horizontal clapboard siding lines
      const planks = 8;
      const step = s / planks;
      ctx.strokeStyle = '#9c9585';
      ctx.lineWidth = 2;
      for (let y = 0; y <= s; y += step) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(s, y);
        ctx.stroke();
      }
      // Glowing eerie yellow window in center
      ctx.fillStyle = '#33291a';
      ctx.fillRect(s * 0.28, s * 0.22, s * 0.44, s * 0.48);
      ctx.fillStyle = '#ffdf78';
      ctx.fillRect(s * 0.32, s * 0.26, s * 0.36, s * 0.40);
      // Window muntins (crossbars)
      ctx.fillStyle = '#33291a';
      ctx.fillRect(s * 0.49, s * 0.26, s * 0.03, s * 0.40);
      ctx.fillRect(s * 0.32, s * 0.44, s * 0.36, s * 0.03);
      rng.next();
    }

    _drawWoodDoor(ctx, s, rng) {
      ctx.fillStyle = '#6e4726';
      ctx.fillRect(0, 0, s, s);
      ctx.strokeStyle = '#3d2511';
      ctx.lineWidth = Math.max(2, s / 24);
      ctx.strokeRect(s * 0.08, s * 0.05, s * 0.84, s * 0.9);
      // Upper frosted window
      ctx.fillStyle = '#a9c7c4';
      ctx.fillRect(s * 0.2, s * 0.14, s * 0.6, s * 0.3);
      // Lower recessed panel
      ctx.strokeRect(s * 0.2, s * 0.54, s * 0.6, s * 0.3);
      // Brass doorknob
      ctx.fillStyle = '#ffd25a';
      ctx.beginPath();
      ctx.arc(s * 0.82, s * 0.5, s * 0.045, 0, Math.PI * 2);
      ctx.fill();
      rng.next();
    }

    _drawCRTScreen(ctx, s, rng) {
      ctx.fillStyle = '#081822';
      ctx.fillRect(0, 0, s, s);
      // Phosphor glow
      const grad = ctx.createRadialGradient(s / 2, s / 2, 4, s / 2, s / 2, s * 0.55);
      grad.addColorStop(0, '#3cf7ff');
      grad.addColorStop(0.6, '#146278');
      grad.addColorStop(1, '#041017');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, s, s);
      // Eye motif on screen
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.ellipse(s * 0.5, s * 0.45, s * 0.26, s * 0.14, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#101426';
      ctx.beginPath();
      ctx.arc(s * 0.5, s * 0.45, s * 0.09, 0, Math.PI * 2);
      ctx.fill();
      // Scanlines
      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      for (let y = 0; y < s; y += 4) {
        ctx.fillRect(0, y, s, 2);
      }
      rng.next();
    }

    _drawLiminalPoster(ctx, s, rng) {
      ctx.fillStyle = '#120d1f';
      ctx.fillRect(0, 0, s, s);
      ctx.strokeStyle = '#ff4da6';
      ctx.lineWidth = 4;
      ctx.strokeRect(4, 4, s - 8, s - 8);
      // Weirdcore eye
      ctx.fillStyle = '#f8f5ff';
      ctx.beginPath();
      ctx.ellipse(s * 0.5, s * 0.38, s * 0.32, s * 0.18, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#3b66ff';
      ctx.beginPath();
      ctx.arc(s * 0.5, s * 0.38, s * 0.11, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#000000';
      ctx.beginPath();
      ctx.arc(s * 0.5, s * 0.38, s * 0.05, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = '#ffe863';
      ctx.font = `bold ${Math.max(10, Math.floor(s * 0.11))}px monospace`;
      ctx.textAlign = 'center';
      const msgs = ['WAKE UP?', 'ТЫ ЗДЕСЬ БЫЛ', 'NO EXIT', 'REMEMBER'];
      ctx.fillText(rng.pick(msgs), s * 0.5, s * 0.78);
    }

    _drawSkyEye(ctx, s, rng) {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, s, s);
      const grad = ctx.createRadialGradient(s / 2, s / 2, s * 0.05, s / 2, s / 2, s * 0.48);
      grad.addColorStop(0, '#000000');
      grad.addColorStop(0.22, '#000000');
      grad.addColorStop(0.25, '#3be8ff');
      grad.addColorStop(0.48, '#6e3bff');
      grad.addColorStop(0.55, '#ffffff');
      grad.addColorStop(1, '#f5d0e6');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, s, s);
      rng.next();
    }

    _drawVendingFront(ctx, s, rng) {
      ctx.fillStyle = '#1d2b44';
      ctx.fillRect(0, 0, s, s);
      ctx.fillStyle = '#7bf5ff';
      ctx.fillRect(s * 0.1, s * 0.08, s * 0.8, s * 0.58);
      // Drink cans rows
      const colors = ['#ff5277', '#42f5aa', '#ffde59', '#6b8cff'];
      for (let r = 0; r < 3; r++) {
        for (let c = 0; c < 4; c++) {
          ctx.fillStyle = colors[(r + c) % colors.length];
          ctx.fillRect(s * (0.16 + c * 0.18), s * (0.14 + r * 0.16), s * 0.12, s * 0.11);
        }
      }
      // Dispenser slot
      ctx.fillStyle = '#0a0f18';
      ctx.fillRect(s * 0.18, s * 0.74, s * 0.64, s * 0.16);
      rng.next();
    }

    _drawPortalRift(ctx, s, rng) {
      const grad = ctx.createRadialGradient(s / 2, s / 2, 2, s / 2, s / 2, s * 0.5);
      grad.addColorStop(0, '#ffffff');
      grad.addColorStop(0.35, '#8afbff');
      grad.addColorStop(0.7, '#b44cff');
      grad.addColorStop(1, '#12002b');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, s, s);
      rng.next();
    }

    _drawFallbackGrid(ctx, s) {
      ctx.fillStyle = '#444';
      ctx.fillRect(0, 0, s, s);
      ctx.strokeStyle = '#888';
      ctx.strokeRect(0, 0, s, s);
    }

    disposeAll() {
      for (const tex of this.cache.values()) {
        if (tex && typeof tex.dispose === 'function') {
          tex.dispose();
        }
      }
      this.cache.clear();
      this.canvasCache.clear();
    }
  }

  return {
    TextureManager,
    createCanvas2D
  };
});
