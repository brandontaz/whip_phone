// Browser preview only: a stand-in for client/main.lua plus the framework, so the phone can be tried without the game.
// It answers the same requests the framework will (docs/FRAMEWORK.md) from in-memory sample data, and plays the
// pushes the framework would send (call progress, incoming texts and calls, notifications). Never loaded in game.
const S = () => Math.floor(Date.now() / 1000);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const digits = (n) => String(n ?? '').replace(/\D/g, '');
const pick = (a) => a[Math.floor(Math.random() * a.length)];

// The Skill Check Tester's numbers as the server sends them: whip_core's ring (config.lua section 10) and
// whip_phone's Config.SkillGames, as config.lua has them.
const SKILL_RING = {
  holdMs: 196, mouseSpeed: 1.0, difficulties: {
    easy: { pieces: 4, parts: 6, widest: 3, narrowest: 1, msPerPart: 650 },
    medium: { pieces: 8, parts: 12, widest: 4, narrowest: 1, msPerPart: 600 },
    hard: { pieces: 16, parts: 16, widest: 4, narrowest: 1, msPerPart: 575 },
  },
};
const SKILL_GAMES = [
  { key: 'bruteforce', name: 'Brute Force', goal: 'Lock each reel when its letter is on the line.', enabled: true, levels: {
    easy: { reels: 4, speed: 3.2, letters: 12, window: 0.32, missCost: 2, set: 'clear', lookalikes: false, bothWays: false, seconds: 25 },
    medium: { reels: 6, speed: 4.4, letters: 16, window: 0.27, missCost: 3, set: 'mixed', lookalikes: false, bothWays: false, seconds: 32 },
    hard: { reels: 8, speed: 5.6, letters: 20, window: 0.22, missCost: 4, set: 'all', lookalikes: true, bothWays: true, seconds: 40 } } },
  { key: 'coderecall', name: 'Code Recall', goal: 'Watch the code, then enter it.', enabled: true, levels: {
    easy: { rounds: [3, 4, 5], flashMs: 560, gapMs: 220, mistakes: 2, newCode: false, lastBackwards: false, seconds: 45 },
    medium: { rounds: [4, 5, 6, 7], flashMs: 430, gapMs: 170, mistakes: 1, newCode: false, lastBackwards: false, seconds: 55 },
    hard: { rounds: [5, 6, 7, 8], flashMs: 330, gapMs: 130, mistakes: 0, newCode: true, lastBackwards: true, seconds: 60 } } },
  { key: 'fragmentmatch', name: 'Fragment Match', goal: 'Slide the columns until the middle line matches the code.', enabled: true, levels: {
    easy: { columns: 4, letters: 6, afterWrong: 'columns', lookalikes: false, wrongCost: 3, seconds: 40 },
    medium: { columns: 6, letters: 8, afterWrong: 'count', lookalikes: false, wrongCost: 4, seconds: 45 },
    hard: { columns: 8, letters: 10, afterWrong: 'nothing', lookalikes: true, wrongCost: 5, seconds: 50 } } },
  { key: 'override', name: 'Override', goal: 'Press each arrow as it crosses the line.', enabled: true, levels: {
    easy: { lanes: 3, arrows: 14, fallSeconds: 1.9, windowMs: 140, gapMs: { min: 620, max: 1000 }, misses: 4 },
    medium: { lanes: 4, arrows: 20, fallSeconds: 1.5, windowMs: 110, gapMs: { min: 430, max: 760 }, misses: 3 },
    hard: { lanes: 4, arrows: 26, fallSeconds: 1.15, windowMs: 85, gapMs: { min: 300, max: 560 }, misses: 2 } } },
  { key: 'reroute', name: 'Reroute', goal: 'Turn the tiles until power reaches the exit.', enabled: true, levels: {
    easy: { grid: 4, keepRight: 0.2, decoys: { straight: 4, elbow: 5, tee: 1, dead: 0 }, seconds: 40 },
    medium: { grid: 5, keepRight: 0.15, decoys: { straight: 3, elbow: 5, tee: 2, dead: 1 }, seconds: 50 },
    hard: { grid: 6, keepRight: 0.1, decoys: { straight: 3, elbow: 4, tee: 3, dead: 2 }, seconds: 60 } } },
  { key: 'safecrack', name: 'Safe Crack', goal: 'Turn the dial and set each number on the heavy click.', enabled: true, levels: {
    easy: { numbers: 2, hint: 2, wrongCost: 3, wrongRestarts: false, seconds: 40 },
    medium: { numbers: 3, hint: 1, wrongCost: 4, wrongRestarts: false, seconds: 50 },
    hard: { numbers: 4, hint: 0, wrongCost: 4, wrongRestarts: true, seconds: 60 } } },
  { key: 'stabilise', name: 'Stabilise', goal: 'Keep the needle inside the band until the drill is through.', enabled: true, levels: {
    easy: { band: 0.26, bandSpeed: 0.07, drillSeconds: 7, leaving: 0, overheatSeconds: 1.6, seconds: 25 },
    medium: { band: 0.2, bandSpeed: 0.11, drillSeconds: 9, leaving: 0.25, overheatSeconds: 1.3, seconds: 30 },
    hard: { band: 0.14, bandSpeed: 0.16, drillSeconds: 11, leaving: 0.5, overheatSeconds: 1.0, seconds: 36 } } },
];

export function createMock({ modules = ['phone', 'messages', 'bank', 'business', 'settings'] } = {}) {
  // a sample character, on their own SIM (mine: they may change its card, Settings > My card)
  const me = { number: '6895550142', name: 'Alex Carter', mine: true, card: null };
  // the numbers Alex owns (Settings > SIM): this one, and an old SIM they locked
  const myNumbers = [{ number: '6895550142', locked: false }, { number: '0415550177', locked: true }];
  let nextId = 100, bridge = null;
  const contacts = [
    // Sofia put a picture on her card (server/card.lua): it shows here, framed as she framed it
    { id: 1, name: 'Sofia Reyes', number: '6895550148', picture: 'https://r2.fivemanage.com/preview/sofia.jpg', pictureFrame: { x: 50, y: 35, z: 1.4 } },
    { id: 2, name: 'Ray (Mechanic)', number: '6895550192' },
    { id: 3, name: 'Mom', number: '2275550101' }, { id: 4, name: 'Marcus Lee', number: '0415550177' },
    { id: 5, name: 'Ava Chen', number: '8695550125' }, { id: 6, name: 'Jules Park', number: '9155550164' },
  ];
  const t0 = S();
  const msgs = {      // number -> [{ id, me, text, time }]
    '6895550148': [{ id: 1, me: false, text: 'Car meet is still on for tonight 🚗', time: t0 - 3600 }, { id: 2, me: false, text: 'Del Perro Pier, 9pm. Bring the Sultan!', time: t0 - 3500 }],
    '6895550192': [{ id: 3, me: true, text: 'Hey, how’s the Sultan looking?', time: t0 - 7200 }, { id: 4, me: false, text: 'Engine and brakes are done. She’s ready when you are 🔧', time: t0 - 7000 }],
    '2275550101': [{ id: 5, me: false, text: 'Call me when you’re free x', time: t0 - 90000 }],
    '0415550177': [{ id: 6, me: false, text: 'did you see that pile-up on the Del Perro freeway', time: t0 - 95000 }, { id: 7, me: true, text: 'Haha yeah, wild', time: t0 - 94800 }],
    '7175550199': [{ id: 8, me: false, text: 'Your parking permit for Pillbox Hill expires tomorrow.', time: t0 - 200000 }],
  };
  const unread = { '6895550148': 2, '6895550192': 1 };
  const cars = [
    { plate: 'WHIP 042', name: 'Pegassi Zentorno', fuel: 72, state: 'garage', where: 'Alta St garage', hue: 0 },
    { plate: '4ZX 811', name: 'Karin Sultan RS', fuel: 38, state: 'out', where: 'Pillbox Hill', hue: 200 },
    { plate: '17ROD3', name: 'Bravado Banshee', fuel: 9, state: 'impound', where: 'LSPD Impound', hue: 110 },
  ];
  // 'example' in the module list = the example app another resource would register (mount mode, its own style)
  const EXAMPLE = { id: 'garage', script: 'dev/example/app.js', ns: 'example_garage', external: true };
  // 'example3d' = the 3D map app (dev/example_3d/app.js, ns example_atlas). Places in GTA world coordinates (metres)
  const EXAMPLE_3D = { id: 'atlas', script: 'dev/example_3d/app.js', ns: 'example_atlas', external: true };
  const PLACES = [
    { id: 'fleeca', name: 'Fleeca Bank', kind: 'bank', x: 150, y: -1040 },
    { id: 'pillbox', name: 'Pillbox Medical', kind: 'medical', x: 300, y: -590 },
    { id: 'lsc', name: 'LS Customs', kind: 'garage', x: -365, y: -130 },
    { id: 'pier', name: 'Del Perro Pier', kind: 'landmark', x: -1850, y: -1230 },
    { id: 'lsia', name: 'LS International', kind: 'airport', x: -1240, y: -2700 },
    { id: 'sign', name: 'Vinewood Sign', kind: 'landmark', x: 710, y: 1200 },
    { id: 'sandy', name: 'Sandy Shores', kind: 'town', x: 1850, y: 3650 },
    { id: 'chiliad', name: 'Mount Chiliad', kind: 'landmark', x: 450, y: 5560 },
    { id: 'paleto', name: 'Paleto Bay', kind: 'town', x: -150, y: 6300 },
  ];
  const WALK = [[215, -810, 'Pillbox Hill'], [120, -990, 'Legion Square'], [-60, -1080, 'Strawberry Ave'], [-250, -890, 'Alta St'], [40, -690, 'Pillbox Hill']];
  let walk = 0;
  const me3d = () => ({ x: WALK[walk][0], y: WALK[walk][1], street: WALK[walk][2] });
  const recents = [
    { id: 1, number: '2275550101', dir: 'missed', time: t0 - 5000 }, { id: 2, number: '6895550192', dir: 'out', time: t0 - 20000, duration: 151 },
    { id: 3, number: '6895550148', dir: 'in', time: t0 - 90000, duration: 47 }, { id: 4, number: '0415550177', dir: 'missed', time: t0 - 180000 },
    { id: 5, number: '9155550164', dir: 'out', time: t0 - 260000, duration: 12 },
  ];
  const REPLIES = { '6895550148': ['Yesss, see you there 🙌', 'Don’t be late this time 😂'], '6895550192': ['Bring it by anytime 👍', 'Turbo’s in too, go easy on her'],
    '2275550101': ['Love you! x', 'Did you eat today?'], '0415550177': ['lmao', 'facts', 'pull up later?'], '8695550125': ['😍', 'Ok! sending more'], '9155550164': ['On my way', '👍'] };
  const TEXTS = ['yo you pulling up to the meet later? 🚗', 'Where you at?', 'Got a minute? Need a hand with something', 'lol check the news', 'Running 10 late, sorry!'];
  // ---- the bank (server/bank.lua answers these from whip_core's bank, as the player): Alex's accounts, with the bank's
  // own rules (withdraw to send, managers share, you give only roles below your own, 5 savings / shared accounts)
  const RANKS = { view: 1, deposit: 2, withdraw: 3, manager: 4, owner: 5 };
  const bank = {
    accounts: [
      { id: 11, number: 'WB-104233', label: 'Personal Account', type: 'personal', balance: 4820, role: 'owner', default: true, frozen: false },
      { id: 12, number: 'WB-551902', label: 'Rainy Day', type: 'savings', balance: 12500, role: 'owner', default: false, frozen: false },
      { id: 13, number: 'WB-330147', label: 'House Money', type: 'shared', balance: 860, role: 'owner', default: false, frozen: false },
      { id: 14, number: 'WB-778210', label: 'LS Customs', type: 'business', balance: 48315, role: 'manager', default: false, frozen: false, job: 'Los Santos Customs' },
    ],
    access: {
      13: [{ charId: 7, name: 'Alex Carter', role: 'owner' }, { charId: 9, name: 'Sofia Reyes', role: 'withdraw' }, { charId: 12, name: 'Marcus Lee', role: 'view' }],
      14: [{ charId: 3, name: 'Benny Ortiz', role: 'owner' }, { charId: 7, name: 'Alex Carter', role: 'manager' }, { charId: 15, name: 'Jules Park', role: 'deposit' }],
    },
    nearby: [{ src: 4, name: 'Sofia Reyes', dist: 2 }, { src: 6, name: 'Dante Rivera', dist: 7 }],
    srcChar: { 4: 9, 6: 21 },
    chars: { 9: 'Sofia Reyes', 12: 'Marcus Lee', 15: 'Jules Park', 21: 'Dante Rivera', 1042: 'Ava Chen' },
    elsewhere: { 'WB-900417': 'Sofia Reyes', 'WB-612090': 'Ray (Mechanic)' },
    tx: {},
    next: 500,
  };
  const BANK_TX = {
    11: [['Paycheck · LS Customs', 1850, 'in', 26], ['Ray (Mechanic) · brakes', 640, 'out', 50], ['Cluckin\' Bell', 23, 'out', 75], ['Transfer to Rainy Day', 500, 'out', 120], ['Starting balance', 1000, 'in', 900]],
    12: [['Transfer from Personal', 500, 'in', 120], ['Interest', 38, 'in', 400], ['Transfer from Personal', 2000, 'in', 700]],
    13: [['Rent · Sofia', 425, 'in', 30], ['Power bill', 112, 'out', 90], ['Rent · Alex', 425, 'in', 200]],
    14: [['Sale · respray', 1200, 'in', 3], ['Sale · turbo kit', 8500, 'in', 9], ['Parts order', 3920, 'out', 30], ['Paycheck · Alex', 1850, 'out', 26]],
  };
  for (const [id, rows] of Object.entries(BANK_TX)) {
    let bal = bank.accounts.find((a) => a.id === +id).balance;
    bank.tx[id] = rows.map(([text, amount, dir, minsAgo]) => {
      const row = { id: ++bank.next, amount, dir, text, time: t0 - minsAgo * 60, balance: bal };
      bal += dir === 'in' ? -amount : amount;
      return row;
    });
  }
  // ---- jobs (server/business.lua answers these from whip_core's jobs, with the player as `by`): Alex manages LS Customs,
  // cooks at Cluckin' Bell, and is an officer at a job that puts people on duty itself. The jobs system's rules: the
  // permissions, and nothing at or above your own level (level 100 does anything).
  const jobs = {
    7: { id: 7, name: 'Los Santos Customs', owner: 3, selfClock: true, declared: { tune: 'Tune customer cars' },
      roles: [{ roleId: 71, name: 'Owner', level: 100, permissions: {} },
        { roleId: 72, name: 'Manager', level: 50, permissions: { canHire: true, canFire: true, canDemote: true, canManage: true, tune: true, bankAccess: 'withdraw' } },
        { roleId: 73, name: 'Mechanic', level: 20, permissions: { tune: true, bankAccess: 'deposit' } },
        { roleId: 75, name: 'Accountant', level: 10, permissions: { bankAccess: 'manager' } },   // more than Alex: he can't give it
        { roleId: 74, name: 'Apprentice', level: 1, permissions: {} }],
      staff: { 7: { roleId: 72, onDuty: true }, 15: { roleId: 73, onDuty: true }, 12: { roleId: 73, onDuty: false }, 21: { roleId: 74, onDuty: false } } },
    8: { id: 8, name: 'Cluckin\' Bell', owner: null, selfClock: true, declared: {},
      roles: [{ roleId: 81, name: 'Boss', level: 100, permissions: {} }, { roleId: 82, name: 'Cook', level: 1, permissions: {} }],
      staff: { 7: { roleId: 82, onDuty: false }, 9: { roleId: 81, onDuty: true } } },
    9: { id: 9, name: 'LSPD', owner: null, selfClock: false, declared: { cuff: 'Cuff suspects' },
      roles: [{ roleId: 91, name: 'Chief', level: 100, permissions: {} }, { roleId: 92, name: 'Officer', level: 20, permissions: { cuff: true } }],
      staff: { 7: { roleId: 92, onDuty: false } } },
  };
  const jobNames = { 3: 'Benny Ortiz', 7: me.name, 9: 'Sofia Reyes', 12: 'Marcus Lee', 15: 'Jules Park', 21: 'Dante Rivera', 1042: 'Ava Chen' };
  const jrole = (j, id) => j.roles.find((r) => r.roleId === +id);
  const jmine = (id) => { const j = jobs[id]; const e = j && j.staff[7]; if (!e) throw new Error('You do not work there'); return { j, r: jrole(j, e.roleId), e }; };
  const jcan = (r, p) => r.level >= 100 || !!(r.permissions && r.permissions[p]);
  const joutranks = (r, level) => r.level >= 100 || level < r.level;
  const jsorted = (j) => [...j.roles].sort((a, b) => b.level - a.level);
  // never more than you have (whip_core's actorCovers): what Alex's rank holds, and may he hand out `role`
  const JBANK = { none: 0, view: 1, deposit: 2, withdraw: 3, manager: 4 };
  const jknown = (j) => ['canHire', 'canFire', 'canPromote', 'canDemote', 'canManage', ...Object.keys(j.declared)];
  const jholds = (j, r) => ({ perms: Object.fromEntries(jknown(j).filter((k) => jcan(r, k)).map((k) => [k, true])),
    bank: r.level >= 100 ? 'manager' : (r.permissions.bankAccess || 'none') });
  const jcovers = (j, r, perms, before = {}) => {
    if (r.level >= 100) return true;
    const h = jholds(j, r);
    if (jknown(j).some((k) => perms[k] === true && before[k] !== true && !h.perms[k])) return false;
    const give = JBANK[perms.bankAccess] || 0;
    return !(give > (JBANK[before.bankAccess] || 0) && give > JBANK[h.bank]);
  };
  const POWER = 'That rank can do more than yours: you cannot give more than you have';
  const bacct = (id) => bank.accounts.find((a) => a.id === +id);
  const bankLog = (a, dir, amount, text) => { (bank.tx[a.id] = bank.tx[a.id] || []).unshift({ id: ++bank.next, amount, dir, text, time: S(), balance: a.balance }); };
  const bankMine = (id) => { const a = bacct(id); if (!a) throw new Error('That account is not yours'); return a; };
  let settings = null;
  try { settings = JSON.parse(localStorage.getItem('whip_phone_preview_settings') || 'null'); } catch (e) { settings = null; }
  // the home screen's arrangement (the SIM's, in game: whip_phone:home:save)
  let home = null;
  try { home = JSON.parse(localStorage.getItem('whip_phone_preview_home') || 'null'); } catch (e) { home = null; }
  const calls = {};
  // the SIM's block list (server/blocks.lua): a blocked number's texts and calls never reach the page
  let blocks = [];
  const isBlocked = (n) => blocks.some((b) => b.number === digits(n));

  const push = (module, event, data) => bridge && bridge.emit({ type: 'push', module, event, data });
  let skillTest = null;   // the Skill Check Tester's phone game playing now (whip_phone:skilltest:run)
  let shown = 'hidden';   // what the page says is showing ('state'): a held game folds back to it, as Lua does
  const threadList = () => Object.entries(msgs).map(([number, list]) => {
    const l = list[list.length - 1];
    return { number, unread: unread[number] || 0, last: l ? { text: l.text, time: l.time, me: l.me } : null };
  }).sort((a, b) => (b.last ? b.last.time : 0) - (a.last ? a.last.time : 0));
  const addRecent = (number, dir, duration = 0) => { recents.unshift({ id: ++nextId, number, dir, time: S(), duration }); };
  const endCall = (id, state, reason) => {
    const c = calls[id];
    if (!c || c.done) return;
    c.done = true;
    if (c.dir === 'in' && state === 'missed') addRecent(c.number, 'missed');
    else addRecent(c.number, c.dir, c.start ? S() - c.start : 0);
    push('phone', 'state', { callId: id, state, reason });
  };

  const handlers = {
    // ---- core
    'whip_phone:contacts:list': () => contacts,
    'whip_phone:contacts:save': (c) => {
      const number = digits(c.number);
      if (!c.name || number.length < 3) throw new Error('Name and number are required');
      const ex = c.id != null ? contacts.find((x) => String(x.id) === String(c.id)) : null;
      if (ex) Object.assign(ex, { name: c.name, number }); else contacts.push({ id: ++nextId, name: c.name, number });
      push('contacts', 'changed');
      return ex || contacts[contacts.length - 1];
    },
    'whip_phone:contacts:delete': ({ id }) => { const i = contacts.findIndex((x) => String(x.id) === String(id)); if (i >= 0) contacts.splice(i, 1); return true; },
    'whip_phone:settings:save': (s) => { settings = s; try { localStorage.setItem('whip_phone_preview_settings', JSON.stringify(s)); } catch (e) { /* private window */ } return true; },
    'whip_phone:home:save': ({ home: h }) => { home = h; try { localStorage.setItem('whip_phone_preview_home', JSON.stringify(h)); } catch (e) { /* private window */ } return true; },
    // My card (server/card.lua): a name and a picture link with its framing; the real server takes only accepted sites
    'whip_phone:settings:card': ({ name, picture, frame }) => {
      name = String(name || '').trim(); picture = String(picture || '').trim();
      if (picture && !/^https:\/\/[A-Za-z0-9.-]+\/[A-Za-z0-9\-._/]+$/.test(picture)) throw new Error('That link is not a picture\'s address');
      me.card = name || picture ? { name: name || undefined, picture: picture || undefined, frame: picture ? frame : undefined } : null;
      return me.card || {};
    },
    // the SIM page (Settings > SIM): the character's numbers, lockable (server/contract.lua)
    'whip_phone:settings:numbers': () => {
      const mine = myNumbers.find((x) => x.number === me.number);
      return { current: me.number, state: mine && mine.locked ? 'locked' : 'ok', currentMine: !!mine, currentLocked: !!(mine && mine.locked), numbers: myNumbers };
    },
    'whip_phone:settings:lock': ({ number, locked }) => {
      const n = myNumbers.find((x) => x.number === number);
      if (!n) throw new Error('That is not your number');
      n.locked = !!locked;
      return true;
    },
    // the block list (server/blocks.lua), the latest first
    'whip_phone:blocks:list': () => blocks,
    'whip_phone:blocks:add': ({ number }) => {
      const n = digits(number);
      if (n.length !== 10) throw new Error('A phone number is 10 digits');
      if (n === me.number) throw new Error('You cannot block your own number');
      if (!isBlocked(n)) blocks.unshift({ number: n, time: S() });
      return true;
    },
    'whip_phone:blocks:remove': ({ number }) => { const n = digits(number); blocks = blocks.filter((b) => b.number !== n); return true; },
    // ---- the Skill Check Tester (server/skilltest.lua; a developer app): config.lua's numbers, and a test played as
    // Lua plays it (client/main.lua): a phone game held on the phone, the ring answered after a moment
    'whip_phone:skilltest:settings': () => ({ ring: SKILL_RING, games: SKILL_GAMES }),
    'whip_phone:skilltest:run': ({ game, level, settings }) => {
      if (game === 'ring') {
        setTimeout(() => push('skilltest', 'result', { game, level, passed: Math.random() < 0.6, why: 'failed', ms: 2400 + Math.round(Math.random() * 3000) }), 1200);
        return true;
      }
      const g = SKILL_GAMES.find((x) => x.key === game);
      if (!g) throw new Error('There is no such skill check');
      skillTest = { game, level, was: shown };
      bridge && bridge.emit({ type: 'force', app: 'skillcheck', args: { game, level, cfg: settings, label: g.name, goal: g.goal } });
      return true;
    },
    // ---- phone
    'whip_phone:phone:recents': () => recents,
    'whip_phone:phone:dial': ({ number }) => {
      const n = digits(number);
      if (n.length < 7) throw new Error('Number not in service');
      if (n === me.number) throw new Error('You can’t call yourself');
      const id = ++nextId;
      calls[id] = { number: n, dir: 'out' };
      setTimeout(() => !calls[id].done && push('phone', 'state', { callId: id, state: 'ringing' }), 500);
      if (n === '6895550192') setTimeout(() => endCall(id, 'missed', 'No answer'), 7000);                 // Ray never picks up
      else setTimeout(() => { if (!calls[id].done) { calls[id].start = S(); push('phone', 'state', { callId: id, state: 'active', startedAt: calls[id].start }); } }, 2800);
      return { callId: id, state: 'dialing' };
    },
    'whip_phone:phone:answer': ({ callId }) => { const c = calls[callId]; if (!c || c.done) throw new Error('The call ended'); c.start = S(); return { state: 'active', startedAt: c.start }; },
    'whip_phone:phone:decline': ({ callId }) => { endCall(callId, 'declined'); return true; },
    'whip_phone:phone:end': ({ callId }) => { endCall(callId, 'ended'); return true; },
    'whip_phone:phone:mute': () => true,
    'whip_phone:phone:speaker': () => true,
    'whip_phone:phone:dtmf': () => true,
    // ---- messages
    'whip_phone:messages:threads': () => threadList(),
    'whip_phone:messages:thread': ({ number }) => msgs[digits(number)] || [],
    'whip_phone:messages:read': ({ number }) => { unread[digits(number)] = 0; return true; },
    'whip_phone:messages:send': ({ number, text }) => {
      const n = digits(number);
      if (!String(text || '').trim()) throw new Error('Empty message');
      const m = { id: ++nextId, me: true, text: String(text).slice(0, 500), time: S() };
      (msgs[n] = msgs[n] || []).push(m);
      const pool = REPLIES[n];
      if (pool) setTimeout(() => receive(n, pick(pool)), 2400);   // contacts write back in the preview
      return { id: m.id, time: m.time };
    },
    // ---- bank
    'whip_phone:bank:accounts': () => bank.accounts,
    'whip_phone:bank:account': ({ id }) => {
      const a = bankMine(id), r = RANKS[a.role];
      return { account: a, history: (bank.tx[a.id] || []).slice(0, 30),
        can: { transfer: r >= 3, share: r >= 4, close: a.role === 'owner' && !a.default && (a.type === 'savings' || a.type === 'shared') } };
    },
    'whip_phone:bank:transfer': ({ from, to, number, amount, message }) => {
      const a = bankMine(from), n = Math.floor(+amount);
      if (!(n >= 1)) throw new Error('Enter a whole number of dollars');
      if (RANKS[a.role] < 3) throw new Error('No withdraw permission on source account');
      let dest = null, destName;
      if (number != null) {
        let num = String(number).toUpperCase().replace(/\s/g, '');
        if (/^\d{6}$/.test(num)) num = 'WB-' + num;
        if (!/^WB-\d{6}$/.test(num)) throw new Error('An account number looks like WB-000000');
        dest = bank.accounts.find((x) => x.number === num);
        destName = dest ? dest.label : bank.elsewhere[num];
        if (!destName) throw new Error(`There is no account ${num}`);
      } else { dest = bank.accounts.find((x) => x.id === +to); if (!dest) throw new Error('Pick one of your accounts'); destName = dest.label; }
      if (dest && dest.id === a.id) throw new Error('That is the same account');
      if (n > a.balance) throw new Error('Insufficient funds');
      a.balance -= n; bankLog(a, 'out', n, message || `Transfer to ${destName}`);
      if (dest) { dest.balance += n; bankLog(dest, 'in', n, message || `Transfer from ${a.label}`); }
      return true;
    },
    'whip_phone:bank:access': ({ id }) => {
      const a = bankMine(id);
      if (RANKS[a.role] < 4) throw new Error('Only the owner and managers see who shares it');
      return (bank.access[a.id] || [{ charId: 7, name: me.name, role: a.role }]).map((p) => ({ ...p, me: p.charId === 7 }));
    },
    'whip_phone:bank:share': ({ id, role, src, charId }) => {
      const a = bankMine(id), list = bank.access[a.id] = bank.access[a.id] || [{ charId: 7, name: me.name, role: a.role }];
      if (!RANKS[role] || role === 'owner') throw new Error('Pick what they may do');
      const cid = src != null ? bank.srcChar[src] : +charId;
      if (src != null && !cid) throw new Error('They are not here any more');
      const name = bank.chars[cid];
      if (!name) throw new Error(`No character has the ID ${charId}`);
      if (RANKS[role] >= RANKS[a.role]) throw new Error('Cannot grant a role equal to or higher than your own');
      const ex = list.find((p) => p.charId === cid);
      if (ex && RANKS[ex.role] >= RANKS[a.role]) throw new Error('Cannot change the access of someone at or above your own level');
      if (ex) ex.role = role; else list.push({ charId: cid, name, role });
      return { name };
    },
    'whip_phone:bank:unshare': ({ id, charId }) => {
      const a = bankMine(id), list = bank.access[a.id] || [], i = list.findIndex((p) => p.charId === +charId);
      if (i < 0) throw new Error('They have no access');
      if (RANKS[list[i].role] >= RANKS[a.role]) throw new Error('Cannot revoke someone at or above your own level');
      list.splice(i, 1);
      return true;
    },
    'whip_phone:bank:nearby': () => bank.nearby,
    'whip_phone:bank:open': ({ label, type }) => {
      if (!String(label || '').trim()) throw new Error('Give the account a name');
      if (type !== 'savings' && type !== 'shared') throw new Error('Pick savings or shared');
      if (bank.accounts.filter((a) => a.role === 'owner' && (a.type === 'savings' || a.type === 'shared')).length >= 5) throw new Error('A character may have at most 5 savings and shared accounts');
      const a = { id: ++bank.next, number: 'WB-' + String(100000 + Math.floor(Math.random() * 899999)), label: String(label).slice(0, 50), type, balance: 0, role: 'owner', default: false, frozen: false };
      bank.accounts.push(a);
      return { id: a.id, number: a.number };
    },
    'whip_phone:bank:close': ({ id }) => {
      const a = bankMine(id);
      if (a.role !== 'owner') throw new Error('Only the owner can close this account');
      if (a.default) throw new Error('Cannot close default account');
      if (a.type !== 'savings' && a.type !== 'shared') throw new Error('Only a savings or shared account can be closed');
      if (a.balance > 0) throw new Error('Account must have zero balance');
      bank.accounts.splice(bank.accounts.indexOf(a), 1);
      return true;
    },
    // ---- business
    'whip_phone:business:jobs': () => Object.values(jobs).filter((j) => j.staff[7]).map((j) => { const r = jrole(j, j.staff[7].roleId);
      return { id: j.id, name: j.name, role: r.name, level: r.level, onDuty: j.staff[7].onDuty }; }).sort((a, b) => a.name.localeCompare(b.name)),
    'whip_phone:business:job': ({ id }) => {
      const { j, r, e } = jmine(id);
      const can = { hire: jcan(r, 'canHire'), fire: jcan(r, 'canFire'), promote: jcan(r, 'canPromote'), demote: jcan(r, 'canDemote'), manage: jcan(r, 'canManage') };
      const out = { job: { id: j.id, name: j.name, role: r.name, level: r.level, onDuty: e.onDuty, selfClock: j.selfClock }, can };
      if (!Object.values(can).some(Boolean)) return out;
      out.roles = jsorted(j).map((x) => ({ roleId: x.roleId, name: x.name, level: x.level, give: joutranks(r, x.level) && jcovers(j, r, x.permissions) }));
      out.staff = Object.entries(j.staff).map(([c, x]) => { const rr = jrole(j, x.roleId);
        return { charId: +c, name: jobNames[c] || 'Character #' + c, roleId: rr.roleId, role: rr.name, level: rr.level, onDuty: x.onDuty, me: +c === 7, owner: +c === j.owner }; });
      if (j.owner && !j.staff[j.owner]) out.staff.push({ charId: j.owner, name: jobNames[j.owner], role: out.roles[0].name, level: out.roles[0].level, owner: true, unhired: true, onDuty: false });
      out.staff.sort((a, b) => b.level - a.level || a.name.localeCompare(b.name));
      return out;
    },
    'whip_phone:business:clockOn': ({ id }) => { const { j, e } = jmine(id); if (!j.selfClock) throw new Error('This job puts people on duty itself'); if (e.onDuty) throw new Error('Already on duty'); e.onDuty = true; return true; },
    'whip_phone:business:clockOff': ({ id }) => { const { e } = jmine(id); if (!e.onDuty) throw new Error('They are not on duty'); e.onDuty = false; return true; },
    'whip_phone:business:setRole': ({ id, charId, roleId }) => {
      const { j, r } = jmine(id), t = j.staff[charId], to = jrole(j, roleId);
      if (!t) throw new Error('They do not work there'); if (!to) throw new Error('No such role at that job');
      const from = jrole(j, t.roleId), up = to.level > from.level;
      if (!jcan(r, up ? 'canPromote' : 'canDemote')) throw new Error('Your role is not allowed to do that');
      if (+charId === 7 || !joutranks(r, from.level) || !joutranks(r, to.level)) throw new Error('They (or that role) outrank you');
      if (!jcovers(j, r, to.permissions, from.permissions)) throw new Error(POWER);
      t.roleId = to.roleId; return true;
    },
    'whip_phone:business:fire': ({ id, charId }) => {
      const { j, r } = jmine(id), t = j.staff[charId];
      if (!t) throw new Error('They do not work there');
      if (!jcan(r, 'canFire')) throw new Error('Your role is not allowed to do that');
      if (!joutranks(r, jrole(j, t.roleId).level)) throw new Error('They (or that role) outrank you');
      delete j.staff[charId]; return true;
    },
    'whip_phone:business:hire': ({ id, roleId, src, charId }) => {
      const { j, r } = jmine(id), to = jrole(j, roleId);
      const cid = src != null ? bank.srcChar[src] : +charId;
      if (src != null && !cid) throw new Error('They are not here any more');
      if (!jobNames[cid] && !bank.chars[cid]) throw new Error(`No character has the ID ${charId}`);
      if (!to) throw new Error('No such role at that job');
      if (!jcan(r, 'canHire')) throw new Error('Your role is not allowed to do that');
      if (!joutranks(r, to.level)) throw new Error('They (or that role) outrank you');
      if (!jcovers(j, r, to.permissions)) throw new Error(POWER);
      if (j.staff[cid]) throw new Error('They already work there');
      j.staff[cid] = { roleId: to.roleId, onDuty: false }; jobNames[cid] = jobNames[cid] || bank.chars[cid];
      return { name: jobNames[cid] };
    },
    'whip_phone:business:nearby': () => bank.nearby,
    'whip_phone:business:roles': ({ id }) => {
      const { j, r } = jmine(id);
      if (!jcan(r, 'canManage')) throw new Error('Your rank does not manage the business');
      const perms = [['canHire', 'Hire'], ['canFire', 'Fire'], ['canPromote', 'Promote'], ['canDemote', 'Demote'], ['canManage', 'Manage the business']].map(([key, label]) => ({ key, label }))
        .concat(Object.entries(j.declared).map(([key, label]) => ({ key, label, custom: true })));
      const h = jholds(j, r);
      return { roles: jsorted(j).map((x) => structuredClone(x)), perms, level: r.level, have: { perms: h.perms, bank: h.bank } };
    },
    'whip_phone:business:saveRole': ({ id, roleId, name, level, permissions }) => {
      const { j, r } = jmine(id);
      if (!jcan(r, 'canManage')) throw new Error('Your role is not allowed to do that');
      name = String(name || '').trim(); level = Math.floor(+level);
      if (!name || name.length > 60) throw new Error('A role name is 1 to 60 characters');
      if (!(level >= 1 && level <= 100)) throw new Error('A role\'s level is a whole number from 1 to 100');
      const same = j.roles.find((x) => x.name.toLowerCase() === name.toLowerCase());
      if (same && same.roleId !== +roleId) throw new Error(`There is already a role called ${same.name}`);
      const clean = {};
      for (const [k, v] of Object.entries(permissions || {})) if (k === 'bankAccess') { if (v !== 'none') clean.bankAccess = v; } else if (v === true) clean[k] = true;
      if (roleId) {
        const role = jrole(j, roleId);
        if (!role) throw new Error('No such role at that job');
        if (!joutranks(r, role.level) || !joutranks(r, level)) throw new Error('They (or that role) outrank you');
        if (role.level >= 100 && level < 100 && !j.roles.some((x) => x !== role && x.level >= 100)) throw new Error('The job needs a level 100 role: its owner holds it');
        if (!jcovers(j, r, clean, role.permissions)) throw new Error(POWER);
        Object.assign(role, { name, level, permissions: clean });
        return { roleId: role.roleId };
      }
      if (!joutranks(r, level)) throw new Error('They (or that role) outrank you');
      if (!jcovers(j, r, clean)) throw new Error(POWER);
      const role = { roleId: ++nextId, name, level, permissions: clean };
      j.roles.push(role);
      return { roleId: role.roleId };
    },
    'whip_phone:business:deleteRole': ({ id, roleId }) => {
      const { j, r } = jmine(id), role = jrole(j, roleId);
      if (!role) throw new Error('No such role at that job');
      if (!jcan(r, 'canManage')) throw new Error('Your role is not allowed to do that');
      if (!joutranks(r, role.level)) throw new Error('They (or that role) outrank you');
      if (Object.values(j.staff).some((x) => x.roleId === role.roleId)) throw new Error('Move the people in that role to another role first');
      j.roles.splice(j.roles.indexOf(role), 1);
      return true;
    },
    // the example app from another resource (dev/example/app.js, ns example_garage)
    'example_atlas:places': () => PLACES,
    'example_atlas:me': () => me3d(),
    'example_atlas:waypoint': ({ id }) => { const p = PLACES.find((x) => x.id === id); if (!p) throw new Error('Unknown place'); return { x: p.x, y: p.y }; },
    'example_garage:cars': () => cars,
    'example_garage:toggle': ({ plate }) => {
      const c = cars.find((x) => x.plate === plate);
      if (!c) throw new Error('Not your car');
      if (c.state === 'impound') throw new Error('Pay the release fee at the LSPD impound first');
      c.state = c.state === 'garage' ? 'out' : 'garage';
      c.where = c.state === 'out' ? 'Pillbox Hill' : 'Alta St garage';
      return c;
    },
  };

  function receive(number, text) {
    if (isBlocked(number)) return;   // kept from this SIM, as the server does
    const m = { id: ++nextId, me: false, text, time: S() };
    (msgs[number] = msgs[number] || []).push(m);
    unread[number] = (unread[number] || 0) + 1;
    push('messages', 'incoming', { id: m.id, number, text, time: m.time });
  }

  let callVolume = 100;
  return {
    async post(name, data, b) {
      bridge = b;
      if (name === 'ready') {
        setTimeout(() => {
          b.emit({ type: 'init', config: {}, modules: modules.map((id) => (id === 'example' ? EXAMPLE : id === 'example3d' ? EXAMPLE_3D : { id, script: `modules/${id}/module.js` })) });
          if (modules.includes('example3d')) setInterval(() => { walk = (walk + 1) % WALK.length; push('atlas', 'moved', me3d()); }, 6000);
          b.emit({ type: 'session', session: { ...me, settings, home } });
        }, 0);
        return {};
      }
      if (name === 'request') {
        const h = handlers[data.name];
        await wait(90 + Math.random() * 160);                // a little network-ish latency
        if (!h) return { ok: false, reason: `No framework handler for ${data.name}` };
        try { return { ok: true, data: structuredClone(await h(data.args || {})) }; } catch (e) { return { ok: false, reason: e.message }; }
      }
      if (name === 'state' && data && typeof data.state === 'string') shown = data.state;
      if (name === 'forcedDone' && skillTest && data && data.app === 'skillcheck') {   // a tester's game ended: Lua lets go
        const t = skillTest, r = data.result || {};
        skillTest = null;
        b.emit({ type: 'unforce' });
        if (t.was === 'phone') b.emit({ type: 'open', mode: 'phone' });
        push('skilltest', 'result', { game: t.game, level: t.level, passed: r.passed === true, why: r.passed ? null : r.why, ms: r.ms, reason: r.reason });
        return {};
      }
      if (name === 'callVolume') {                            // the voice system's "Phone call volume" (Lua: client/main.lua)
        if (typeof data.value === 'number') callVolume = Math.max(0, Math.min(100, Math.round(data.value)));
        return { value: callVolume };
      }
      return {};                                              // close, state, typing: nothing to do without Lua
    },
    // ---- dev panel helpers: what the framework would push
    incomingText() { const c = pick(contacts); receive(c.number, pick(TEXTS)); },
    /** Sofia sends Alex $250: the bank's event refreshes an open Bank app, and the owner's phone says so */
    incomingMoney() {
      const a = bacct(11);
      a.balance += 250; bankLog(a, 'in', 250, 'Pizza money');
      push('bank', 'changed', { ids: [11] });
      bridge && bridge.emit({ type: 'notify', notification: { app: 'bank', title: a.label, text: 'Received $250 · Pizza money', kind: 'success', args: { id: 11 } } });
    },
    incomingCall() {
      const c = pick(contacts.filter((x) => x.number !== '6895550192' && !isBlocked(x.number))), id = ++nextId;
      if (!c) return;
      calls[id] = { number: c.number, dir: 'in' };
      push('phone', 'incoming', { callId: id, number: c.number });
      setTimeout(() => { if (calls[id] && !calls[id].start) endCall(id, 'missed', 'Missed call'); }, 20000);
    },
    frameworkNotify() {
      bridge && bridge.emit({ type: 'notify', notification: pick([
        { app: 'bank', title: 'Fleeca', text: '+$2,500.00 from Los Santos Customs', kind: 'success' },
        { app: 'garage', title: 'LSPD Impound', text: 'Your Pegassi Zentorno was towed from Vinewood Blvd.', kind: 'warning' },
        { app: 'jobs', title: 'Dispatch', text: 'New job: tow request on Route 68.', kind: 'command' },
        { app: 'system', title: 'Battery', text: '15% battery remaining.', kind: 'warning' },
      ]) });
    },
  };
}
