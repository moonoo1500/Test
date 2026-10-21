/**
 * Main Application Controller — LIMINAL // DREAMCORE EXPLORER
 * Connects 3D Volumetric & 2D Pixel Arcade engines, Seed World Generator,
 * Physics, Interactions, Procedural Textures/Audio, Mobile Touch Controls, and 10-Step Diagnostics.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.LiminalMain = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  class LiminalExplorerApp {
    constructor() {
      this.renderMode = '3D'; // '3D' (Volumetric) or '2D' (Pixel Arcade)
      this.quality = 'MEDIUM';
      this.forcedBiome = 'AUTO';
      this.currentSeed = 'LIMINAL-1997';
      this.isRunning = false;
      this.worldsVisited = 0;

      this.textureManager = null;
      this.sound = null;
      this.world = null;
      this.physics = null;
      this.interaction = null;
      this.renderer3D = null;
      this.renderer2D = null;
      this.input = null;

      this.fpsFrames = 0;
      this.fpsLastTime = 0;
      this.currentFps = 60;
      this.lastFrameTime = 0;
      this._toastTimer = null;
    }

    init() {
      if (typeof document === 'undefined') return;

      const PRNG = window.LiminalPRNG;
      const Textures = window.LiminalTextures;
      const AudioMod = window.LiminalAudio;
      const WorldGen = window.LiminalWorldGen;
      const PhysicsMod = window.LiminalPhysics;
      const InteractionMod = window.LiminalInteraction;
      const Renderer3DMod = window.LiminalRenderer3D;
      const Renderer2DMod = window.LiminalRenderer2D;
      const InputMod = window.LiminalInput;

      this.textureManager = new Textures.TextureManager({
        retroFilter: false
      });
      this.sound = new AudioMod.SoundEngine();
      this.physics = new PhysicsMod.PhysicsEngine(null, this.sound);

      this.interaction = new InteractionMod.InteractionSystem({
        physics: this.physics,
        sound: this.sound,
        onPortalEnter: (targetSeed, targetBiomeId) => {
          this.triggerPortalTransition(targetSeed, targetBiomeId);
        },
        onMessage: (msg, kind) => {
          this.showToast(msg, kind);
        },
        onJournalUpdate: () => {
          this.updateJournalUI();
        }
      });

      const viewportContainer = document.getElementById('viewport-container');
      this.renderer3D = new Renderer3DMod.Renderer3D({
        container: viewportContainer,
        textureManager: this.textureManager,
        quality: this.quality
      });
      this.renderer2D = new Renderer2DMod.Renderer2D({
        container: viewportContainer,
        textureManager: this.textureManager
      });

      this.input = new InputMod.InputController({
        onInteract: () => {
          this.sound.init();
          this.interaction.interact();
        },
        onToggleFlashlight: () => {
          this.sound.init();
          this.physics.player.flashlightOn = !this.physics.player.flashlightOn;
          this.sound.playSFX('switch');
          this.updateHUD();
        },
        onToggleRenderMode: () => {
          this.toggleRenderMode();
        },
        onToggleCameraView: () => {
          if (this.renderMode === '3D') {
            const view = this.renderer3D.toggleCameraView();
            this.showToast(
              view === '3P' ? 'Камера: Вид от 3-го лица (Человек)' : 'Камера: Вид от 1-го лица',
              'info'
            );
            this.updateHUD();
          } else {
            this.showToast('В 2D-Аркаде активна пиксельная камера сверху', 'info');
          }
        }
      });

      this._bindUIEvents(PRNG, WorldGen);
      this.loadWorld(this.currentSeed, this.forcedBiome);
      this.setRenderMode(this.renderMode);

      window.addEventListener('resize', () => {
        if (this.renderer3D) this.renderer3D.resize();
        if (this.renderer2D) this.renderer2D.resize();
      });

      this.isRunning = true;
      this.lastFrameTime = performance.now();
      this.fpsLastTime = this.lastFrameTime;
      requestAnimationFrame((t) => this._loop(t));
    }

    _bindUIEvents(PRNG) {
      this.input.bindDOM({
        joystickZone: document.getElementById('touch-joystick-zone'),
        joystickKnob: document.getElementById('touch-joystick-knob'),
        lookZone: document.getElementById('touch-look-zone')
      });

      // Menu controls
      const seedInput = document.getElementById('seed-input');
      const biomeSelect = document.getElementById('biome-select');
      const qualitySelect = document.getElementById('quality-select');

      const btnRandomSeed = document.getElementById('btn-random-seed');
      if (btnRandomSeed) {
        btnRandomSeed.addEventListener('click', () => {
          const newSeed = PRNG.generateRandomSeedCode();
          if (seedInput) seedInput.value = newSeed;
        });
      }

      // Mode selector cards in launcher
      document.querySelectorAll('[data-select-mode]').forEach((btn) => {
        btn.addEventListener('click', () => {
          const m = btn.getAttribute('data-select-mode');
          document.querySelectorAll('[data-select-mode]').forEach((b) => b.classList.remove('active'));
          btn.classList.add('active');
          this.setRenderMode(m);
        });
      });

      // Preset biome chips
      document.querySelectorAll('[data-preset-seed]').forEach((chip) => {
        chip.addEventListener('click', () => {
          const presetSeed = chip.getAttribute('data-preset-seed');
          const presetBiome = chip.getAttribute('data-preset-biome') || 'AUTO';
          if (seedInput) seedInput.value = presetSeed;
          if (biomeSelect) biomeSelect.value = presetBiome;
        });
      });

      // Start Exploring button
      const btnStart = document.getElementById('btn-start-world');
      if (btnStart) {
        btnStart.addEventListener('click', () => {
          this.sound.init();
          const chosenSeed = seedInput ? seedInput.value : this.currentSeed;
          const chosenBiome = biomeSelect ? biomeSelect.value : 'AUTO';
          const chosenQuality = qualitySelect ? qualitySelect.value : 'MEDIUM';
          this.quality = chosenQuality;
          if (this.renderer3D) this.renderer3D.applyQuality(chosenQuality);

          this.loadWorld(chosenSeed, chosenBiome);
          this.hideLauncherModal();
        });
      }

      // HUD Top-bar buttons
      const bindClick = (id, fn) => {
        const el = document.getElementById(id);
        if (el) {
          el.addEventListener('click', (e) => {
            e.stopPropagation();
            this.sound.init();
            fn();
          });
        }
      };

      bindClick('btn-hud-mode', () => this.toggleRenderMode());
      bindClick('btn-hud-cam', () => {
        if (this.renderMode !== '3D') {
          this.setRenderMode('3D');
        }
        const v = this.renderer3D.toggleCameraView();
        this.showToast(v === '3P' ? '3D Вид от 3-го лица' : '3D Вид от 1-го лица', 'info');
        this.updateHUD();
      });
      bindClick('btn-hud-seed', () => this.showLauncherModal());
      bindClick('btn-hud-journal', () => this.toggleModal('journal-modal', true));
      bindClick('btn-hud-bugcheck', () => this.openAndRunBugCheckModal());
      bindClick('btn-hud-audio', () => {
        const muted = this.sound.toggleMute();
        const el = document.getElementById('btn-hud-audio');
        if (el) el.textContent = muted ? '🔇 Звук' : '🔊 Звук';
      });

      // Close modal buttons
      bindClick('btn-close-journal', () => this.toggleModal('journal-modal', false));
      bindClick('btn-close-bugcheck', () => this.toggleModal('bugcheck-modal', false));
      bindClick('btn-rerun-bugcheck', () => this.openAndRunBugCheckModal());

      // Mobile Action Pad Buttons (support both touchstart for instant response and click)
      const bindMobileAction = (id, fn) => {
        const el = document.getElementById(id);
        if (!el) return;
        const handler = (e) => {
          e.preventDefault();
          e.stopPropagation();
          this.sound.init();
          fn(el);
        };
        el.addEventListener('touchstart', handler, { passive: false });
        el.addEventListener('click', handler);
      };

      bindMobileAction('mob-btn-jump', () => this.input.triggerJump());
      bindMobileAction('mob-btn-interact', () => this.interaction.interact());
      bindMobileAction('mob-btn-flashlight', () => {
        this.physics.player.flashlightOn = !this.physics.player.flashlightOn;
        this.sound.playSFX('switch');
        this.updateHUD();
      });
      bindMobileAction('mob-btn-sprint', (el) => {
        const active = this.input.toggleSprintButton();
        el.classList.toggle('active-toggle', active);
      });
      bindMobileAction('mob-btn-crouch', (el) => {
        const active = this.input.toggleCrouchButton();
        el.classList.toggle('active-toggle', active);
      });
      bindMobileAction('mob-btn-random-warp', () => {
        const nextSeed = window.LiminalPRNG.generateRandomSeedCode();
        this.triggerPortalTransition(nextSeed, 'AUTO');
      });
    }

    loadWorld(seedInput, forcedBiomeId = 'AUTO') {
      const WorldGen = window.LiminalWorldGen;
      this.world = WorldGen.WorldGenerator.generate(seedInput, forcedBiomeId);
      this.currentSeed = this.world.seed;
      this.forcedBiome = forcedBiomeId;
      this.worldsVisited++;

      this.physics.bindWorld(this.world);
      this.interaction.bindWorld(this.world, this.physics);
      if (this.renderer3D) this.renderer3D.buildWorld(this.world);
      if (this.renderer2D) this.renderer2D.buildWorld(this.world);
      if (this.sound && this.sound.initialized) {
        this.sound.setBiomeAmbient(this.world.biome.id);
      }

      const seedInputEl = document.getElementById('seed-input');
      if (seedInputEl) seedInputEl.value = this.currentSeed;

      this.updateHUD();
      this.showToast(`Сид [${this.world.seed}] — ${this.world.biome.name}`, 'portal');
    }

    triggerPortalTransition(targetSeed, targetBiomeId = 'AUTO') {
      const flash = document.getElementById('vhs-transition-overlay');
      if (flash) {
        flash.classList.add('active');
        setTimeout(() => flash.classList.remove('active'), 550);
      }
      this.loadWorld(targetSeed, targetBiomeId);
    }

    setRenderMode(mode) {
      this.renderMode = mode === '2D' ? '2D' : '3D';
      const c3d = document.querySelector('.canvas-3d');
      const c2d = document.querySelector('.canvas-2d');
      if (c3d) c3d.style.display = this.renderMode === '3D' ? 'block' : 'none';
      if (c2d) c2d.style.display = this.renderMode === '2D' ? 'block' : 'none';
      if (this.renderer3D) this.renderer3D.resize();
      if (this.renderer2D) this.renderer2D.resize();
      this.updateHUD();
    }

    toggleRenderMode() {
      const next = this.renderMode === '3D' ? '2D' : '3D';
      this.setRenderMode(next);
      this.showToast(
        next === '3D'
          ? 'Режим: ОБЪЁМНЫЙ (3D WebGL)'
          : 'Режим: АРКАДА (2D Пиксельный)',
        'info'
      );
    }

    showLauncherModal() {
      this.toggleModal('launcher-modal', true);
    }

    hideLauncherModal() {
      this.toggleModal('launcher-modal', false);
    }

    toggleModal(id, visible) {
      const el = document.getElementById(id);
      if (el) {
        el.classList.toggle('hidden', !visible);
      }
    }

    showToast(message, kind = 'info') {
      const el = document.getElementById('hud-toast');
      if (!el) return;
      el.textContent = message;
      el.className = `hud-toast visible toast-${kind}`;
      if (this._toastTimer) clearTimeout(this._toastTimer);
      this._toastTimer = setTimeout(() => {
        el.classList.remove('visible');
      }, 3600);
    }

    updateJournalUI() {
      const listEl = document.getElementById('journal-entries-list');
      if (!listEl) return;
      const entries = this.interaction.journal;
      if (entries.length === 0) {
        listEl.innerHTML =
          '<div class="empty-journal">Пока не найдено ни одной VHS-кассеты. Ищите жёлтые светящиеся кассеты в мирах!</div>';
        return;
      }
      listEl.innerHTML = entries
        .map(
          (e) => `
          <div class="journal-card">
            <div class="journal-card-head">
              <span class="journal-title">${e.title}</span>
              <span class="journal-meta">СИД: ${e.seed} • ${e.timestamp}</span>
            </div>
            <div class="journal-biome">${e.biomeName}</div>
            <p class="journal-text">${e.text}</p>
          </div>
        `
        )
        .join('');
    }

    openAndRunBugCheckModal() {
      this.toggleModal('bugcheck-modal', true);
      const container = document.getElementById('bugcheck-results');
      if (!container || !window.LiminalDiagnostics) return;

      const report = window.LiminalDiagnostics.runTenStepBugCheck();
      const summaryClass = report.allPassed ? 'bugcheck-summary pass' : 'bugcheck-summary fail';
      const summaryText = report.allPassed
        ? `✅ ВСЕ ${report.passedCount}/${report.totalSteps} ШАГОВ ПРОВЕРКИ ПРОЙДЕНЫ УСПЕШНО (${report.totalDurationMs} мс)`
        : `⚠️ ПРОЙДЕНО ${report.passedCount}/${report.totalSteps} ШАГОВ`;

      container.innerHTML = `
        <div class="${summaryClass}">${summaryText}</div>
        <div class="bugcheck-steps-list">
          ${report.steps
            .map(
              (s) => `
            <div class="bugcheck-step-item ${s.passed ? 'step-pass' : 'step-fail'}">
              <div class="step-header">
                <span class="step-badge">${s.passed ? '✔ ШАГ ' + s.step : '✖ ШАГ ' + s.step}</span>
                <span class="step-title">${s.name}</span>
                <span class="step-time">${s.durationMs} мс</span>
              </div>
              <div class="step-detail">${s.detail}</div>
            </div>
          `
            )
            .join('')}
        </div>
      `;
    }

    updateHUD() {
      if (!this.world || !this.physics) return;
      const p = this.physics.player;

      const setText = (id, txt) => {
        const el = document.getElementById(id);
        if (el) el.textContent = txt;
      };

      setText('hud-seed-val', this.world.seed);
      setText('hud-biome-val', this.world.biome.name);
      setText(
        'btn-hud-mode',
        this.renderMode === '3D' ? '🧊 Режим: 3D Объёмный' : '👾 Режим: 2D Аркада'
      );
      setText(
        'btn-hud-cam',
        this.renderer3D && this.renderer3D.cameraView === '3P' ? '🎥 Камера: 3-е лицо' : '👁 Камера: 1-е лицо'
      );

      const vhsLeft = this.world.interactables.filter(
        (i) => i.type === 'VHS_TAPE' && !i.collected
      ).length;
      const totalCollected = this.interaction ? this.interaction.journal.length : 0;
      setText('hud-vhs-val', `📼 ${totalCollected} (в мире: ${vhsLeft})`);

      const sanityBar = document.getElementById('hud-sanity-fill');
      if (sanityBar) sanityBar.style.width = `${Math.round(p.sanity)}%`;
      const staminaBar = document.getElementById('hud-stamina-fill');
      if (staminaBar) staminaBar.style.width = `${Math.round(p.stamina)}%`;

      const flashBtn = document.getElementById('mob-btn-flashlight');
      if (flashBtn) {
        flashBtn.classList.toggle('active-toggle', Boolean(p.flashlightOn));
      }
    }

    _drawMinimap() {
      const canvas = document.getElementById('minimap-canvas');
      if (!canvas || !this.world || !this.physics) return;
      const ctx = canvas.getContext('2d');
      const W = canvas.width;
      const H = canvas.height;
      const p = this.physics.player;
      const scale = 2.1;

      ctx.fillStyle = 'rgba(10, 12, 20, 0.85)';
      ctx.fillRect(0, 0, W, H);

      const toX = (wx) => W * 0.5 + (wx - p.x) * scale;
      const toY = (wz) => H * 0.5 + (wz - p.z) * scale;

      // Walls
      ctx.fillStyle = 'rgba(215, 198, 122, 0.65)';
      for (const w of this.world.walls) {
        if (w.isDoor && w.isOpen) continue;
        const x = toX(w.x - w.w * 0.5);
        const y = toY(w.z - w.d * 0.5);
        ctx.fillRect(x, y, Math.max(2, w.w * scale), Math.max(2, w.d * scale));
      }

      // VHS & Portals on radar
      for (const it of this.world.interactables) {
        if (it.type === 'VHS_TAPE' && !it.collected) {
          ctx.fillStyle = '#ffe64d';
          ctx.fillRect(toX(it.x) - 2, toY(it.z) - 2, 5, 5);
        } else if (it.type === 'PORTAL') {
          ctx.fillStyle = '#c85cff';
          ctx.beginPath();
          ctx.arc(toX(it.x), toY(it.z), 4, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      // Player center dot & look cone
      ctx.fillStyle = '#47ffb2';
      ctx.beginPath();
      ctx.arc(W * 0.5, H * 0.5, 3.5, 0, Math.PI * 2);
      ctx.fill();

      ctx.strokeStyle = '#47ffb2';
      ctx.beginPath();
      ctx.moveTo(W * 0.5, H * 0.5);
      ctx.lineTo(W * 0.5 - Math.sin(p.yaw) * 12, H * 0.5 - Math.cos(p.yaw) * 12);
      ctx.stroke();
    }

    _loop(nowMs) {
      if (!this.isRunning) return;
      const dt = Math.min(0.1, Math.max(0.001, (nowMs - this.lastFrameTime) / 1000));
      this.lastFrameTime = nowMs;

      // FPS counter
      this.fpsFrames++;
      if (nowMs - this.fpsLastTime >= 500) {
        this.currentFps = Math.round((this.fpsFrames * 1000) / (nowMs - this.fpsLastTime));
        this.fpsFrames = 0;
        this.fpsLastTime = nowMs;
        const fpsEl = document.getElementById('hud-fps-val');
        if (fpsEl && this.physics) {
          const p = this.physics.player;
          fpsEl.textContent = `${this.currentFps} FPS • X:${p.x.toFixed(1)} Z:${p.z.toFixed(1)}`;
        }
        this.updateHUD();
        this._drawMinimap();
      }

      // Step input, physics & interaction focus
      const frameInput = this.input.sampleFrameInput(this.physics.player);
      frameInput.arcade2D = this.renderMode === '2D';
      frameInput.manualLookActive = Boolean(this.input.lookPad.active || this.input._mouseDragging);
      this.physics.update(dt, frameInput);
      const focused = this.interaction.updateFocus();

      const promptEl = document.getElementById('hud-interact-prompt');
      const mobInteractBtn = document.getElementById('mob-btn-interact');
      if (promptEl) {
        if (focused) {
          promptEl.textContent = focused.prompt || 'Взаимодействовать [E]';
          promptEl.classList.add('visible');
        } else {
          promptEl.classList.remove('visible');
        }
      }
      if (mobInteractBtn) {
        mobInteractBtn.classList.toggle('highlight-action', Boolean(focused));
      }

      // Render active engine (3D Volumetric or 2D Pixel Arcade)
      const timeSec = nowMs * 0.001;
      if (this.renderMode === '3D' && this.renderer3D) {
        this.renderer3D.render(this.physics, timeSec);
      } else if (this.renderMode === '2D' && this.renderer2D) {
        this.renderer2D.render(this.physics, this.interaction, timeSec);
      }

      requestAnimationFrame((t) => this._loop(t));
    }
  }

  return { LiminalExplorerApp };
});
