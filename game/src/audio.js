// Every sound in the game is synthesised here with WebAudio, so the entry ships no audio files
// and nothing it plays is borrowed: noise bursts for gunfire, filtered clicks for reloads.

export class Sound {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.muted = false;
    this.noiseBuffer = null;
  }

  // Browsers only allow audio after a gesture, so the first click starts the graph.
  start() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    this.ctx = new Ctx();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.55;
    this.master.connect(this.ctx.destination);
    const length = Math.floor(this.ctx.sampleRate * 0.5);
    this.noiseBuffer = this.ctx.createBuffer(1, length, this.ctx.sampleRate);
    const data = this.noiseBuffer.getChannelData(0);
    for (let i = 0; i < length; i += 1) data[i] = Math.random() * 2 - 1;
  }

  toggleMute() {
    this.muted = !this.muted;
    if (this.master) this.master.gain.value = this.muted ? 0 : 0.55;
    return this.muted;
  }

  noise(duration, filterHz, gain, q = 1) {
    if (!this.ctx) return;
    const source = this.ctx.createBufferSource();
    source.buffer = this.noiseBuffer;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = filterHz;
    filter.Q.value = q;
    const amp = this.ctx.createGain();
    const now = this.ctx.currentTime;
    amp.gain.setValueAtTime(gain, now);
    amp.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    source.connect(filter).connect(amp).connect(this.master);
    source.start(now);
    source.stop(now + duration + 0.02);
  }

  tone(freq, duration, gain = 0.18, type = 'sine', slideTo = null) {
    if (!this.ctx) return;
    const osc = this.ctx.createOscillator();
    osc.type = type;
    const amp = this.ctx.createGain();
    const now = this.ctx.currentTime;
    osc.frequency.setValueAtTime(freq, now);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, now + duration);
    amp.gain.setValueAtTime(gain, now);
    amp.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    osc.connect(amp).connect(this.master);
    osc.start(now);
    osc.stop(now + duration + 0.02);
  }

  shot(weapon, distance = 0) {
    const falloff = Math.max(0.08, 1 - distance / 60);
    this.noise(weapon.heavy ? 0.3 : 0.16, weapon.heavy ? 900 : 1600, (weapon.heavy ? 0.55 : 0.38) * falloff);
    this.tone(weapon.heavy ? 90 : 160, 0.12, 0.16 * falloff, 'square', 40);
  }

  dryFire() { this.tone(880, 0.04, 0.06, 'square'); }
  reloadStart() { this.tone(220, 0.07, 0.1, 'triangle'); }
  reloadEnd() { this.tone(320, 0.06, 0.12, 'triangle', 520); }
  footstep() { this.noise(0.07, 700, 0.1); }
  hit(headshot) {
    this.tone(headshot ? 1600 : 900, headshot ? 0.14 : 0.08, 0.2, 'triangle');
    if (headshot) this.tone(2400, 0.1, 0.12, 'sine');
  }
  hurt() { this.noise(0.2, 420, 0.3); this.tone(140, 0.2, 0.16, 'sawtooth', 70); }
  kill() { this.tone(520, 0.1, 0.16, 'square', 780); }
  bombBeep(fast) { this.tone(fast ? 1400 : 900, 0.07, 0.16, 'square'); }
  planted() { this.tone(300, 0.5, 0.2, 'sawtooth', 120); }
  defused() { this.tone(600, 0.4, 0.18, 'sine', 900); }
  explosion() { this.noise(0.9, 260, 0.8); this.tone(60, 0.8, 0.3, 'sawtooth', 30); }
  roundStart() { this.tone(440, 0.18, 0.14, 'triangle'); setTimeout(() => this.tone(660, 0.22, 0.14, 'triangle'), 160); }
  roundWin() { [523, 659, 784].forEach((f, i) => setTimeout(() => this.tone(f, 0.22, 0.15, 'triangle'), i * 140)); }
  roundLoss() { [400, 300, 220].forEach((f, i) => setTimeout(() => this.tone(f, 0.26, 0.15, 'sawtooth'), i * 150)); }
  buy() { this.tone(760, 0.06, 0.14, 'square'); setTimeout(() => this.tone(1040, 0.08, 0.12, 'square'), 60); }
  tick() { this.tone(1200, 0.03, 0.06, 'square'); }
}
