/* MOST LIKELY — audio
   All sound is synthesized with WebAudio. No asset files.
   Cozy, quiet, beep beep boop boop. */

'use strict';

const Audio2 = (() => {
  let ctx = null;
  let master = null;
  let musicGain = null;
  let muted = false;
  let musicTimer = null;
  let step = 0;

  function ensure() {
    if (ctx) return;
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    master = ctx.createGain();
    master.gain.value = 0.5;
    master.connect(ctx.destination);
    musicGain = ctx.createGain();
    musicGain.gain.value = 0.16;
    musicGain.connect(master);
  }

  function tone(freq, dur, { type = 'triangle', gain = 0.2, at = 0, dest = null, slideTo = null } = {}) {
    if (!ctx || muted) return;
    const t0 = ctx.currentTime + at;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(gain, t0 + 0.015);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(g);
    g.connect(dest || master);
    osc.start(t0);
    osc.stop(t0 + dur + 0.05);
  }

  /* Gentle pentatonic music box, slow and low. */
  const SCALE = [220, 261.63, 293.66, 329.63, 392, 440, 523.25];
  const PATTERN = [0, 4, 2, 5, 1, 4, 3, 6, 0, 4, 2, 5, 3, 1, 4, 2];

  function musicTick() {
    if (!ctx || muted) return;
    const n = PATTERN[step % PATTERN.length];
    tone(SCALE[n], 0.9, { type: 'sine', gain: 0.5, dest: musicGain });
    if (step % 4 === 0) tone(SCALE[n] / 2, 1.4, { type: 'triangle', gain: 0.25, dest: musicGain });
    if (step % 8 === 6) tone(SCALE[(n + 2) % 7] * 2, 0.35, { type: 'sine', gain: 0.12, dest: musicGain });
    step++;
  }

  return {
    start() {
      ensure();
      if (ctx.state === 'suspended') ctx.resume();
      if (!musicTimer) musicTimer = setInterval(musicTick, 620);
    },
    setMuted(m) {
      muted = m;
      if (master) master.gain.value = m ? 0 : 0.5;
    },
    isMuted: () => muted,
    /* soft "filed" blip */
    blip() { tone(660, 0.09, { type: 'square', gain: 0.06 }); tone(990, 0.12, { type: 'square', gain: 0.05, at: 0.06 }); },
    /* blocked placement */
    buzz() { tone(160, 0.18, { type: 'sawtooth', gain: 0.07 }); tone(110, 0.16, { type: 'sawtooth', gain: 0.06, at: 0.02 }); },
    /* QC thumbs */
    yes() { tone(523, 0.1, { type: 'triangle', gain: 0.12 }); tone(784, 0.16, { type: 'triangle', gain: 0.12, at: 0.09 }); },
    no() { tone(220, 0.22, { type: 'triangle', gain: 0.12 }); tone(185, 0.26, { type: 'triangle', gain: 0.1, at: 0.12 }); },
    /* deployment siren */
    siren() {
      for (let i = 0; i < 3; i++) {
        tone(620, 0.42, { type: 'square', gain: 0.08, at: i * 0.9 });
        tone(470, 0.42, { type: 'square', gain: 0.08, at: i * 0.9 + 0.45 });
      }
    },
    stamp() { tone(90, 0.16, { type: 'square', gain: 0.16 }); tone(60, 0.22, { type: 'square', gain: 0.12, at: 0.03 }); },
    ding() { tone(880, 0.12, { type: 'sine', gain: 0.1 }); tone(1174, 0.2, { type: 'sine', gain: 0.08, at: 0.08 }); },
    send() { tone(740, 0.1, { type: 'sine', gain: 0.08, slideTo: 1100 }); },
    powerDown() {
      tone(440, 1.6, { type: 'sawtooth', gain: 0.1, slideTo: 40 });
      tone(330, 1.9, { type: 'triangle', gain: 0.08, at: 0.1, slideTo: 30 });
    }
  };
})();
