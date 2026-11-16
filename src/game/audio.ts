import { GameSettings, PowerUpType } from '../types/game';

/**
 * Procedural Web Audio synthesizer & dynamic arcade soundtrack engine for FLUTON RUN.
 * Zero external audio files = zero 404s, instant playback, throttled SFX to prevent overlaps.
 */
class FlutonAudioEngine {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private sfxGain: GainNode | null = null;
  private musicGain: GainNode | null = null;
  private noiseBuffer: AudioBuffer | null = null;

  private settings: GameSettings = {
    soundEnabled: true,
    musicEnabled: true,
    volume: 0.75,
    quality: 'medium',
  };

  private musicTimer: number | null = null;
  private musicPlaying = false;
  private musicTempoBoost = false;
  private stepIndex = 0;
  private tokenCombo = 0;
  private lastTokenTime = 0;

  // Throttle timestamps (performance.now ms) to eliminate audio stacking & mobile glitches
  private lastPlayMs: Record<string, number> = {};

  private shouldThrottle(key: string, minIntervalMs: number): boolean {
    const now = performance.now();
    const prev = this.lastPlayMs[key] ?? 0;
    if (now - prev < minIntervalMs) return true;
    this.lastPlayMs[key] = now;
    return false;
  }

  private ensureContext(): AudioContext | null {
    if (typeof window === 'undefined') return null;
    if (!this.ctx) {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtx) return null;
      this.ctx = new AudioCtx();

      this.masterGain = this.ctx.createGain();
      this.sfxGain = this.ctx.createGain();
      this.musicGain = this.ctx.createGain();

      this.sfxGain.connect(this.masterGain);
      this.musicGain.connect(this.masterGain);
      this.masterGain.connect(this.ctx.destination);

      const sampleRate = this.ctx.sampleRate;
      const buf = this.ctx.createBuffer(1, sampleRate, sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < sampleRate; i++) {
        data[i] = Math.random() * 2 - 1;
      }
      this.noiseBuffer = buf;
      this.applySettings();
    }

    if (this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
    return this.ctx;
  }

  public unlock(): void {
    this.ensureContext();
  }

  public updateSettings(settings: GameSettings): void {
    this.settings = { ...settings };
    this.applySettings();
  }

  private applySettings(): void {
    if (!this.ctx || !this.masterGain || !this.sfxGain || !this.musicGain) return;
    const now = this.ctx.currentTime;
    this.masterGain.gain.setTargetAtTime(this.settings.volume, now, 0.03);
    this.sfxGain.gain.setTargetAtTime(this.settings.soundEnabled ? 1 : 0, now, 0.03);
    this.musicGain.gain.setTargetAtTime(this.settings.musicEnabled ? 0.34 : 0, now, 0.05);
  }

  public setBoostTempo(boost: boolean): void {
    this.musicTempoBoost = boost;
  }

  public resetForNewRun(): void {
    this.tokenCombo = 0;
    this.lastTokenTime = 0;
    this.lastPlayMs = {};
    this.musicTempoBoost = false;
  }

  public startMusic(): void {
    this.ensureContext();
    this.stopMusic();
    this.musicPlaying = true;
    this.stepIndex = 0;

    const scheduleNext = () => {
      if (!this.musicPlaying) return;
      const stepMs = this.musicTempoBoost ? 115 : 138;
      this.playMusicStep(this.stepIndex++);
      this.musicTimer = window.setTimeout(scheduleNext, stepMs);
    };
    scheduleNext();
  }

  public stopMusic(): void {
    this.musicPlaying = false;
    if (this.musicTimer !== null) {
      clearTimeout(this.musicTimer);
      this.musicTimer = null;
    }
  }

  private playMusicStep(step: number): void {
    if (!this.settings.musicEnabled || this.settings.volume <= 0.01) return;
    const ctx = this.ctx;
    if (!ctx || !this.musicGain || ctx.state !== 'running') return;

    const now = ctx.currentTime;
    const barStep = step % 16;
    const barIndex = Math.floor(step / 16) % 4;

    if (barStep % 4 === 0 || (barIndex % 2 === 1 && barStep === 14)) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(135, now);
      osc.frequency.exponentialRampToValueAtTime(42, now + 0.11);
      gain.gain.setValueAtTime(0.62, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.13);
      osc.connect(gain);
      gain.connect(this.musicGain);
      osc.start(now);
      osc.stop(now + 0.14);
    }

    if (barStep === 4 || barStep === 12) {
      this.triggerNoiseBurst(0.09, 1400, 'highpass', 0.24, this.musicGain);
    }

    if (barStep % 2 === 1) {
      this.triggerNoiseBurst(0.035, 6500, 'highpass', 0.1, this.musicGain);
    }

    const bassRoots = [92.5, 92.5, 110.0, 123.47];
    const root = bassRoots[barIndex];
    const bassPattern = [1, 0, 1, 1, 0, 1, 1, 0, 1, 0, 1, 1, 0, 1, 2, 1];
    const mult = bassPattern[barStep];
    if (mult > 0) {
      const osc = ctx.createOscillator();
      const filter = ctx.createBiquadFilter();
      const gain = ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(root * (mult === 2 ? 1.5 : 1), now);
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(620, now);
      filter.frequency.exponentialRampToValueAtTime(180, now + 0.11);
      gain.gain.setValueAtTime(0.22, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);
      osc.connect(filter);
      filter.connect(gain);
      gain.connect(this.musicGain);
      osc.start(now);
      osc.stop(now + 0.125);
    }

    const arpScale = [369.99, 440.0, 493.88, 554.37, 659.25, 739.99];
    const arpIdx = [0, 2, 3, 4, 2, 3, 5, 4, 0, 1, 3, 4, 5, 3, 2, 1][barStep];
    if (barStep % 2 === 0 || barIndex === 3) {
      const freq = arpScale[arpIdx] * (barIndex === 2 ? 1.122 : 1);
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, now);
      gain.gain.setValueAtTime(0.11, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.11);
      osc.connect(gain);
      gain.connect(this.musicGain);
      osc.start(now);
      osc.stop(now + 0.12);
    }
  }

  private triggerNoiseBurst(
    duration: number,
    freq: number,
    filterType: BiquadFilterType,
    level: number,
    dest: AudioNode
  ): void {
    if (!this.ctx || !this.noiseBuffer) return;
    const now = this.ctx.currentTime;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuffer;

    const filter = this.ctx.createBiquadFilter();
    filter.type = filterType;
    filter.frequency.setValueAtTime(freq, now);

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(level, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + duration);

    src.connect(filter);
    filter.connect(gain);
    gain.connect(dest);
    src.start(now);
    src.stop(now + duration + 0.01);
  }

  private canPlaySfx(): boolean {
    const ctx = this.ensureContext();
    return Boolean(
      ctx && this.sfxGain && this.settings.soundEnabled && this.settings.volume > 0.01
    );
  }

  public playFootstep(onTrain = false): void {
    if (this.shouldThrottle('footstep', 105)) return;
    if (!this.canPlaySfx() || !this.ctx || !this.sfxGain) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = onTrain ? 'triangle' : 'sine';
    osc.frequency.setValueAtTime(onTrain ? 190 : 115, now);
    osc.frequency.exponentialRampToValueAtTime(onTrain ? 75 : 48, now + 0.055);
    gain.gain.setValueAtTime(0.1, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.06);
    osc.connect(gain);
    gain.connect(this.sfxGain);
    osc.start(now);
    osc.stop(now + 0.065);
  }

  public playLaneSwitch(): void {
    if (this.shouldThrottle('lane', 65)) return;
    if (!this.canPlaySfx() || !this.ctx || !this.sfxGain) return;
    this.triggerNoiseBurst(0.07, 1100, 'bandpass', 0.15, this.sfxGain);
  }

  public playJump(): void {
    if (this.shouldThrottle('jump', 120)) return;
    if (!this.canPlaySfx() || !this.ctx || !this.sfxGain) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(240, now);
    osc.frequency.exponentialRampToValueAtTime(580, now + 0.16);
    gain.gain.setValueAtTime(0.24, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.18);
    osc.connect(gain);
    gain.connect(this.sfxGain);
    osc.start(now);
    osc.stop(now + 0.19);
    this.triggerNoiseBurst(0.12, 1800, 'bandpass', 0.12, this.sfxGain);
  }

  public playLand(): void {
    if (this.shouldThrottle('land', 110)) return;
    if (!this.canPlaySfx() || !this.ctx || !this.sfxGain) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(140, now);
    osc.frequency.exponentialRampToValueAtTime(42, now + 0.11);
    gain.gain.setValueAtTime(0.24, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);
    osc.connect(gain);
    gain.connect(this.sfxGain);
    osc.start(now);
    osc.stop(now + 0.13);
  }

  public playSlide(): void {
    if (this.shouldThrottle('slide', 180)) return;
    if (!this.canPlaySfx() || !this.ctx || !this.sfxGain) return;
    const now = this.ctx.currentTime;
    this.triggerNoiseBurst(0.2, 900, 'bandpass', 0.2, this.sfxGain);
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(340, now);
    osc.frequency.exponentialRampToValueAtTime(130, now + 0.18);
    gain.gain.setValueAtTime(0.14, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);
    osc.connect(gain);
    gain.connect(this.sfxGain);
    osc.start(now);
    osc.stop(now + 0.21);
  }

  public playTokenCollect(): void {
    if (this.shouldThrottle('token', 38)) return;
    if (!this.canPlaySfx() || !this.ctx || !this.sfxGain) return;
    const now = this.ctx.currentTime;
    if (now - this.lastTokenTime < 0.45) {
      this.tokenCombo = Math.min(this.tokenCombo + 1, 10);
    } else {
      this.tokenCombo = 0;
    }
    this.lastTokenTime = now;

    const baseFreq = 780 * Math.pow(1.045, this.tokenCombo);
    const osc1 = this.ctx.createOscillator();
    const osc2 = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc1.type = 'sine';
    osc2.type = 'triangle';
    osc1.frequency.setValueAtTime(baseFreq, now);
    osc1.frequency.setValueAtTime(baseFreq * 1.25, now + 0.045);
    osc2.frequency.setValueAtTime(baseFreq * 2, now);
    osc2.frequency.setValueAtTime(baseFreq * 2.5, now + 0.045);

    gain.gain.setValueAtTime(0.2, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.18);
    osc1.connect(gain);
    osc2.connect(gain);
    gain.connect(this.sfxGain);
    osc1.start(now);
    osc2.start(now);
    osc1.stop(now + 0.19);
    osc2.stop(now + 0.19);
  }

  public playSprayPaint(): void {
    if (this.shouldThrottle('spray', 350)) return;
    if (!this.canPlaySfx() || !this.ctx || !this.sfxGain) return;
    this.triggerNoiseBurst(0.42, 3400, 'bandpass', 0.24, this.sfxGain);
  }

  public playPoliceWhistle(): void {
    if (this.shouldThrottle('whistle', 900)) return;
    if (!this.canPlaySfx() || !this.ctx || !this.sfxGain) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const lfo = this.ctx.createOscillator();
    const lfoGain = this.ctx.createGain();
    const gain = this.ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(2650, now);
    osc.frequency.linearRampToValueAtTime(2850, now + 0.12);
    osc.frequency.linearRampToValueAtTime(2550, now + 0.35);

    lfo.frequency.setValueAtTime(36, now);
    lfoGain.gain.setValueAtTime(180, now);
    lfo.connect(lfoGain);
    lfoGain.connect(osc.frequency);

    gain.gain.setValueAtTime(0.01, now);
    gain.gain.linearRampToValueAtTime(0.22, now + 0.03);
    gain.gain.setValueAtTime(0.22, now + 0.28);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.42);

    osc.connect(gain);
    gain.connect(this.sfxGain);
    lfo.start(now);
    osc.start(now);
    lfo.stop(now + 0.43);
    osc.stop(now + 0.43);
  }

  public playDogBark(): void {
    if (this.shouldThrottle('bark', 750)) return;
    if (!this.canPlaySfx() || !this.ctx || !this.sfxGain) return;
    const now = this.ctx.currentTime;
    for (let i = 0; i < 2; i++) {
      const t = now + i * 0.16;
      const osc = this.ctx.createOscillator();
      const filter = this.ctx.createBiquadFilter();
      const gain = this.ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(260, t);
      osc.frequency.exponentialRampToValueAtTime(115, t + 0.09);
      filter.type = 'bandpass';
      filter.frequency.setValueAtTime(680, t);
      filter.Q.setValueAtTime(2.5, t);
      gain.gain.setValueAtTime(0.26, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.11);
      osc.connect(filter);
      filter.connect(gain);
      gain.connect(this.sfxGain);
      osc.start(t);
      osc.stop(t + 0.12);
    }
  }

  public playTrainHorn(): void {
    if (this.shouldThrottle('horn', 800)) return;
    if (!this.canPlaySfx() || !this.ctx || !this.sfxGain) return;
    const now = this.ctx.currentTime;
    const freqs = [220, 277.18, 329.63];
    for (const f of freqs) {
      const osc = this.ctx.createOscillator();
      const filter = this.ctx.createBiquadFilter();
      const gain = this.ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(f, now);
      osc.frequency.linearRampToValueAtTime(f * 0.94, now + 0.55);
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(1200, now);
      gain.gain.setValueAtTime(0.001, now);
      gain.gain.linearRampToValueAtTime(0.1, now + 0.04);
      gain.gain.setValueAtTime(0.1, now + 0.32);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.58);
      osc.connect(filter);
      filter.connect(gain);
      gain.connect(this.sfxGain);
      osc.start(now);
      osc.stop(now + 0.6);
    }
  }

  public playPowerUp(type: PowerUpType): void {
    if (this.shouldThrottle('powerup', 120)) return;
    if (!this.canPlaySfx() || !this.ctx || !this.sfxGain) return;
    const now = this.ctx.currentTime;
    const notes =
      type === 'hoverboard'
        ? [392, 523.25, 659.25, 783.99]
        : type === 'boost'
        ? [330, 440, 660, 880]
        : type === 'shield'
        ? [293.66, 440, 587.33]
        : type === 'magnet'
        ? [349.23, 440, 523.25, 698.46]
        : [523.25, 659.25, 783.99, 1046.5];

    notes.forEach((freq, i) => {
      if (!this.ctx || !this.sfxGain) return;
      const t = now + i * 0.06;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = type === 'boost' ? 'sawtooth' : 'triangle';
      osc.frequency.setValueAtTime(freq, t);
      gain.gain.setValueAtTime(0.2, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.22);
      osc.connect(gain);
      gain.connect(this.sfxGain);
      osc.start(t);
      osc.stop(t + 0.23);
    });
  }

  public playShieldSave(): void {
    if (this.shouldThrottle('shield', 220)) return;
    if (!this.canPlaySfx() || !this.ctx || !this.sfxGain) return;
    const now = this.ctx.currentTime;
    this.triggerNoiseBurst(0.24, 1600, 'bandpass', 0.32, this.sfxGain);
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(520, now);
    osc.frequency.exponentialRampToValueAtTime(140, now + 0.28);
    gain.gain.setValueAtTime(0.3, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
    osc.connect(gain);
    gain.connect(this.sfxGain);
    osc.start(now);
    osc.stop(now + 0.31);
  }

  public playStumble(): void {
    if (this.shouldThrottle('stumble', 220)) return;
    if (!this.canPlaySfx() || !this.ctx || !this.sfxGain) return;
    this.triggerNoiseBurst(0.18, 450, 'lowpass', 0.34, this.sfxGain);
  }

  public playCollisionImpact(): void {
    if (this.shouldThrottle('collision', 400)) return;
    this.stopMusic();
    if (!this.canPlaySfx() || !this.ctx || !this.sfxGain) return;
    const now = this.ctx.currentTime;
    this.triggerNoiseBurst(0.28, 380, 'lowpass', 0.45, this.sfxGain);
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(160, now);
    osc.frequency.exponentialRampToValueAtTime(38, now + 0.24);
    gain.gain.setValueAtTime(0.4, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.26);
    osc.connect(gain);
    gain.connect(this.sfxGain);
    osc.start(now);
    osc.stop(now + 0.27);
  }

  public playGameOver(): void {
    if (this.shouldThrottle('gameover', 400)) return;
    this.stopMusic();
    if (!this.canPlaySfx() || !this.ctx || !this.sfxGain) return;
    const now = this.ctx.currentTime;
    const notes = [392, 349.23, 311.13, 261.63];
    notes.forEach((f, idx) => {
      if (!this.ctx || !this.sfxGain) return;
      const t = now + idx * 0.12;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(f, t);
      gain.gain.setValueAtTime(0.18, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.19);
      osc.connect(gain);
      gain.connect(this.sfxGain);
      osc.start(t);
      osc.stop(t + 0.21);
    });
  }
}

export const audioEngine = new FlutonAudioEngine();
