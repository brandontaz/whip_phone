// PHONE SOUNDS — ringtones, the message tone and notification sounds, made in the page (Josh, 12 Oct 2026).
//
// No audio files: a small Web Audio synth plays each sound from a score, notes on a voice or two. RINGTONES ring a call
// in, round and round until it is answered, declined or missed: each is TEN SECONDS made to run straight back into its
// own start (Josh, 13 Oct 2026), so it plays on with no gap at the seam. ALERTS are the message tone and the
// notification sound. Calling out, the caller hears RINGBACK (the line ringing) until it is answered. The SIM keeps which
// ringtone, which tones and how loud (Settings → Sounds; whip_phone:settings:save), so they go wherever the SIM goes, and
// the server sends them with each call and text it rings in, in case this page has not had the SIM's session yet.
//
// TUNING BY EAR (they are heard in game): MASTER is the whole phone's level, each sound's and each part's `gain` its own,
// and each voice's numbers (decays, overtones) its colour. Heard by the person holding the phone, nobody else.

const MASTER = 0.55;              // the whole phone at full volume (0-1)
const RING_MAX_S = 60;            // a ringtone or ringback never goes on longer than this, whatever happens to the call

let ctx = null, out = null;
/** The audio context, made the first time a sound plays (and woken if the browser put it to sleep). */
function audio() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    // A gentle limiter: a chord, or a tone over the ringtone, never clips.
    const lim = ctx.createDynamicsCompressor();
    lim.threshold.value = -10; lim.knee.value = 6; lim.ratio.value = 8; lim.attack.value = 0.002; lim.release.value = 0.15;
    out = ctx.createGain();
    out.connect(lim); lim.connect(ctx.destination);
  }
  if (ctx.state === 'suspended') ctx.resume().catch(() => {});
  return ctx;
}

const hz = (m) => 440 * Math.pow(2, (m - 69) / 12);

/** An envelope: from silence to `peak` in `attack` seconds, then down to silence over `decay`. */
function env(param, t, peak, attack, decay) {
  param.setValueAtTime(0.0001, t);
  param.exponentialRampToValueAtTime(Math.max(0.0002, peak), t + attack);
  param.exponentialRampToValueAtTime(0.0001, t + attack + decay);
}

function osc(type, f, t, stop) {
  const o = ctx.createOscillator();
  o.type = type; o.frequency.setValueAtTime(f, t);
  o.start(t); o.stop(stop);
  return o;
}

function noiseBuffer() {
  if (noiseBuffer.b) return noiseBuffer.b;
  const b = ctx.createBuffer(1, ctx.sampleRate * 0.25, ctx.sampleRate);
  const d = b.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  return (noiseBuffer.b = b);
}

// ---------------------------------------------------------------- voices: (bus, t, f, dur, vel) schedule one note
const VOICES = {
  /** a wooden bar: the fundamental, a quick 4th partial for its knock */
  marimba(bus, t, f, dur, vel) {
    const g1 = ctx.createGain(), g2 = ctx.createGain();
    env(g1.gain, t, vel * 0.55, 0.004, 0.5);
    env(g2.gain, t, vel * 0.16, 0.002, 0.09);
    osc('sine', f, t, t + 0.7).connect(g1).connect(bus);
    osc('sine', f * 3.93, t, t + 0.2).connect(g2).connect(bus);
  },
  /** a struck bell (FM: an inharmonic modulator that dies away first) */
  bell(bus, t, f, dur, vel) {
    const car = osc('sine', f, t, t + 2.2), mod = osc('sine', f * 3.5, t, t + 2.2);
    const depth = ctx.createGain(), g = ctx.createGain();
    depth.gain.setValueAtTime(f * 2.2, t);
    depth.gain.exponentialRampToValueAtTime(f * 0.05, t + 1.2);
    mod.connect(depth).connect(car.frequency);
    env(g.gain, t, vel * 0.32, 0.003, Math.max(0.15, dur) * 6);
    car.connect(g).connect(bus);
  },
  /** a plucked string: bright, then darker as it rings */
  pluck(bus, t, f, dur, vel) {
    const lp = ctx.createBiquadFilter(), g = ctx.createGain();
    lp.type = 'lowpass'; lp.Q.value = 3;
    lp.frequency.setValueAtTime(Math.min(12000, f * 7), t);
    lp.frequency.exponentialRampToValueAtTime(Math.max(80, f * 1.1), t + 0.3);
    env(g.gain, t, vel * 0.3, 0.003, 0.4);
    osc('sawtooth', f, t, t + 0.5).connect(lp).connect(g).connect(bus);
  },
  /** an old handset's square beep: held for its length, then off */
  chip(bus, t, f, dur, vel) {
    const lp = ctx.createBiquadFilter(), g = ctx.createGain();
    lp.type = 'lowpass'; lp.frequency.value = 5000;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vel * 0.11, t + 0.004);
    g.gain.setValueAtTime(vel * 0.11, t + Math.max(0.01, dur - 0.012));
    g.gain.linearRampToValueAtTime(0.0001, t + dur);
    osc('square', f, t, t + dur + 0.02).connect(lp).connect(g).connect(bus);
  },
  /** glass: a sine with two inharmonic overtones that fade fast */
  glass(bus, t, f, dur, vel) {
    [[1, 0.36, 0.9], [2.76, 0.12, 0.3], [5.4, 0.06, 0.12]].forEach(([r, a, d]) => {
      const g = ctx.createGain();
      env(g.gain, t, vel * a, 0.002, d);
      osc('sine', f * r, t, t + d + 0.05).connect(g).connect(bus);
    });
  },
  /** a knock on wood: a falling thump and a click of noise */
  wood(bus, t, f, dur, vel) {
    const o = osc('sine', f * 1.6, t, t + 0.15), g = ctx.createGain();
    o.frequency.exponentialRampToValueAtTime(f, t + 0.03);
    env(g.gain, t, vel * 0.6, 0.002, 0.09);
    o.connect(g).connect(bus);
    const n = ctx.createBufferSource(), bp = ctx.createBiquadFilter(), gn = ctx.createGain();
    n.buffer = noiseBuffer(); bp.type = 'bandpass'; bp.frequency.value = 2400; bp.Q.value = 1.2;
    env(gn.gain, t, vel * 0.25, 0.001, 0.025);
    n.connect(bp).connect(gn).connect(bus); n.start(t); n.stop(t + 0.05);
  },
  /** a bubble: a pitch that jumps up */
  pop(bus, t, f, dur, vel) {
    const o = osc('sine', f, t, t + 0.12), g = ctx.createGain();
    o.frequency.exponentialRampToValueAtTime(f * 2.6, t + 0.05);
    env(g.gain, t, vel * 0.5, 0.003, 0.08);
    o.connect(g).connect(bus);
  },
  /** the phone buzzing on a table: two low saws a little apart (their beat is the rattle), dull */
  buzz(bus, t, f, dur, vel) {
    const lp = ctx.createBiquadFilter(), g = ctx.createGain();
    lp.type = 'lowpass'; lp.frequency.value = 320; lp.Q.value = 0.7;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vel * 0.5, t + 0.03);
    g.gain.setValueAtTime(vel * 0.5, t + Math.max(0.04, dur - 0.04));
    g.gain.linearRampToValueAtTime(0.0001, t + dur);
    osc('sawtooth', 146, t, t + dur + 0.02).connect(lp);
    osc('sawtooth', 153, t, t + dur + 0.02).connect(lp);
    lp.connect(g).connect(bus);
  },
  /** the line ringing in the earpiece: two plain sines together, flat */
  line(bus, t, f, dur, vel) {
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vel * 0.14, t + 0.02);
    g.gain.setValueAtTime(vel * 0.14, t + dur - 0.02);
    g.gain.linearRampToValueAtTime(0.0001, t + dur);
    osc('sine', 440, t, t + dur + 0.02).connect(g);
    osc('sine', 480, t, t + dur + 0.02).connect(g);
    g.connect(bus);
  },
};

// ---------------------------------------------------------------- the scores
// A score: { label, gain, parts: [{ voice, gain, notes: [[seconds, midi, length?, velocity?], ...] }] }, or one part's
// `voice` and `notes` on the score itself; a ringtone has `every`, how long one go of it is (the next starts right
// there). MIDI 60 is middle C.
//
// TEN SECONDS EACH, SEAMLESS: four bars of four at 96 beats a minute (exactly 10 s), the harmony coming back round to
// where it started; or, for the bells and buzzes, four rings of two and a half seconds. Nothing is longer at the seam
// than inside: the last note leads into the first as any note into the next.
const LOOP = 10;                  // seconds: one go of a ringtone
const Q = LOOP / 16;              // a beat (four bars of four in ten seconds: 96 a minute)
const E = Q / 2, S = Q / 4;       // an eighth, a sixteenth

const N = (list) => list.map(([t, m, d = 0.18, v = 1]) => [t, m, d, v]);
/** a run of fast alternating notes, `count` of them `step` seconds apart, from `at` */
const trill = (at, a, b, count, step, d = step) => Array.from({ length: count }, (_, i) => [at + i * step, i % 2 ? b : a, d, 1]);
/** four bars, one chord each: fn(chord) answers [[step, midi, length?, velocity?], ...], `unit` seconds a step */
const bars = (chords, unit, fn) => chords.flatMap((c, b) => fn(c).map(([s, m, d = unit, v = 1]) => [b * 4 * Q + s * unit, m, d, v]));
/** four rings of 2.5 seconds, each fn()'s notes */
const rings = (fn) => [0, 1, 2, 3].flatMap((k) => fn().map(([t, m, d, v = 1]) => [k * 2.5 + t, m, d, v]));

// Marimba: E major, I-V-vi-IV, a syncopated sixteenth figure over a walking bass.
const MARIMBA = [
  { bass: 40, t: [64, 68, 71, 76, 80] },   // E
  { bass: 47, t: [63, 66, 71, 75, 78] },   // B
  { bass: 49, t: [64, 68, 73, 76, 80] },   // C#m
  { bass: 45, t: [64, 69, 73, 76, 81] },   // A
];
const MARIMBA_RIFF = [[0, 3], [2, 4], [3, 3], [4, 2], [6, 3], [7, 1], [8, 2], [10, 4], [11, 3], [12, 2], [13, 1], [14, 0]];   // [sixteenth, chord tone]
// Digital: A minor, i-VI-III-VII, an eighth-note handset tune over a square bass.
const DIGITAL = [
  { bass: 45, m: [76, 81, 84, 81, 76, 81, 83, 84] },   // Am
  { bass: 41, m: [77, 81, 84, 81, 77, 81, 84, 86] },   // F
  { bass: 48, m: [88, 86, 84, 79, 76, 79, 84, 88] },   // C
  { bass: 43, m: [86, 83, 79, 83, 86, 84, 83, 79] },   // G (back down into the Am)
];
// Chimes: C major, I-vi-IV-V, a bell on each beat and one between into the next bar, a low bell under each.
const CHIMES = [
  { root: 48, m: [67, 72, 76, 72] },   // C
  { root: 45, m: [64, 69, 72, 69] },   // Am
  { root: 41, m: [65, 69, 72, 69] },   // F
  { root: 43, m: [67, 71, 74, 71] },   // G
];
// Pulse: D minor, i-VI-III-VII, a plucked sixteenth ostinato and a pushing bass.
const PULSE = [
  { bass: 38, t: [62, 65, 69, 74] },   // Dm
  { bass: 34, t: [62, 65, 70, 74] },   // Bb
  { bass: 41, t: [60, 65, 69, 72] },   // F
  { bass: 36, t: [60, 64, 67, 72] },   // C
];
const PULSE_RIFF = [0, 2, 1, 3, 2, 1, 3, 2, 0, 2, 1, 3, 2, 3, 1, 2];
// Arcade: C major, I-V-vi-IV, eight-bit arpeggios over an octave-jumping bass.
const ARCADE = [
  { bass: 48, t: [72, 76, 79, 84] },   // C
  { bass: 43, t: [71, 74, 79, 83] },   // G
  { bass: 45, t: [72, 76, 81, 84] },   // Am
  { bass: 41, t: [72, 77, 81, 84] },   // F
];
const ARCADE_ARP = [0, 1, 2, 3, 2, 1, 0, 1, 2, 3, 2, 1, 0, 1, 2, 3];

export const RINGTONES = {
  marimba: { label: 'Marimba', every: LOOP, parts: [
    { voice: 'marimba', notes: bars(MARIMBA, S, (c) => MARIMBA_RIFF.map(([s, i]) => [s, c.t[i], 0.2])) },
    { voice: 'marimba', gain: 0.75, notes: bars(MARIMBA, S, (c) => [[0, c.bass, 0.4], [8, c.bass + 12, 0.4, 0.8]]) },
  ] },
  classic: { label: 'Classic', every: LOOP, gain: 0.9, parts: [
    { voice: 'chip', notes: rings(() => [...trill(0, 88, 91, 20, 0.045), ...trill(1.15, 88, 91, 20, 0.045)]) },
  ] },
  oldphone: { label: 'Old Phone', every: LOOP, gain: 0.5, parts: [
    { voice: 'bell', notes: rings(() => trill(0, 100, 101, 40, 0.04, 0.05)) },
  ] },
  digital: { label: 'Digital', every: LOOP, parts: [
    { voice: 'chip', notes: bars(DIGITAL, E, (c) => c.m.map((m, i) => [i, m, E * 0.8])) },
    { voice: 'chip', gain: 0.6, notes: bars(DIGITAL, Q, (c) => [0, 1, 2, 3].map((i) => [i, c.bass, Q * 0.45])) },
  ] },
  chimes: { label: 'Chimes', every: LOOP, gain: 0.8, parts: [
    { voice: 'bell', notes: bars(CHIMES, Q, (c) => [...c.m.map((m, i) => [i, m, 0.3]), [3.5, c.m[2] + 12, 0.2, 0.5]]) },
    { voice: 'bell', gain: 0.55, notes: bars(CHIMES, Q, (c) => [[0, c.root, 0.5]]) },
  ] },
  pulse: { label: 'Pulse', every: LOOP, parts: [
    { voice: 'pluck', gain: 0.6, notes: bars(PULSE, S, (c) => PULSE_RIFF.map((i, s) => [s, c.t[i] + 12, 0.15, s % 4 === 0 ? 1 : 0.7])) },
    { voice: 'pluck', gain: 0.9, notes: bars(PULSE, E, (c) => [0, 2, 3, 4, 6, 7].map((e) => [e, c.bass + 12, 0.25])) },
  ] },
  arcade: { label: 'Arcade', every: LOOP, parts: [
    { voice: 'chip', gain: 0.75, notes: bars(ARCADE, S, (c) => ARCADE_ARP.map((i, s) => [s, c.t[i], S * 0.8])) },
    { voice: 'chip', gain: 0.55, notes: bars(ARCADE, E, (c) => [0, 1, 2, 3, 4, 5, 6, 7].map((e) => [e, c.bass + (e % 2 ? 12 : 0), E * 0.6])) },
  ] },
  vibrate: { label: 'Vibrate only', every: LOOP, parts: [
    { voice: 'buzz', notes: rings(() => [[0, 0, 0.45], [0.65, 0, 0.45]]) },
  ] },
  silent: { label: 'Silent', notes: [] },
};

export const ALERTS = {
  note: { label: 'Note', voice: 'marimba', gain: 1, notes: N([[0, 84], [0.11, 91]]) },
  tritone: { label: 'Tri-tone', voice: 'bell', gain: 0.9, notes: N([[0, 79, 0.1], [0.12, 83, 0.1], [0.24, 88, 0.2]]) },
  ding: { label: 'Ding', voice: 'bell', gain: 1, notes: N([[0, 88, 0.25]]) },
  glass: { label: 'Glass', voice: 'glass', gain: 1, notes: N([[0, 93], [0.08, 100]]) },
  pop: { label: 'Pop', voice: 'pop', gain: 1, notes: N([[0, 64]]) },
  blip: { label: 'Blip', voice: 'chip', gain: 0.9, notes: N([[0, 96, 0.05], [0.07, 100, 0.06]]) },
  knock: { label: 'Knock', voice: 'wood', gain: 1, notes: N([[0, 55], [0.14, 55]]) },
  chord: { label: 'Chord', voice: 'pluck', gain: 0.8, notes: N([[0, 72], [0.01, 76], [0.02, 79], [0.03, 84]]) },
  vibrate: { label: 'Vibrate only', voice: 'buzz', gain: 1, notes: N([[0, 0, 0.22], [0.32, 0, 0.22]]) },
  none: { label: 'None', notes: [] },
};

/** the line ringing at the other end, as callers hear it in the game's America: two seconds on, four off */
const RINGBACK = { voice: 'line', every: 6.0, gain: 1, notes: [[0, 0, 2.0, 1]] };

/** What a SIM starts with (Config.Defaults on the server says the same; it wins when it says otherwise). */
export const SOUND_DEFAULTS = { ringtone: 'marimba', messageTone: 'note', notifyTone: 'ding', soundVolume: 75 };
export const SOUND_KEYS = Object.keys(SOUND_DEFAULTS);
export const VOLUMES = [25, 50, 75, 100];

/** A score's notes, every part's, in time order: [{ t, voice, m, f, d, v }]. Worked out once and kept on the score. */
export function notesOf(score) {
  if (!score) return [];
  if (score._notes) return score._notes;
  const parts = score.parts || [{ voice: score.voice, notes: score.notes || [] }];
  const list = [];
  for (const p of parts) {
    const g = (p.gain ?? 1) * (score.gain ?? 1);
    for (const [t, m, d = 0.18, v = 1] of p.notes) list.push({ t, voice: p.voice, m, f: m ? hz(m) : 0, d, v: v * g });
  }
  list.sort((a, b) => a.t - b.t);
  return (score._notes = list);
}

/** Cut a bus short: a quick fade (no click), then let it go. */
function cut(bus) {
  if (!bus || !ctx) return;
  const t = ctx.currentTime;
  try {
    bus.gain.cancelScheduledValues(t);
    bus.gain.setValueAtTime(bus.gain.value, t);
    bus.gain.linearRampToValueAtTime(0, t + 0.06);
  } catch (e) { /* already gone */ }
  setTimeout(() => { try { bus.disconnect(); } catch (e) { /* already gone */ } }, 120);
}

// Two seconds ahead: the page can be held up that long and the ringtone still plays on unbroken (the phone coming up for
// a call held a software-drawn test page up 1.2 s at a time). Stopping is still at once: a stop fades the whole bus,
// the notes already put down with it.
const AHEAD_S = 2.0;    // notes are put down this far ahead of their time...
const TICK_MS = 200;    // ...looked at this often
const TAIL_S = 2.5;     // the longest ring-out of any voice (the bell's): a finished player lets go after it

/**
 * Plays a score into its own bus, `passes` times back to back (Infinity: until stopped), each `every` seconds after the
 * last, for `maxS` at most. Notes are put down a little ahead of their time, a few at a time, so the beat is exact across
 * the seam however busy the page is, and stopping leaves nothing queued. A note the page fell too far behind for (it was
 * held up) is skipped, never bunched up with the next.
 */
class Player {
  constructor(score, passes, level, maxS = Infinity) {
    this.notes = notesOf(score); this.every = score.every || 0; this.passes = passes;
    this.bus = ctx.createGain(); this.bus.gain.value = level; this.bus.connect(out);
    this.t0 = ctx.currentTime + 0.03; this.pass = 0; this.i = 0; this.last = this.t0;
    this.until = this.t0 + maxS; this.over = false; this.timer = 0;
    this.fill();
    if (!this.over) this.timer = setInterval(() => this.fill(), TICK_MS);
  }
  fill() {
    const now = ctx.currentTime, horizon = now + AHEAD_S;
    if (!this.notes.length) { this.finish(); return; }
    while (!this.over) {
      if (this.i >= this.notes.length) {              // one go put down: the next starts where it ends
        this.pass++; this.i = 0; this.t0 += this.every;
        if (this.pass >= this.passes || !this.every) { this.finish(); return; }
        continue;
      }
      const n = this.notes[this.i], t = this.t0 + n.t;
      if (t >= this.until) { this.finish(); return; }
      if (t >= horizon) return;
      this.i++;
      if (t < now - 0.05) continue;
      const voice = VOICES[n.voice];
      if (voice) voice(this.bus, Math.max(t, now), n.f, n.d, n.v);
      this.last = Math.max(this.last, t + n.d);
    }
  }
  finish() {
    if (this.over) return;
    this.over = true;
    clearInterval(this.timer);
    const bus = this.bus;
    setTimeout(() => { try { bus.disconnect(); } catch (e) { /* already let go */ } }, Math.max(0, this.last - ctx.currentTime + TAIL_S) * 1000);
  }
  stop() {
    this.over = true;
    clearInterval(this.timer);
    cut(this.bus);
  }
  setLevel(l) { this.bus.gain.value = l; }
}

export class PhoneSounds {
  constructor() {
    this.prefs = { ...SOUND_DEFAULTS };
    this.loop = null;        // the ringtone's or the ringback's Player while it plays, and its kind
    this.loopKind = null;
    this.preview = null;     // Settings' Player while a pick is heard
  }

  /** Take the SIM's choices (a session's settings, or the sounds a call or text came with). Unknown ids are left. */
  setPrefs(p) {
    if (!p || typeof p !== 'object') return;
    if (RINGTONES[p.ringtone]) this.prefs.ringtone = p.ringtone;
    if (ALERTS[p.messageTone]) this.prefs.messageTone = p.messageTone;
    if (ALERTS[p.notifyTone]) this.prefs.notifyTone = p.notifyTone;
    const v = Math.round(Number(p.soundVolume));
    if (Number.isFinite(v) && v >= 0 && v <= 100) {
      const changed = v !== this.prefs.soundVolume;
      this.prefs.soundVolume = v;
      if (changed && this.loop) this.loop.setLevel(this.level());   // a ringing call follows it
    }
  }

  level() { return MASTER * (this.prefs.soundVolume / 100); }

  /**
   * The call's sound: 'ring' (a call ringing in: the SIM's ringtone, round and round), 'back' (calling out: the line
   * ringing at the other end), or null (nothing). The same again changes nothing; a ringtone that started rings on.
   */
  ring(kind) {
    const want = kind === 'ring' || kind === 'back' ? kind : null;
    const playing = this.loop && !this.loop.over ? this.loopKind : null;
    if (playing === want) return;
    this.stopLoop();
    const score = want === 'ring' ? RINGTONES[this.prefs.ringtone] : want === 'back' ? RINGBACK : null;
    if (!notesOf(score).length || !audio()) return;
    this.loop = new Player(score, Infinity, this.level(), RING_MAX_S);
    this.loopKind = want;
  }

  stopLoop() {
    if (this.loop) this.loop.stop();
    this.loop = null; this.loopKind = null;
  }

  /** A notification: 'message' (the message tone) or 'notify' (the notification sound). */
  alert(which) {
    const score = ALERTS[which === 'message' ? this.prefs.messageTone : this.prefs.notifyTone];
    if (!notesOf(score).length || !audio()) return;
    new Player(score, 1, this.level());
  }

  /** Settings: hear one before picking it (a ringtone's whole ten seconds, once; a tone). Ends the last preview. */
  previewTone(kind, id) {
    this.stopPreview();
    const score = kind === 'ringtone' ? RINGTONES[id] : ALERTS[id];
    if (!notesOf(score).length || !audio()) return;
    this.preview = new Player(score, 1, this.level());
  }

  stopPreview() {
    if (this.preview) this.preview.stop();
    this.preview = null;
  }

  /** The lists Settings offers: [{ id, label }] in order. */
  static list(kind) {
    return Object.entries(kind === 'ringtone' ? RINGTONES : ALERTS).map(([id, s]) => ({ id, label: s.label }));
  }
}
