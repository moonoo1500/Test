/**
 * Deterministic Seeded PRNG & Procedural Noise Module
 * Supports arbitrary string/number seeds, mulberry32 generator, and 2D smooth coherent noise.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.LiminalPRNG = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /**
   * Normalize any user seed input into a clean canonical seed string.
   */
  function normalizeSeedString(input) {
    if (input === null || input === undefined) {
      return 'LIMINAL-1997';
    }
    const str = String(input).trim();
    if (!str) return 'LIMINAL-1997';
    return str.slice(0, 48).toUpperCase();
  }

  /**
   * xmur3 string hash -> produces 32-bit unsigned seed state generator
   */
  function xmur3(str) {
    let h = 1779033703 ^ str.length;
    for (let i = 0; i < str.length; i++) {
      h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
      h = (h << 13) | (h >>> 19);
    }
    return function () {
      h = Math.imul(h ^ (h >>> 16), 2246822507);
      h = Math.imul(h ^ (h >>> 13), 3266489909);
      return (h ^= h >>> 16) >>> 0;
    };
  }

  /**
   * mulberry32 fast high-quality 32-bit PRNG
   */
  function mulberry32(a) {
    let state = a >>> 0;
    return function () {
      let t = (state += 0x6d2b79f5);
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  class SeededRandom {
    constructor(seedInput) {
      this.seedString = normalizeSeedString(seedInput);
      const hashFn = xmur3(this.seedString);
      this.numericSeed = hashFn();
      this.secondarySeed = hashFn();
      this._rng = mulberry32(this.numericSeed);
      this._perm = new Uint8Array(512);
      this._initNoisePermutation();
    }

    _initNoisePermutation() {
      const noiseRng = mulberry32(this.secondarySeed);
      const p = new Uint8Array(256);
      for (let i = 0; i < 256; i++) p[i] = i;
      for (let i = 255; i > 0; i--) {
        const j = Math.floor(noiseRng() * (i + 1));
        const tmp = p[i];
        p[i] = p[j];
        p[j] = tmp;
      }
      for (let i = 0; i < 512; i++) {
        this._perm[i] = p[i & 255];
      }
    }

    /**
     * Float in [0, 1)
     */
    next() {
      return this._rng();
    }

    /**
     * Float in [min, max)
     */
    range(min, max) {
      return min + this.next() * (max - min);
    }

    /**
     * Integer in [min, max] inclusive
     */
    int(min, max) {
      const lo = Math.ceil(Math.min(min, max));
      const hi = Math.floor(Math.max(min, max));
      return Math.floor(this.next() * (hi - lo + 1)) + lo;
    }

    /**
     * Boolean with probability p (0..1)
     */
    chance(p = 0.5) {
      return this.next() < p;
    }

    /**
     * Pick random item from non-empty array
     */
    pick(arr) {
      if (!Array.isArray(arr) || arr.length === 0) return null;
      return arr[Math.floor(this.next() * arr.length)];
    }

    /**
     * Fork a child deterministic PRNG with a salt tag
     */
    fork(tag) {
      return new SeededRandom(`${this.seedString}::${tag}`);
    }

    /**
     * Deterministic 2D hash in [0, 1) for integer grid coordinates
     */
    gridHash(ix, iz) {
      const x = ix & 255;
      const z = iz & 255;
      const h = this._perm[(this._perm[x] + z) & 255];
      return h / 255;
    }

    /**
     * Smooth 2D Value Noise in [-1, 1]
     */
    noise2D(x, z) {
      const xi = Math.floor(x);
      const zi = Math.floor(z);
      const xf = x - xi;
      const zf = z - zi;

      const u = xf * xf * xf * (xf * (xf * 6 - 15) + 10);
      const v = zf * zf * zf * (zf * (zf * 6 - 15) + 10);

      const aa = this.gridHash(xi, zi);
      const ab = this.gridHash(xi, zi + 1);
      const ba = this.gridHash(xi + 1, zi);
      const bb = this.gridHash(xi + 1, zi + 1);

      const x1 = aa + u * (ba - aa);
      const x2 = ab + u * (bb - ab);
      const val = x1 + v * (x2 - x1);
      return val * 2 - 1;
    }

    /**
     * Fractal Brownian Motion (fBm) 2D noise in [-1, 1]
     */
    fbm2D(x, z, octaves = 3, persistence = 0.5, lacunarity = 2.0) {
      let total = 0;
      let frequency = 1;
      let amplitude = 1;
      let maxValue = 0;
      for (let i = 0; i < octaves; i++) {
        total += this.noise2D(x * frequency, z * frequency) * amplitude;
        maxValue += amplitude;
        amplitude *= persistence;
        frequency *= lacunarity;
      }
      return maxValue > 0 ? total / maxValue : 0;
    }
  }

  const BIOME_TYPES = [
    {
      id: 'YELLOW_COMPLEX',
      name: 'Уровень 0: Жёлтый Комплекс',
      subtitle: 'Влажный ковролин, гул ламп и бесконечные офисные перегородки',
      category: 'building',
      skyColor: 0x1a170b,
      fogColor: 0x26210f,
      fogDensity: 0.042,
      ambientColor: 0xd8ca8a,
      ambientIntensity: 0.58,
      waterLevel: null,
      footstepSurface: 'carpet'
    },
    {
      id: 'DREAMCORE_MEADOW',
      name: 'Поляна Снов: Холмы Эдема',
      subtitle: 'Изумрудные луга, одинокие домики и глаза в пастельном небе',
      category: 'meadow',
      skyColor: 0x7ec8e3,
      fogColor: 0x9bd7e8,
      fogDensity: 0.022,
      ambientColor: 0xfff6e5,
      ambientIntensity: 0.85,
      waterLevel: null,
      footstepSurface: 'grass'
    },
    {
      id: 'POOLROOMS',
      name: 'Уровень 37: Аква-Комплекс (Poolrooms)',
      subtitle: 'Тёплая бирюзовая вода, белая плитка и солнечные колодцы',
      category: 'pool',
      skyColor: 0xd8f3f0,
      fogColor: 0xc2ebe6,
      fogDensity: 0.028,
      ambientColor: 0xe0fbf8,
      ambientIntensity: 0.82,
      waterLevel: 0.52,
      footstepSurface: 'water'
    },
    {
      id: 'DEAD_MALL',
      name: 'Атриум 1997: Пустой Молл',
      subtitle: 'Шахматный мрамор, неоновые вывески, пальмы и застывшие эскалаторы',
      category: 'mall',
      skyColor: 0x221338,
      fogColor: 0x2c1947,
      fogDensity: 0.030,
      ambientColor: 0xd6b4fc,
      ambientIntensity: 0.68,
      waterLevel: null,
      footstepSurface: 'tile'
    },
    {
      id: 'ETERNAL_SUBURBIA',
      name: 'Улица Без Конца: Ночной Пригород',
      subtitle: 'Оранжевые фонари, мокрый асфальт, звонящие таксофоны и одинаковые дома',
      category: 'suburbia',
      skyColor: 0x0b0e1c,
      fogColor: 0x161a2c,
      fogDensity: 0.036,
      ambientColor: 0xffb36b,
      ambientIntensity: 0.52,
      waterLevel: null,
      footstepSurface: 'asphalt'
    }
  ];

  function resolveBiomeForSeed(seedInput, forcedBiomeId = 'AUTO') {
    const cleanSeed = normalizeSeedString(seedInput);
    if (forcedBiomeId && forcedBiomeId !== 'AUTO') {
      const found = BIOME_TYPES.find((b) => b.id === forcedBiomeId);
      if (found) return found;
    }
    // Check if seed string contains explicit biome hints
    if (cleanSeed.includes('POOL') || cleanSeed.includes('AQUA') || cleanSeed.includes('37')) {
      return BIOME_TYPES[2];
    }
    if (cleanSeed.includes('MEADOW') || cleanSeed.includes('DREAM') || cleanSeed.includes('FIELD') || cleanSeed.includes('EYE')) {
      return BIOME_TYPES[1];
    }
    if (cleanSeed.includes('MALL') || cleanSeed.includes('1997') || cleanSeed.includes('ATRIUM')) {
      return BIOME_TYPES[3];
    }
    if (cleanSeed.includes('SUBURB') || cleanSeed.includes('STREET') || cleanSeed.includes('NIGHT')) {
      return BIOME_TYPES[4];
    }
    if (cleanSeed.includes('BACKROOM') || cleanSeed.includes('YELLOW') || cleanSeed.includes('LEVEL-0')) {
      return BIOME_TYPES[0];
    }
    const rng = new SeededRandom(cleanSeed);
    const idx = rng.int(0, BIOME_TYPES.length - 1);
    return BIOME_TYPES[idx];
  }

  function generateRandomSeedCode() {
    const prefixes = ['DREAM', 'LIMINAL', 'POOL', 'MEADOW', 'MALL', 'SUBURB', 'ECHO', 'VHS', 'NULL', 'AETHER'];
    const p = prefixes[Math.floor(Math.random() * prefixes.length)];
    const num = Math.floor(1000 + Math.random() * 9000);
    const suffix = String.fromCharCode(65 + Math.floor(Math.random() * 26)) +
                   String.fromCharCode(65 + Math.floor(Math.random() * 26));
    return `${p}-${num}-${suffix}`;
  }

  return {
    SeededRandom,
    BIOME_TYPES,
    normalizeSeedString,
    resolveBiomeForSeed,
    generateRandomSeedCode
  };
});
