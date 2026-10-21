import * as THREE from 'three';
import { SceneManager, type QualityLevel } from './render/scene';
import { MaterialLibrary } from './render/materials';
import { PropGeometryCache } from './render/chunkMesh';
import { PhysicsWorld } from './physics/world';
import { CharacterController } from './physics/character';
import { ChunkManager, type RuntimeInteractable } from './world/chunkManager';
import { generateChunk, worldTypeForSeed } from './world/generate';
import { profileFor } from './world/profiles';
import type { WorldType } from './world/types';
import { InputManager } from './player/input';
import { UI } from './ui/ui';
import { AudioEngine } from './audio/audio';
import { deriveSeed, normalizeSeed } from './core/rng';
import { clamp } from './core/mathx';

type GameState = 'menu' | 'playing' | 'paused' | 'transition';

const FIXED_DT = 1 / 60;
const MAX_STEPS = 4;

export interface GameOptions {
  canvas: HTMLCanvasElement;
  uiRoot: HTMLElement;
}

export class Game {
  private readonly sceneManager: SceneManager;
  private readonly materials = new MaterialLibrary();
  private readonly propCache = new PropGeometryCache();
  private readonly physics = new PhysicsWorld();
  private readonly chunks: ChunkManager;
  private readonly character = new CharacterController();
  private readonly input: InputManager;
  private readonly ui: UI;
  private readonly audio = new AudioEngine();

  private state: GameState = 'menu';
  private worldType: WorldType = 'backrooms';
  private seed = 'liminal';
  private worldIndex = 0;
  private required = 3;
  private artifacts = 0;
  private accumulator = 0;
  private lastTime = 0;
  private frameCount = 0;
  private fps = 60;
  private fpsTimer = 0;
  private footstepDistance = 0;
  private exitPortal: THREE.Group | null = null;
  private exitPosition: THREE.Vector3 | null = null;
  private time = 0;
  private cameraShake = 0;
  private readonly cameraPos = new THREE.Vector3();

  constructor(opts: GameOptions) {
    this.sceneManager = new SceneManager({
      canvas: opts.canvas,
      quality: 'medium',
      pixelation: 1,
    });
    this.chunks = new ChunkManager({
      scene: this.sceneManager.scene,
      physics: this.physics,
      materials: this.materials,
      propCache: this.propCache,
    });
    this.input = new InputManager(opts.canvas, opts.uiRoot);
    this.ui = new UI(opts.uiRoot, {
      onStart: (seed, type, quality, pixelation) => {
        void this.startWorld(seed, type, quality, pixelation);
      },
      onResume: () => this.resume(),
      onRestart: (seed, type) => {
        void this.startWorld(seed, type, this.sceneManager.quality, this.sceneManager.pixelation);
      },
    });

    window.addEventListener('resize', () => this.resize());
    this.resize();
    this.ui.showMenu();
    this.input.setVisible(false);
    this.input.setSuspended(true);
    requestAnimationFrame(this.loop);
  }

  // ------------------------------------------------------------------ setup
  private resize(): void {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.sceneManager.setSize(w, h);
  }

  private async startWorld(
    rawSeed: string,
    type: WorldType | 'random',
    quality: QualityLevel,
    pixelation: number,
    worldIndex = 0,
  ): Promise<void> {
    this.state = 'transition';
    this.input.setSuspended(true);
    await this.ui.fadeOut(0.35);

    this.seed = normalizeSeed(rawSeed);
    this.worldType = type === 'random' ? worldTypeForSeed(this.seed) : type;
    this.worldIndex = worldIndex;
    this.ui.setSeed(this.seed);
    this.ui.setType(type);
    this.writeSeedToUrl(this.seed);

    this.sceneManager.setQuality(quality);
    this.sceneManager.setPixelation(pixelation);
    this.physics.clear();
    this.chunks.setWorld(this.worldType, this.seed);
    this.physics.gravity = profileFor(this.worldType).gravity;
    this.sceneManager.applyProfile(profileFor(this.worldType));

    // spawn the player on the first chunk of the world
    const spawn = this.findSpawn();
    this.character.teleport(spawn.x, spawn.y + 0.2, spawn.z);
    this.character.yaw = 0;
    this.character.pitch = 0;

    this.artifacts = 0;
    this.required = profileFor(this.worldType).requiredArtifacts;
    this.clearExit();

    // load the surroundings synchronously so the player always has a floor
    this.chunks.loadAround(spawn.x, spawn.z);

    this.ui.hideMenu();
    this.input.setVisible(true);
    this.input.setSuspended(false);
    await this.audio.resume();
    this.audio.setAmbience(profileFor(this.worldType).ambience);

    this.state = 'playing';
    await this.ui.fadeIn(0.6);
    this.ui.toast(`${profileFor(this.worldType).name} · ${this.seed}`, 3);
  }

  /** Keeps the current seed in the URL so worlds can be shared. */
  private writeSeedToUrl(seed: string): void {
    if (typeof window === 'undefined' || !window.history?.replaceState) return;
    try {
      const params = new URLSearchParams();
      params.set('seed', seed);
      window.history.replaceState(null, '', `#${params.toString()}`);
    } catch {
      /* the url cannot be written, the game still works */
    }
  }

  /** Finds a safe spawn point (the middle of the world origin chunk). */
  private findSpawn(): { x: number; y: number; z: number } {
    const chunk = generateChunk(this.worldType, this.seed, 0, 0);
    if (chunk.spawns.length > 0) {
      // pick the spawn closest to the origin
      let best = chunk.spawns[0];
      let bestDist = Infinity;
      for (const s of chunk.spawns) {
        const d = s.x * s.x + s.z * s.z;
        if (d < bestDist) {
          bestDist = d;
          best = s;
        }
      }
      return best;
    }
    return { x: 0, y: 0.2, z: 0 };
  }

  private resume(): void {
    this.ui.hidePause();
    this.input.setSuspended(false);
    this.state = 'playing';
  }

  // ------------------------------------------------------------------- loop
  private loop = (time: number): void => {
    requestAnimationFrame(this.loop);
    if (this.lastTime === 0) this.lastTime = time;
    let dt = (time - this.lastTime) / 1000;
    this.lastTime = time;
    if (!Number.isFinite(dt)) dt = 0;
    dt = clamp(dt, 0, 0.1);

    this.frameCount++;
    this.fpsTimer += dt;
    if (this.fpsTimer >= 0.5) {
      this.fps = Math.round(this.frameCount / this.fpsTimer);
      this.frameCount = 0;
      this.fpsTimer = 0;
      this.adaptQuality();
    }

    this.ui.update(dt);
    if (this.state === 'playing') this.update(dt);
    this.sceneManager.render(dt);
  };

  /** Lowers the resolution automatically when the frame rate drops. */
  private adaptQuality(): void {
    const sm = this.sceneManager;
    if (this.fps < 34 && sm.renderScale > 0.6) {
      sm.renderScale = Math.max(0.6, sm.renderScale - 0.1);
      sm.setSize(window.innerWidth, window.innerHeight);
    } else if (this.fps > 55 && sm.renderScale < 1) {
      sm.renderScale = Math.min(1, sm.renderScale + 0.05);
      sm.setSize(window.innerWidth, window.innerHeight);
    }
  }

  private update(dt: number): void {
    this.time += dt;
    const input = this.input.update();

    // look
    const look = this.input.consumeLook();
    this.character.yaw += look.yaw;
    this.character.pitch = clamp(this.character.pitch + look.pitch, -1.45, 1.45);

    // fixed step physics
    this.accumulator += dt;
    let steps = 0;
    while (this.accumulator >= FIXED_DT && steps < MAX_STEPS) {
      this.accumulator -= FIXED_DT;
      steps++;
      const jump = this.input.consumeJump();
      this.character.update(
        FIXED_DT,
        {
          moveX: input.moveX,
          moveZ: input.moveZ,
          jump,
          sprint: input.sprint,
          crouch: input.crouch,
        },
        this.physics,
      );
      this.physics.step(FIXED_DT);
    }

    // footsteps
    const travelled = this.character.distanceTravelled - this.footstepDistance;
    if (travelled >= 0.85 && this.character.grounded) {
      this.footstepDistance = this.character.distanceTravelled;
      this.audio.footstep(this.surfaceUnderfoot());
    }

    // camera
    this.updateCamera(dt);

    // streaming
    this.chunks.update(this.character.pos.x, this.character.pos.z, dt);

    // lights
    this.sceneManager.updatePointLights(this.chunks.lightCandidates, this.cameraPos);
    this.sceneManager.updateSun(this.cameraPos);

    // interactions
    this.handleInteractions();
    this.updateObjective();
    this.updateHud();
  }

  private updateCamera(dt: number): void {
    const bob = this.character.grounded ? Math.min(1, Math.hypot(this.character.vel.x, this.character.vel.z) / 4) : 0;
    const bobAmount = bob * 0.035;
    const bobPhase = this.character.distanceTravelled * 7.5;
    this.cameraPos.set(
      this.character.pos.x,
      this.character.pos.y + this.character.eyeHeight + Math.sin(bobPhase) * bobAmount,
      this.character.pos.z,
    );
    if (this.cameraShake > 0) {
      this.cameraShake = Math.max(0, this.cameraShake - dt * 2.4);
      const s = this.cameraShake * 0.05;
      this.cameraPos.x += (Math.random() - 0.5) * s;
      this.cameraPos.y += (Math.random() - 0.5) * s;
    }
    this.sceneManager.camera.position.copy(this.cameraPos);
    this.sceneManager.camera.rotation.set(this.character.pitch, this.character.yaw, 0, 'YXZ');
    // subtle roll while strafing
    const lateral = this.character.vel.x * Math.cos(this.character.yaw) - this.character.vel.z * Math.sin(this.character.yaw);
    this.sceneManager.camera.rotation.z += clamp(-lateral * 0.012, -0.05, 0.05);
  }

  private handleInteractions(): void {
    const px = this.character.pos.x;
    const py = this.character.pos.y + this.character.eyeHeight;
    const pz = this.character.pos.z;
    const candidates = this.chunks.nearby(px, py, pz, 3.2);

    // auto collect artifacts
    for (const it of candidates) {
      if (it.kind === 'artifact' && !it.collected) {
        const d = Math.hypot(it.x - px, it.z - pz);
        if (d < 1.25 && Math.abs(it.y - py) < 2.2) {
          this.chunks.collect(it);
          this.artifacts++;
          this.audio.blip('pickup');
          this.ui.toast(`found one · ${this.artifacts} / ${this.required}`);
        }
      }
    }

    // closest interactable in front of the player
    const fx = Math.sin(this.character.yaw);
    const fz = Math.cos(this.character.yaw);
    let best: RuntimeInteractable | null = null;
    let bestScore = -Infinity;
    for (const it of candidates) {
      if (it.kind !== 'door') continue;
      const dx = it.x - px;
      const dz = it.z - pz;
      const dist = Math.hypot(dx, dz);
      if (dist > 2.6) continue;
      const dot = dist > 0.01 ? (dx / dist) * fx + (dz / dist) * fz : 1;
      if (dot < 0.2) continue;
      const score = dot - dist * 0.12;
      if (score > bestScore) {
        bestScore = score;
        best = it;
      }
    }

    if (best) {
      this.ui.setPrompt(best.open ? 'close door' : 'open door');
      if (this.input.consumeInteract()) {
        this.chunks.toggleDoor(best);
        this.audio.blip('door');
      }
    } else {
      this.ui.setPrompt(null);
      this.input.consumeInteract();
    }
  }

  private updateObjective(): void {
    if (this.artifacts >= this.required && !this.exitPortal) {
      this.spawnExit();
    }
    if (this.exitPosition) {
      const dx = this.exitPosition.x - this.character.pos.x;
      const dz = this.exitPosition.z - this.character.pos.z;
      if (dx * dx + dz * dz < 1.6) {
        void this.enterNextWorld();
      }
    }
  }

  private spawnExit(): void {
    const spawn = this.findSpawn();
    const group = new THREE.Group();
    group.position.set(spawn.x, spawn.y, spawn.z);

    const frame = new THREE.Mesh(
      new THREE.BoxGeometry(1.7, 2.6, 0.12),
      new THREE.MeshStandardMaterial({
        color: 0x101018,
        emissive: new THREE.Color(profileFor(this.worldType).artifactColor),
        emissiveIntensity: 0.55,
        roughness: 0.4,
      }),
    );
    frame.position.y = 1.3;
    group.add(frame);

    const light = new THREE.PointLight(profileFor(this.worldType).artifactColor, 3.2, 14, 2);
    light.position.y = 1.4;
    group.add(light);

    this.sceneManager.scene.add(group);
    this.exitPortal = group;
    this.exitPosition = new THREE.Vector3(spawn.x, spawn.y, spawn.z);
    this.ui.toast('the way out is open — follow the light');
  }

  private clearExit(): void {
    if (this.exitPortal) {
      this.sceneManager.scene.remove(this.exitPortal);
      this.exitPortal.traverse((obj) => {
        if (obj instanceof THREE.Mesh) obj.geometry.dispose();
      });
      this.exitPortal = null;
    }
    this.exitPosition = null;
  }

  private updateHud(): void {
    const profile = profileFor(this.worldType);
    const target = this.chunks.nearestArtifact(this.character.pos.x, this.character.pos.z);
    let angle: number | null = null;
    if (target) {
      const dx = target.x - this.character.pos.x;
      const dz = target.z - this.character.pos.z;
      const worldAngle = Math.atan2(dx, dz);
      angle = worldAngle - this.character.yaw;
    } else if (this.exitPosition) {
      const dx = this.exitPosition.x - this.character.pos.x;
      const dz = this.exitPosition.z - this.character.pos.z;
      angle = Math.atan2(dx, dz) - this.character.yaw;
    }
    this.ui.setCompass(angle);
    this.ui.setHud({
      worldName: `${profile.name}`,
      subtitle: profile.subtitle,
      seed: this.seed,
      objective: profile.objective,
      artifacts: this.artifacts,
      required: this.required,
      fps: this.fps,
      depth: this.worldIndex + 1,
    });
  }

  private surfaceUnderfoot(): 'carpet' | 'tile' | 'grass' | 'dirt' | 'concrete' {
    switch (this.worldType) {
      case 'glade':
      case 'forest':
        return 'grass';
      case 'pool':
      case 'mall':
        return 'tile';
      case 'parking':
        return 'concrete';
      default:
        return 'carpet';
    }
  }

  /** Advances to the next world (used by the exit portal). */
  async enterNextWorld(): Promise<void> {
    if (this.state !== 'playing') return;
    this.state = 'transition';
    this.audio.blip('portal');
    await this.ui.fadeOut(0.6);
    const nextIndex = this.worldIndex + 1;
    const nextSeed = deriveSeed(this.seed, nextIndex);
    await this.startWorld(
      nextSeed,
      this.worldType,
      this.sceneManager.quality,
      this.sceneManager.pixelation,
      nextIndex,
    );
  }

  /** Exposed for tests: the current player position. */
  get playerPosition(): { x: number; y: number; z: number } {
    return { x: this.character.pos.x, y: this.character.pos.y, z: this.character.pos.z };
  }

  /** Exposed for tests: the world the player is currently in. */
  get currentWorld(): { type: WorldType; seed: string; index: number } {
    return { type: this.worldType, seed: this.seed, index: this.worldIndex };
  }

  /** Exposed for tests: how many chunks are loaded right now. */
  get loadedChunks(): number {
    return this.chunks.chunks.size;
  }

  /** Exposed for tests: how many objective items were collected. */
  get collectedArtifacts(): number {
    return this.artifacts;
  }
}
