/* MOST LIKELY — audio
   Sound effects are synthesized with WebAudio. Phase music is three real
   tracks (assets/audio/), crossfaded on phase change. */

'use strict';

const Audio2 = (() => {
  let ctx = null;
  let master = null;
  /* Music and effects get a gain node each, both feeding `master`, so they
     can be silenced independently (issue #70). They are genuinely different
     things to want off: the tracks are the thing someone listening to their
     own music turns off, and the blips are the thing that carries the
     act's feedback — the correct-answer tone climbs a semitone per streak,
     which is information, not decoration. */
  let musicGain = null;
  let sfxGain = null;
  let musicMuted = false;
  let sfxMuted = false;

  /* phase music: one <audio> per track, crossfaded between phases */
  const TRACKS = {
    intro: 'assets/audio/the-last-atom.mp3', // opening zoom — "The Last Atom"
    era1: 'assets/audio/sort-it-out.mp3',   // training + QC — "Sort It Out"
    era2: 'assets/audio/best-guess.mp3',    // inference — "Best Guess"
    end:  'assets/audio/thank-you.mp3'      // deprecation + end screen — "Thank You"
  };
  // doubled from the perceived-loudness target (0.32) because every track
  // now routes through `master`, which sits at 0.5 — see ensurePlayers()
  const MUSIC_VOLUME = 0.64;
  const FADE_MS = 1400;

  const players = {};   // name -> HTMLAudioElement
  let currentPhase = null;
  let fadeTimers = [];

  /* Every phase track is routed through the same `master` gain node the
     synthesized SFX use, so one mute switch silences both. Previously the
     tracks played straight to the speakers with their own independent
     .volume, untouched by mute except in the narrow window between
     crossfades — which is why mute read as broken (#46): most of a
     session, some track is either fading or freshly settled, and the old
     code only poked the current track's volume when no fade was running. */
  function ensurePlayers() {
    if (players.intro) return;
    ensure();
    for (const [name, src] of Object.entries(TRACKS)) {
      const a = new Audio(src);
      a.loop = name !== 'intro';
      a.preload = 'auto';
      a.volume = 0;
      players[name] = a;
      ctx.createMediaElementSource(a).connect(musicGain);
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
    // the two buses. Both sit at 1 and only ever move to 0, so the levels
    // that were tuned against `master` at 0.5 are unchanged
    musicGain = ctx.createGain();
    musicGain.gain.value = musicMuted ? 0 : 1;
    musicGain.connect(master);
    sfxGain = ctx.createGain();
    sfxGain.gain.value = sfxMuted ? 0 : 1;
    sfxGain.connect(master);
  }

  function tone(freq, dur, { type = 'triangle', gain = 0.2, at = 0, dest = null, slideTo = null } = {}) {
    if (!ctx || sfxMuted) return;
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
    g.connect(dest || sfxGain);
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
    // always fades to full: muting is the music bus's job, not the
    // crossfade's, so a track muted mid-fade comes back at the right level
    const target = MUSIC_VOLUME;
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
    /* Two switches, one per bus. Each is instant and correct regardless of
       whether a crossfade happens to be running, which is what the single
       master switch bought when it replaced poking each track's own volume
       (#46) — the split keeps that property. */
    setMusicMuted(m) {
      musicMuted = m;
      if (musicGain) musicGain.gain.value = m ? 0 : 1;
    },
    isMusicMuted: () => musicMuted,
    setSfxMuted(m) {
      sfxMuted = m;
      if (sfxGain) sfxGain.gain.value = m ? 0 : 1;
    },
    isSfxMuted: () => sfxMuted,
    /* soft "filed" blip */
    blip() { tone(660, 0.09, { type: 'square', gain: 0.06 }); tone(990, 0.12, { type: 'square', gain: 0.05, at: 0.06 }); },
    /* thumbs up — `step` raises the pitch a semitone per consecutive
       correct answer (capped an octave up), so a streak audibly climbs */
    yes(step = 0) {
      const m = Math.pow(1.0595, Math.min(step, 12));
      tone(523 * m, 0.1, { type: 'triangle', gain: 0.12 });
      tone(784 * m, 0.16, { type: 'triangle', gain: 0.12, at: 0.09 });
    },
    no() { tone(220, 0.22, { type: 'triangle', gain: 0.12 }); tone(185, 0.26, { type: 'triangle', gain: 0.1, at: 0.12 }); },
    /* deployment siren */
    siren() {
      for (let i = 0; i < 3; i++) {
        tone(620, 0.42, { type: 'square', gain: 0.08, at: i * 0.9 });
        tone(470, 0.42, { type: 'square', gain: 0.08, at: i * 0.9 + 0.45 });
      }
    },
    stamp() { tone(90, 0.16, { type: 'square', gain: 0.16 }); tone(60, 0.22, { type: 'square', gain: 0.12, at: 0.03 }); },
    /* the picked word landing in the sentence. Deliberately lighter and a
       little higher than stamp(): that one is the document being finished,
       this one is a paper tag pressed into a line, and they must not read
       as the same event. Short enough to sit under yes()/no() without
       muddying the verdict that follows it. */
    thunk() { tone(164, 0.07, { type: 'square', gain: 0.09 }); tone(104, 0.1, { type: 'triangle', gain: 0.08, at: 0.02 }); },
    ding() { tone(880, 0.12, { type: 'sine', gain: 0.1 }); tone(1174, 0.2, { type: 'sine', gain: 0.08, at: 0.08 }); },
    send() { tone(740, 0.1, { type: 'sine', gain: 0.08, slideTo: 1100 }); },
    powerDown() {
      tone(440, 1.6, { type: 'sawtooth', gain: 0.1, slideTo: 40 });
      tone(330, 1.9, { type: 'triangle', gain: 0.08, at: 0.1, slideTo: 30 });
    }
  };
})();
