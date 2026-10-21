/**
 * Procedural WebAudio Soundscape & SFX Engine
 * Zero external audio assets needed: synthesizes fluorescent hum, dreamcore pads,
 * surface-accurate footsteps (carpet, grass, water, tile, asphalt), and interaction SFX.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.LiminalAudio = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  class SoundEngine {
    constructor() {
      this.ctx = null;
      this.muted = false;
      this.masterGain = null;
      this.ambientNodes = [];
      this.currentBiomeId = null;
      this.initialized = false;
    }

    init() {
      if (this.initialized) {
        if (this.ctx && this.ctx.state === 'suspended') {
          this.ctx.resume().catch(() => {});
        }
        return true;
      }
      const AudioCtx =
        typeof window !== 'undefined'
          ? window.AudioContext || window.webkitAudioContext
          : null;
      if (!AudioCtx) return false;

      try {
        this.ctx = new AudioCtx();
        this.masterGain = this.ctx.createGain();
        this.masterGain.gain.value = this.muted ? 0 : 0.35;
        this.masterGain.connect(this.ctx.destination);
        this.initialized = true;
        return true;
      } catch (_e) {
        return false;
      }
    }

    setMuted(muted) {
      this.muted = Boolean(muted);
      if (this.masterGain && this.ctx) {
        this.masterGain.gain.setTargetAtTime(
          this.muted ? 0 : 0.35,
          this.ctx.currentTime,
          0.05
        );
      }
    }

    toggleMute() {
      this.setMuted(!this.muted);
      return this.muted;
    }

    stopAmbient() {
      for (const node of this.ambientNodes) {
        try {
          if (node.stop) node.stop();
          if (node.disconnect) node.disconnect();
        } catch (_e) {}
      }
      this.ambientNodes = [];
    }

    setBiomeAmbient(biomeId) {
      this.currentBiomeId = biomeId;
      if (!this.initialized || !this.ctx) return;
      this.stopAmbient();

      const now = this.ctx.currentTime;
      const ambGain = this.ctx.createGain();
      ambGain.gain.setValueAtTime(0.001, now);
      ambGain.gain.exponentialRampToValueAtTime(0.16, now + 1.0);
      ambGain.connect(this.masterGain);
      this.ambientNodes.push(ambGain);

      if (biomeId === 'YELLOW_COMPLEX') {
        // 60Hz + 120Hz fluorescent hum
        const osc1 = this.ctx.createOscillator();
        const osc2 = this.ctx.createOscillator();
        osc1.type = 'sawtooth';
        osc2.type = 'sine';
        osc1.frequency.value = 60;
        osc2.frequency.value = 120;
        const filter = this.ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.value = 210;
        osc1.connect(filter);
        osc2.connect(filter);
        filter.connect(ambGain);
        osc1.start();
        osc2.start();
        this.ambientNodes.push(osc1, osc2, filter);
      } else if (biomeId === 'DREAMCORE_MEADOW') {
        // Warm nostalgic Fmaj7 pad
        const freqs = [174.61, 220.0, 261.63, 329.63];
        for (const f of freqs) {
          const osc = this.ctx.createOscillator();
          osc.type = 'triangle';
          osc.frequency.value = f;
          const g = this.ctx.createGain();
          g.gain.value = 0.18;
          osc.connect(g);
          g.connect(ambGain);
          osc.start();
          this.ambientNodes.push(osc, g);
        }
      } else if (biomeId === 'POOLROOMS') {
        // Resonant aqua hall drone
        const freqs = [130.81, 196.0, 293.66];
        for (const f of freqs) {
          const osc = this.ctx.createOscillator();
          osc.type = 'sine';
          osc.frequency.value = f;
          const g = this.ctx.createGain();
          g.gain.value = 0.22;
          osc.connect(g);
          g.connect(ambGain);
          osc.start();
          this.ambientNodes.push(osc, g);
        }
      } else {
        // Suburbia / Dead Mall nostalgic low pad
        const osc1 = this.ctx.createOscillator();
        const osc2 = this.ctx.createOscillator();
        osc1.type = 'sine';
        osc2.type = 'triangle';
        osc1.frequency.value = 110;
        osc2.frequency.value = 164.81;
        osc1.connect(ambGain);
        osc2.connect(ambGain);
        osc1.start();
        osc2.start();
        this.ambientNodes.push(osc1, osc2);
      }
    }

    playFootstep(surface = 'carpet', isSprinting = false) {
      if (this.muted || !this.init() || !this.ctx) return;
      const now = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      const vol = isSprinting ? 0.22 : 0.13;

      if (surface === 'water') {
        osc.type = 'sine';
        osc.frequency.setValueAtTime(220 + Math.random() * 80, now);
        osc.frequency.exponentialRampToValueAtTime(95, now + 0.14);
        gain.gain.setValueAtTime(vol, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
      } else if (surface === 'tile' || surface === 'asphalt') {
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(340 + Math.random() * 60, now);
        osc.frequency.exponentialRampToValueAtTime(80, now + 0.06);
        gain.gain.setValueAtTime(vol * 0.9, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.065);
      } else if (surface === 'grass') {
        osc.type = 'sine';
        osc.frequency.setValueAtTime(160 + Math.random() * 40, now);
        osc.frequency.exponentialRampToValueAtTime(65, now + 0.09);
        gain.gain.setValueAtTime(vol * 0.75, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.095);
      } else {
        // Damp carpet thud
        osc.type = 'sine';
        osc.frequency.setValueAtTime(115 + Math.random() * 25, now);
        osc.frequency.exponentialRampToValueAtTime(42, now + 0.085);
        gain.gain.setValueAtTime(vol, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.09);
      }

      osc.connect(gain);
      gain.connect(this.masterGain);
      osc.start(now);
      osc.stop(now + 0.16);
    }

    playSFX(type) {
      if (this.muted || !this.init() || !this.ctx) return;
      const now = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.connect(gain);
      gain.connect(this.masterGain);

      switch (type) {
        case 'door':
          osc.type = 'sawtooth';
          osc.frequency.setValueAtTime(140, now);
          osc.frequency.linearRampToValueAtTime(195, now + 0.18);
          osc.frequency.linearRampToValueAtTime(110, now + 0.32);
          gain.gain.setValueAtTime(0.14, now);
          gain.gain.exponentialRampToValueAtTime(0.001, now + 0.34);
          osc.start(now);
          osc.stop(now + 0.35);
          break;
        case 'switch':
          osc.type = 'square';
          osc.frequency.setValueAtTime(920, now);
          osc.frequency.setValueAtTime(540, now + 0.025);
          gain.gain.setValueAtTime(0.15, now);
          gain.gain.exponentialRampToValueAtTime(0.001, now + 0.06);
          osc.start(now);
          osc.stop(now + 0.065);
          break;
        case 'vhs':
          osc.type = 'triangle';
          osc.frequency.setValueAtTime(440, now);
          osc.frequency.setValueAtTime(659.25, now + 0.09);
          osc.frequency.setValueAtTime(880, now + 0.18);
          gain.gain.setValueAtTime(0.22, now);
          gain.gain.exponentialRampToValueAtTime(0.001, now + 0.38);
          osc.start(now);
          osc.stop(now + 0.4);
          break;
        case 'vending':
          osc.type = 'sine';
          osc.frequency.setValueAtTime(520, now);
          osc.frequency.setValueAtTime(310, now + 0.12);
          gain.gain.setValueAtTime(0.2, now);
          gain.gain.exponentialRampToValueAtTime(0.001, now + 0.28);
          osc.start(now);
          osc.stop(now + 0.3);
          break;
        case 'portal':
          osc.type = 'sine';
          osc.frequency.setValueAtTime(220, now);
          osc.frequency.exponentialRampToValueAtTime(880, now + 0.55);
          gain.gain.setValueAtTime(0.26, now);
          gain.gain.exponentialRampToValueAtTime(0.001, now + 0.6);
          osc.start(now);
          osc.stop(now + 0.62);
          break;
        case 'jump':
          osc.type = 'sine';
          osc.frequency.setValueAtTime(150, now);
          osc.frequency.exponentialRampToValueAtTime(260, now + 0.12);
          gain.gain.setValueAtTime(0.15, now);
          gain.gain.exponentialRampToValueAtTime(0.001, now + 0.14);
          osc.start(now);
          osc.stop(now + 0.15);
          break;
        default:
          osc.type = 'sine';
          osc.frequency.setValueAtTime(380, now);
          gain.gain.setValueAtTime(0.12, now);
          gain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);
          osc.start(now);
          osc.stop(now + 0.13);
          break;
      }
    }
  }

  return { SoundEngine };
});
