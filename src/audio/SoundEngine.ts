export class SoundEngine {
  private ctx: AudioContext | null = null;
  private muted = false;
  private ambientGain: GainNode | null = null;
  private beltOsc: OscillatorNode | null = null;
  private beltGain: GainNode | null = null;

  public unlock(): void {
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtx) return;
      this.ctx = new AudioCtx();
      this.startAmbientHum();
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      void this.ctx.resume();
    }
  }

  public isMuted(): boolean {
    return this.muted;
  }

  public toggleMute(): boolean {
    this.muted = !this.muted;
    if (this.ambientGain && this.ctx) {
      this.ambientGain.gain.setTargetAtTime(this.muted ? 0 : 0.032, this.ctx.currentTime, 0.08);
    }
    if (this.beltGain && this.ctx && this.muted) {
      this.beltGain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.05);
    }
    return this.muted;
  }

  private startAmbientHum(): void {
    if (!this.ctx) return;
    // Soft airport HVAC / terminal room tone using filtered noise
    const bufferSize = this.ctx.sampleRate * 2;
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    let last = 0;
    for (let i = 0; i < bufferSize; i++) {
      const white = Math.random() * 2 - 1;
      last = (last + 0.03 * white) / 1.03;
      data[i] = last * 2.2;
    }

    const noise = this.ctx.createBufferSource();
    noise.buffer = buffer;
    noise.loop = true;

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 340;

    this.ambientGain = this.ctx.createGain();
    this.ambientGain.gain.value = this.muted ? 0 : 0.032;

    noise.connect(filter);
    filter.connect(this.ambientGain);
    this.ambientGain.connect(this.ctx.destination);
    noise.start();

    // Conveyor belt motor loop (modulated by setBeltRunning)
    this.beltOsc = this.ctx.createOscillator();
    this.beltOsc.type = 'sawtooth';
    this.beltOsc.frequency.value = 62;

    const beltFilter = this.ctx.createBiquadFilter();
    beltFilter.type = 'lowpass';
    beltFilter.frequency.value = 180;

    this.beltGain = this.ctx.createGain();
    this.beltGain.gain.value = 0;

    this.beltOsc.connect(beltFilter);
    beltFilter.connect(this.beltGain);
    this.beltGain.connect(this.ctx.destination);
    this.beltOsc.start();
  }

  public setBeltRunning(running: boolean, fast = false): void {
    if (!this.ctx || !this.beltGain || !this.beltOsc) return;
    const now = this.ctx.currentTime;
    this.beltOsc.frequency.setTargetAtTime(fast ? 82 : 62, now, 0.08);
    this.beltGain.gain.setTargetAtTime(running && !this.muted ? 0.022 : 0, now, 0.06);
  }

  private playTone(
    freq: number,
    duration: number,
    type: OscillatorType = 'sine',
    volume = 0.09,
    delay = 0,
  ): void {
    if (this.muted || !this.ctx) return;
    const now = this.ctx.currentTime + delay;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, now);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(volume, now + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start(now);
    osc.stop(now + duration + 0.02);
  }

  public playTerminalChime(): void {
    this.unlock();
    // Classic three-note airport PA ding-dong-ding
    this.playTone(587.33, 0.35, 'triangle', 0.09, 0);
    this.playTone(739.99, 0.35, 'triangle', 0.09, 0.22);
    this.playTone(880.0, 0.55, 'triangle', 0.1, 0.44);
  }

  public playClick(high = false): void {
    this.unlock();
    this.playTone(high ? 980 : 640, 0.055, 'square', 0.035);
  }

  public playUvToggle(on: boolean): void {
    this.unlock();
    this.playTone(on ? 520 : 340, 0.08, 'triangle', 0.06);
    this.playTone(on ? 880 : 240, 0.09, 'sine', 0.04, 0.04);
  }

  public playFlagItem(flagged: boolean): void {
    this.unlock();
    if (flagged) {
      this.playTone(1046, 0.09, 'sine', 0.08);
      this.playTone(1396, 0.12, 'sine', 0.08, 0.06);
    } else {
      this.playTone(520, 0.08, 'sine', 0.05);
    }
  }

  public playDecisionResult(correct: boolean, isDetain: boolean): void {
    this.unlock();
    if (correct) {
      if (isDetain) {
        // Authoritative security lock confirmation
        this.playTone(440, 0.12, 'sawtooth', 0.06, 0);
        this.playTone(659.25, 0.18, 'triangle', 0.09, 0.1);
        this.playTone(880, 0.24, 'triangle', 0.09, 0.2);
      } else {
        // Crisp green gate clear chime
        this.playTone(660, 0.14, 'sine', 0.08, 0);
        this.playTone(990, 0.22, 'sine', 0.09, 0.1);
      }
    } else {
      // Warning error buzz
      this.playTone(195, 0.22, 'sawtooth', 0.09, 0);
      this.playTone(155, 0.3, 'sawtooth', 0.09, 0.16);
    }
  }

  public playPaperSlide(): void {
    if (this.muted || !this.ctx) return;
    const len = Math.floor(this.ctx.sampleRate * 0.14);
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const ch = buf.getChannelData(0);
    for (let i = 0; i < len; i++) {
      const env = Math.sin((i / len) * Math.PI);
      ch[i] = (Math.random() * 2 - 1) * env * 0.25;
    }
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 1800;
    const gain = this.ctx.createGain();
    gain.gain.value = 0.08;
    src.connect(filter);
    filter.connect(gain);
    gain.connect(this.ctx.destination);
    src.start();
  }

  public playTaserFire(): void {
    this.unlock();
    if (this.muted || !this.ctx) return;
    // Crackling high-voltage taser arc burst
    this.playTone(1480, 0.09, 'sawtooth', 0.08, 0);
    this.playTone(1920, 0.07, 'square', 0.06, 0.03);
    this.playTone(1120, 0.11, 'sawtooth', 0.07, 0.06);
  }

  public playHostileShot(): void {
    this.unlock();
    if (this.muted || !this.ctx) return;
    this.playTone(165, 0.12, 'sawtooth', 0.09, 0);
    this.playTone(92, 0.16, 'square', 0.07, 0.03);
  }

  public playScanPing(hostile: boolean): void {
    this.unlock();
    if (hostile) {
      this.playTone(740, 0.12, 'sawtooth', 0.08, 0);
      this.playTone(980, 0.16, 'sawtooth', 0.09, 0.09);
    } else {
      this.playTone(880, 0.09, 'sine', 0.06, 0);
      this.playTone(1174, 0.11, 'sine', 0.06, 0.07);
    }
  }

  public playHijackerAlert(): void {
    this.unlock();
    this.playTone(620, 0.15, 'sawtooth', 0.09, 0);
    this.playTone(460, 0.18, 'sawtooth', 0.09, 0.14);
    this.playTone(620, 0.22, 'sawtooth', 0.09, 0.3);
  }

  public playCuffLock(): void {
    this.unlock();
    this.playTone(1240, 0.05, 'triangle', 0.08, 0);
    this.playTone(1680, 0.08, 'triangle', 0.08, 0.055);
  }

  public playCockpitAlarm(): void {
    this.unlock();
    this.playTone(880, 0.12, 'square', 0.07, 0);
    this.playTone(660, 0.12, 'square', 0.07, 0.13);
  }
}
