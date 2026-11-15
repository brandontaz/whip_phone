// The phone's skill check games: a hidden app whip_core's skill check plays on the phone (client/main.lua RunApp,
// shared/skillgames.lua). The phone opens to a tablet, held to this app, plays one game and answers app.done().
//
// Seven games, every input a single press, so a controller and a keyboard play the same game at the same
// difficulty (Josh, 30 Oct 2026). A mouse only clicks (A) and scrolls (one step a notch), never points.
// The look is the phone's own (Josh, 31 Oct 2026: no hacker styling): night glass, the white pill for what is done,
// Signal Blue for what you are acting on.
//
// args (from Lua): { game, level, cfg, label, goal }: cfg is that level's settings from Config.SkillGames.
(() => {
  'use strict';
  const W = 1024, H = 722;
  const INTRO_MS = 1800, RESULT_MS = 1300;

  // ---------- helpers ----------
  const rnd = (a, b) => a + Math.random() * (b - a);
  const ri = (a, b) => Math.floor(rnd(a, b + 1));
  const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
  const mod = (n, m) => ((n % m) + m) % m;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const num = (v, d) => (typeof v === 'number' && isFinite(v) ? v : d);
  const shuffle = (a) => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  const h = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  function flash(el, cls, ms) { el.classList.remove(cls); void el.offsetWidth; el.classList.add(cls); clearTimeout(el['_t' + cls]); el['_t' + cls] = setTimeout(() => el.classList.remove(cls), ms || 380); }

  const ROT = { up: 0, right: 90, down: 180, left: 270 };
  const arrowSvg = (d) => `<svg class="sk-arr" viewBox="0 0 24 24" style="transform:rotate(${ROT[d]}deg)"><path d="M12 3.5l7.5 8.5h-5v8.5h-5V12h-5z" fill="currentColor"/></svg>`;
  const dpadSvg = (arms) => {
    const a = (k, d) => `<path class="${arms.includes(k) ? 'on' : 'off'}" d="${d}"/>`;
    return `<svg class="sk-dpad" viewBox="0 0 24 24">${a('u', 'M9 1.5h6v7.5l-3 3-3-3z')}${a('d', 'M9 22.5h6V15l-3-3-3 3z')}${a('l', 'M1.5 9v6H9l3-3-3-3z')}${a('r', 'M22.5 9v6H15l-3-3 3-3z')}</svg>`;
  };
  const CHECK = '<svg viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7.5" fill="none" stroke="currentColor" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  const CROSS = '<svg viewBox="0 0 24 24"><path d="M6.5 6.5l11 11M17.5 6.5l-11 11" fill="none" stroke="currentColor" stroke-width="2.8" stroke-linecap="round"/></svg>';
  const turnSvg = (d) => `<svg viewBox="0 0 24 24" style="transform:scaleX(${d > 0 ? 1 : -1})"><path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/><path d="M21 3v5h-5" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
  const GLYPH = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="6" width="18" height="12" rx="3"/><path d="M7 12h4M9 10v4"/><circle cx="15.5" cy="11" r="1" fill="currentColor"/><circle cx="17.5" cy="13" r="1" fill="currentColor"/></svg>';

  // Character sets. Clear: shapes nobody mixes up. All: with the lookalikes, which hard puts beside the real one.
  const POOLS = {
    clear: 'ACEFHKMPRTWXY3479'.split(''),
    mixed: 'ABCDEFGHJKLMNPRSTUVWXYZ2345679'.split(''),
    all: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'.split(''),
  };
  const LOOK = { O: 'Q0D', Q: 'O0', D: 'O0', '0': 'OQD', B: '83', '8': 'B3', S: '5', '5': 'S', I: '1L', '1': 'IL', L: '1I', Z: '2', '2': 'Z', U: 'VJ', V: 'UY', M: 'NW', N: 'MH', E: 'FB', F: 'EP', P: 'RF', R: 'PB', C: 'GO', G: 'C6', '6': 'G' };
  function makeStrip(target, size, pool, alike) {
    const near = alike ? (LOOK[target] || '').split('').filter((c) => c !== target) : [];
    const rest = shuffle(pool.filter((c) => c !== target && !near.includes(c))).slice(0, Math.max(0, size - 1 - near.length));
    const block = near.length ? [near[0], target, ...near.slice(1)] : [target];
    rest.splice(ri(0, rest.length), 0, ...block);
    return rest;
  }

  // ---------- sound: its own Web Audio voice, at the phone's volume (Settings > Sounds) ----------
  let AC = null, NOISE = null, VOL = 0.75;
  function audio() {
    if (VOL <= 0) return null;
    try {
      if (!AC) {
        const C = window.AudioContext || window.webkitAudioContext; if (!C) return null;
        AC = new C();
        const len = Math.floor(AC.sampleRate * 0.2); NOISE = AC.createBuffer(1, len, AC.sampleRate);
        const d = NOISE.getChannelData(0); for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      }
      if (AC.state === 'suspended') AC.resume();
      return AC;
    } catch (e) { return null; }
  }
  function tone(freq, dur, vol, type, when) {
    const ac = audio(); if (!ac) return;
    const t = ac.currentTime + (when || 0), o = ac.createOscillator(), g = ac.createGain();
    o.type = type || 'sine'; o.frequency.setValueAtTime(freq, t);
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol * VOL, t + 0.005); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(ac.destination); o.start(t); o.stop(t + dur + 0.02);
  }
  function dialClick(w) {
    const ac = audio(); if (!ac) return;
    const t = ac.currentTime, s = ac.createBufferSource(), f = ac.createBiquadFilter(), g = ac.createGain();
    s.buffer = NOISE; f.type = 'bandpass'; f.frequency.value = 3400 - 2300 * w; f.Q.value = 2;
    const dur = 0.018 + 0.03 * w; g.gain.setValueAtTime((0.16 + 0.5 * w) * VOL, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f); f.connect(g); g.connect(ac.destination); s.start(t); s.stop(t + dur + 0.01);
    if (w >= 1) tone(150, 0.07, 0.22, 'triangle');
  }
  const NOTES = [659, 784, 523, 587];
  const SFX = {
    move: () => tone(620, 0.035, 0.025),
    lock: () => tone(880, 0.08, 0.07),
    hit: () => tone(740, 0.05, 0.05),
    miss: () => tone(170, 0.13, 0.09, 'triangle'),
    show: (i) => tone(NOTES[i] || 600, 0.14, 0.05),
    dial: (w) => dialClick(w),
    pass: () => { tone(660, 0.12, 0.08); tone(990, 0.2, 0.08, 'sine', 0.1); },
    fail: () => { tone(300, 0.14, 0.08, 'triangle'); tone(200, 0.24, 0.08, 'triangle', 0.12); },
  };

  // ---------- the games ----------
  // Each: create(body, cfg, api) -> { tick(ms), press(action) }. cfg: the level's settings (config.lua's
  // Config.SkillGames, read with the defaults below so a missing setting never breaks a game).
  const GAMES = {};

  GAMES.bruteforce = {
    name: 'Brute Force', goal: 'Lock each reel when its letter is on the line.',
    create(root, c, api) {
      const cfg = { reels: clamp(num(c.reels, 6), 1, 8), speed: num(c.speed, 4.4), letters: clamp(num(c.letters, 16), 4, 30),
        window: clamp(num(c.window, 0.27), 0.05, 0.5), missCost: num(c.missCost, 3), set: POOLS[c.set] ? c.set : 'mixed',
        lookalikes: c.lookalikes === true, bothWays: c.bothWays === true };
      const pool = POOLS[cfg.lookalikes ? 'all' : cfg.set], CELL = 58, wrap = h('div', 'sk-bf'), reels = [];
      root.appendChild(wrap);
      const draw = (r) => {
        const base = Math.floor(r.pos), fr = r.pos - base;
        for (let k = -3; k <= 3; k++) {
          const sp = r.spans[k + 3], y = (k - fr) * CELL;
          sp.textContent = r.strip[mod(base + k, r.strip.length)];
          sp.style.transform = `translateY(${y}px)`;
          sp.style.opacity = clamp(1 - Math.abs(y) / (CELL * 2.7), 0, 1).toFixed(3);
        }
      };
      for (let i = 0; i < cfg.reels; i++) {
        const target = cfg.lookalikes ? pick(Object.keys(LOOK)) : pick(pool);
        const strip = makeStrip(target, cfg.letters, pool, cfg.lookalikes);
        const el = h('div', 'sk-bf-reel', `<div class="sk-bf-tg">${esc(target)}</div><div class="sk-bf-win"><div class="sk-bf-line"></div></div>`);
        const win = el.querySelector('.sk-bf-win'), spans = [];
        for (let k = 0; k < 7; k++) { const s = h('div', 'sk-bf-ch'); win.appendChild(s); spans.push(s); }
        const r = { target, strip, el, spans, pos: rnd(0, strip.length), dir: cfg.bothWays && i % 2 ? -1 : 1, speed: cfg.speed * rnd(0.92, 1.08) };
        reels.push(r); wrap.appendChild(el); draw(r);
      }
      let cur = 0, over = false;
      reels[0].el.classList.add('on');
      const meta = () => api.meta(`${cur} of ${reels.length} locked`);
      meta(); api.prompts([['a', 'Lock', true]]);
      return {
        tick(dt) { const r = reels[cur]; if (!r || over) return; r.pos += r.dir * r.speed * dt / 1000; draw(r); },
        press(act) {
          if (act !== 'a' || over) return;
          const r = reels[cur], near = Math.round(r.pos), off = Math.abs(r.pos - near);
          if (r.strip[mod(near, r.strip.length)] === r.target && off <= cfg.window) {
            r.pos = near; draw(r); r.spans[3].classList.add('lock');
            r.el.classList.remove('on'); r.el.classList.add('done'); api.sound('lock');
            cur++; meta();
            if (cur >= reels.length) { over = true; api.pass(350); return; }
            reels[cur].el.classList.add('on');
          } else {
            api.penalty(cfg.missCost * 1000); api.sound('miss'); flash(r.el, 'bad');
            r.pos += ri(3, Math.max(3, r.strip.length - 3));
          }
        },
      };
    },
  };

  GAMES.coderecall = {
    name: 'Code Recall', goal: 'Watch the code, then enter it.',
    create(root, c, api) {
      const rounds = Array.isArray(c.rounds) && c.rounds.length ? c.rounds.map((n) => clamp(Math.floor(num(n, 4)), 1, 12)).slice(0, 8) : [4, 5, 6, 7];
      const cfg = { rounds, flash: clamp(num(c.flashMs, 430), 120, 2000), gap: clamp(num(c.gapMs, 170), 40, 1000),
        lives: clamp(Math.floor(num(c.mistakes, 1)), 0, 9), fresh: c.newCode === true, back: c.lastBackwards === true };
      const DIRS = ['up', 'right', 'down', 'left'];
      root.innerHTML = `<div class="sk-cr"><div class="sk-cr-msg"></div><div class="sk-cr-pad">${DIRS.map((d) => `<div class="sk-cr-k sk-cr-${d}">${arrowSvg(d)}</div>`).join('')}<div class="sk-cr-mid"></div></div><div class="sk-cr-dots"></div></div>`;
      const keys = {}; DIRS.forEach((d) => { keys[d] = root.querySelector('.sk-cr-' + d); });
      const msgEl = root.querySelector('.sk-cr-msg'), midEl = root.querySelector('.sk-cr-mid'), dotsEl = root.querySelector('.sk-cr-dots');
      let round = 0, seq = [], pos = 0, lives = cfg.lives, phase = 'wait', t = 700, lit = null, litT = 0, back = false;
      const light = (d) => {
        if (lit) keys[lit].classList.remove('lit');
        if (d) { void keys[d].offsetWidth; keys[d].classList.add('lit'); }
        lit = d;
      };
      const dots = () => { dotsEl.innerHTML = seq.map((_, i) => `<i class="${i < pos ? 'on' : ''}"></i>`).join(''); };
      const meta = () => api.meta(`Round ${round + 1} of ${cfg.rounds.length} · ${lives === 0 ? 'No mistakes left' : lives + (lives === 1 ? ' mistake left' : ' mistakes left')}`);
      const grow = (len, base) => {
        const s = base ? base.slice() : [];
        while (s.length < len) { let d; do { d = pick(DIRS); } while (s.length >= 2 && s[s.length - 1] === d && s[s.length - 2] === d); s.push(d); }
        return s.slice(0, len);
      };
      const startRound = () => {
        seq = cfg.fresh ? grow(cfg.rounds[round]) : grow(cfg.rounds[round], seq);
        back = cfg.back && round === cfg.rounds.length - 1;
        pos = 0; phase = 'wait'; t = 700;
        msgEl.textContent = back ? 'Last round: you enter this one backwards' : 'Watch';
        midEl.textContent = `${seq.length} steps`; dots(); meta();
      };
      startRound();
      api.prompts([['dirs', 'Enter the code']]);
      return {
        tick(dt) {
          if (litT > 0) { litT -= dt; if (litT <= 0 && phase !== 'show') light(null); }
          if (phase === 'wait') { t -= dt; if (t <= 0) { phase = 'show'; t = 0; if (!back) msgEl.textContent = 'Watch'; } }
          else if (phase === 'show') {
            t += dt;
            const per = cfg.flash + cfg.gap, i = Math.floor(t / per);
            if (i >= seq.length) { light(null); phase = 'input'; msgEl.textContent = back ? 'Now enter it backwards' : 'Your turn'; }
            else { const d = (t - i * per) < cfg.flash ? seq[i] : null; if (d !== lit) { light(d); if (d) api.sound('show', DIRS.indexOf(d)); } }
          }
          else if (phase === 'next') { t -= dt; if (t <= 0) { round++; startRound(); } }
        },
        press(act) {
          if (phase !== 'input' || !DIRS.includes(act)) return;
          const want = back ? seq[seq.length - 1 - pos] : seq[pos];
          if (act === want) {
            light(act); litT = 160; api.sound('show', DIRS.indexOf(act)); pos++; dots();
            if (pos >= seq.length) {
              if (round >= cfg.rounds.length - 1) { phase = 'done'; msgEl.textContent = 'Code accepted'; api.pass(450); }
              else { phase = 'next'; t = 750; msgEl.textContent = 'Correct'; }
            }
          } else {
            lives--; api.sound('miss'); flash(keys[act], 'bad', 400);
            if (lives < 0) { phase = 'done'; msgEl.textContent = 'Wrong code'; api.fail('Wrong code', 450); return; }
            phase = 'wait'; t = 1100; pos = 0; dots(); meta(); msgEl.textContent = 'Wrong. Watch again.';
          }
        },
      };
    },
  };

  GAMES.fragmentmatch = {
    name: 'Fragment Match', goal: 'Slide the columns until the middle line matches the code.', wheel: { up: 'up', down: 'down' }, repeat: true,
    create(root, c, api) {
      const cfg = { cols: clamp(Math.floor(num(c.columns, 6)), 2, 8), len: clamp(Math.floor(num(c.letters, 8)), 3, 14),
        lookalikes: c.lookalikes === true, reveal: ['columns', 'count', 'nothing'].includes(c.afterWrong) ? c.afterWrong : 'count',
        wrongCost: num(c.wrongCost, 4) };
      const ROW = 60, pool = POOLS[cfg.lookalikes ? 'all' : 'mixed'], code = [], cols = [];
      for (let i = 0; i < cfg.cols; i++) {
        const t = cfg.lookalikes ? pick(Object.keys(LOOK)) : pick(pool);
        const s = makeStrip(t, cfg.len, pool, cfg.lookalikes), ti = s.indexOf(t);
        let p; do { p = ri(0, s.length - 1); } while (p === ti);
        code.push(t); cols.push({ s, p, v: p });
      }
      root.innerHTML = `<div class="sk-fm"><div class="sk-fm-row">${code.map((ch) => `<div class="sk-fm-tg">${esc(ch)}</div>`).join('')}</div><div class="sk-fm-row sk-fm-cols"></div><div class="sk-fm-msg"></div></div>`;
      const colRow = root.querySelector('.sk-fm-cols'), msgEl = root.querySelector('.sk-fm-msg');
      const draw = (col) => {
        const base = Math.floor(col.v), fr = col.v - base;
        for (let k = -3; k <= 3; k++) {
          const sp = col.spans[k + 3], y = (k - fr) * ROW;
          sp.textContent = col.s[mod(base + k, col.s.length)];
          sp.style.transform = `translateY(${y}px)`;
          sp.style.opacity = clamp(1 - Math.abs(y) / (ROW * 2.9), 0, 1).toFixed(3);
        }
      };
      cols.forEach((col) => {
        col.el = h('div', 'sk-fm-col', '<div class="sk-fm-line"></div>'); col.spans = [];
        for (let k = 0; k < 7; k++) { const s = h('div', 'sk-fm-ch'); col.el.appendChild(s); col.spans.push(s); }
        colRow.appendChild(col.el); draw(col);
      });
      let sel = 0, over = false;
      const paintSel = () => cols.forEach((col, i) => col.el.classList.toggle('sel', i === sel));
      paintSel();
      api.prompts([['lr', 'Pick'], ['ud', 'Slide'], ['a', 'Check', true]]);
      return {
        tick(dt) {
          const k = 1 - Math.exp(-dt / 45);
          for (const col of cols) if (col.v !== col.p) { col.v += (col.p - col.v) * k; if (Math.abs(col.p - col.v) < 0.003) col.v = col.p; draw(col); }
        },
        press(act) {
          if (over) return;
          if (act === 'left' || act === 'right') { const n = clamp(sel + (act === 'left' ? -1 : 1), 0, cols.length - 1); if (n !== sel) { sel = n; paintSel(); api.sound('move'); } return; }
          if (act === 'up' || act === 'down') { cols[sel].p += act === 'up' ? 1 : -1; api.sound('move'); return; }
          if (act !== 'a') return;
          const wrong = [];
          cols.forEach((col, i) => { if (col.s[mod(col.p, col.s.length)] !== code[i]) wrong.push(i); });
          if (!wrong.length) { over = true; cols.forEach((col) => col.el.classList.add('good')); msgEl.textContent = 'Match'; api.pass(450); return; }
          api.penalty(cfg.wrongCost * 1000); api.sound('miss');
          if (cfg.reveal === 'columns') { wrong.forEach((i) => flash(cols[i].el, 'bad', 900)); msgEl.textContent = `${wrong.length} wrong, marked in red`; }
          else if (cfg.reveal === 'count') msgEl.textContent = wrong.length === 1 ? '1 column is wrong' : `${wrong.length} columns are wrong`;
          else msgEl.textContent = 'Not a match';
          flash(msgEl, 'pop', 300);
        },
      };
    },
  };

  GAMES.override = {
    name: 'Override', goal: 'Press each arrow as it crosses the line.',
    create(root, c, api) {
      const gap = c.gapMs && typeof c.gapMs === 'object' ? c.gapMs : {};
      const cfg = { lanes: num(c.lanes, 4) === 3 ? 3 : 4, travel: clamp(num(c.fallSeconds, 1.5), 0.5, 5) * 1000, win: clamp(num(c.windowMs, 110), 30, 400),
        notes: clamp(Math.floor(num(c.arrows, 20)), 1, 80), gapMin: clamp(num(gap.min, 430), 150, 3000), gapMax: clamp(num(gap.max, 760), 150, 4000),
        misses: clamp(Math.floor(num(c.misses, 3)), 0, 40) };
      if (cfg.gapMax < cfg.gapMin) cfg.gapMax = cfg.gapMin;
      const lanes = cfg.lanes === 3 ? ['left', 'up', 'right'] : ['left', 'down', 'up', 'right'], LINE = 410;
      const wrap = h('div', 'sk-od'); root.appendChild(wrap);
      wrap.appendChild(h('div', 'sk-od-line'));
      const laneEls = lanes.map((d) => { const l = h('div', 'sk-od-lane', `<div class="sk-od-rc">${arrowSvg(d)}</div>`); wrap.appendChild(l); return l; });
      const rcs = laneEls.map((l) => l.querySelector('.sk-od-rc'));
      const notes = []; let t = cfg.travel + 700, prev = -1, run = 0;
      for (let i = 0; i < cfg.notes; i++) {
        let lane; do { lane = ri(0, lanes.length - 1); } while (lane === prev && run >= 1);
        run = lane === prev ? run + 1 : 0; prev = lane;
        const el = h('div', 'sk-od-n', arrowSvg(lanes[lane])); el.style.display = 'none'; laneEls[lane].appendChild(el);
        notes.push({ t, lane, st: 0, el });
        t += rnd(cfg.gapMin, cfg.gapMax);
      }
      let now = 0, misses = 0, over = false;
      const meta = () => api.meta(`Misses ${misses} of ${cfg.misses}`);
      const miss = (n) => {
        if (n) { n.st = 2; n.el.classList.add('miss'); }
        misses++; meta();
        if (misses > cfg.misses && !over) { over = true; api.fail('Too many misses', 300); }
      };
      meta(); api.prompts([['dirs', 'Hit the arrows']]);
      return {
        tick(dt) {
          now += dt;
          for (const n of notes) {
            if (n.st === 1) continue;
            const ahead = n.t - now;
            if (ahead > cfg.travel + 80) continue;
            const y = LINE * (1 - ahead / cfg.travel);
            if (y > LINE + 110) { n.el.style.display = 'none'; continue; }
            n.el.style.display = ''; n.el.style.transform = `translateY(${y}px)`;
            if (n.st === 0 && now > n.t + cfg.win) miss(n);
          }
          if (!over && notes.every((n) => n.st !== 0)) { over = true; api.pass(300); }
        },
        press(act) {
          const lane = lanes.indexOf(act); if (lane < 0 || over) return;
          const n = notes.find((x) => x.st === 0 && x.lane === lane && Math.abs(now - x.t) <= cfg.win);
          if (n) { n.st = 1; n.el.style.display = 'none'; flash(rcs[lane], 'hit', 160); api.sound('hit'); }
          else { flash(rcs[lane], 'bad', 260); api.sound('miss'); miss(null); }
        },
      };
    },
  };

  function makePath(n, sr, er) {
    const minLen = n + 1, maxLen = Math.max(minLen + 2, Math.floor(n * n * 0.5));
    for (let attempt = 0; attempt < 300; attempt++) {
      const seen = new Uint8Array(n * n), path = [[sr, 0]]; seen[sr * n] = 1;
      let budget = 4000;
      const walk = () => {
        if (--budget < 0) return false;
        const [r, c] = path[path.length - 1];
        if (r === er && c === n - 1) return path.length >= minLen;
        if (path.length >= maxLen) return false;
        for (const [dr, dc] of shuffle([[0, 1], [1, 0], [-1, 0], [0, -1]])) {
          const nr = r + dr, nc = c + dc;
          if (nr < 0 || nc < 0 || nr >= n || nc >= n || seen[nr * n + nc]) continue;
          seen[nr * n + nc] = 1; path.push([nr, nc]);
          if (walk()) return true;
          path.pop(); seen[nr * n + nc] = 0;
        }
        return false;
      };
      if (walk()) return path;
    }
    const p = []; for (let c = 0; c < n; c++) p.push([sr, c]);
    for (let r = sr; r !== er;) { r += er > r ? 1 : -1; p.push([r, n - 1]); }
    return p;
  }

  GAMES.reroute = {
    name: 'Reroute', goal: 'Turn the tiles until power reaches the exit.', repeat: true,
    create(root, c, api) {
      const d = c.decoys && typeof c.decoys === 'object' ? c.decoys : {};
      const n = clamp(Math.floor(num(c.grid, 5)), 3, 6), keep = clamp(num(c.keepRight, 0.15), 0, 1);
      const mix = { straight: Math.max(0, num(d.straight, 3)), elbow: Math.max(0, num(d.elbow, 5)), tee: Math.max(0, num(d.tee, 2)), end: Math.max(0, num(d.dead, 1)) };
      const S = { 3: 112, 4: 100, 5: 86, 6: 74 }[n], GAP = 4;
      const U = 1, R = 2, D = 4, L = 8;
      const rot1 = (m) => ((m << 1) | (m >> 3)) & 15;
      const rotN = (m, k) => { k = mod(k, 4); while (k--) m = rot1(m); return m; };
      const BASE = { straight: U | D, elbow: U | R, tee: U | R | D, end: U };
      const ARMS = { straight: 'M50 0V100', elbow: 'M50 0V50H100', tee: 'M50 0V100M50 50H100', end: 'M50 0V50' };
      const sr = ri(0, n - 1), er = ri(0, n - 1);
      const path = makePath(n, sr, er), tiles = new Array(n * n);
      const dirTo = (r, cc, q) => q[0] < r ? U : q[0] > r ? D : q[1] > cc ? R : L;
      path.forEach(([r, cc], i) => {
        const prev = i === 0 ? [r, cc - 1] : path[i - 1], next = i === path.length - 1 ? [r, cc + 1] : path[i + 1];
        const m = dirTo(r, cc, prev) | dirTo(r, cc, next), type = (m === (U | D) || m === (L | R)) ? 'straight' : 'elbow';
        let k = 0; while (rotN(BASE[type], k) !== m) k++;
        const off = Math.random() < keep ? 0 : (type === 'straight' ? 1 : ri(1, 3));
        tiles[r * n + cc] = { type, rot: k + off };
      });
      const keys = Object.keys(mix).filter((k) => mix[k] > 0), sum = keys.reduce((s, k) => s + mix[k], 0);
      const weighted = () => { if (!sum) return 'elbow'; let x = Math.random() * sum; for (const k of keys) { x -= mix[k]; if (x <= 0) return k; } return keys[0]; };
      for (let i = 0; i < n * n; i++) if (!tiles[i]) tiles[i] = { type: weighted(), rot: ri(0, 3) };
      const mask = (i) => rotN(BASE[tiles[i].type], tiles[i].rot);
      const flow = () => {
        const lit = new Set(), s = sr * n; if (!(mask(s) & L)) return lit;
        const q = [s]; lit.add(s);
        while (q.length) {
          const k = q.shift(), r = Math.floor(k / n), cc = k % n, m = mask(k);
          for (const [bit, nr, nc, back] of [[U, r - 1, cc, D], [R, r, cc + 1, L], [D, r + 1, cc, U], [L, r, cc - 1, R]]) {
            if (!(m & bit) || nr < 0 || nc < 0 || nr >= n || nc >= n) continue;
            const nk = nr * n + nc;
            if (!lit.has(nk) && (mask(nk) & back)) { lit.add(nk); q.push(nk); }
          }
        }
        return lit;
      };
      const exit = er * n + n - 1;
      const solved = (lit) => lit.has(exit) && !!(mask(exit) & R);
      if (solved(flow())) tiles[path[0][0] * n + path[0][1]].rot += 1;

      const wrap = h('div', 'sk-rt'), grid = h('div', 'sk-rt-grid');
      grid.style.gridTemplateColumns = `repeat(${n}, ${S}px)`;
      const cells = tiles.map((tl) => {
        const cell = h('div', 'sk-rt-cell', `<svg class="sk-rt-pipe" viewBox="0 0 100 100"><path d="${ARMS[tl.type]}" stroke-width="15" fill="none" stroke-linejoin="round"/><circle cx="50" cy="50" r="${tl.type === 'end' ? 15 : 8}"/></svg>`);
        cell.style.width = cell.style.height = S + 'px'; grid.appendChild(cell); return cell;
      });
      const tagIn = h('div', 'sk-rt-tag in', '<span>Power</span><b></b>'), tagOut = h('div', 'sk-rt-tag out', '<b></b><span>Exit</span>');
      tagIn.style.top = (sr * (S + GAP) + S / 2) + 'px'; tagOut.style.top = (er * (S + GAP) + S / 2) + 'px';
      wrap.appendChild(grid); wrap.appendChild(tagIn); wrap.appendChild(tagOut); root.appendChild(wrap);
      let sel = sr * n, over = false;
      const paint = () => {
        const lit = flow();
        tiles.forEach((tl, i) => { cells[i].classList.toggle('on', lit.has(i)); cells[i].firstChild.style.transform = `rotate(${tl.rot * 90}deg)`; });
        const ok = solved(lit); tagOut.classList.toggle('on', ok);
        return ok ? lit : null;
      };
      const paintSel = () => cells.forEach((cell, i) => cell.classList.toggle('sel', i === sel));
      paint(); paintSel();
      api.prompts([['dirs', 'Move'], ['a', 'Turn', true]]);
      return {
        tick() {},
        press(act) {
          if (over) return;
          const r = Math.floor(sel / n), cc = sel % n;
          const mv = { up: [-1, 0], down: [1, 0], left: [0, -1], right: [0, 1] }[act];
          if (mv) { const nr = clamp(r + mv[0], 0, n - 1), nc = clamp(cc + mv[1], 0, n - 1); if (nr * n + nc !== sel) { sel = nr * n + nc; paintSel(); api.sound('move'); } return; }
          if (act !== 'a') return;
          tiles[sel].rot++; api.sound('move');
          const lit = paint();
          if (lit) { over = true; lit.forEach((i) => cells[i].classList.add('win')); cells[sel].classList.remove('sel'); api.pass(650); }
        },
      };
    },
  };

  GAMES.safecrack = {
    name: 'Safe Crack', goal: 'Turn the dial and set each number on the heavy click.', wheel: { up: 'left', down: 'right' }, repeat: true,
    create(root, c, api) {
      const cfg = { nums: clamp(Math.floor(num(c.numbers, 3)), 1, 6), near: clamp(Math.floor(num(c.hint, 1)), 0, 5),
        wrongCost: num(c.wrongCost, 4), restart: c.wrongRestarts === true };
      const N = 40, DEG = 360 / N, combo = [], dirs = [];
      let prev = 0;
      for (let i = 0; i < cfg.nums; i++) { const dd = i % 2 ? -1 : 1, v = mod(prev + dd * ri(8, 30), N); combo.push(v); dirs.push(dd); prev = v; }
      let marks = '';
      for (let k = 0; k < N; k++) {
        const a = -k * DEG, major = k % 5 === 0;
        marks += `<line x1="190" y1="${major ? 16 : 20}" x2="190" y2="${major ? 40 : 32}" class="${major ? 'mj' : ''}" transform="rotate(${a} 190 190)"/>`;
        if (major) marks += `<text x="190" y="66" transform="rotate(${a} 190 190)">${k}</text>`;
      }
      root.innerHTML = `<div class="sk-sc">
        <div class="sk-sc-dw"><div class="sk-sc-mark"></div><div class="sk-sc-dial"><svg class="sk-sc-face" viewBox="0 0 380 380"><circle cx="190" cy="190" r="184"/></svg><div class="sk-sc-rot"><svg viewBox="0 0 380 380">${marks}</svg></div><div class="sk-sc-knob"><b>0</b></div></div></div>
        <div class="sk-sc-side">
          <div><div class="sk-cap">Combination</div><div class="sk-sc-combo">${combo.map(() => '<div class="sk-sc-c">?</div>').join('')}</div></div>
          <div class="sk-sc-turn"></div>
          <div><div class="sk-cap">Feel</div><div class="sk-sc-feel">${'<i></i>'.repeat(6)}</div></div>
          <div class="sk-sc-msg"></div>
        </div></div>`;
      const dial = root.querySelector('.sk-sc-dial'), rot = root.querySelector('.sk-sc-rot'), knob = root.querySelector('.sk-sc-knob b');
      const cells = [...root.querySelectorAll('.sk-sc-c')], turnEl = root.querySelector('.sk-sc-turn'), feelEls = [...root.querySelectorAll('.sk-sc-feel i')], msgEl = root.querySelector('.sk-sc-msg');
      let turn = 0, idx = 0, over = false, feelT = 0;
      const paint = () => {
        cells.forEach((cell, i) => { cell.className = 'sk-sc-c' + (i < idx ? ' set' : i === idx ? ' cur' : ''); cell.textContent = i < idx ? combo[i] : '?'; });
        turnEl.innerHTML = idx < combo.length ? `${turnSvg(dirs[idx])}<span>Turn ${dirs[idx] > 0 ? 'right' : 'left'}</span>` : '';
      };
      const feel = (w) => { const on = Math.round(w * 6); feelEls.forEach((e, i) => e.classList.toggle('on', i < on)); feelT = 260; };
      paint();
      api.meta(`${idx} of ${combo.length} set`);
      api.prompts([['turn', 'Turn'], ['a', 'Set']]);
      return {
        tick(dt) { if (feelT > 0) { feelT -= dt; if (feelT <= 0) feel(0); } },
        press(act) {
          if (over) return;
          const step = (act === 'right' || act === 'rb') ? 1 : (act === 'left' || act === 'lb') ? -1 : 0;
          if (step) {
            turn += step; const pos = mod(turn, N);
            rot.style.transform = `rotate(${turn * DEG}deg)`; knob.textContent = pos;
            let w = 0;
            if (step === dirs[idx]) {
              const dd = Math.min(mod(pos - combo[idx], N), mod(combo[idx] - pos, N));
              if (dd === 0) w = 1; else if (dd <= cfg.near) w = 0.35 + 0.3 * (1 - dd / (cfg.near + 1));
            }
            api.sound('dial', w); feel(w); if (w === 1) flash(dial, 'jolt', 170);
            return;
          }
          if (act !== 'a') return;
          if (mod(turn, N) === combo[idx]) {
            idx++; api.sound('lock'); api.rumble(140, 0.7); paint(); api.meta(`${idx} of ${combo.length} set`);
            if (idx >= combo.length) { over = true; msgEl.textContent = 'Open'; api.pass(450); }
            else msgEl.textContent = 'Set. Now turn the other way.';
          } else {
            api.penalty(cfg.wrongCost * 1000); api.sound('miss'); flash(dial, 'bad', 380);
            if (cfg.restart && idx > 0) { idx = 0; paint(); api.meta(`0 of ${combo.length} set`); msgEl.textContent = 'Wrong number. Back to the first one.'; }
            else msgEl.textContent = 'Wrong number.';
          }
        },
      };
    },
  };

  GAMES.stabilise = {
    name: 'Stabilise', goal: 'Keep the needle inside the band until the drill is through.',
    create(root, c, api) {
      const cfg = { width: clamp(num(c.band, 0.2), 0.05, 0.6), wander: clamp(num(c.bandSpeed, 0.11), 0.01, 1), need: clamp(num(c.drillSeconds, 9), 1, 60) * 1000,
        drain: clamp(num(c.leaving, 0.25), 0, 2), heat: clamp(num(c.overheatSeconds, 1.3), 0.2, 10) };
      const GH = 440, HOT = 0.86;
      let tk = ''; for (let i = 1; i < 10; i++) tk += `<div class="sk-st-tk" style="top:${i * GH / 10}px"></div>`;
      root.innerHTML = `<div class="sk-st"><div class="sk-st-g"><div class="sk-st-hot" style="height:${Math.round((1 - HOT) * GH)}px">Too hot</div><div class="sk-st-band"></div>${tk}<div class="sk-st-nd"></div></div>
        <div class="sk-st-side"><div><div class="sk-cap">Drilled</div><div class="sk-st-big">0%</div><div class="sk-st-bar sk-st-prog"><i></i></div></div>
        <div><div class="sk-cap">Heat</div><div class="sk-st-bar sk-st-heat"><i></i></div></div></div></div>`;
      const band = root.querySelector('.sk-st-band'), nd = root.querySelector('.sk-st-nd'), big = root.querySelector('.sk-st-big');
      const progI = root.querySelector('.sk-st-prog i'), heatBar = root.querySelector('.sk-st-heat'), heatI = heatBar.querySelector('i');
      let p = 0.06, v = 0, cc = 0.42, c0 = cc, tc = cc, seg = 0, segT = 1, prog = 0, heat = 0, over = false;
      const lo = 0.14 + cfg.width / 2, hi = Math.max(lo + 0.1, HOT - 0.07 - cfg.width / 2);
      const nextSeg = () => { c0 = cc; let tries = 0; do { tc = rnd(lo, hi); } while (Math.abs(tc - cc) < 0.08 && ++tries < 20); segT = Math.max(200, Math.abs(tc - c0) / cfg.wander * 1000); seg = 0; };
      nextSeg();
      api.prompts([['a', 'Hold to push', true]]);
      return {
        tick(dt) {
          if (over) return;
          const s = dt / 1000;
          v += (api.held('a') ? 1.55 : -1.05) * s; v *= Math.exp(-1.9 * s); p += v * s;
          if (p < 0) { p = 0; if (v < 0) v = 0; }
          if (p > 1) { p = 1; if (v > 0) v = 0; }
          seg += dt; const k = Math.min(1, seg / segT); cc = c0 + (tc - c0) * k * k * (3 - 2 * k); if (k >= 1) nextSeg();
          const inBand = Math.abs(p - cc) <= cfg.width / 2;
          prog = inBand ? prog + dt : Math.max(0, prog - cfg.drain * dt);
          heat = p >= HOT ? heat + s / cfg.heat : Math.max(0, heat - s / 3);
          band.style.top = ((1 - (cc + cfg.width / 2)) * GH) + 'px'; band.style.height = (cfg.width * GH) + 'px';
          band.classList.toggle('in', inBand);
          nd.style.transform = `translateY(${(1 - p) * GH}px)`;
          const pct = Math.min(100, Math.floor(prog / cfg.need * 100));
          big.textContent = pct + '%'; progI.style.width = pct + '%';
          heatI.style.width = Math.min(100, heat * 100) + '%'; heatBar.classList.toggle('high', heat > 0.6);
          if (heat >= 1) { over = true; api.fail('Overheated', 250); return; }
          if (prog >= cfg.need) { over = true; api.pass(300); }
        },
        press() {},
      };
    },
  };

  // ---------- the shell around a game: header, clock, prompts, intro and result ----------
  const REPEATS = new Set(['up', 'down', 'left', 'right']);
  const FIRST = 300, EVERY = 75;   // one repeat for every device: a held direction steps the same on all of them

  /** one game playing in `el`; app.done() when it is over */
  function play(app, el, args) {
    const def = GAMES[args.game];
    const cfg = args.cfg && typeof args.cfg === 'object' ? args.cfg : {};
    el.innerHTML = `<div class="sk-stage"><div class="sk-app">
        <div class="sk-hd"><div><div class="sk-hd-t"></div><div class="sk-hd-s"></div></div>
          <div class="sk-hd-r"><span class="sk-meta"></span><span class="sk-lvl"></span><div class="sk-clock"><b>0.0</b><i>s</i></div><span class="sk-pen"></span></div></div>
        <div class="sk-cl"><i></i></div>
        <div class="sk-body"></div>
        <div class="sk-ft"><div class="sk-pr sk-pr-l"></div><div class="sk-pr sk-pr-r"></div></div>
      </div><div class="sk-ov"></div></div>`;
    const $ = (s) => el.querySelector(s);
    const ui = { stage: $('.sk-stage'), t: $('.sk-hd-t'), s: $('.sk-hd-s'), meta: $('.sk-meta'), lvl: $('.sk-lvl'), clock: $('.sk-clock'), clk: $('.sk-clock b'),
      pen: $('.sk-pen'), cl: $('.sk-cl'), clI: $('.sk-cl i'), body: $('.sk-body'), prL: $('.sk-pr-l'), prR: $('.sk-pr-r'), ov: $('.sk-ov') };
    const G = { state: 'intro', inst: null, limit: 1, left: 1, used: 0, frozen: false, timers: [], prompts: [], device: app.console ? 'pad' : 'keys',
      held: new Set(), rep: {}, wheelAcc: 0, raf: 0, last: 0, finished: false, introT: INTRO_MS, resultT: 0, result: null };

    const level = String(args.level || '');
    ui.t.textContent = args.label || (def && def.name) || 'Skill check';
    ui.s.textContent = args.goal || (def && def.goal) || '';
    ui.lvl.textContent = level ? level.charAt(0).toUpperCase() + level.slice(1) : '';

    const glyph = (act) => {
      const pad = G.device === 'pad';
      switch (act) {
        case 'a': return pad ? '<span class="sk-pb">A</span>' : '<span class="sk-key">Space</span>';
        case 'b': return pad ? '<span class="sk-pb">B</span>' : '<span class="sk-key">Esc</span>';
        case 'dirs': return pad ? dpadSvg('udlr') : `<span class="sk-key">${arrowSvg('left')}${arrowSvg('up')}${arrowSvg('down')}${arrowSvg('right')}</span>`;
        case 'lr': return pad ? dpadSvg('lr') : `<span class="sk-key">${arrowSvg('left')}</span><span class="sk-key">${arrowSvg('right')}</span>`;
        case 'ud': return pad ? dpadSvg('ud') : `<span class="sk-key">${arrowSvg('up')}</span><span class="sk-key">${arrowSvg('down')}</span>`;
        case 'turn': return pad ? `${dpadSvg('lr')}<span class="sk-pb sq">LB</span><span class="sk-pb sq">RB</span>` : `<span class="sk-key">${arrowSvg('left')}</span><span class="sk-key">${arrowSvg('right')}</span>`;
      }
      return '';
    };
    const promptHtml = ([act, label, click]) => `<span class="sk-pi">${glyph(act)}${click && G.device !== 'pad' ? '<span class="sk-or">or</span><span class="sk-key">Click</span>' : ''}<span>${esc(label)}</span></span>`;
    const drawPrompts = () => {
      ui.prL.innerHTML = G.prompts.map(promptHtml).join('');
      ui.prR.innerHTML = G.state === 'play' || G.state === 'intro' ? promptHtml(['b', 'Give up']) : '';
    };
    const drawClock = () => {
      const f = G.limit ? clamp(G.left / G.limit, 0, 1) : 1, low = f < 0.3 && G.state === 'play';
      ui.clk.textContent = (Math.max(0, G.left) / 1000).toFixed(1);
      ui.clI.style.width = (f * 100) + '%';
      ui.cl.classList.toggle('low', low); ui.clock.classList.toggle('low', low);
    };
    const setDevice = (d) => { if (d && d !== G.device) { G.device = d; drawPrompts(); } };

    function finish(passed, why, reason) {
      if (G.state !== 'play' && G.state !== 'intro') return;
      G.state = 'result'; G.timers = []; G.frozen = false; G.inst = null; G.rep = {};
      const took = (G.used / 1000).toFixed(1);
      ui.ov.innerHTML = `<div class="sk-card ${passed ? 'ok' : 'no'}"><div class="sk-disc">${passed ? CHECK : CROSS}</div><div class="sk-card-t">${passed ? 'Passed' : 'Failed'}</div><div class="sk-card-s">${esc(passed ? `Done in ${took} s` : `${reason} after ${took} s`)}</div></div>`;
      ui.ov.classList.add('on');
      SFX[passed ? 'pass' : 'fail']();
      if (passed) app.rumble?.(200, 0.5);
      G.prompts = []; drawPrompts();
      G.result = { passed, why: passed ? null : why, reason: passed ? null : reason };
      G.resultT = RESULT_MS;
    }

    const api = {
      pass: (delay) => end(true, null, '', delay),
      fail: (reason, delay) => end(false, 'failed', reason || 'Missed', delay),
      penalty: (ms) => {
        if (G.state !== 'play') return;
        G.left -= ms; drawClock();
        ui.pen.textContent = `−${Math.round(ms / 100) / 10} s`; flash(ui.pen, 'go', 900);
      },
      prompts: (list) => { G.prompts = list; drawPrompts(); },
      meta: (text) => { ui.meta.textContent = text; },
      sound: (name, x) => { const f = SFX[name]; if (f) f(x); },
      rumble: (ms, s) => app.rumble?.(ms, s),
      held: (act) => { for (const k of G.held) if (k.endsWith(':' + act)) return true; return false; },
    };
    function end(passed, why, reason, delay) {
      if (G.state !== 'play' || G.frozen) return;
      if (delay) { G.frozen = true; G.timers.push({ t: delay, fn: () => { G.frozen = false; finish(passed, why, reason); } }); return; }
      finish(passed, why, reason);
    }

    function begin() {
      ui.ov.classList.remove('on'); ui.ov.innerHTML = ''; ui.body.innerHTML = '';
      G.state = 'play'; G.used = 0;
      try { G.inst = def.create(ui.body, cfg, api); }
      catch (e) { console.error('[whip_phone] skill check game', args.game, e); finish(false, 'failed', 'The game broke'); return; }
      drawClock(); drawPrompts();
    }

    function press(act, from) {
      setDevice(from);
      if (G.state === 'result') return;
      if (act === 'b') { finish(false, 'cancelled', 'Gave up'); return; }
      if (G.state !== 'play' || G.frozen || !G.inst) return;
      try { G.inst.press(act); } catch (e) { console.error('[whip_phone] skill check press', e); }
    }
    function down(act, from) {
      const key = from + ':' + act;
      if (G.held.has(key)) return;
      G.held.add(key);
      if (def && def.repeat && REPEATS.has(act)) G.rep[act] = performance.now() + FIRST;
      press(act, from);
    }
    function up(act, from) {
      G.held.delete(from + ':' + act);
      if (!api.held(act)) delete G.rep[act];
    }

    // the clock: the level's seconds (Override: its track)
    const seconds = num(cfg.seconds, 0);
    G.limit = G.left = seconds > 0 ? seconds * 1000 : 30000;
    if (args.game === 'override') {
      const gap = cfg.gapMs && typeof cfg.gapMs === 'object' ? cfg.gapMs : {};
      const travel = clamp(num(cfg.fallSeconds, 1.5), 0.5, 5) * 1000, notes = clamp(Math.floor(num(cfg.arrows, 20)), 1, 80);
      G.limit = G.left = Math.round(travel + 700 + notes * clamp(num(gap.max, 760), 150, 4000) + 1600);
    }
    drawClock();

    if (!def) {
      ui.body.innerHTML = '<div class="sk-idle">This game is not on this phone.</div>';
      G.state = 'play'; finish(false, 'failed', 'No such game');
    } else {
      ui.ov.innerHTML = `<div class="sk-card"><div class="sk-card-k">Get ready</div><div class="sk-card-t">${esc(ui.t.textContent)}</div><div class="sk-card-s">${esc(ui.s.textContent)}</div><div class="sk-bar"><i style="animation-duration:${INTRO_MS}ms"></i></div></div>`;
      ui.ov.classList.add('on');
    }
    G.prompts = []; drawPrompts();

    // the mouse: a click on the game is A (held for as long as the button is), the wheel steps where the game allows it
    const onDown = (e) => { if (e.button !== 0) return; e.preventDefault(); down('a', 'mouse'); };
    const onUp = (e) => { if (e.button === 0) up('a', 'mouse'); };
    const onWheel = (e) => {
      if (G.state !== 'play') return;
      e.preventDefault();
      const map = def && def.wheel; if (!map || G.frozen) return;
      G.wheelAcc += e.deltaMode === 1 ? e.deltaY * 40 : e.deltaY;
      if (Math.abs(G.wheelAcc) >= 90) { const dir = G.wheelAcc > 0 ? 'down' : 'up'; G.wheelAcc = 0; press(map[dir], 'keys'); }
    };
    el.addEventListener('pointerdown', onDown);
    window.addEventListener('pointerup', onUp);
    el.addEventListener('wheel', onWheel, { passive: false });

    const frame = (now) => {
      // Two clocks. The game's own motion steps at most 50 ms a frame (a slow frame does not jump it); the clock the
      // player is timed on (the intro, the time left, the result) is real time, as the server's give-up is, held back
      // only on a real stall (a hidden page): below 20 fps an honest player is not timed out with seconds showing.
      const real = G.last ? now - G.last : 16; G.last = now;
      const dt = Math.min(50, real);
      const clock = Math.min(1000, real);
      if (def && def.repeat) for (const act in G.rep) if (now >= G.rep[act]) { G.rep[act] = now + EVERY; press(act, null); }
      if (G.state === 'intro') { G.introT -= clock; if (G.introT <= 0) begin(); }
      else if (G.state === 'play') {
        for (let i = G.timers.length - 1; i >= 0; i--) {
          const tm = G.timers[i]; tm.t -= dt;
          if (tm.t <= 0) { G.timers.splice(i, 1); tm.fn(); }
        }
        if (G.state === 'play' && G.inst && !G.frozen) { try { G.inst.tick(dt); } catch (e) { console.error('[whip_phone] skill check tick', e); } }
        if (G.state === 'play' && !G.frozen) {
          G.left -= clock; G.used += clock;
          if (G.left <= 0) { G.left = 0; drawClock(); finish(false, 'failed', 'Out of time'); }
          else drawClock();
        }
      } else if (G.state === 'result' && !G.finished) {
        G.resultT -= clock;
        // (ms, the time played, and reason, the words on the card: for the Skill Check Tester)
        if (G.resultT <= 0) { G.finished = true; app.done({ passed: G.result.passed, why: G.result.why, ms: Math.round(G.used), reason: G.result.reason }); }
      }
      G.raf = requestAnimationFrame(frame);
    };
    G.raf = requestAnimationFrame(frame);

    return {
      input(cmd, isDown, info) {
        const from = info && info.from === 'pad' ? 'pad' : 'keys';
        if (info && info.repeat) return true;          // the game's own repeat steps a held direction (FIRST / EVERY)
        if (isDown) down(cmd, from); else up(cmd, from);
        // LB arrives as a press only (whip's combo key goes on its release): never held
        if (cmd === 'lb' && isDown) G.held.delete(from + ':lb');
        return true;
      },
      device(d) { setDevice(d); },
      giveUp() { press('b', null); },
      fit(w, hgt) {
        const s = Math.min(w / W, hgt / H) || 1;
        ui.stage.style.transform = `translate(${Math.max(0, (w - W * s) / 2)}px, ${Math.max(0, (hgt - H * s) / 2)}px) scale(${s})`;
      },
      stop() {
        cancelAnimationFrame(G.raf);
        el.removeEventListener('pointerdown', onDown);
        window.removeEventListener('pointerup', onUp);
        el.removeEventListener('wheel', onWheel);
      },
    };
  }

  let P = null;     // the game playing now
  let ARGS = {};    // what it was opened with

  const fitNow = (el) => { if (P && el) P.fit(el.clientWidth || W, el.clientHeight || H); };

  window.WhipPhone.module({
    id: 'skillcheck', name: 'Skill Check', version: '1.0.0', order: 999, hidden: true, icon: GLYPH,
    // WASD, Space, Q and E reach it too (keyboard); the phone holds walking and jumping off while it is open
    keys: 'all',
    open(app, args) { ARGS = args && typeof args === 'object' ? args : {}; },
    close() { if (P) { P.stop(); P = null; } },
    mount(app, el) {
      VOL = clamp(num(app.settings.get('soundVolume'), 75), 0, 100) / 100;
      if (P) P.stop();
      P = play(app, el, ARGS);
      fitNow(el);
      if (window.ResizeObserver) { this._ro = new ResizeObserver(() => fitNow(el)); this._ro.observe(el); }
    },
    update(app, el, view, changed) {
      if (!P) return;
      if (changed) { P.device(view.console ? 'pad' : 'keys'); fitNow(el); }
    },
    unmount() {
      if (this._ro) { this._ro.disconnect(); this._ro = null; }
      if (P) { P.stop(); P = null; }
    },
    // every button is the game's: nothing else on the phone moves while it plays
    input(app, cmd, down, info) { return P ? P.input(cmd, down, info) : true; },
    back() { if (P) P.giveUp(); return true; },
    backLabel() { return 'Give up'; },
    css: `
:host{--sk-ink:rgb(10,12,18);--sk-raised:rgba(10,12,18,.92);--sk-scrim:rgba(10,12,18,.78);--sk-pane:rgba(255,255,255,.04);--sk-fill:rgba(255,255,255,.05);
  --sk-fill2:rgba(255,255,255,.1);--sk-edge:rgba(255,255,255,.08);--sk-edge2:rgba(255,255,255,.16);--sk-text:rgba(255,255,255,.93);--sk-mid:rgba(255,255,255,.5);
  --sk-label:rgba(255,255,255,.48);--sk-dim:rgba(255,255,255,.25);--sk-accent:#60a5fa;--sk-wash:rgba(96,165,250,.16);--sk-subtle:rgba(96,165,250,.07);
  --sk-medium:rgba(96,165,250,.3);--sk-glow:rgba(96,165,250,.1);--sk-green:#4ade80;--sk-red:#f87171;--sk-red-wash:rgba(248,113,113,.12);--sk-red-edge:rgba(248,113,113,.5);
  --sk-amber:#fbbf24;--sk-pill:rgba(255,255,255,.93);--sk-pill-ink:rgb(10,12,18);--sk-shade:rgba(0,0,0,.45);
  --sk-sh:0 4px 20px rgba(0,0,0,.4),inset 0 1px 0 rgba(255,255,255,.05);--sk-modal:0 20px 60px rgba(0,0,0,.6);--sk-ease:cubic-bezier(.16,1,.3,1);
  background-color:var(--sk-ink);background-image:radial-gradient(ellipse at 0 0,var(--sk-glow),transparent 55%);color:var(--sk-text);
  font-family:var(--font-ui,'Plus Jakarta Sans','Segoe UI',system-ui,sans-serif);font-weight:500;-webkit-font-smoothing:antialiased;user-select:none;-webkit-user-select:none;touch-action:none}
*{box-sizing:border-box}
.sk-stage{position:absolute;left:0;top:0;width:1024px;height:722px;transform-origin:0 0}
.sk-app{position:absolute;top:30px;left:0;right:0;bottom:0;display:flex;flex-direction:column}
.sk-hd{display:flex;align-items:center;gap:20px;padding:12px 28px 14px}
.sk-hd-t{font-size:26px;font-weight:800;letter-spacing:-.4px}
.sk-hd-s{margin-top:2px;font-size:13px;color:var(--sk-mid)}
.sk-hd-r{position:relative;margin-left:auto;display:flex;align-items:center;gap:16px}
.sk-meta{font-size:12px;font-weight:600;color:var(--sk-label);font-variant-numeric:tabular-nums}
.sk-lvl{padding:3px 8px;border-radius:3px;background:var(--sk-fill);color:var(--sk-mid);font-size:10px;font-weight:800;letter-spacing:.08em;text-transform:uppercase}
.sk-clock{min-width:82px;text-align:right;font-variant-numeric:tabular-nums}
.sk-clock b{font-size:30px;font-weight:800;letter-spacing:-.5px}
.sk-clock i{margin-left:3px;font-size:13px;font-style:normal;color:var(--sk-mid)}
.sk-clock.low b{color:var(--sk-red)}
.sk-pen{position:absolute;right:0;top:-14px;font-size:13px;font-weight:800;color:var(--sk-red);opacity:0;pointer-events:none}
.sk-pen.go{animation:rise .9s var(--sk-ease) forwards}
.sk-cl{position:relative;height:2px;margin:0 28px;background:var(--sk-edge)}
.sk-cl i{position:absolute;left:0;top:0;bottom:0;width:100%;background:var(--sk-text)}
.sk-cl.low i{background:var(--sk-red)}
.sk-body{position:relative;flex:1;display:flex;align-items:center;justify-content:center}
.sk-ft{height:54px;padding:0 28px;display:flex;align-items:center;justify-content:space-between;border-top:1px solid var(--sk-edge)}
.sk-pr{display:flex;align-items:center;gap:20px}
.sk-pi{display:flex;align-items:center;gap:6px;font-size:13px;font-weight:700;color:var(--sk-mid)}
.sk-pi>span:last-child{margin-left:2px}
.sk-or{font-size:11px;font-weight:600;color:var(--sk-dim)}
.sk-key{min-width:26px;height:24px;padding:0 7px;display:inline-flex;align-items:center;justify-content:center;gap:3px;border-radius:6px;background:var(--sk-fill2);box-shadow:inset 0 0 0 1px var(--sk-edge),inset 0 -2px 0 var(--sk-shade);color:var(--sk-text);font-size:11px;font-weight:800}
.sk-key .sk-arr{width:12px;height:12px}
.sk-pb{width:24px;height:24px;display:inline-grid;place-items:center;border-radius:50%;box-shadow:inset 0 0 0 2px var(--sk-text);color:var(--sk-text);font-size:11px;font-weight:800}
.sk-pb.sq{width:auto;padding:0 6px;border-radius:7px;font-size:10px}
.sk-dpad{width:24px;height:24px}
.sk-dpad .on{fill:var(--sk-text)}
.sk-dpad .off{fill:var(--sk-dim)}
.sk-arr{display:block}
.sk-cap{font-size:11px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:var(--sk-label);margin-bottom:8px}
.sk-idle{font-size:16px;color:var(--sk-mid)}
.sk-ov{position:absolute;top:30px;left:0;right:0;bottom:0;display:none;place-items:center;background:var(--sk-scrim)}
.sk-ov.on{display:grid}
.sk-card{min-width:380px;max-width:520px;padding:30px 36px 28px;border-radius:12px;background:var(--sk-raised);box-shadow:var(--sk-modal),inset 0 0 0 1px var(--sk-edge);text-align:center;animation:cardIn .35s var(--sk-ease)}
.sk-card-k{font-size:11px;font-weight:800;letter-spacing:.1em;text-transform:uppercase;color:var(--sk-label)}
.sk-card-t{margin-top:6px;font-size:30px;font-weight:800;letter-spacing:-.5px}
.sk-card-s{margin-top:6px;font-size:15px;line-height:1.5;color:var(--sk-mid)}
.sk-bar{height:3px;margin-top:20px;border-radius:2px;background:var(--sk-fill2);overflow:hidden}
.sk-bar i{display:block;height:100%;width:0;background:var(--sk-text);animation:fill 1.8s linear forwards}
.sk-disc{width:64px;height:64px;margin:0 auto 4px;display:grid;place-items:center;border-radius:50%;color:var(--sk-pill-ink)}
.sk-disc svg{width:34px;height:34px}
.ok .sk-disc{background:var(--sk-green)}
.no .sk-disc{background:var(--sk-red)}
.sk-bf{display:flex;gap:14px}
.sk-bf-reel{width:76px;display:flex;flex-direction:column;align-items:center;gap:12px}
.sk-bf-tg{width:76px;height:52px;display:grid;place-items:center;border-radius:11px;background:var(--sk-fill);box-shadow:inset 0 0 0 1px var(--sk-edge);font-size:26px;font-weight:800;color:var(--sk-mid)}
.sk-bf-reel.on .sk-bf-tg{color:var(--sk-text)}
.sk-bf-reel.done .sk-bf-tg{color:var(--sk-dim)}
.sk-bf-win{position:relative;width:76px;height:290px;overflow:hidden;border-radius:11px;background:var(--sk-pane);box-shadow:inset 0 0 0 1px var(--sk-edge)}
.sk-bf-line{position:absolute;left:0;right:0;top:50%;height:58px;margin-top:-29px;background:var(--sk-pane);border-top:1px solid var(--sk-edge2);border-bottom:1px solid var(--sk-edge2)}
.sk-bf-ch{position:absolute;left:0;right:0;top:50%;height:58px;margin-top:-29px;line-height:58px;text-align:center;font-size:30px;font-weight:700;will-change:transform}
.sk-bf-reel:not(.on):not(.done) .sk-bf-ch{color:var(--sk-dim)}
.sk-bf-reel.on .sk-bf-win{background:var(--sk-wash);box-shadow:inset 0 0 0 2px var(--sk-pill)}
.sk-bf-reel.done .sk-bf-ch{opacity:.18!important}
.sk-bf-reel.done .sk-bf-ch.lock{opacity:1!important;left:8px;right:8px;border-radius:8px;background:var(--sk-pill);color:var(--sk-pill-ink);font-weight:800}
.sk-bf-reel.bad .sk-bf-win{box-shadow:inset 0 0 0 2px var(--sk-red);animation:shake .32s}
.sk-cr{display:flex;flex-direction:column;align-items:center;gap:20px}
.sk-cr-msg{height:28px;font-size:20px;font-weight:800}
.sk-cr-pad{display:grid;grid-template-columns:repeat(3,120px);grid-template-rows:repeat(3,120px);gap:10px}
.sk-cr-k{display:grid;place-items:center;border-radius:20px;background:var(--sk-fill);box-shadow:inset 0 0 0 1px var(--sk-edge);color:var(--sk-mid);transition:background .08s,color .08s}
.sk-cr-k .sk-arr{width:46px;height:46px}
.sk-cr-k.lit{background:var(--sk-pill);color:var(--sk-pill-ink);box-shadow:none}
.sk-cr-k.bad{box-shadow:inset 0 0 0 2px var(--sk-red);color:var(--sk-red);animation:shake .32s}
.sk-cr-up{grid-area:1/2}.sk-cr-left{grid-area:2/1}.sk-cr-right{grid-area:2/3}.sk-cr-down{grid-area:3/2}
.sk-cr-mid{grid-area:2/2;display:grid;place-items:center;font-size:13px;font-weight:700;color:var(--sk-label)}
.sk-cr-dots{display:flex;gap:8px;height:10px}
.sk-cr-dots i{width:10px;height:10px;border-radius:50%;background:var(--sk-fill2)}
.sk-cr-dots i.on{background:var(--sk-text)}
.sk-fm{display:flex;flex-direction:column;align-items:center;gap:16px}
.sk-fm-row{display:flex;gap:12px}
.sk-fm-tg{width:72px;height:56px;display:grid;place-items:center;border-radius:11px;background:var(--sk-fill);box-shadow:inset 0 0 0 1px var(--sk-edge);font-size:28px;font-weight:800}
.sk-fm-col{position:relative;width:72px;height:300px;overflow:hidden;border-radius:11px;background:var(--sk-pane);box-shadow:inset 0 0 0 1px var(--sk-edge)}
.sk-fm-col.sel{background:var(--sk-wash);box-shadow:inset 0 0 0 2px var(--sk-pill)}
.sk-fm-col.bad{box-shadow:inset 0 0 0 2px var(--sk-red)}
.sk-fm-col.good{box-shadow:inset 0 0 0 2px var(--sk-green)}
.sk-fm-line{position:absolute;left:0;right:0;top:50%;height:60px;margin-top:-30px;background:var(--sk-pane);border-top:1px solid var(--sk-edge2);border-bottom:1px solid var(--sk-edge2)}
.sk-fm-ch{position:absolute;left:0;right:0;top:50%;height:60px;margin-top:-30px;line-height:60px;text-align:center;font-size:28px;font-weight:700;will-change:transform}
.sk-fm-msg{height:22px;font-size:14px;font-weight:700;color:var(--sk-mid)}
.sk-fm-msg.pop{animation:pop .3s var(--sk-ease)}
.sk-od{position:relative;display:flex;height:480px;overflow:hidden}
.sk-od-lane{position:relative;width:112px;border-left:1px solid var(--sk-edge)}
.sk-od-lane:last-child{border-right:1px solid var(--sk-edge)}
.sk-od-line{position:absolute;left:0;right:0;top:410px;height:1px;background:var(--sk-edge2)}
.sk-od-rc{position:absolute;left:50%;top:410px;width:72px;height:72px;margin:-36px 0 0 -36px;display:grid;place-items:center;border-radius:50%;background:var(--sk-ink);box-shadow:inset 0 0 0 2px var(--sk-edge2);color:var(--sk-dim)}
.sk-od-rc .sk-arr{width:32px;height:32px}
.sk-od-rc.hit{background:var(--sk-wash);box-shadow:inset 0 0 0 2px var(--sk-pill);color:var(--sk-text)}
.sk-od-rc.bad{box-shadow:inset 0 0 0 2px var(--sk-red);color:var(--sk-red)}
.sk-od-n{position:absolute;left:50%;top:0;width:62px;height:62px;margin:-31px 0 0 -31px;display:grid;place-items:center;border-radius:50%;background:var(--sk-pill);color:var(--sk-pill-ink);will-change:transform}
.sk-od-n .sk-arr{width:28px;height:28px}
.sk-od-n.miss{background:var(--sk-red-wash);color:var(--sk-red);box-shadow:inset 0 0 0 2px var(--sk-red-edge)}
.sk-rt{position:relative}
.sk-rt-grid{display:grid;gap:4px}
.sk-rt-cell{position:relative;border-radius:11px;background:var(--sk-pane);box-shadow:inset 0 0 0 1px var(--sk-edge)}
.sk-rt-cell.sel{background:var(--sk-wash);box-shadow:inset 0 0 0 2px var(--sk-pill)}
.sk-rt-pipe{position:absolute;inset:0;width:100%;height:100%;transition:transform .14s var(--sk-ease)}
.sk-rt-pipe path{stroke:var(--sk-dim)}
.sk-rt-pipe circle{fill:var(--sk-dim)}
.sk-rt-cell.on .sk-rt-pipe path{stroke:var(--sk-text)}
.sk-rt-cell.on .sk-rt-pipe circle{fill:var(--sk-text)}
.sk-rt-cell.win .sk-rt-pipe path{stroke:var(--sk-green)}
.sk-rt-cell.win .sk-rt-pipe circle{fill:var(--sk-green)}
.sk-rt-tag{position:absolute;display:flex;align-items:center;gap:8px;transform:translateY(-50%);font-size:11px;font-weight:800;letter-spacing:.06em;text-transform:uppercase;color:var(--sk-mid);white-space:nowrap}
.sk-rt-tag b{width:10px;height:10px;border-radius:50%;background:var(--sk-text)}
.sk-rt-tag.in{right:100%;margin-right:12px}
.sk-rt-tag.out{left:100%;margin-left:12px}
.sk-rt-tag.out b{background:var(--sk-dim)}
.sk-rt-tag.out.on{color:var(--sk-green)}
.sk-rt-tag.out.on b{background:var(--sk-green)}
.sk-sc{display:flex;align-items:center;gap:56px}
.sk-sc-dw{position:relative;width:380px;height:400px}
.sk-sc-mark{position:absolute;top:0;left:50%;margin-left:-9px;width:0;height:0;border-left:9px solid transparent;border-right:9px solid transparent;border-top:13px solid var(--sk-text)}
.sk-sc-dial{position:absolute;top:18px;left:0;width:380px;height:380px}
.sk-sc-dial svg{position:absolute;inset:0;width:100%;height:100%}
.sk-sc-face circle{fill:var(--sk-pane);stroke:var(--sk-edge2);stroke-width:1.5}
.sk-sc-rot{position:absolute;inset:0;transition:transform .07s linear}
.sk-sc-rot line{stroke:var(--sk-mid);stroke-width:2}
.sk-sc-rot line.mj{stroke:var(--sk-text);stroke-width:3}
.sk-sc-rot text{fill:var(--sk-text);font-family:inherit;font-size:17px;font-weight:700;text-anchor:middle}
.sk-sc-knob{position:absolute;top:50%;left:50%;width:150px;height:150px;margin:-75px 0 0 -75px;display:grid;place-items:center;border-radius:50%;background:var(--sk-ink);box-shadow:var(--sk-sh),inset 0 0 0 1px var(--sk-edge2)}
.sk-sc-knob b{font-size:44px;font-weight:800;font-variant-numeric:tabular-nums}
.sk-sc-dial.jolt{animation:jolt .16s}
.sk-sc-dial.bad .sk-sc-face circle{stroke:var(--sk-red)}
.sk-sc-dial.bad{animation:shake .32s}
.sk-sc-side{width:300px;display:flex;flex-direction:column;gap:24px}
.sk-sc-combo{display:flex;gap:10px}
.sk-sc-c{width:62px;height:56px;display:grid;place-items:center;border-radius:11px;background:var(--sk-fill);box-shadow:inset 0 0 0 1px var(--sk-edge);color:var(--sk-dim);font-size:22px;font-weight:800;font-variant-numeric:tabular-nums}
.sk-sc-c.cur{background:var(--sk-wash);box-shadow:inset 0 0 0 2px var(--sk-pill);color:var(--sk-text)}
.sk-sc-c.set{background:var(--sk-pill);color:var(--sk-pill-ink);box-shadow:none}
.sk-sc-turn{display:flex;align-items:center;gap:10px;height:28px;font-size:18px;font-weight:800}
.sk-sc-turn svg{width:24px;height:24px}
.sk-sc-feel{display:flex;align-items:flex-end;gap:5px;height:36px}
.sk-sc-feel i{width:14px;border-radius:3px;background:var(--sk-fill2);transition:background .05s}
.sk-sc-feel i:nth-child(1){height:10px}.sk-sc-feel i:nth-child(2){height:15px}.sk-sc-feel i:nth-child(3){height:20px}
.sk-sc-feel i:nth-child(4){height:25px}.sk-sc-feel i:nth-child(5){height:30px}.sk-sc-feel i:nth-child(6){height:36px}
.sk-sc-feel i.on{background:var(--sk-text)}
.sk-sc-msg{min-height:20px;font-size:14px;font-weight:700;color:var(--sk-mid)}
.sk-st{display:flex;align-items:center;gap:64px}
.sk-st-g{position:relative;width:120px;height:440px;overflow:hidden;border-radius:11px;background:var(--sk-pane);box-shadow:inset 0 0 0 1px var(--sk-edge)}
.sk-st-hot{position:absolute;left:0;right:0;top:0;display:grid;place-items:center;background:var(--sk-red-wash);border-bottom:1px solid var(--sk-red-edge);color:var(--sk-red);font-size:10px;font-weight:800;letter-spacing:.08em;text-transform:uppercase}
.sk-st-band{position:absolute;left:6px;right:6px;border-radius:8px;background:var(--sk-subtle);box-shadow:inset 0 0 0 2px var(--sk-medium)}
.sk-st-band.in{background:var(--sk-wash);box-shadow:inset 0 0 0 2px var(--sk-pill)}
.sk-st-tk{position:absolute;left:0;width:12px;height:1px;background:var(--sk-edge2)}
.sk-st-nd{position:absolute;left:0;right:0;top:0;height:4px;margin-top:-2px;border-radius:2px;background:var(--sk-text);box-shadow:0 0 0 1px var(--sk-shade);will-change:transform}
.sk-st-side{width:300px;display:flex;flex-direction:column;gap:28px}
.sk-st-big{font-size:56px;font-weight:800;letter-spacing:-1px;line-height:1.05;font-variant-numeric:tabular-nums}
.sk-st-bar{height:6px;margin-top:10px;border-radius:3px;background:var(--sk-fill2);overflow:hidden}
.sk-st-bar i{display:block;height:100%;width:0;background:var(--sk-text)}
.sk-st-heat i{background:var(--sk-amber)}
.sk-st-heat.high i{background:var(--sk-red)}
@keyframes shake{0%,100%{transform:translateX(0)}20%{transform:translateX(-6px)}40%{transform:translateX(5px)}60%{transform:translateX(-4px)}80%{transform:translateX(2px)}}
@keyframes jolt{0%,100%{transform:translate(0,0)}30%{transform:translate(2px,-1px)}65%{transform:translate(-1px,1px)}}
@keyframes pop{from{transform:scale(1.08)}to{transform:scale(1)}}
@keyframes rise{0%{opacity:1;transform:translateY(0)}100%{opacity:0;transform:translateY(-16px)}}
@keyframes fill{to{width:100%}}
@keyframes cardIn{from{opacity:0;transform:translateY(6px) scale(.98)}to{opacity:1;transform:none}}
`,
  });
})();
