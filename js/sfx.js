// Sound effects, all generated in code with the Web Audio API. There are no audio files.
//
// Signal path:  voices → [panner] → bus ─┬──────────────→ tone (low-pass) → master → compressor → speakers
//                                        └→ send → reverb ┘
// In bullet time the low-pass filter closes and a low drone fades in, so the whole world sounds muffled and heavy.

const STORE_KEY = 'matrixBulletproof.muted';
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

export class Sfx {
  constructor() {
    this.ctx = null;
    this.slow = 0;
    try { this.muted = localStorage.getItem(STORE_KEY) === '1'; } catch { this.muted = false; }
  }

  // Browsers only allow audio after the first tap or key press, so build everything then.
  unlock() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended' && !this.held) this.ctx.resume();
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = (this.ctx = new AC());

    this.master = ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 0.9;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.ratio.value = 4;
    this.master.connect(comp).connect(ctx.destination);

    this.tone = ctx.createBiquadFilter();
    this.tone.type = 'lowpass';
    this.tone.frequency.value = 20000;
    this.tone.connect(this.master);

    this.bus = ctx.createGain();
    this.bus.connect(this.tone);

    // Reverb tail: a convolver fed with decaying noise sounds like a big concrete space.
    this.reverb = ctx.createConvolver();
    this.reverb.buffer = this.impulse(2.8, 2.6);
    this.send = ctx.createGain();
    this.send.gain.value = 1;
    this.send.connect(this.reverb).connect(this.tone);

    // 2 seconds of white noise, reused by every noisy sound.
    const len = ctx.sampleRate * 2;
    this.noise = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;

    // Bullet-time drone: a low sine plus rumbling noise. Always running, silent until time slows.
    this.drone = ctx.createGain();
    this.drone.gain.value = 0;
    this.drone.connect(this.master);
    const hum = ctx.createOscillator();
    hum.frequency.value = 41;
    hum.connect(this.drone);
    hum.start();
    const rumble = this.noiseSource(0.5, true);
    const rumbleLp = this.filter('lowpass', 140);
    rumble.connect(rumbleLp).connect(this.drone);
    rumble.start();
  }

  impulse(seconds, decay) {
    const { ctx } = this;
    const len = Math.floor(ctx.sampleRate * seconds);
    const buf = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
    }
    return buf;
  }

  // ---------- Building blocks ----------
  noiseSource(rate = 1, loop = false) {
    const s = this.ctx.createBufferSource();
    s.buffer = this.noise;
    s.playbackRate.value = rate;
    s.loop = loop;
    return s;
  }

  filter(type, freq, q = 0.7) {
    const f = this.ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q;
    return f;
  }

  // An output for one sound: panned, then sent to both the dry bus and the reverb.
  out(pan = 0, wet = 0.3) {
    const { ctx } = this;
    const g = ctx.createGain();
    const p = ctx.createStereoPanner ? ctx.createStereoPanner() : ctx.createGain();
    if (p.pan) p.pan.value = clamp(pan, -1, 1);
    g.connect(p);
    p.connect(this.bus);
    const w = ctx.createGain();
    w.gain.value = wet;
    p.connect(w).connect(this.send);
    return g;
  }

  // Attack/decay envelope on a gain node.
  env(g, t, attack, peak, decay) {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
    return t + attack + decay;
  }

  osc(type, f0, f1, t, dur) {
    const o = this.ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(f1, t + dur);
    return o;
  }

  voice(src, chain, dest, t, end) {
    let node = src;
    for (const c of chain) node = node.connect(c);
    node.connect(dest);
    src.start(t);
    src.stop(end + 0.05);
  }

  get ready() { return this.ctx && this.ctx.state === 'running' && !this.muted; }

  // ---------- Sounds ----------

  // A pistol shot: a sharp crack, a noisy body and a low thump. At slow time rates
  // everything stretches and drops in pitch into a deep, booming bullet-time shot.
  gunshot({ pan = 0, rate = 1, count = 1 } = {}) {
    if (!this.ready) return;
    const t = this.ctx.currentTime;
    const r = clamp(rate, 0.2, 1);
    const loud = 0.75 + 0.12 * (count - 1);
    const o = this.out(pan, 0.35 + (1 - r) * 0.4);

    const crack = this.ctx.createGain();
    this.voice(this.noiseSource(r), [this.filter('highpass', 2500 * r)], crack, t, this.env(crack, t, 0.001, loud * 0.9, 0.05 / r));
    crack.connect(o);

    const body = this.ctx.createGain();
    this.voice(this.noiseSource(r), [this.filter('lowpass', 1800 * r)], body, t, this.env(body, t, 0.002, loud, 0.25 / r));
    body.connect(o);

    const thump = this.ctx.createGain();
    this.voice(this.osc('sine', 150 * r, 42 * r, t, 0.2 / r), [], thump, t, this.env(thump, t, 0.002, loud * 1.4, 0.3 / r));
    thump.connect(o);
  }

  // A bullet whizzing past: a sweeping, whistling band of noise that drops in pitch (a Doppler shift).
  whiz({ pan = 0, rate = 1, close = 0.5 } = {}) {
    if (!this.ready) return;
    const t = this.ctx.currentTime;
    const r = clamp(rate, 0.2, 1);
    const dur = 0.32 / r;
    const o = this.out(pan, 0.2);
    const bp = this.filter('bandpass', 4500 * r, 9);
    bp.frequency.exponentialRampToValueAtTime(650 * r, t + dur);
    const g = this.ctx.createGain();
    this.voice(this.noiseSource(r), [bp], g, t, this.env(g, t, 0.07 / r, 0.35 + close * 0.6, dur));
    g.connect(o);

    const zing = this.ctx.createGain();
    this.voice(this.osc('sine', 2100 * r, 900 * r, t, dur), [], zing, t, this.env(zing, t, 0.05 / r, 0.03 + close * 0.05, dur));
    zing.connect(o);
  }

  // Into bullet time: a huge descending whoosh, a sliding pitch drop and a sub-bass boom.
  dodgeStart() {
    if (!this.ready) return;
    const t = this.ctx.currentTime;
    const o = this.out(0, 0.6);

    const lp = this.filter('lowpass', 7000, 1.5);
    lp.frequency.exponentialRampToValueAtTime(220, t + 1.1);
    const whoosh = this.ctx.createGain();
    this.voice(this.noiseSource(1), [lp], whoosh, t, this.env(whoosh, t, 0.06, 0.8, 1.3));
    whoosh.connect(o);

    const slide = this.ctx.createGain();
    this.voice(this.osc('sawtooth', 340, 50, t, 1.2), [this.filter('lowpass', 900)], slide, t, this.env(slide, t, 0.03, 0.22, 1.4));
    slide.connect(o);

    const boom = this.ctx.createGain();
    this.voice(this.osc('sine', 75, 30, t, 1.4), [], boom, t, this.env(boom, t, 0.01, 0.9, 1.7));
    boom.connect(o);
  }

  // Out of bullet time: a rising whoosh that snaps the world back to speed.
  dodgeEnd() {
    if (!this.ready) return;
    const t = this.ctx.currentTime;
    const o = this.out(0, 0.4);
    const lp = this.filter('lowpass', 250, 1.5);
    lp.frequency.exponentialRampToValueAtTime(6000, t + 0.45);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.55, t + 0.42);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.55);
    this.voice(this.noiseSource(1), [lp], g, t, t + 0.55);
    g.connect(o);

    const rise = this.ctx.createGain();
    rise.gain.setValueAtTime(0.0001, t);
    rise.gain.exponentialRampToValueAtTime(0.18, t + 0.4);
    rise.gain.exponentialRampToValueAtTime(0.0001, t + 0.5);
    this.voice(this.osc('sawtooth', 55, 260, t, 0.45), [this.filter('lowpass', 1200)], rise, t, t + 0.5);
    rise.connect(o);
  }

  // NEO raises his palm and the world stops: a deep sub boom, a rushing air shockwave
  // and a shimmering, trembling chord ringing out in a huge reverb.
  stopPalm() {
    if (!this.ready) return;
    const t = this.ctx.currentTime;
    const o = this.out(0, 0.7);

    const boom = this.ctx.createGain();
    this.voice(this.osc('sine', 62, 26, t, 2.2), [], boom, t, this.env(boom, t, 0.01, 1.0, 2.6));
    boom.connect(o);

    const lp = this.filter('lowpass', 3500, 2);
    lp.frequency.exponentialRampToValueAtTime(140, t + 1.3);
    const air = this.ctx.createGain();
    this.voice(this.noiseSource(0.7), [lp], air, t, this.env(air, t, 0.02, 0.85, 1.5));
    air.connect(o);

    // Shimmer chord with a tremolo, like light warping around the frozen bullets.
    const shimmer = this.ctx.createGain();
    shimmer.gain.setValueAtTime(0.0001, t);
    shimmer.gain.exponentialRampToValueAtTime(0.11, t + 0.25);
    shimmer.gain.exponentialRampToValueAtTime(0.0001, t + 3.2);
    const trem = this.ctx.createGain();
    trem.gain.value = 0.6;
    const lfo = this.osc('sine', 7, 7, t, 0);
    const lfoAmt = this.ctx.createGain();
    lfoAmt.gain.value = 0.4;
    lfo.connect(lfoAmt).connect(trem.gain);
    lfo.start(t);
    lfo.stop(t + 3.3);
    for (const f of [880, 1318.5, 1975.5, 2637]) {
      const s = this.osc('sine', f * 1.003, f, t, 0);
      s.connect(shimmer);
      s.start(t);
      s.stop(t + 3.3);
    }
    shimmer.connect(trem).connect(o);
  }

  // A spent bullet clinking on the floor: a few inharmonic metallic partials and a tiny tick.
  clink({ pan = 0, strength = 1 } = {}) {
    if (!this.ready) return;
    const t = this.ctx.currentTime + Math.random() * 0.02;
    const o = this.out(pan, 0.35);
    const f0 = 2600 + Math.random() * 1800;
    [[1, 0.3], [2.76, 0.15], [5.4, 0.07]].forEach(([m, a]) => {
      const g = this.ctx.createGain();
      this.voice(this.osc('sine', f0 * m, f0 * m, t, 0), [], g, t, this.env(g, t, 0.001, a * strength, 0.25 + Math.random() * 0.35));
      g.connect(o);
    });
    const tick = this.ctx.createGain();
    this.voice(this.noiseSource(1), [this.filter('highpass', 5000)], tick, t, this.env(tick, t, 0.001, 0.25 * strength, 0.015));
    tick.connect(o);
  }

  // NEO is hit: a heavy thud, plus a stuttering digital glitch as the Matrix code flickers.
  hit() {
    if (!this.ready) return;
    const t = this.ctx.currentTime;
    const o = this.out(0, 0.25);
    const thud = this.ctx.createGain();
    this.voice(this.osc('sine', 130, 38, t, 0.35), [], thud, t, this.env(thud, t, 0.002, 1.6, 0.45));
    thud.connect(o);
    const smack = this.ctx.createGain();
    this.voice(this.noiseSource(0.8), [this.filter('lowpass', 1100)], smack, t, this.env(smack, t, 0.001, 1.1, 0.18));
    smack.connect(o);
    [0, 0.05, 0.1, 0.16].forEach((dt, i) => {
      const g = this.ctx.createGain();
      const f = [220, 330, 185, 440][i];
      this.voice(this.osc('square', f, f, t + dt, 0), [this.filter('lowpass', 2500)], g, t + dt, this.env(g, t + dt, 0.001, 0.14, 0.035));
      g.connect(o);
    });
  }

  // 0 = normal time, 1 = full bullet time. Muffles the world and fades in the drone.
  setSlowmo(f) {
    if (!this.ctx || Math.abs(f - this.slow) < 0.01) return;
    this.slow = f;
    const t = this.ctx.currentTime;
    this.tone.frequency.setTargetAtTime(20000 * Math.pow(0.08, f), t, 0.08);
    this.drone.gain.setTargetAtTime(f * 0.18, t, 0.15);
  }

  // Paused game or hidden tab: suspend all audio.
  hold(on) {
    this.held = on;
    if (!this.ctx) return;
    if (on && this.ctx.state === 'running') this.ctx.suspend();
    else if (!on && this.ctx.state === 'suspended') this.ctx.resume();
  }

  toggleMute() {
    this.muted = !this.muted;
    try { localStorage.setItem(STORE_KEY, this.muted ? '1' : '0'); } catch { /* storage unavailable */ }
    this.unlock();
    if (this.master) this.master.gain.setTargetAtTime(this.muted ? 0 : 0.9, this.ctx.currentTime, 0.02);
    return this.muted;
  }
}
