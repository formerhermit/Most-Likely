/* MOST LIKELY — audio
   Sound effects are synthesized with WebAudio. Phase music is three real
   tracks (assets/audio/), crossfaded on phase change. */

'use strict';

const Audio2 = (() => {
  let ctx = null;
  let master = null;
  let muted = false;

  /* phase music: one <audio> per track, crossfaded between phases */
  const TRACKS = {
    era1: 'assets/audio/sort-it-out.mp3',   // training + QC — "Sort It Out"
    era2: 'assets/audio/best-guess.mp3',    // inference — "Best Guess"
    end:  'assets/audio/thank-you.mp3'      // deprecation + end screen — "Thank You"
  };
  const MUSIC_VOLUME = 0.32;
  const FADE_MS = 1400;

  const players = {};   // name -> HTMLAudioElement
  let currentPhase = null;
  let fadeTimers = [];

  function ensurePlayers() {
    if (players.era1) return;
    for (const [name, src] of Object.entries(TRACKS)) {
      const a = new Audio(src);
      a.loop = true;
      a.preload = 'auto';
      a.volume = 0;
      players[name] = a;
    }
  }

  function clearFades() {
    fadeTimers.forEach(clearInterval);
    fadeTimers = [];
  }

  function fade(audio, from, to, ms, onDone) {
    const steps = Math.max(1, Math.round(ms / 60));
    let i = 0;
    audio.volume = from;
    const id = setInterval(() => {
      i++;
      audio.volume = from + (to - from) * (i / steps);
      if (i >= steps) {
        audio.volume = to;
        clearInterval(id);
        fadeTimers = fadeTimers.filter(t => t !== id);
        if (onDone) onDone();
      }
    }, ms / steps);
    fadeTimers.push(id);
  }

  function ensure() {
    if (ctx) return;
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    master = ctx.createGain();
    master.gain.value = 0.5;
    master.connect(ctx.destination);
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

  /* Crossfade from whatever phase track is playing to `name`. Safe to call
     repeatedly with the same name — it's a no-op once that track is live. */
  function playPhase(name) {
    ensurePlayers();
    if (currentPhase === name) return;
    const prevName = currentPhase;
    currentPhase = name;
    clearFades();

    const incoming = players[name];
    const target = muted ? 0 : MUSIC_VOLUME;
    if (incoming.paused) {
      incoming.currentTime = 0;
      incoming.play().catch(() => {});
    }
    fade(incoming, incoming.volume, target, FADE_MS);

    if (prevName && players[prevName]) {
      const outgoing = players[prevName];
      fade(outgoing, outgoing.volume, 0, FADE_MS, () => outgoing.pause());
    }
  }

  return {
    start() {
      ensure();
      if (ctx.state === 'suspended') ctx.resume();
      ensurePlayers();
    },
    playPhase,
    setMuted(m) {
      muted = m;
      if (master) master.gain.value = m ? 0 : 0.5;
      if (currentPhase && players[currentPhase] && !fadeTimers.length) {
        players[currentPhase].volume = m ? 0 : MUSIC_VOLUME;
      }
    },
    isMuted: () => muted,
    /* soft "filed" blip */
    blip() { tone(660, 0.09, { type: 'square', gain: 0.06 }); tone(990, 0.12, { type: 'square', gain: 0.05, at: 0.06 }); },
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
