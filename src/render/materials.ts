import * as THREE from 'three';
import { createRng } from '../core/rng';
import type { MatKey } from '../world/types';

/**
 * Procedural texture + material factory.
 *
 * Every surface in the game is painted at runtime on a 2D canvas: no binary
 * assets are shipped, the look stays consistent with the procedural worlds and
 * the download size stays tiny.
 */

type Painter = (ctx: CanvasRenderingContext2D, size: number, seed: number) => void;

const TEXTURE_SIZE = 256;

interface MatSpec {
  color: number;
  roughness: number;
  metalness: number;
  painter?: Painter;
  emissive?: number;
  emissiveIntensity?: number;
  transparent?: boolean;
  opacity?: number;
  bumpScale?: number;
  /** textures that should not tile endlessly use ClampToEdge */
  clamp?: boolean;
}

function noiseOverlay(ctx: CanvasRenderingContext2D, size: number, seed: number, amount: number): void {
  const img = ctx.getImageData(0, 0, size, size);
  const rng = createRng(`noise${seed}`);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const n = (rng() - 0.5) * amount;
    d[i] = Math.max(0, Math.min(255, d[i] + n));
    d[i + 1] = Math.max(0, Math.min(255, d[i + 1] + n));
    d[i + 2] = Math.max(0, Math.min(255, d[i + 2] + n));
  }
  ctx.putImageData(img, 0, 0);
}

function base(ctx: CanvasRenderingContext2D, size: number, color: string): void {
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, size, size);
}

function blob(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, color: string, alpha: number): void {
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, color);
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function tileGrid(ctx: CanvasRenderingContext2D, size: number, count: number, grout: string, groutWidth = 2): void {
  const step = size / count;
  ctx.strokeStyle = grout;
  ctx.lineWidth = groutWidth;
  for (let i = 0; i <= count; i++) {
    ctx.beginPath();
    ctx.moveTo(i * step, 0);
    ctx.lineTo(i * step, size);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, i * step);
    ctx.lineTo(size, i * step);
    ctx.stroke();
  }
}

const painters: Record<string, Painter> = {
  carpet: (ctx, size, seed) => {
    base(ctx, size, '#b39c5c');
    const rng = createRng(`carpet${seed}`);
    // fibre streaks
    ctx.globalAlpha = 0.16;
    for (let i = 0; i < 900; i++) {
      ctx.strokeStyle = rng() < 0.5 ? '#8d7a44' : '#d3bd7d';
      ctx.lineWidth = 1;
      const x = rng() * size;
      const y = rng() * size;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + (rng() - 0.5) * 8, y + (rng() - 0.5) * 8);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    for (let i = 0; i < 10; i++) {
      blob(ctx, rng() * size, rng() * size, 20 + rng() * 50, 'rgba(70,55,25,0.55)', 0.35);
    }
    noiseOverlay(ctx, size, seed + 11, 26);
  },

  carpetStain: (ctx, size, seed) => {
    base(ctx, size, '#7d6a38');
    const rng = createRng(`stain${seed}`);
    for (let i = 0; i < 16; i++) {
      blob(ctx, rng() * size, rng() * size, 18 + rng() * 46, 'rgba(38,30,12,0.6)', 0.4);
    }
    noiseOverlay(ctx, size, seed + 5, 30);
  },

  wallpaper: (ctx, size, seed) => {
    base(ctx, size, '#cbbd88');
    const rng = createRng(`wall${seed}`);
    ctx.globalAlpha = 0.2;
    for (let i = 0; i < size; i += 16) {
      ctx.fillStyle = i % 32 === 0 ? '#b7a76f' : '#d8cc9a';
      ctx.fillRect(i, 0, 8, size);
    }
    ctx.globalAlpha = 1;
    // damp stains creeping up from the floor
    for (let i = 0; i < 8; i++) {
      blob(ctx, rng() * size, size - rng() * 60, 26 + rng() * 40, 'rgba(92,74,36,0.75)', 0.5);
    }
    noiseOverlay(ctx, size, seed + 3, 18);
  },

  wallpaperRed: (ctx, size, seed) => {
    base(ctx, size, '#8d4a42');
    const rng = createRng(`wallred${seed}`);
    ctx.globalAlpha = 0.18;
    for (let i = 0; i < size; i += 12) {
      ctx.fillStyle = i % 24 === 0 ? '#793c36' : '#9c564c';
      ctx.fillRect(i, 0, 6, size);
    }
    ctx.globalAlpha = 1;
    for (let i = 0; i < 6; i++) {
      blob(ctx, rng() * size, rng() * size, 30 + rng() * 40, 'rgba(50,16,14,0.7)', 0.45);
    }
    noiseOverlay(ctx, size, seed + 7, 16);
  },

  wallpaperBlue: (ctx, size, seed) => {
    base(ctx, size, '#5d7f9e');
    ctx.globalAlpha = 0.16;
    for (let i = 0; i < size; i += 20) {
      ctx.fillStyle = i % 40 === 0 ? '#4e6d8a' : '#6b8caa';
      ctx.fillRect(i, 0, 10, size);
    }
    ctx.globalAlpha = 1;
    noiseOverlay(ctx, size, seed + 9, 18);
  },

  ceilingTile: (ctx, size, seed) => {
    base(ctx, size, '#d6d2c2');
    const rng = createRng(`ceil${seed}`);
    tileGrid(ctx, size, 4, 'rgba(120,116,102,0.85)', 3);
    for (let i = 0; i < 8; i++) {
      blob(ctx, rng() * size, rng() * size, 16 + rng() * 30, 'rgba(120,105,60,0.5)', 0.25);
    }
    noiseOverlay(ctx, size, seed + 13, 14);
  },

  plaster: (ctx, size, seed) => {
    base(ctx, size, '#d9d6cd');
    noiseOverlay(ctx, size, seed + 17, 16);
  },

  concrete: (ctx, size, seed) => {
    base(ctx, size, '#8c8c88');
    const rng = createRng(`concrete${seed}`);
    for (let i = 0; i < 60; i++) {
      blob(ctx, rng() * size, rng() * size, 6 + rng() * 26, 'rgba(60,60,58,0.5)', 0.3);
    }
    for (let i = 0; i < 40; i++) {
      blob(ctx, rng() * size, rng() * size, 2 + rng() * 5, 'rgba(200,200,195,0.5)', 0.35);
    }
    // cracks
    ctx.strokeStyle = 'rgba(50,50,48,0.5)';
    for (let i = 0; i < 5; i++) {
      ctx.lineWidth = 0.7 + rng();
      ctx.beginPath();
      let x = rng() * size;
      let y = rng() * size;
      ctx.moveTo(x, y);
      for (let s = 0; s < 6; s++) {
        x += (rng() - 0.5) * 60;
        y += (rng() - 0.5) * 60;
        ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
    noiseOverlay(ctx, size, seed + 19, 22);
  },

  asphalt: (ctx, size, seed) => {
    base(ctx, size, '#3b3b40');
    const rng = createRng(`asphalt${seed}`);
    for (let i = 0; i < 900; i++) {
      const g = 40 + rng() * 70;
      ctx.fillStyle = `rgba(${g},${g},${g + 6},${0.25 + rng() * 0.4})`;
      ctx.fillRect(rng() * size, rng() * size, 1 + rng() * 2, 1 + rng() * 2);
    }
    noiseOverlay(ctx, size, seed + 23, 20);
  },

  tileWhite: (ctx, size, seed) => {
    base(ctx, size, '#e6e3da');
    const rng = createRng(`tilew${seed}`);
    tileGrid(ctx, size, 4, 'rgba(150,146,136,0.8)', 2.5);
    for (let i = 0; i < 14; i++) {
      blob(ctx, rng() * size, rng() * size, 14 + rng() * 26, 'rgba(140,132,110,0.4)', 0.22);
    }
    noiseOverlay(ctx, size, seed + 29, 12);
  },

  tileBlue: (ctx, size, seed) => {
    base(ctx, size, '#4f8ba6');
    const rng = createRng(`tileb${seed}`);
    tileGrid(ctx, size, 4, 'rgba(30,60,72,0.85)', 2.5);
    for (let i = 0; i < 12; i++) {
      blob(ctx, rng() * size, rng() * size, 14 + rng() * 30, 'rgba(25,60,80,0.45)', 0.25);
    }
    noiseOverlay(ctx, size, seed + 31, 14);
  },

  tileGreen: (ctx, size, seed) => {
    base(ctx, size, '#6d9a70');
    tileGrid(ctx, size, 4, 'rgba(40,64,44,0.85)', 2.5);
    noiseOverlay(ctx, size, seed + 37, 14);
  },

  wood: (ctx, size, seed) => {
    base(ctx, size, '#8a6a44');
    const rng = createRng(`wood${seed}`);
    const planks = 6;
    const step = size / planks;
    for (let i = 0; i < planks; i++) {
      const shade = 0.82 + rng() * 0.36;
      ctx.fillStyle = `rgb(${Math.round(138 * shade)},${Math.round(106 * shade)},${Math.round(68 * shade)})`;
      ctx.fillRect(i * step, 0, step, size);
      ctx.strokeStyle = 'rgba(60,40,22,0.75)';
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.moveTo(i * step, 0);
      ctx.lineTo(i * step, size);
      ctx.stroke();
      // grain
      ctx.strokeStyle = 'rgba(70,48,26,0.28)';
      ctx.lineWidth = 1;
      for (let g = 0; g < 8; g++) {
        const x = i * step + rng() * step;
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.bezierCurveTo(x + 4, size * 0.3, x - 4, size * 0.7, x, size);
        ctx.stroke();
      }
    }
    noiseOverlay(ctx, size, seed + 41, 16);
  },

  woodDark: (ctx, size, seed) => {
    base(ctx, size, '#4f3a26');
    const rng = createRng(`woodd${seed}`);
    const planks = 5;
    const step = size / planks;
    for (let i = 0; i < planks; i++) {
      const shade = 0.85 + rng() * 0.3;
      ctx.fillStyle = `rgb(${Math.round(79 * shade)},${Math.round(58 * shade)},${Math.round(38 * shade)})`;
      ctx.fillRect(i * step, 0, step, size);
      ctx.strokeStyle = 'rgba(24,16,8,0.8)';
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.moveTo(i * step, 0);
      ctx.lineTo(i * step, size);
      ctx.stroke();
    }
    noiseOverlay(ctx, size, seed + 43, 14);
  },

  grass: (ctx, size, seed) => {
    base(ctx, size, '#5c7a41');
    const rng = createRng(`grass${seed}`);
    for (let i = 0; i < 2600; i++) {
      const g = rng();
      ctx.strokeStyle = g < 0.4 ? 'rgba(122,150,86,0.5)' : g < 0.8 ? 'rgba(64,88,48,0.5)' : 'rgba(150,160,80,0.35)';
      ctx.lineWidth = 1;
      const x = rng() * size;
      const y = rng() * size;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + (rng() - 0.5) * 3, y - 2 - rng() * 3);
      ctx.stroke();
    }
    noiseOverlay(ctx, size, seed + 47, 18);
  },

  dirt: (ctx, size, seed) => {
    base(ctx, size, '#6b5236');
    const rng = createRng(`dirt${seed}`);
    for (let i = 0; i < 700; i++) {
      const g = 70 + rng() * 60;
      ctx.fillStyle = `rgba(${g},${Math.round(g * 0.78)},${Math.round(g * 0.55)},0.5)`;
      ctx.fillRect(rng() * size, rng() * size, 1 + rng() * 3, 1 + rng() * 3);
    }
    noiseOverlay(ctx, size, seed + 53, 22);
  },

  metal: (ctx, size, seed) => {
    base(ctx, size, '#a7acb2');
    const rng = createRng(`metal${seed}`);
    for (let i = 0; i < 260; i++) {
      ctx.strokeStyle = `rgba(255,255,255,${rng() * 0.12})`;
      ctx.lineWidth = 1;
      const y = rng() * size;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(size, y + (rng() - 0.5) * 2);
      ctx.stroke();
    }
    noiseOverlay(ctx, size, seed + 59, 10);
  },

  metalDark: (ctx, size, seed) => {
    base(ctx, size, '#494e53');
    noiseOverlay(ctx, size, seed + 61, 16);
  },

  glass: (ctx, size, seed) => {
    base(ctx, size, '#a9d6e6');
    const rng = createRng(`glass${seed}`);
    ctx.globalAlpha = 0.25;
    for (let i = 0; i < 40; i++) {
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = rng() * 3;
      const x = rng() * size;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x + (rng() - 0.5) * 30, size);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    noiseOverlay(ctx, size, seed + 67, 8);
  },

  fabric: (ctx, size, seed) => {
    base(ctx, size, '#6b7079');
    for (let y = 0; y < size; y += 4) {
      ctx.fillStyle = y % 8 === 0 ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)';
      ctx.fillRect(0, y, size, 2);
    }
    for (let x = 0; x < size; x += 4) {
      ctx.fillStyle = x % 8 === 0 ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)';
      ctx.fillRect(x, 0, 2, size);
    }
    noiseOverlay(ctx, size, seed + 71, 14);
  },

  water: (ctx, size, seed) => {
    base(ctx, size, '#2f7896');
    const rng = createRng(`water${seed}`);
    ctx.globalAlpha = 0.35;
    for (let i = 0; i < 60; i++) {
      ctx.strokeStyle = 'rgba(190,235,255,0.8)';
      ctx.lineWidth = rng() * 2.4;
      ctx.beginPath();
      const y = rng() * size;
      ctx.moveTo(0, y);
      for (let x = 0; x <= size; x += 16) {
        ctx.lineTo(x, y + Math.sin((x / size) * Math.PI * 4 + i) * 5);
      }
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    noiseOverlay(ctx, size, seed + 73, 12);
  },
};

const SPECS: Record<MatKey, MatSpec> = {
  carpet: { color: 0xffffff, roughness: 0.96, metalness: 0, painter: painters.carpet },
  carpetStain: { color: 0xffffff, roughness: 0.98, metalness: 0, painter: painters.carpetStain },
  wallpaper: { color: 0xffffff, roughness: 0.92, metalness: 0, painter: painters.wallpaper },
  wallpaperRed: { color: 0xffffff, roughness: 0.92, metalness: 0, painter: painters.wallpaperRed },
  wallpaperBlue: { color: 0xffffff, roughness: 0.92, metalness: 0, painter: painters.wallpaperBlue },
  ceilingTile: { color: 0xffffff, roughness: 0.9, metalness: 0, painter: painters.ceilingTile },
  plaster: { color: 0xffffff, roughness: 0.95, metalness: 0, painter: painters.plaster },
  concrete: { color: 0xffffff, roughness: 0.94, metalness: 0, painter: painters.concrete },
  asphalt: { color: 0xffffff, roughness: 0.95, metalness: 0, painter: painters.asphalt },
  tileWhite: { color: 0xffffff, roughness: 0.55, metalness: 0.02, painter: painters.tileWhite },
  tileBlue: { color: 0xffffff, roughness: 0.5, metalness: 0.02, painter: painters.tileBlue },
  tileGreen: { color: 0xffffff, roughness: 0.55, metalness: 0.02, painter: painters.tileGreen },
  wood: { color: 0xffffff, roughness: 0.85, metalness: 0, painter: painters.wood },
  woodDark: { color: 0xffffff, roughness: 0.88, metalness: 0, painter: painters.woodDark },
  grass: { color: 0xffffff, roughness: 1, metalness: 0, painter: painters.grass },
  dirt: { color: 0xffffff, roughness: 1, metalness: 0, painter: painters.dirt },
  metal: { color: 0xffffff, roughness: 0.42, metalness: 0.75, painter: painters.metal },
  metalDark: { color: 0xffffff, roughness: 0.6, metalness: 0.5, painter: painters.metalDark },
  glass: { color: 0xffffff, roughness: 0.08, metalness: 0.1, painter: painters.glass, transparent: true, opacity: 0.35 },
  fabric: { color: 0xffffff, roughness: 0.98, metalness: 0, painter: painters.fabric },
  water: { color: 0xffffff, roughness: 0.08, metalness: 0.1, painter: painters.water, transparent: true, opacity: 0.72 },
  emissiveWarm: { color: 0x201a10, roughness: 0.4, metalness: 0, emissive: 0xffe6b0, emissiveIntensity: 2.4 },
  emissiveCold: { color: 0x101418, roughness: 0.4, metalness: 0, emissive: 0xcfe8ff, emissiveIntensity: 2.1 },
  emissiveGreen: { color: 0x0c1410, roughness: 0.5, metalness: 0, emissive: 0x9dffb8, emissiveIntensity: 1.6 },
  emissiveRed: { color: 0x140c0c, roughness: 0.5, metalness: 0, emissive: 0xff8a7a, emissiveIntensity: 1.5 },
};

export class MaterialLibrary {
  private materials = new Map<MatKey, THREE.MeshStandardMaterial>();
  private textures = new Map<MatKey, THREE.Texture>();
  private anisotropy = 4;

  get(key: MatKey): THREE.MeshStandardMaterial {
    const cached = this.materials.get(key);
    if (cached) return cached;
    const spec = SPECS[key];
    const mat = new THREE.MeshStandardMaterial({
      color: spec.color,
      roughness: spec.roughness,
      metalness: spec.metalness,
      transparent: spec.transparent ?? false,
      opacity: spec.opacity ?? 1,
      side: THREE.FrontSide,
    });
    if (spec.emissive !== undefined) {
      mat.emissive = new THREE.Color(spec.emissive);
      mat.emissiveIntensity = spec.emissiveIntensity ?? 1;
    }
    if (spec.painter) {
      const tex = this.paint(key, spec.painter);
      mat.map = tex;
      if (spec.bumpScale) {
        mat.bumpMap = tex;
        mat.bumpScale = spec.bumpScale;
      }
    }
    mat.vertexColors = true;
    this.materials.set(key, mat);
    return mat;
  }

  /** Texture of a material (used to animate water and other scrolling surfaces). */
  texture(key: MatKey): THREE.Texture | undefined {
    this.get(key);
    return this.textures.get(key);
  }

  setAnisotropy(value: number): void {
    this.anisotropy = value;
    for (const tex of this.textures.values()) {
      tex.anisotropy = value;
      tex.needsUpdate = true;
    }
  }

  private paint(key: MatKey, painter: Painter): THREE.Texture {
    const size = TEXTURE_SIZE;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    let tex: THREE.Texture;
    if (!ctx) {
      // very old / restricted browsers: fall back to a flat colour texture
      const data = new Uint8Array([128, 128, 128, 255]);
      tex = new THREE.DataTexture(data, 1, 1, THREE.RGBAFormat);
    } else {
      const seed = hashKey(key);
      painter(ctx, size, seed);
      tex = new THREE.CanvasTexture(canvas);
    }
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = this.anisotropy;
    tex.needsUpdate = true;
    this.textures.set(key, tex);
    return tex;
  }

  dispose(): void {
    for (const tex of this.textures.values()) tex.dispose();
    for (const mat of this.materials.values()) mat.dispose();
    this.textures.clear();
    this.materials.clear();
  }
}

function hashKey(key: string): number {
  let h = 2166136261;
  for (let i = 0; i < key.length; i++) {
    h ^= key.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
