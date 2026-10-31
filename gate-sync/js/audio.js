/**
 * Gate Sync — Web Audio SFX (oscillator / noise only, no external files)
 */
(function (global) {
  'use strict';

  let ctx = null;
  let master = null;
  let muted = false;
  let unlocked = false;

  function ensureCtx() {
    if (ctx) return ctx;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = muted ? 0 : 0.35;
    master.connect(ctx.destination);
    return ctx;
  }

  function unlock() {
    const c = ensureCtx();
    if (!c) return false;
    if (c.state === 'suspended') {
      c.resume();
    }
    unlocked = true;
    return true;
  }

  function setMuted(m) {
    muted = !!m;
    if (master) master.gain.value = muted ? 0 : 0.35;
  }

  function isMuted() {
    return muted;
  }

  function isUnlocked() {
    return unlocked;
  }

  function tone(freq, type, dur, startGain, endGain, when) {
    const c = ensureCtx();
    if (!c || !unlocked || muted) return;
    const t0 = when != null ? when : c.currentTime;
    const osc = c.createOscillator();
    const g = c.createGain();
    osc.type = type || 'square';
    osc.frequency.setValueAtTime(freq, t0);
    g.gain.setValueAtTime(startGain == null ? 0.2 : startGain, t0);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0001, endGain == null ? 0.001 : endGain), t0 + dur);
    osc.connect(g);
    g.connect(master);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  }

  function noiseBurst(dur, startGain) {
    const c = ensureCtx();
    if (!c || !unlocked || muted) return;
    const t0 = c.currentTime;
    const len = Math.floor(c.sampleRate * dur);
    const buf = c.createBuffer(1, len, c.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = c.createBufferSource();
    src.buffer = buf;
    const g = c.createGain();
    const f = c.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 800;
    g.gain.setValueAtTime(startGain || 0.25, t0);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    src.connect(f);
    f.connect(g);
    g.connect(master);
    src.start(t0);
    src.stop(t0 + dur + 0.02);
  }

  const SFX = {
    'sfx-tap': function () {
      tone(880, 'square', 0.05, 0.18, 0.001);
    },
    'sfx-move': function () {
      tone(180, 'sine', 0.04, 0.06, 0.001);
    },
    'sfx-gate-ok': function () {
      const c = ensureCtx();
      if (!c || !unlocked || muted) return;
      const t0 = c.currentTime;
      tone(523.25, 'sine', 0.1, 0.16, 0.001, t0);
      tone(783.99, 'sine', 0.12, 0.14, 0.001, t0 + 0.08);
    },
    'sfx-fail': function () {
      noiseBurst(0.12, 0.28);
      tone(110, 'sawtooth', 0.12, 0.2, 0.001);
    },
    'sfx-clear': function () {
      const c = ensureCtx();
      if (!c || !unlocked || muted) return;
      const t0 = c.currentTime;
      tone(392, 'sine', 0.12, 0.16, 0.001, t0);
      tone(523.25, 'sine', 0.12, 0.16, 0.001, t0 + 0.12);
      tone(659.25, 'sine', 0.18, 0.18, 0.001, t0 + 0.24);
    },
    'sfx-lock': function () {
      const c = ensureCtx();
      if (!c || !unlocked || muted) return;
      const t0 = c.currentTime;
      tone(440, 'triangle', 0.1, 0.14, 0.001, t0);
      tone(554.37, 'triangle', 0.1, 0.12, 0.001, t0);
      tone(659.25, 'triangle', 0.12, 0.1, 0.001, t0 + 0.02);
    }
  };

  function play(id) {
    if (SFX[id]) SFX[id]();
  }

  global.GateSyncAudio = {
    unlock: unlock,
    setMuted: setMuted,
    isMuted: isMuted,
    isUnlocked: isUnlocked,
    play: play
  };
})(typeof window !== 'undefined' ? window : globalThis);
