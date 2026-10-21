import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import type { WorldProfile } from '../world/types';

export type QualityLevel = 'low' | 'medium' | 'high';

export interface PointLightCandidate {
  x: number;
  y: number;
  z: number;
  color: number;
  intensity: number;
  distance: number;
}

/** Dream core post processing: pixelation, vignette, grain, chromatic edges. */
const DreamShader = {
  uniforms: {
    tDiffuse: { value: null as THREE.Texture | null },
    uResolution: { value: new THREE.Vector2(1, 1) },
    uPixelSize: { value: 1 },
    uVignette: { value: 0.85 },
    uGrain: { value: 0.045 },
    uAberration: { value: 0.0016 },
    uTime: { value: 0 },
    uSaturation: { value: 0.94 },
    uTint: { value: new THREE.Color(0xf6f0e2) },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform vec2 uResolution;
    uniform float uPixelSize;
    uniform float uVignette;
    uniform float uGrain;
    uniform float uAberration;
    uniform float uTime;
    uniform float uSaturation;
    uniform vec3 uTint;
    varying vec2 vUv;

    float hash(vec2 p) {
      return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
    }

    void main() {
      vec2 res = max(uResolution, vec2(1.0));
      vec2 cell = floor(res / max(uPixelSize, 1.0));
      vec2 uv = (floor(vUv * cell) + 0.5) / cell;

      vec2 dir = uv - 0.5;
      float dist = length(dir);

      vec2 offset = dir * uAberration * (0.35 + dist);
      float r = texture2D(tDiffuse, uv + offset).r;
      vec4 g = texture2D(tDiffuse, uv);
      float b = texture2D(tDiffuse, uv - offset).b;
      vec3 color = vec3(r, g.g, b);

      // gentle dream grade
      float luma = dot(color, vec3(0.2126, 0.7152, 0.0722));
      color = mix(vec3(luma), color, uSaturation);
      color *= uTint;

      // vignette
      float vig = smoothstep(0.92, 0.28, dist * uVignette);
      color *= mix(0.55, 1.0, vig);

      // film grain
      float n = hash(uv * res + fract(uTime) * 91.7) - 0.5;
      color += n * uGrain;

      gl_FragColor = vec4(color, g.a);
    }
  `,
};

export interface SceneManagerOptions {
  canvas: HTMLCanvasElement;
  quality: QualityLevel;
  pixelation: number;
}

const QUALITY_PRESETS: Record<QualityLevel, { pixelRatio: number; shadows: boolean; shadowSize: number; pointLights: number; post: boolean }> = {
  low: { pixelRatio: 0.75, shadows: false, shadowSize: 512, pointLights: 3, post: false },
  medium: { pixelRatio: 1, shadows: true, shadowSize: 1024, pointLights: 5, post: true },
  high: { pixelRatio: 1.5, shadows: true, shadowSize: 2048, pointLights: 8, post: true },
};

export class SceneManager {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;
  readonly composer: EffectComposer;
  readonly dreamPass: ShaderPass;

  readonly hemisphere: THREE.HemisphereLight;
  readonly sun: THREE.DirectionalLight;

  quality: QualityLevel;
  pixelation: number;
  /** dynamic resolution scale, lowered automatically on slow devices */
  renderScale = 1;

  private pointLightPool: THREE.PointLight[] = [];
  private sunTarget = new THREE.Object3D();
  private width = 1;
  private height = 1;
  private elapsed = 0;

  constructor(opts: SceneManagerOptions) {
    this.quality = opts.quality;
    this.pixelation = opts.pixelation;

    this.renderer = new THREE.WebGLRenderer({
      canvas: opts.canvas,
      antialias: false,
      powerPreference: 'high-performance',
      alpha: false,
      stencil: false,
    });
    this.renderer.setClearColor(0x000000, 1);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.shadowMap.enabled = QUALITY_PRESETS[opts.quality].shadows;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;

    this.camera = new THREE.PerspectiveCamera(72, 1, 0.05, 220);
    this.camera.position.set(0, 1.6, 0);

    this.hemisphere = new THREE.HemisphereLight(0xbfdcff, 0x4a5a3a, 0.8);
    this.scene.add(this.hemisphere);

    this.sun = new THREE.DirectionalLight(0xfff2d8, 1.1);
    this.sun.castShadow = QUALITY_PRESETS[opts.quality].shadows;
    this.sun.shadow.mapSize.set(
      QUALITY_PRESETS[opts.quality].shadowSize,
      QUALITY_PRESETS[opts.quality].shadowSize,
    );
    this.sun.shadow.camera.near = 0.5;
    this.sun.shadow.camera.far = 120;
    this.sun.shadow.camera.left = -40;
    this.sun.shadow.camera.right = 40;
    this.sun.shadow.camera.top = 40;
    this.sun.shadow.camera.bottom = -40;
    this.sun.shadow.bias = -0.0008;
    this.sun.target = this.sunTarget;
    this.scene.add(this.sun);
    this.scene.add(this.sunTarget);

    for (let i = 0; i < QUALITY_PRESETS.high.pointLights; i++) {
      const light = new THREE.PointLight(0xffffff, 0, 10, 2);
      light.visible = false;
      this.scene.add(light);
      this.pointLightPool.push(light);
    }

    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.dreamPass = new ShaderPass(DreamShader);
    this.composer.addPass(this.dreamPass);
    this.composer.addPass(new OutputPass());

    this.applyQuality();
  }

  get pointLightCount(): number {
    return QUALITY_PRESETS[this.quality].pointLights;
  }

  setQuality(quality: QualityLevel): void {
    this.quality = quality;
    this.applyQuality();
  }

  setPixelation(value: number): void {
    this.pixelation = value;
    this.dreamPass.uniforms.uPixelSize.value = value;
  }

  private applyQuality(): void {
    const preset = QUALITY_PRESETS[this.quality];
    this.renderer.shadowMap.enabled = preset.shadows;
    this.sun.castShadow = preset.shadows;
    this.sun.shadow.mapSize.set(preset.shadowSize, preset.shadowSize);
    if (this.sun.shadow.map) {
      this.sun.shadow.map.dispose();
      this.sun.shadow.map = null;
    }
    for (let i = 0; i < this.pointLightPool.length; i++) {
      this.pointLightPool[i].visible = i < preset.pointLights;
    }
    this.resize();
  }

  /** Applies the profile of the current world (fog, sky, ambient light). */
  applyProfile(profile: WorldProfile): void {
    this.scene.background = new THREE.Color(profile.sky);
    this.scene.fog = new THREE.FogExp2(profile.fogColor, profile.fogDensity);
    this.hemisphere.color.setHex(profile.ambientSky);
    this.hemisphere.groundColor.setHex(profile.ambientGround);
    this.hemisphere.intensity = profile.ambientIntensity;

    const outdoor = profile.type === 'glade' || profile.type === 'forest';
    this.sun.visible = outdoor;
    this.sun.intensity = outdoor ? 1.5 : 0.25;
    this.sun.color.setHex(outdoor ? 0xfff4de : 0xd8e4ff);
  }

  /** Keeps the shadow frustum around the player. */
  updateSun(focus: THREE.Vector3): void {
    if (!this.sun.visible) return;
    this.sunTarget.position.copy(focus);
    this.sun.position.set(focus.x + 26, focus.y + 42, focus.z + 18);
    this.sun.target.updateMatrixWorld();
  }

  /**
   * Assigns the fixed point light pool to the closest emitters.
   * Using a fixed pool avoids shader recompilations when lights come and go.
   */
  updatePointLights(candidates: PointLightCandidate[], focus: THREE.Vector3): void {
    const count = this.pointLightCount;
    if (count <= 0) {
      for (const light of this.pointLightPool) light.visible = false;
      return;
    }
    const sorted = candidates
      .map((c) => ({
        c,
        d: (c.x - focus.x) ** 2 + (c.y - focus.y) ** 2 + (c.z - focus.z) ** 2,
      }))
      .sort((a, b) => a.d - b.d)
      .slice(0, count);

    for (let i = 0; i < this.pointLightPool.length; i++) {
      const light = this.pointLightPool[i];
      if (i < sorted.length) {
        const c = sorted[i].c;
        light.visible = true;
        light.position.set(c.x, c.y, c.z);
        light.color.setHex(c.color);
        light.intensity = c.intensity;
        light.distance = c.distance;
      } else {
        light.visible = false;
        light.intensity = 0;
      }
    }
  }

  setSize(width: number, height: number): void {
    this.width = Math.max(1, width);
    this.height = Math.max(1, height);
    this.camera.aspect = this.width / this.height;
    this.camera.updateProjectionMatrix();
    this.resize();
  }

  private resize(): void {
    const preset = QUALITY_PRESETS[this.quality];
    const dpr = Math.min(window.devicePixelRatio || 1, preset.pixelRatio);
    const w = Math.max(1, Math.floor(this.width * dpr * this.renderScale));
    const h = Math.max(1, Math.floor(this.height * dpr * this.renderScale));
    this.renderer.setPixelRatio(1);
    this.renderer.setSize(w, h, false);
    this.composer.setSize(w, h);
    this.dreamPass.uniforms.uResolution.value.set(w, h);
    this.dreamPass.uniforms.uPixelSize.value = this.pixelation;
    const canvas = this.renderer.domElement;
    canvas.style.width = '100%';
    canvas.style.height = '100%';
  }

  render(dt: number): void {
    this.elapsed += dt;
    this.dreamPass.uniforms.uTime.value = this.elapsed;
    if (QUALITY_PRESETS[this.quality].post) {
      this.composer.render();
    } else {
      this.renderer.render(this.scene, this.camera);
    }
  }

  dispose(): void {
    this.composer.dispose();
    this.renderer.dispose();
  }
}
