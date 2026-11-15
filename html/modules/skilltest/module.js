// The Skill Check Tester: a developer app (Config.DeveloperApps: only while developer mode is on in /w). Pick a skill
// check (whip's ring or one of the phone's games) and a level, change its numbers, and play it.
// TEST RUNS ONLY: the numbers changed here are the test's and are never saved. config.lua stays as
// it is, and the app starts from it every time.
//
// The server says who may (server/skilltest.lua) and hands the test to Lua (client/main.lua), which plays it and pushes
// the answer back here ('result'). The ring needs the screen to itself: the phone goes away while it plays and comes
// back out with the answer. A phone game plays on the phone, and this app is back when it ends.
(() => {
  const { kit: K } = window.WhipPhone;
  const LEVELS = [['easy', 'Easy'], ['medium', 'Medium'], ['hard', 'Hard']];
  const LEVEL_NAME = Object.fromEntries(LEVELS);
  const RING = { key: 'ring', name: 'Ring', goal: 'Push the dot onto the lit part and hold it there until it fills. Mouse or right stick.', enabled: true };

  const GLYPH = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="8.5" opacity=".35"/><path d="M12 3.5a8.5 8.5 0 0 1 8.5 8.5"/><circle cx="12" cy="12" r="2.4" fill="currentColor" stroke="none"/></svg>';
  const PAD = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="6" width="18" height="12" rx="3"/><path d="M7 12h4M9 10v4"/><circle cx="15.5" cy="11" r="1" fill="currentColor"/><circle cx="17.5" cy="13" r="1" fill="currentColor"/></svg>';
  const PLUS = '<svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"/></svg>';
  const MINUS = '<svg viewBox="0 0 24 24"><path d="M5 12h14" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"/></svg>';
  const CHECK = '<svg viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7.5" fill="none" stroke="currentColor" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  const CROSS = '<svg viewBox="0 0 24 24"><path d="M6.5 6.5l11 11M17.5 6.5l-11 11" fill="none" stroke="currentColor" stroke-width="2.8" stroke-linecap="round"/></svg>';

  // ---------- the numbers each check has: what config.lua calls them, what they do, and how far they go ----------
  // kind: int, num, bool, pick (opts), list (one number per item: Code Recall's rounds). min / max as the games clamp
  // them (html/modules/skillcheck/module.js; the ring: whip_core's shared/skillcheck.lua). def: when config.lua has none.
  // every: the ring's two that every level shares (Config.SkillCheckHoldMs / MouseSpeed).
  const CLOCK = { k: 'seconds', label: 'Clock', help: 'Running out is a fail', kind: 'int', min: 5, max: 120, step: 1, unit: ' s', def: 30 };
  const FIELDS = {
    ring: [
      { k: 'pieces', label: 'Pieces', help: 'How many directions the ring is cut into', kind: 'int', min: 1, max: 32, step: 1, def: 8 },
      { k: 'parts', label: 'Parts', help: 'How many parts to fill', kind: 'int', min: 1, max: 40, step: 1, def: 12 },
      { k: 'widest', label: 'Widest part', help: 'The first part, in pieces', kind: 'num', min: 0.25, max: (d) => d.pieces, step: 0.25, def: 4 },
      { k: 'narrowest', label: 'Narrowest part', help: 'The last part, in pieces', kind: 'num', min: 0.25, max: (d) => d.widest, step: 0.25, def: 1 },
      { k: 'msPerPart', label: 'Time per part', help: 'The clock is this times the parts', kind: 'int', min: 100, max: 3000, step: 25, unit: ' ms', def: 600 },
      { k: 'holdMs', label: 'Fill time', help: 'How long the dot stays on a part to fill it', kind: 'int', min: 20, max: 2000, step: 10, unit: ' ms', def: 196, every: true },
      { k: 'mouseSpeed', label: 'Mouse speed', help: '2 is twice as fast', kind: 'num', min: 0.1, max: 5, step: 0.1, unit: '×', def: 1, every: true },
    ],
    bruteforce: [
      { k: 'reels', label: 'Reels', help: 'How many letters to lock', kind: 'int', min: 1, max: 8, step: 1, def: 6 },
      { k: 'speed', label: 'Speed', help: 'Letters a second', kind: 'num', min: 0.6, max: 15, step: 0.2, unit: '/s', def: 4.4 },
      { k: 'letters', label: 'Letters', help: 'On each reel', kind: 'int', min: 4, max: 30, step: 1, def: 16 },
      { k: 'window', label: 'Window', help: 'How close to the line counts (0.5 is half a letter)', kind: 'num', min: 0.05, max: 0.5, step: 0.01, def: 0.27 },
      { k: 'missCost', label: 'Miss cost', help: 'Seconds a miss takes off the clock', kind: 'num', min: 0, max: 20, step: 0.5, unit: ' s', def: 3 },
      { k: 'set', label: 'Letters used', help: 'Clear has no lookalikes', kind: 'pick', opts: [['clear', 'Clear'], ['mixed', 'Mixed'], ['all', 'All']], def: 'mixed' },
      { k: 'lookalikes', label: 'Lookalikes', help: '8 and B, O and 0 right beside the real letter', kind: 'bool', def: false },
      { k: 'bothWays', label: 'Both ways', help: 'Every other reel scrolls the other way', kind: 'bool', def: false },
      CLOCK,
    ],
    coderecall: [
      { k: 'rounds', label: 'Rounds', item: 'Round', help: 'The code\'s length', kind: 'list', min: 1, max: 12, step: 1, minItems: 1, maxItems: 8, def: [4, 5, 6, 7] },
      { k: 'flashMs', label: 'Flash', help: 'How long each arrow shows', kind: 'int', min: 120, max: 2000, step: 10, unit: ' ms', def: 430 },
      { k: 'gapMs', label: 'Gap', help: 'The pause after each arrow', kind: 'int', min: 40, max: 1000, step: 10, unit: ' ms', def: 170 },
      { k: 'mistakes', label: 'Mistakes allowed', help: 'A mistake shows the code again', kind: 'int', min: 0, max: 9, step: 1, def: 1 },
      { k: 'newCode', label: 'New code each round', help: 'Otherwise the code grows', kind: 'bool', def: false },
      { k: 'lastBackwards', label: 'Last round backwards', help: 'Entered back to front', kind: 'bool', def: false },
      CLOCK,
    ],
    fragmentmatch: [
      { k: 'columns', label: 'Columns', help: 'How many to line up', kind: 'int', min: 2, max: 8, step: 1, def: 6 },
      { k: 'letters', label: 'Letters', help: 'In each column', kind: 'int', min: 3, max: 14, step: 1, def: 8 },
      { k: 'afterWrong', label: 'After a wrong check', help: 'What the player is told', kind: 'pick', opts: [['columns', 'Marks the columns'], ['count', 'Says how many'], ['nothing', 'Nothing']], def: 'count' },
      { k: 'lookalikes', label: 'Lookalikes', help: 'Beside the real letter', kind: 'bool', def: false },
      { k: 'wrongCost', label: 'Wrong cost', help: 'Seconds a wrong check takes off the clock', kind: 'num', min: 0, max: 20, step: 0.5, unit: ' s', def: 4 },
      CLOCK,
    ],
    override: [
      { k: 'lanes', label: 'Lanes', help: 'Arrows fall in this many', kind: 'pick', opts: [[3, '3'], [4, '4']], def: 4 },
      { k: 'arrows', label: 'Arrows', help: 'How many fall', kind: 'int', min: 1, max: 80, step: 1, def: 20 },
      { k: 'fallSeconds', label: 'Fall time', help: 'From the top to the line', kind: 'num', min: 0.5, max: 5, step: 0.05, unit: ' s', def: 1.5 },
      { k: 'windowMs', label: 'Window', help: 'How early or late still counts', kind: 'int', min: 30, max: 400, step: 5, unit: ' ms', def: 110 },
      { k: 'gapMs.min', label: 'Shortest gap', help: 'Between two arrows', kind: 'int', min: 150, max: 3000, step: 10, unit: ' ms', def: 430 },
      { k: 'gapMs.max', label: 'Longest gap', help: 'Between two arrows', kind: 'int', min: 150, max: 4000, step: 10, unit: ' ms', def: 760 },
      { k: 'misses', label: 'Misses allowed', help: 'A press with nothing there counts too', kind: 'int', min: 0, max: 40, step: 1, def: 3 },
    ],
    reroute: [
      { k: 'grid', label: 'Grid', help: 'Tiles a side', kind: 'int', min: 3, max: 6, step: 1, def: 5 },
      { k: 'keepRight', label: 'Already right', help: 'Share of the path\'s tiles turned right at the start', kind: 'num', min: 0, max: 1, step: 0.05, def: 0.15 },
      { k: 'decoys.straight', label: 'Straights', help: 'How often another tile is one', kind: 'int', min: 0, max: 10, step: 1, def: 3 },
      { k: 'decoys.elbow', label: 'Elbows', help: 'How often another tile is one', kind: 'int', min: 0, max: 10, step: 1, def: 5 },
      { k: 'decoys.tee', label: 'T pieces', help: 'How often another tile is one', kind: 'int', min: 0, max: 10, step: 1, def: 2 },
      { k: 'decoys.dead', label: 'Dead ends', help: 'How often another tile is one', kind: 'int', min: 0, max: 10, step: 1, def: 1 },
      CLOCK,
    ],
    safecrack: [
      { k: 'numbers', label: 'Numbers', help: 'In the combination', kind: 'int', min: 1, max: 6, step: 1, def: 3 },
      { k: 'hint', label: 'Hint', help: 'Notches away the clicks get heavier (0: the number only)', kind: 'int', min: 0, max: 5, step: 1, def: 1 },
      { k: 'wrongCost', label: 'Wrong cost', help: 'Seconds a wrong number takes off the clock', kind: 'num', min: 0, max: 20, step: 0.5, unit: ' s', def: 4 },
      { k: 'wrongRestarts', label: 'Wrong restarts', help: 'A wrong number goes back to the first', kind: 'bool', def: false },
      CLOCK,
    ],
    stabilise: [
      { k: 'band', label: 'Band', help: 'Its size, as a share of the gauge', kind: 'num', min: 0.05, max: 0.6, step: 0.01, def: 0.2 },
      { k: 'bandSpeed', label: 'Band speed', help: 'How fast it moves', kind: 'num', min: 0.01, max: 1, step: 0.01, def: 0.11 },
      { k: 'drillSeconds', label: 'Drill time', help: 'Time in the band needed', kind: 'num', min: 1, max: 60, step: 0.5, unit: ' s', def: 9 },
      { k: 'leaving', label: 'Losing', help: 'How fast progress drains outside the band (0: it only pauses)', kind: 'num', min: 0, max: 2, step: 0.05, def: 0.25 },
      { k: 'overheatSeconds', label: 'Overheat', help: 'Time in the red before it fails', kind: 'num', min: 0.2, max: 10, step: 0.1, unit: ' s', def: 1.3 },
      CLOCK,
    ],
  };

  // ---------- helpers ----------
  const get = (o, path) => path.split('.').reduce((v, p) => (v == null ? undefined : v[p]), o);
  function put(o, path, v) {
    const ps = path.split('.');
    let t = o;
    for (let i = 0; i < ps.length - 1; i++) { if (!t[ps[i]] || typeof t[ps[i]] !== 'object') t[ps[i]] = {}; t = t[ps[i]]; }
    t[ps[ps.length - 1]] = v;
  }
  const copy = (v) => (v == null ? v : JSON.parse(JSON.stringify(v)));
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  const places = (step) => (String(step).split('.')[1] || '').length;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const limit = (f, d, which) => (typeof f[which] === 'function' ? f[which](d) : f[which]);
  const fieldOf = (key, k) => (FIELDS[key] || []).find((f) => f.k === k);
  function fmt(f, v) {
    if (typeof v !== 'number' || !isFinite(v)) return '—';
    return (f.kind === 'num' ? v.toFixed(places(f.step)) : String(Math.round(v))) + (f.unit || '');
  }

  /** the checks there are: the ring, then the phone's games (on or off in config.lua) */
  const checks = (s) => [RING, ...((s.cfg && s.cfg.games) || [])];
  const checkOf = (s, key) => checks(s).find((c) => c.key === key) || null;

  /** what config.lua has for a check's level (the ring: as an admin may have changed it in /whip Config). The ring's
   *  two that every level shares are their own: `every`. */
  function baseOf(s, key, level, every) {
    const cfg = s.cfg || {};
    if (key === 'ring') {
      const r = cfg.ring || {};
      if (every) return { holdMs: r.holdMs, mouseSpeed: r.mouseSpeed };
      return (r.difficulties || {})[level] || {};
    }
    const g = (cfg.games || []).find((x) => x.key === key);
    return (g && g.levels && g.levels[level]) || {};
  }

  /** the test's numbers for a check's level (or the ring's shared two): config.lua's until changed here. keep: an
   *  action about to change them keeps them in the state (render only reads: a fresh copy until then). */
  function draftOf(s, key, level, every, keep) {
    const slot = every ? 'every' : level;
    const kept = s.drafts[key] && s.drafts[key][slot];
    if (kept) return kept;
    const d = copy(baseOf(s, key, level, every)) || {};
    for (const f of FIELDS[key] || []) if (!!f.every === !!every && get(d, f.k) === undefined) put(d, f.k, copy(f.def));
    if (keep) (s.drafts[key] = s.drafts[key] || {})[slot] = d;
    return d;
  }
  const holder = (s, key, level, f, keep) => ({ d: draftOf(s, key, level, f.every, keep), base: baseOf(s, key, level, f.every) });
  const baseValue = (f, base) => { const v = get(base, f.k); return v === undefined ? f.def : v; };
  const changed = (s, key, level, f) => { const h = holder(s, key, level, f); return !same(get(h.d, f.k), baseValue(f, h.base)); };
  const anyChanged = (s, key, level) => (FIELDS[key] || []).some((f) => changed(s, key, level, f));

  /** what is sent to play: the level's numbers, with the ring's shared two on them */
  function testNumbers(s, key, level) {
    const d = copy(draftOf(s, key, level, false));
    return key === 'ring' ? { ...d, ...copy(draftOf(s, key, level, true)) } : d;
  }

  /** after a change: what one number allows depends on another */
  function settle(key, d, k) {
    if (key === 'ring') {
      if (d.widest > d.pieces) d.widest = d.pieces;
      if (d.narrowest > d.widest) d.narrowest = d.widest;
    } else if (key === 'override' && d.gapMs) {
      if (d.gapMs.max < d.gapMs.min) { if (k === 'gapMs.min') d.gapMs.max = d.gapMs.min; else d.gapMs.min = d.gapMs.max; }
    }
  }

  /** the clock the level plays to, worked out as the check does */
  function clockOf(s, key, level) {
    const d = testNumbers(s, key, level);
    if (key === 'ring') return `${d.parts} parts · ${(d.parts * d.msPerPart / 1000).toFixed(1)} s on the clock`;
    if (key === 'override') {
      const gap = d.gapMs || {}, travel = clamp(Number(d.fallSeconds) || 1.5, 0.5, 5) * 1000;
      const ms = travel + 700 + clamp(Math.floor(Number(d.arrows) || 20), 1, 80) * clamp(Number(gap.max) || 760, 150, 4000) + 1600;
      return `${d.arrows} arrows · ${(ms / 1000).toFixed(1)} s track`;
    }
    return `${d.seconds} s on the clock`;
  }

  // ---------- a result, in words ----------
  const WHY = {
    timeout: 'No answer: it timed out', busy: 'Did not start: another check or screen was up', 'not a developer': 'Developer mode is off',
    'no such game': 'That game is not on this phone', 'no app': 'The game is not on this phone', dead: 'Not while down', 'not ready': 'The phone was not ready',
  };
  function said(r) {
    const t = typeof r.ms === 'number' ? `${(r.ms / 1000).toFixed(1)} s` : '';
    if (r.passed) return t ? `Passed in ${t}` : 'Passed';
    if (r.why === 'failed') return `${r.reason || 'Failed'}${t ? ` after ${t}` : ''}`;
    if (r.why === 'cancelled') return t ? `Gave up after ${t}` : 'Gave up';
    return WHY[r.why] || String(r.why || 'Failed');
  }
  const resultLine = (r) => `<div class="st-res ${r.passed ? 'ok' : 'no'}">${r.passed ? CHECK : CROSS}<b>${K.esc(said(r))}</b>${r.own ? '<span>your numbers</span>' : ''}</div>`;

  // ---------- pages ----------
  function stepRow(f, label, sub, v, chg, i) {
    const b = (dir, hint, glyph) => `<button class="st-b" data-act="step" ${K.data({ f: f.k, i, dir })} data-hint="${hint}" aria-label="${hint}">${glyph}</button>`;
    return `<div class="row st-row${chg ? ' chg' : ''}"><span class="r-main">${K.esc(label)}${sub ? `<div class="r-sub">${K.esc(sub)}</div>` : ''}</span>` +
      `<span class="st-step">${b(-1, 'Less', MINUS)}<b>${K.esc(fmt(f, v))}</b>${b(1, 'More', PLUS)}</span></div>`;
  }

  function rowsFor(s, key, level, f) {
    const { d, base } = holder(s, key, level, f);
    const v = get(d, f.k), was = baseValue(f, base), chg = !same(v, was);
    const sub = (shown) => f.help + (chg ? ` · config.lua: ${shown}` : '');
    if (f.kind === 'bool') {
      return [K.row({ label: f.label, sub: sub(was ? 'on' : 'off'), toggle: v === true, act: 'flip', d: { f: f.k }, chev: false, tone: chg ? 'chg' : '', hint: 'Switch' })];
    }
    if (f.kind === 'pick') {
      const name = (x) => { const o = f.opts.find(([ov]) => ov === x); return o ? o[1] : String(x); };
      return [K.row({ label: f.label, sub: sub(name(was)), value: name(v), act: 'cycle', d: { f: f.k }, chev: false, tone: chg ? 'chg' : '', hint: 'Change' })];
    }
    if (f.kind === 'list') {
      const list = Array.isArray(v) ? v : [], wasList = Array.isArray(was) ? was : [];
      const rows = list.map((n, i) => stepRow(f, `${f.item} ${i + 1}`, i === 0 ? f.help : '', n, n !== wasList[i], i));
      rows.push(`<div class="row st-li">${list.length < f.maxItems ? K.button({ label: `Add a ${f.item.toLowerCase()}`, act: 'addItem', d: { f: f.k }, kind: 'gray', hint: 'Add' }) : ''}` +
        `${list.length > f.minItems ? K.button({ label: `Take the last off`, act: 'dropItem', d: { f: f.k }, kind: 'gray', hint: 'Remove' }) : ''}` +
        `${chg ? `<span class="st-was">config.lua: ${K.esc(wasList.join(', '))}</span>` : ''}</div>`);
      return rows;
    }
    return [stepRow(f, f.label, sub(fmt(f, was)), v, chg)];
  }

  function checkPage(app) {
    const s = app.state, c = checkOf(s, s.sel);
    if (!c) return '';
    const level = s.level, fields = FIELDS[c.key] || [];
    const last = s.results.find((r) => r.game === c.key && r.level === level);
    const running = !!s.running;
    const own = anyChanged(s, c.key, level);
    const off = c.enabled === false ? '<b>Off in config.lua: only the tester plays it.</b> ' : '';
    return `<div class="st-goal">${off}${K.esc(c.goal)}</div>` + K.seg(LEVELS, level, 'level') +
      `<div class="st-go">${K.button({ label: running ? 'Playing…' : `Start ${LEVEL_NAME[level].toLowerCase()} test`, act: 'start', block: true, hint: 'Start' })}` +
      `<div class="st-clock">${K.esc(clockOf(s, c.key, level))}${own ? ' · <i>your numbers</i>' : ''}</div>` +
      `${last ? resultLine(last) : ''}</div>` +
      K.list(fields.filter((f) => !f.every).flatMap((f) => rowsFor(s, c.key, level, f)), { header: `${LEVEL_NAME[level]} level`, inset: 14 }) +
      (c.key === 'ring' ? K.list(fields.filter((f) => f.every).flatMap((f) => rowsFor(s, c.key, level, f)), { header: 'Every level', inset: 14 }) : '') +
      (own ? `<div class="st-reset">${K.button({ label: 'Back to config.lua', act: 'reset', kind: 'gray', hint: 'Reset' })}</div>` : '') +
      `<div class="st-note">Your numbers are only for your tests. Nothing here is saved: config.lua stays as it is.</div>`;
  }

  /** the tests played since the phone came up, newest first */
  function recentList(s, max) {
    const rows = s.results.slice(0, max).map((r) => K.row({ label: `${(checkOf(s, r.game) || { name: r.game }).name} · ${LEVEL_NAME[r.level] || r.level}`,
      sub: said(r) + (r.own ? ' · your numbers' : ''), value: K.fmtTime(r.at) }));
    return rows.length ? K.list(rows, { header: 'Your tests', inset: 14 }) : '';
  }

  /** the checks to pick from; withRecent: the tests under them (the folded phone's one page) */
  function listPage(app, sel, withRecent) {
    const s = app.state;
    const rows = checks(s).map((c) => {
      const last = s.results.find((r) => r.game === c.key);
      return K.row({ icon: c.key === 'ring' ? GLYPH : PAD, label: c.name,
        sub: c.enabled === false ? 'Off in config.lua' : c.key === 'ring' ? 'whip\'s ring' : 'On the phone',
        value: last ? (last.passed ? 'Passed' : 'Failed') : '', act: 'pick', d: { k: c.key }, sel: sel === c.key, hint: 'Open' });
    });
    return K.title('Skill Check Tester') + K.scroll(K.list(rows, { header: 'Pick one to test', inset: 58 }) + (withRecent ? recentList(s, 8) : ''));
  }

  /** the tablet's right side before a check is picked */
  const overview = (s) => recentList(s, 20) ||
    K.empty({ icon: GLYPH, title: 'Pick a skill check', text: 'Choose one on the left, change its numbers if you like, and start a test.' });

  async function load(app) {
    const s = app.state;
    try { s.cfg = await app.request('settings'); s.err = ''; }   // -> whip_phone:skilltest:settings
    catch (e) { s.err = e.reason || 'Could not load the skill checks'; }
  }

  async function start(app) {
    const s = app.state, key = s.sel, level = s.level;
    if (s.running || !checkOf(s, key)) return;
    const run = { game: key, level, own: anyChanged(s, key, level) };
    s.running = run;
    // a test whose answer never comes (the game was stopped) lets go of the button in the end
    setTimeout(() => { if (s.running === run) { s.running = null; app.render(); } }, 150000);
    try { await app.request('run', { game: key, level, settings: testNumbers(s, key, level) }); }   // -> whip_phone:skilltest:run
    catch (e) { if (s.running === run) s.running = null; app.toast(e.reason || 'Could not start that'); }
  }

  WhipPhone.module({
    id: 'skilltest', name: 'Skill Check Tester', version: '1.0.0', order: 95, icon: GLYPH,
    css: `
.row .r-sub{white-space:normal}
.st-goal{margin:4px 32px 14px;font-size:14px;line-height:1.45;color:var(--text2)}
.st-goal b{color:var(--orange);font-weight:600}
.st-go{display:flex;flex-direction:column;gap:10px;padding:0 16px 22px}
.st-clock{font-size:13px;color:var(--text2);text-align:center;font-variant-numeric:tabular-nums}
.st-clock i{font-style:normal;color:var(--accent)}
.st-res{display:flex;align-items:center;gap:10px;min-height:46px;padding:10px 14px;border-radius:var(--r-card);background:var(--fill)}
.st-res svg{flex:none;width:20px;height:20px}
.st-res.ok svg{color:var(--green)}
.st-res.no svg{color:var(--red)}
.st-res b{font-size:15px;font-weight:600;font-variant-numeric:tabular-nums}
.st-res span{margin-left:auto;font-size:13px;color:var(--accent)}
.st-step{display:flex;align-items:center;gap:6px;flex:none}
.st-step b{min-width:70px;text-align:center;font-weight:600;font-variant-numeric:tabular-nums}
.st-b{width:34px;height:34px;display:grid;place-items:center;border-radius:50%;background:var(--fill);color:var(--accent)}
.st-b svg{width:15px;height:15px}
.st-row.chg .st-step b,.row.chg .r-val{color:var(--accent)}
.st-li{flex-wrap:wrap;gap:10px}
.st-li .btn{height:34px;padding:0 14px;font-size:14px}
.st-was{font-size:13px;color:var(--text2)}
.st-reset{padding:0 16px 18px}
.st-note{margin:0 32px 22px;font-size:13px;line-height:1.45;color:var(--text2)}
`,
    state: () => ({ cfg: null, err: '', page: null, sel: null, level: 'medium', drafts: {}, results: [], running: null }),

    open(app) { return load(app); },
    route: (app) => (app.state.page ? 'c-' + app.state.sel : 'list'),
    info: () => 'Developer tool',
    back(app) {
      if (!app.state.page) return false;
      app.state.page = null;
      return true;
    },
    // LB / RB: the level; X: start, from anywhere on a check's page
    tab(app, dir) {
      const s = app.state;
      if (!s.page) return false;
      const i = LEVELS.findIndex(([v]) => v === s.level);
      s.level = LEVELS[clamp(i + dir, 0, LEVELS.length - 1)][0];
      return true;
    },
    tabLabel: () => 'Level',
    x(app) {
      const s = app.state;
      if (!s.page || !s.cfg || s.running) return null;
      return { label: 'Start test', run: () => start(app) };
    },

    render(app, v) {
      const s = app.state;
      if (!s.cfg) return K.screen('wait', K.empty({ icon: GLYPH, title: s.err ? 'Not available' : 'Loading…', text: s.err }));
      if (v.size === 'tablet') {
        const c = s.page ? checkOf(s, s.sel) : null;
        const main = c ? `${K.nav({ title: c.name })}${K.scroll(checkPage(app))}` : `${K.nav({ title: 'Your tests' })}${K.scroll(overview(s))}`;
        return K.screen('split', K.split(listPage(app, c ? c.key : null, false), main, 'sp-' + (c ? c.key : 'none')));
      }
      if (!s.page) return K.screen('main', listPage(app, null, true));
      const c = checkOf(s, s.sel);
      return K.screen('c-' + s.sel, K.nav({ back: 'Checks', act: 'home', title: c ? c.name : '' }) + K.scroll(checkPage(app)), { slide: true });
    },

    actions: {
      pick(app, d) { app.state.sel = d.k; app.state.page = 'check'; },
      home(app) { app.state.page = null; },
      level(app, d) { app.state.level = d.v; },
      start(app) { return start(app); },
      reset(app) { const m = app.state.drafts[app.state.sel]; if (m) { delete m[app.state.level]; delete m.every; } },
      step(app, d) {
        const s = app.state, f = fieldOf(s.sel, d.f);
        if (!f) return;
        const h = holder(s, s.sel, s.level, f, true);
        const dir = Number(d.dir) > 0 ? 1 : -1;
        if (f.kind === 'list') {
          const list = get(h.d, f.k), i = Number(d.i);
          if (!Array.isArray(list) || !(i >= 0 && i < list.length)) return;
          list[i] = clamp(Math.round(list[i] + dir * f.step), f.min, f.max);
          return;
        }
        const now = Number(get(h.d, f.k));
        const next = Number(((isFinite(now) ? now : f.def) + dir * f.step).toFixed(places(f.step)));
        put(h.d, f.k, clamp(next, limit(f, h.d, 'min'), limit(f, h.d, 'max')));
        settle(s.sel, h.d, f.k);
      },
      flip(app, d) {
        const s = app.state, f = fieldOf(s.sel, d.f);
        if (!f) return;
        const h = holder(s, s.sel, s.level, f, true);
        put(h.d, f.k, get(h.d, f.k) !== true);
      },
      cycle(app, d) {
        const s = app.state, f = fieldOf(s.sel, d.f);
        if (!f) return;
        const h = holder(s, s.sel, s.level, f, true);
        const i = f.opts.findIndex(([v]) => v === get(h.d, f.k));
        put(h.d, f.k, f.opts[(i + 1) % f.opts.length][0]);
      },
      addItem(app, d) {
        const s = app.state, f = fieldOf(s.sel, d.f);
        if (!f) return;
        const list = get(holder(s, s.sel, s.level, f, true).d, f.k);
        if (Array.isArray(list) && list.length < f.maxItems) list.push(clamp((list[list.length - 1] || 3) + 1, f.min, f.max));
      },
      dropItem(app, d) {
        const s = app.state, f = fieldOf(s.sel, d.f);
        if (!f) return;
        const list = get(holder(s, s.sel, s.level, f, true).d, f.k);
        if (Array.isArray(list) && list.length > f.minItems) list.pop();
      },
    },

    on: {
      // client/main.lua: { game, level, passed, why, ms, reason }. The phone came back out (the ring) or the game let
      // go of it: this app shows the answer.
      result(app, d) {
        const s = app.state;
        if (!d || typeof d !== 'object') return;
        const own = !!(s.running && s.running.game === d.game && s.running.own);
        s.running = null;
        s.results.unshift({ game: d.game, level: d.level, passed: d.passed === true, why: d.why, reason: d.reason, ms: d.ms, own, at: Date.now() });
        if (s.results.length > 20) s.results.length = 20;
        if (checkOf(s, d.game)) { s.sel = d.game; s.page = 'check'; }
        if (LEVEL_NAME[d.level]) s.level = d.level;
        if (!app.active) app.open('skilltest');
      },
    },
  });
})();
