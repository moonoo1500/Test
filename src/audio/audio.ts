/**
 * Procedural audio. No samples are shipped: ambience, footsteps and interface
 * sounds are synthesised with the Web Audio API.
 */

export type Ambience = 'hum' | 'wind' | 'water' | 'reverb' | 'forest' | 'machines';

export class AudioEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private ambienceNodes: AudioNode[] = [];
  private noiseBuffer: AudioBuffer | null = null;
  private enabled = true;
  private lastFootstep = 0;

  get isEnabled(): boolean {
    return this.enabled;
  }

  /** Must be called from a user gesture (mobile browsers require it). */
  async resume(): Promise<void> {
    if (!this.ctx) {
      const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return;
      this.ctx = new Ctor();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.55;
      this.master.connect(this.ctx.destination);
      this.noiseBuffer = this.createNoiseBuffer();
    }
    if (this.ctx.state === 'suspended') {
      await this.ctx.resume();
    }
  }

  setEnabled(value: boolean): void {
    this.enabled = value;
    if (this.master && this.ctx) {
      this.master.gain.setTargetAtTime(value ? 0.55 : 0, this.ctx.currentTime, 0.1);
    }
  }

  private createNoiseBuffer(): AudioBuffer | null {
    if (!this.ctx) return null;
    const len = this.ctx.sampleRate * 2;
    const buffer = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) {
      const white = Math.random() * 2 - 1;
      last = (last + 0.02 * white) / 1.02;
      data[i] = last * 3.5;
    }
    return buffer;
  }

  /** Starts the ambience loop for a world type. */
  setAmbience(kind: Ambience): void {
    if (!this.ctx || !this.master || !this.noiseBuffer) return;
    this.stopAmbience();
    if (!this.enabled) return;

    const ctx = this.ctx;
    const gain = ctx.createGain();
    gain.gain.value = 0;
    gain.connect(this.master);
    this.ambienceNodes = [gain];

    const noise = ctx.createBufferSource();
    noise.buffer = this.noiseBuffer;
    noise.loop = true;
    const filter = ctx.createBiquadFilter();
    const lfo = ctx.createOscillator();
    const lfoGain = ctx.createGain();

    switch (kind) {
      case 'hum': {
        filter.type = 'lowpass';
        filter.frequency.value = 420;
        const drone = ctx.createOscillator();
        drone.type = 'sawtooth';
        drone.frequency.value = 60;
        const droneGain = ctx.createGain();
        droneGain.gain.value = 0.05;
        const droneFilter = ctx.createBiquadFilter();
        droneFilter.type = 'lowpass';
        droneFilter.frequency.value = 220;
        drone.connect(droneFilter).connect(droneGain).connect(gain);
        drone.start();
        this.ambienceNodes.push(drone, droneGain, droneFilter);
        lfo.frequency.value = 0.07;
        lfoGain.gain.value = 90;
        break;
      }
      case 'wind': {
        filter.type = 'bandpass';
        filter.frequency.value = 620;
        filter.Q.value = 0.7;
        lfo.frequency.value = 0.09;
        lfoGain.gain.value = 320;
        break;
      }
      case 'water': {
        filter.type = 'lowpass';
        filter.frequency.value = 900;
        lfo.frequency.value = 0.25;
        lfoGain.gain.value = 260;
        break;
      }
      case 'reverb': {
        filter.type = 'lowpass';
        filter.frequency.value = 320;
        const delay = ctx.createDelay(1.5);
        delay.delayTime.value = 0.42;
        const fb = ctx.createGain();
        fb.gain.value = 0.42;
        const wet = ctx.createGain();
        wet.gain.value = 0.35;
        gain.connect(delay);
        delay.connect(fb).connect(delay);
        delay.connect(wet).connect(this.master);
        this.ambienceNodes.push(delay, fb, wet);
        lfo.frequency.value = 0.05;
        lfoGain.gain.value = 40;
        break;
      }
      case 'forest': {
        filter.type = 'bandpass';
        filter.frequency.value = 1400;
        filter.Q.value = 0.5;
        lfo.frequency.value = 0.12;
        lfoGain.gain.value = 500;
        break;
      }
      default: {
        filter.type = 'lowpass';
        filter.frequency.value = 260;
        const drone = ctx.createOscillator();
        drone.type = 'square';
        drone.frequency.value = 44;
        const droneGain = ctx.createGain();
        droneGain.gain.value = 0.035;
        drone.connect(droneGain).connect(gain);
        drone.start();
        this.ambienceNodes.push(drone, droneGain);
        lfo.frequency.value = 0.03;
        lfoGain.gain.value = 30;
        break;
      }
    }

    noise.connect(filter);
    filter.connect(gain);
    noise.start();
    lfo.connect(lfoGain).connect(filter.frequency);
    lfo.start();
    this.ambienceNodes.push(noise, filter, lfo, lfoGain);

    gain.gain.setTargetAtTime(0.55, ctx.currentTime, 1.2);
  }

  stopAmbience(): void {
    if (!this.ctx) return;
    for (const node of this.ambienceNodes) {
      const anyNode = node as AudioNode & { stop?: (t: number) => void };
      try {
        anyNode.stop?.(this.ctx.currentTime);
      } catch {
        /* node was never started */
      }
      node.disconnect();
    }
    this.ambienceNodes = [];
  }

  /** Footstep triggered by travelled distance. */
  footstep(surface: 'carpet' | 'tile' | 'grass' | 'dirt' | 'concrete' = 'carpet'): void {
    if (!this.ctx || !this.master || !this.enabled) return;
    const ctx = this.ctx;
    const now = ctx.currentTime;
    if (now - this.lastFootstep < 0.12) return;
    this.lastFootstep = now;

    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    src.playbackRate.value = 0.8 + Math.random() * 0.4;
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    const freq = surface === 'grass' ? 900 : surface === 'tile' ? 2400 : surface === 'dirt' ? 600 : 1400;
    filter.frequency.value = freq * (0.85 + Math.random() * 0.3);
    filter.Q.value = 1.2;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.12, now + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.13);
    src.connect(filter).connect(gain).connect(this.master);
    src.start(now, Math.random() * 1.5, 0.16);
    src.stop(now + 0.18);
  }

  /** Short UI / interaction sounds. */
  blip(kind: 'door' | 'pickup' | 'portal' | 'click'): void {
    if (!this.ctx || !this.master || !this.enabled) return;
    const ctx = this.ctx;
    const now = ctx.currentTime;

    if (kind === 'pickup' || kind === 'portal') {
      const freqs = kind === 'pickup' ? [660, 990] : [330, 495, 660];
      freqs.forEach((f, i) => {
        const osc = ctx.createOscillator();
        osc.type = 'sine';
        osc.frequency.value = f;
        const gain = ctx.createGain();
        const start = now + i * 0.07;
        gain.gain.setValueAtTime(0.0001, start);
        gain.gain.exponentialRampToValueAtTime(0.16, start + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.6);
        osc.connect(gain).connect(this.master!);
        osc.start(start);
        osc.stop(start + 0.65);
      });
      return;
    }

    if (kind === 'door') {
      const src = ctx.createBufferSource();
      src.buffer = this.noiseBuffer;
      src.playbackRate.value = 0.35;
      const filter = ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.setValueAtTime(400, now);
      filter.frequency.linearRampToValueAtTime(1200, now + 0.35);
      filter.Q.value = 6;
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.exponentialRampToValueAtTime(0.09, now + 0.05);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.45);
      src.connect(filter).connect(gain).connect(this.master);
      src.start(now, Math.random(), 0.5);
      src.stop(now + 0.5);
      return;
    }

    const osc = ctx.createOscillator();
    osc.type = 'square';
    osc.frequency.value = 520;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.07, now + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.09);
    osc.connect(gain).connect(this.master);
    osc.start(now);
    osc.stop(now + 0.1);
  }
}
