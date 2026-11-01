/* Procedural audio: no downloaded assets or external libraries. */
(() => {
  class AudioEngine {
    constructor() {
      this.ctx = null;
      this.master = null;
      this.enabled = false;
      this.ambientNodes = [];
      this.pingAt = 0;
      this.engine = null;
      this.magnetarHum = null;
    }
    enable() {
      if (this.enabled) {
        if (this.ctx && this.ctx.state === "suspended") this.ctx.resume().catch(() => {});
        return;
      }
      if (this.ctx) {
        this.enabled = true;
        if (this.ctx.state === "suspended") this.ctx.resume().catch(() => {});
        this.master.gain.setTargetAtTime(0.42, this.ctx.currentTime, 0.08);
        return;
      }
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      try { this.ctx = new AC(); } catch (_) { return; }
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.42;
      this.master.connect(this.ctx.destination);
      this.enabled = true;
      if (this.ctx.state === "suspended") this.ctx.resume().catch(() => {});
      this.ambience();
      this.initEngineSound();
    }
    ambience() {
      if (!this.ctx) return;
      const c = this.ctx;
      const osc = c.createOscillator(),
        gain = c.createGain(),
        filter = c.createBiquadFilter();
      osc.type = "sine";
      osc.frequency.value = 48;
      filter.type = "lowpass";
      filter.frequency.value = 115;
      gain.gain.value = 0.045;
      osc.connect(filter).connect(gain).connect(this.master);
      osc.start();
      const lfo = c.createOscillator(),
        lg = c.createGain();
      lfo.frequency.value = 0.12;
      lg.gain.value = 18;
      lfo.connect(lg).connect(osc.frequency);
      lfo.start();
      this.ambientNodes = [osc, lfo];
    }
    initEngineSound() {
      if (!this.ctx || this.engine) return;
      const c = this.ctx, hum = c.createOscillator(), humGain = c.createGain();
      hum.type = "sine"; hum.frequency.value = 42; humGain.gain.value = .001;
      hum.connect(humGain).connect(this.master); hum.start();
      const body = c.createOscillator(), bodyGain = c.createGain(), bodyFilter = c.createBiquadFilter();
      body.type = "triangle"; body.frequency.value = 84; bodyGain.gain.value = .001;
      bodyFilter.type = "lowpass"; bodyFilter.frequency.value = 170; body.connect(bodyFilter).connect(bodyGain).connect(this.master); body.start();
      const frames = c.sampleRate * 2, buffer = c.createBuffer(1, frames, c.sampleRate), data = buffer.getChannelData(0);
      let pink = 0;
      for (let i = 0; i < frames; i++) { const white = Math.random() * 2 - 1; pink = pink * .97 + white * .03; data[i] = pink * .25 + white * .08; }
      const noise = c.createBufferSource(), filter = c.createBiquadFilter(), noiseGain = c.createGain();
      noise.buffer = buffer; noise.loop = true; filter.type = "lowpass"; filter.frequency.value = 95; filter.Q.value = .65;
      noiseGain.gain.value = .001; noise.connect(filter).connect(noiseGain).connect(this.master); noise.start();
      const lfo = c.createOscillator(), lfoGain = c.createGain();
      lfo.frequency.value = 3; lfoGain.gain.value = 0;
      lfo.connect(lfoGain).connect(noiseGain.gain); lfo.start();
      const whine = c.createOscillator(), whineGain = c.createGain();
      whine.type = "sine"; whine.frequency.value = 240; whineGain.gain.value = .001;
      whine.connect(whineGain).connect(this.master); whine.start();
      const throb = c.createOscillator(), throbGain = c.createGain();
      throb.type = "sine"; throb.frequency.value = 3; throbGain.gain.value = 0;
      throb.connect(throbGain).connect(humGain.gain); throb.start();
      this.engine = { hum, humGain, body, bodyGain, filter, noiseGain, lfo, lfoGain, whine, whineGain, throb, throbGain };
    }
    updateEngineSound(throttleRatio = 0, speedRatio = 0, isSilent = false) {
      if (!this.ctx || !this.enabled) return;
      this.initEngineSound(); if (!this.engine) return;
      const e = this.engine, now = this.ctx.currentTime;
      const throttle = Number.isFinite(throttleRatio) ? Math.max(0, Math.min(1, throttleRatio)) : 0;
      const speed = Number.isFinite(speedRatio) ? Math.max(0, Math.min(1, speedRatio)) : 0;
      const power = throttle > 0 ? Math.max(throttle, speed * .82) : 0, ramp = (param, value, time = .15) => { param.cancelScheduledValues(now); param.setTargetAtTime(value, now, time / 3); };
      ramp(e.hum.frequency, 42 + power * 24); ramp(e.body.frequency, 84 + power * 48);
      ramp(e.filter.frequency, 95 + power * 95);
      ramp(e.humGain.gain, power > .01 ? .045 + power * .105 : .001);
      ramp(e.bodyGain.gain, power > .01 ? .018 + power * .055 : .001);
      ramp(e.noiseGain.gain, power > .01 ? .012 + power * .052 : .001);
      ramp(e.lfo.frequency, 3 + power * 3.2); ramp(e.lfoGain.gain, power > .01 ? .003 + power * .012 : 0);
      ramp(e.throb.frequency, 2.4 + power * 2.8); ramp(e.throbGain.gain, power > .01 ? .012 + power * .018 : 0);
      ramp(e.whine.frequency, 240 + power * 140); ramp(e.whineGain.gain, !isSilent && power > .7 ? .004 + (power - .7) * .012 : .001);
    }
    initMagnetarHum() {
      if (!this.ctx || this.magnetarHum) return;
      const c = this.ctx, out = this.spatialPan(0) || this.master;
      const base = c.createOscillator(), overtone = c.createOscillator();
      const gain = c.createGain(), baseGain = c.createGain(), overtoneGain = c.createGain();
      const lfo = c.createOscillator(), lfoGain = c.createGain();
      base.type = "sawtooth"; base.frequency.value = 55;
      overtone.type = "sawtooth"; overtone.frequency.value = 110;
      baseGain.gain.value = 0.72; overtoneGain.gain.value = 0.28;
      gain.gain.value = 0.0001;
      lfo.type = "sine"; lfo.frequency.value = 2.2; lfoGain.gain.value = 0.2;
      lfo.connect(lfoGain).connect(gain.gain);
      base.connect(baseGain).connect(gain); overtone.connect(overtoneGain).connect(gain);
      gain.connect(out); base.start(); overtone.start(); lfo.start();
      this.magnetarHum = { base, overtone, gain, lfo, lfoGain, out };
    }
    updateMagnetarHum(intensity = 0, pan = 0) {
      if (!this.ctx || !this.enabled) return;
      this.initMagnetarHum();
      const h = this.magnetarHum;
      if (!h) return;
      const now = this.ctx.currentTime, level = Math.max(0, Math.min(1, Number.isFinite(intensity) ? intensity : 0));
      h.gain.gain.setTargetAtTime(level > 0 ? 0.014 + level * 0.075 : 0.0001, now, 0.12);
      h.lfoGain.gain.setTargetAtTime(level * 0.009, now, 0.12);
      if (h.out.pan) h.out.pan.setTargetAtTime(Math.max(-1, Math.min(1, Number.isFinite(pan) ? pan : 0)), now, 0.16);
    }
    playRelayActivation() {
      if (!this.enabled || !this.ctx) return;
      [[440, 880, 0], [554, 1108, .07], [659, 1318, .14], [880, 1760, .21]].forEach(([freq, end, delay]) => {
        this.tone({ freq, end, duration: .34, type: "sine", volume: .095, delay });
      });
    }
    playMagnetarLock(pan = 0, distNorm = 0) {
      if (!this.enabled || !this.ctx) return;
      const c = this.ctx, now = c.currentTime, out = this.spatialPan(pan) || this.master;
      if (out !== this.master) setTimeout(() => out.disconnect(), 1250);
      const carrier = c.createOscillator(), mod = c.createOscillator(), modGain = c.createGain();
      const filter = c.createBiquadFilter(), gain = c.createGain();
      carrier.type = "sawtooth"; carrier.frequency.setValueAtTime(180, now);
      carrier.frequency.exponentialRampToValueAtTime(920, now + 0.9);
      mod.type = "square"; mod.frequency.value = 47; modGain.gain.value = 110;
      mod.connect(modGain).connect(carrier.frequency);
      filter.type = "bandpass"; filter.frequency.value = 1250; filter.Q.value = 2.4;
      const volume = 0.095 * (1 - Math.max(0, Math.min(1, distNorm)) * 0.45);
      gain.gain.setValueAtTime(0.001, now); gain.gain.linearRampToValueAtTime(volume, now + 0.08);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.95);
      carrier.connect(filter).connect(gain).connect(out);
      carrier.start(now); mod.start(now); carrier.stop(now + 1); mod.stop(now + 1);
      this.tone({ freq: 2400, end: 620, duration: 0.13, type: "square", volume: 0.035, delay: 0.11 });
      this.tone({ freq: 1900, end: 480, duration: 0.1, type: "square", volume: 0.025, delay: 0.38 });
    }
    playMagnetarDischarge() {
      if (!this.enabled || !this.ctx) return;
      this.tone({ freq: 1850, end: 420, duration: 0.11, type: "square", volume: 0.2 });
      this.tone({ freq: 740, end: 55, duration: 0.72, type: "sawtooth", volume: 0.24, delay: 0.025 });
      this.tone({ freq: 330, end: 35, duration: 0.9, type: "triangle", volume: 0.16, delay: 0.06 });
    }
    tone({
      freq = 300,
      end = 100,
      duration = 0.5,
      type = "sine",
      volume = 0.2,
      delay = 0,
    } = {}) {
      if (!this.enabled || !this.ctx) return;
      const c = this.ctx,
        now = c.currentTime + delay,
        o = c.createOscillator(),
        g = c.createGain(),
        f = c.createBiquadFilter();
      o.type = type;
      o.frequency.setValueAtTime(freq, now);
      o.frequency.exponentialRampToValueAtTime(
        Math.max(25, end),
        now + duration,
      );
      f.type = "lowpass";
      f.frequency.value = 2200;
      g.gain.setValueAtTime(0.001, now);
      g.gain.exponentialRampToValueAtTime(volume, now + 0.025);
      g.gain.exponentialRampToValueAtTime(0.001, now + duration);
      o.connect(f).connect(g).connect(this.master);
      o.start(now);
      o.stop(now + duration + 0.04);
    }
    ping() {
      const t = performance.now();
      if (t - this.pingAt < 750) return;
      this.pingAt = t;
      this.tone({
        freq: 1150,
        end: 280,
        duration: 1.25,
        type: "sine",
        volume: 0.22,
      });
      this.tone({
        freq: 320,
        end: 90,
        duration: 1.1,
        type: "sine",
        volume: 0.12,
        delay: 0.08,
      });
    }
    playPingEmit() {
      if (!this.enabled || !this.ctx) return;
      this.tone({ freq: 1150, end: 280, duration: 1.05, type: "sine", volume: 0.22 });
      this.tone({ freq: 320, end: 90, duration: 0.9, type: "sine", volume: 0.12, delay: 0.06 });
    }
    scheduleEcho(delaySec = 0, pan = 0, distNorm = 0, kind = "STONE") {
      if (!this.enabled || !this.ctx) return;
      const safeDelay = Number.isFinite(delaySec) ? Math.max(0, Math.min(2, delaySec)) : 0;
      const safePan = Number.isFinite(pan) ? Math.max(-1, Math.min(1, pan)) : 0;
      const safeDistance = Number.isFinite(distNorm) ? Math.max(0, Math.min(1, distNorm)) : 1;
      const c = this.ctx, start = c.currentTime + safeDelay;
      const panner = this.spatialPan(safePan), out = panner || this.master;
      if (panner) setTimeout(() => panner.disconnect(), (safeDelay + 0.5) * 1000);
      const tones = {
        STONE: [720, "sine"], MINE: [390, "triangle"], FLESH: [210, "sawtooth"],
        BEACON: [960, "sine"], BATTERY: [1120, "triangle"], PYLON: [1380, "sine"],
      };
      const [freq, type] = tones[kind] || tones.STONE;
      const osc = c.createOscillator(), filter = c.createBiquadFilter(), gain = c.createGain();
      const volume = Math.max(0, Math.min(0.12, 0.12 * (1 - safeDistance * 0.72)));
      osc.type = type; osc.frequency.setValueAtTime(freq, start);
      filter.type = "bandpass"; filter.frequency.value = freq; filter.Q.value = 5;
      gain.gain.setValueAtTime(0.001, start);
      gain.gain.linearRampToValueAtTime(Number.isFinite(volume) ? volume : 0, start + 0.018);
      gain.gain.exponentialRampToValueAtTime(0.001, start + 0.22);
      osc.connect(filter).connect(gain).connect(out);
      osc.start(start); osc.stop(start + 0.25);
    }
    spatialPan(pan) {
      if (!this.ctx) return null;
      const node = this.ctx.createStereoPanner();
      node.pan.value = Number.isFinite(pan) ? Math.max(-1, Math.min(1, pan)) : 0;
      node.connect(this.master);
      return node;
    }
    playCreatureEcho(delaySec = 0, pan = 0, distNorm = 0) {
      if (!this.enabled || !this.ctx) return;
      const c = this.ctx, now = c.currentTime + Math.max(0, delaySec);
      const osc = c.createOscillator(), lfo = c.createOscillator();
      const vibrato = c.createGain(), filter = c.createBiquadFilter();
      const gain = c.createGain(), panner = this.spatialPan(pan);
      if (panner) setTimeout(() => panner.disconnect(), 700);
      const volume = 0.12 * (1 - Math.min(1, distNorm) * 0.78);
      osc.type = "sawtooth";
      osc.frequency.setValueAtTime(220, now);
      lfo.frequency.value = 12;
      vibrato.gain.value = 7;
      filter.type = "lowpass";
      filter.frequency.value = 460;
      gain.gain.setValueAtTime(0.001, now);
      gain.gain.linearRampToValueAtTime(volume, now + 0.035);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.52);
      lfo.connect(vibrato).connect(osc.frequency);
      osc.connect(filter).connect(gain).connect(panner || this.master);
      lfo.start(now); osc.start(now); osc.stop(now + 0.56); lfo.stop(now + 0.56);
    }
    playCreatureVocalization(type, pan = 0, distNorm = 0) {
      if (!this.enabled || !this.ctx) return;
      if (type === "HUNTER") return this.playMagnetarLock(pan, distNorm);
      const c = this.ctx, now = c.currentTime, panner = this.spatialPan(pan);
      if (panner) setTimeout(() => panner.disconnect(), 1500);
      const out = panner || this.master, distanceGain = 1 - Math.min(1, distNorm) * 0.72;
      const voice = (freq, end, duration, wave, volume, filterHz, start = now) => {
        const o = c.createOscillator(), f = c.createBiquadFilter(), g = c.createGain();
        o.type = wave; o.frequency.setValueAtTime(freq, start);
        o.frequency.exponentialRampToValueAtTime(Math.max(20, end), start + duration);
        f.type = "lowpass"; f.frequency.value = filterHz;
        g.gain.setValueAtTime(0.001, start);
        g.gain.linearRampToValueAtTime(volume * distanceGain, start + 0.02);
        g.gain.exponentialRampToValueAtTime(0.001, start + duration);
        o.connect(f).connect(g).connect(out); o.start(start); o.stop(start + duration + 0.03);
      };
      if (type === "LISTENER") {
        for (let i = 0; i < 7; i++) voice(1750 + (i % 2) * 210, 900, 0.055, "square", 0.055, 3200, now + i * 0.075);
      } else if (type === "LURKER") {
        voice(1320, 820, 0.9, "sine", 0.075, 2800);
        voice(1980, 1460, 0.75, "triangle", 0.035, 3400);
      }
    }
    playDecoyPing(pan = 0, distNorm = 0) {
      if (!this.enabled || !this.ctx) return;
      const c = this.ctx, now = c.currentTime, out = this.spatialPan(pan) || this.master;
      if (out !== this.master) setTimeout(() => out.disconnect(), 500);
      [[920, 0], [1380, 0.14]].forEach(([freq, delay]) => {
        const o = c.createOscillator(), f = c.createBiquadFilter(), g = c.createGain();
        const start = now + delay;
        const safeDistance = Number.isFinite(distNorm) ? Math.max(0, Math.min(1, distNorm)) : 1;
        const volume = Math.max(0, Math.min(1, 0.1 * (1 - safeDistance * 0.7)));
        o.type = "sine"; o.frequency.value = freq;
        f.type = "bandpass"; f.frequency.value = freq; f.Q.value = 7;
        g.gain.setValueAtTime(0.001, start);
        g.gain.linearRampToValueAtTime(Number.isFinite(volume) ? volume : 0, start + 0.018);
        g.gain.exponentialRampToValueAtTime(0.001, start + 0.24);
        o.connect(f).connect(g).connect(out); o.start(start); o.stop(start + 0.27);
      });
    }
    contact() {
      this.tone({
        freq: 520,
        end: 180,
        duration: 0.25,
        type: "triangle",
        volume: 0.18,
      });
      this.tone({
        freq: 420,
        end: 130,
        duration: 0.32,
        type: "triangle",
        volume: 0.16,
        delay: 0.3,
      });
    }
    hit() {
      this.tone({
        freq: 150,
        end: 35,
        duration: 0.65,
        type: "sawtooth",
        volume: 0.35,
      });
    }
    mineExplosion() {
      this.tone({ freq: 92, end: 28, duration: 0.85, type: "sawtooth", volume: 0.46 });
      this.tone({ freq: 620, end: 80, duration: 0.48, type: "triangle", volume: 0.3, delay: 0.03 });
      this.tone({ freq: 1250, end: 180, duration: 0.22, type: "square", volume: 0.12, delay: 0.02 });
    }
    creatureImpact() {
      this.tone({ freq: 105, end: 32, duration: 0.72, type: "triangle", volume: 0.42 });
      this.tone({ freq: 740, end: 115, duration: 0.34, type: "sawtooth", volume: 0.16, delay: 0.04 });
    }
    creatureRattle() {
      for (let i = 0; i < 6; i++) this.tone({ freq: 1750 + (i % 2) * 240, end: 1100, duration: 0.07, type: "square", volume: 0.075, delay: i * 0.08 });
    }
    stalkerTick(distNorm = 0) {
      const d = Math.max(0, Math.min(1, distNorm));
      this.tone({ freq: 220 + (1-d)*180, end: 125, duration: 0.13, type: "triangle", volume: 0.06 + (1-d)*0.06 });
    }
    stalkerScreech() {
      this.tone({ freq: 1480, end: 530, duration: 0.38, type: "sawtooth", volume: 0.12 });
    }
    implosion() {
      this.tone({
        freq: 72,
        end: 24,
        duration: 2.1,
        type: "sawtooth",
        volume: 0.48,
      });
      this.tone({
        freq: 38,
        end: 25,
        duration: 2.6,
        type: "sine",
        volume: 0.38,
        delay: 0.12,
      });
      this.tone({
        freq: 210,
        end: 42,
        duration: 1.1,
        type: "triangle",
        volume: 0.22,
        delay: 0.18,
      });
    }
    decoy() {
      this.tone({
        freq: 230,
        end: 760,
        duration: 0.35,
        type: "triangle",
        volume: 0.24,
      });
      this.tone({
        freq: 900,
        end: 240,
        duration: 0.7,
        type: "sine",
        volume: 0.13,
        delay: 0.12,
      });
    }
    lowBatteryWarning() {
      this.tone({ freq: 720, end: 540, duration: 0.16, type: "sine", volume: 0.045 });
    }
    toggle() {
      if (!this.ctx) return;
      this.enabled = !this.enabled;
      if (this.master)
        this.master.gain.setTargetAtTime(
          this.enabled ? 0.42 : 0.0001,
          this.ctx.currentTime,
          0.08,
        );
    }
  }
  window.GameAudio = new AudioEngine();
})();
