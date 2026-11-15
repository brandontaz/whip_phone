// whip_phone OS shell. The home screen shows whatever modules registered through window.WhipPhone.module(def).
// One shared state, three views (phone = cover display, tablet / tabletP = inner display landscape / upright);
// views re-render through a keyed DOM morph, so transitions, focus and scroll survive.
import { CSS, MOUNT_CSS } from './style.js';
import { THEMES, themeCSS, whipLogo, DEFAULT_THEME } from './themes.js';
import { makeWallpaper, paintPanel, PALETTES, resolveWallpaper, DEFAULT_WALLPAPER } from './wallpaper.js';
import { Focus, ACT_HINT } from './focus.js';
import { GLYPH, I, appIcon } from './icons.js';
import { kit, esc, digits, picUrl, frameStyle } from './kit.js';
import { scopeCss, resolveUrls, shieldCss } from './scope.js';
import { PhoneSounds, SOUND_KEYS } from './sounds.js';

export const SIZE = { phone: [390, 578], tablet: [1024, 722], tabletP: [722, 1024] };
const STACK = { top: 60, pitch: 66, gap: 8 }, STACK_MAX = 3, STACK_LIFE = 5000;   // notification stack (phone view px)
// The phone's home grid is 4 x 4: a fifth row (it was 20) sat behind the page dots and the dock, which only
// showed once a page held more than 16 apps (7 Oct 2026, when every slot became a place an app can go).
const PER_PAGE = { phone: 16, tablet: 24 }, CONSOLE_PER_PAGE = 9, DOCK_MAX = { phone: 4, tablet: 6 };
// An app's place on the home screen: a slot number, page * PER_PAGE + slot, for each grid (the phone's and the
// tablet's; the controller layout follows the phone's order).
const MAX_SLOT = 16 * 12;
const GLYPHS = { pad: { a: 'A', b: 'B', x: 'X', y: 'Y', lb: 'LB', rb: 'RB', menu: '☰' }, keys: { a: 'Enter', b: 'Esc', x: 'X', y: 'F', lb: 'Q', rb: 'E', menu: 'C' } };
const ID_RE = /^[a-z][a-z0-9_-]{0,31}$/;
const pad2 = (n) => String(n).padStart(2, '0');
// the "voice connection failed" screen's picture: a microphone, struck through
const VOICE_DOWN_ICON = '<svg class="vd-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">' +
  '<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0"/><path d="M12 18v3"/><path d="M4 4l16 16"/></svg>';

/** A home arrangement as the session sent it, kept to its shape: { phone: { id: slot }, tablet: { id: slot } }. */
function cleanHome(h) {
  const out = { phone: {}, tablet: {} };
  if (!h || typeof h !== 'object') return out;
  for (const g of ['phone', 'tablet']) {
    const src = h[g];
    if (!src || typeof src !== 'object') continue;
    for (const [id, slot] of Object.entries(src)) {
      if (ID_RE.test(id) && Number.isInteger(slot) && slot >= 0 && slot < MAX_SLOT) out[g][id] = slot;
    }
  }
  return out;
}

// ---------------------------------------------------------------- DOM morph (keyed: data-k)
const keyOf = (n) => (n && n.nodeType === 1 ? n.getAttribute('data-k') : null);
function morphAttrs(a, b) {
  for (const { name, value } of b.attributes) if (a.getAttribute(name) !== value) a.setAttribute(name, value);
  for (const { name } of [...a.attributes]) if (!b.hasAttribute(name)) a.removeAttribute(name);
  if (a.tagName === 'INPUT') { const v = b.getAttribute('value') ?? ''; if (a.value !== v && document.activeElement !== a) a.value = v; }
  if (a.tagName === 'TEXTAREA') { if (a.value !== b.value && document.activeElement !== a) a.value = b.value; }
}
function morphChildren(from, to) {
  const a = from.childNodes, b = to.childNodes;
  const keysA = new Set([...a].map(keyOf).filter(Boolean)), keysB = new Set([...b].map(keyOf).filter(Boolean));
  for (let i = 0; i < b.length; i++) {
    let na = a[i]; const nb = b[i], kb = keyOf(nb);
    // keyed lists: drop keyed nodes that are gone and insert new ones in place, so siblings keep their DOM nodes
    // (and their running CSS transitions) instead of being re-cloned one slot over
    while (na && keyOf(na) && !keysB.has(keyOf(na))) { from.removeChild(na); na = a[i]; }
    if (na && kb && !keysA.has(kb) && keyOf(na) !== kb) { from.insertBefore(nb.cloneNode(true), na); continue; }
    if (!na) { from.appendChild(nb.cloneNode(true)); continue; }
    if (na.nodeType !== nb.nodeType || na.nodeName !== nb.nodeName ||
        (nb.nodeType === 1 && (na.getAttribute('data-k') !== nb.getAttribute('data-k')))) { from.replaceChild(nb.cloneNode(true), na); continue; }
    if (nb.nodeType !== 1) { if (na.nodeValue !== nb.nodeValue) na.nodeValue = nb.nodeValue; continue; }
    if (na.hasAttribute('data-mount')) continue;              // a mount-mode app's box: what is inside belongs to the app
    morphAttrs(na, nb);
    if (na.tagName !== 'TEXTAREA') morphChildren(na, nb);
  }
  while (a.length > b.length) from.removeChild(from.lastChild);
}
const tpl = document.createElement('template');
function morphHTML(el, html) { tpl.innerHTML = html; morphChildren(el, tpl.content); tpl.innerHTML = ''; }

// ---------------------------------------------------------------- view (one per display)
class View {
  constructor(os, key, mode, parent) {
    this.os = os; this.key = key; this.mode = mode; this.portrait = key === 'tabletP'; this._stale = true; this.scale = 1;
    const [w, h] = SIZE[key];
    // The host is placed on the device (duo.js's homography); the screen sits in it, drawn `scale` times its size
    // (setScale). Chromium rasterises a leaning layer at its layout size and stretches it, so a bigger host with the
    // screen scaled up in it keeps text sharp.
    const host = this.host = document.createElement('div');
    host.className = 'os-host';
    host.style.width = w + 'px'; host.style.height = h + 'px';
    const root = this.root = document.createElement('div');
    root.className = `os-screen ${mode}`;
    root.style.width = w + 'px'; root.style.height = h + 'px';
    root.innerHTML = '<canvas class="wp"></canvas><div class="layer behind"></div><canvas class="wp"></canvas><div class="layer front"></div>';
    [this.sky, this.behind, this.fg, this.front] = root.children;
    for (const c of [this.sky, this.fg]) { c.width = w * 2; c.height = h * 2; }
    host.appendChild(root);
    parent.appendChild(host);
    this.focus = new Focus(os, this);
    root.addEventListener('scroll', () => os.bump(), true);   // scroll position is part of the snapshot
    root.addEventListener('pointermove', (e) => {
      if (Math.abs(e.movementX) + Math.abs(e.movementY) > 3) os.setInput('mouse');
      if (os.isConsole()) this.focus.hover(e.target);
    });
    root.addEventListener('pointerdown', (e) => { os.s.touch = e.pointerType === 'touch'; os.setInput('mouse'); }, true);
    // an app on the home grid may be about to be dragged (os.homePointerDown decides once it moves)
    root.addEventListener('pointerdown', (e) => {
      const icon = e.target.closest('.home .grid .app-icon');
      if (icon && root.contains(icon)) os.homePointerDown(this, icon, e);
    });
    root.addEventListener('click', (e) => {
      if (os._noClickUntil && performance.now() < os._noClickUntil) { e.stopPropagation(); return; }   // a drag's release
      const t = e.target.closest('[data-act]');
      if (t && root.contains(t)) { e.stopPropagation(); os.act(t.dataset.act, t.dataset, t, this); }
    });
    root.addEventListener('input', (e) => { if (e.target.dataset && e.target.dataset.bind) os.bind(e.target.dataset.bind, e.target.value, e.target, this); });
    root.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && e.target.dataset && e.target.dataset.enter) { e.preventDefault(); os.act(e.target.dataset.enter, e.target.dataset, e.target, this); }
      if (e.target.matches('input, textarea')) {
        if (e.key === 'Escape') { e.preventDefault(); e.target.blur(); }   // back to navigating
        e.stopPropagation();                                              // typing: keep keys away from the page / nav
      }
    });
    // typing in an input: the game must stop reading the keyboard (Lua drops SetNuiFocusKeepInput while this is on).
    // A slider is not typing: clicking one leaves the game the keyboard.
    const TYPED = 'input:not([type=range]), textarea';
    root.addEventListener('focusin', (e) => { if (e.target.matches(TYPED)) os.typing(true); });
    root.addEventListener('focusout', (e) => { if (e.target.matches(TYPED)) os.typing(false); });
    root.addEventListener('pointerdown', (e) => {
      const g = e.target.closest('[data-drag]');
      if (g) {
        e.preventDefault();
        const move = (ev) => { const r = g.getBoundingClientRect(); os.drag(g.dataset.drag, Math.min(1, Math.max(0, 1 - (ev.clientY - r.top) / r.height))); };
        const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); };
        move(e); window.addEventListener('pointermove', move); window.addEventListener('pointerup', up);
      }
    });
    // data-pan="action": an element moved by dragging. The action gets { dx, dy }, the move since the last as a share of
    // the element's size; the wheel over it gets { zoom: 1 } (up) or { zoom: -1 }.
    root.addEventListener('pointerdown', (e) => {
      const g = e.target.closest('[data-pan]');
      if (!g || !root.contains(g) || e.button !== 0) return;
      e.preventDefault();
      const r = g.getBoundingClientRect();
      let lx = e.clientX, ly = e.clientY;
      const move = (ev) => {
        const dx = (ev.clientX - lx) / r.width, dy = (ev.clientY - ly) / r.height;
        lx = ev.clientX; ly = ev.clientY;
        if (dx || dy) os.pan(g, { dx, dy });
      };
      const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); };
      window.addEventListener('pointermove', move); window.addEventListener('pointerup', up);
    });
    root.addEventListener('wheel', (e) => {
      const g = e.target.closest('[data-pan]');
      if (!g || !root.contains(g)) return;
      e.preventDefault();
      os.pan(g, { zoom: e.deltaY < 0 ? 1 : -1 });
    }, { passive: false });
  }
  get info() { return { size: this.mode, key: this.key, portrait: this.portrait, console: this.os.isConsole() }; }
  /** draw the screen k times its size in its host (duo.js picks k from its size on screen); 1: as laid out */
  setScale(k) {
    if (k === this.scale) return;
    this.scale = k;
    const [w, h] = SIZE[this.key];
    this.host.style.width = w * k + 'px'; this.host.style.height = h * k + 'px';
    this.root.style.transform = k === 1 ? '' : `scale(${k})`;
  }
  render() {
    const os = this.os, s = os.s, m = this.mode;
    const front = os.tplFront(m, this), behind = os.tplBehind(m);
    const sb = s.app ? os.statusBarFor(s.app) : '';
    const off = s.hidden || os.activeKey !== this.key;           // not the display being looked at: animations hold still
    const cls = `os-screen ${m}${this.portrait ? ' portrait' : ''}${s.locked ? ' locked' : ''}${s.app ? ' app-open' : ''}${sb ? ' sb-' + sb : ''}${s.cc ? ' cc-open' : ''}` +
      `${this._overlay ? ' in-call' : ''}${os.isConsole() ? ' console' : ' mk'} in-${s.input}${s.hidden && m === 'phone' ? ' peek' : ''}${off ? ' os-off' : ''}`;
    const sum = cls + '\n' + front + '\n' + behind;
    if (sum === this._sum) return false;                         // same screen as last time: nothing to patch
    this._sum = sum; os.bump();
    this.root.className = cls;
    morphHTML(this.front, front);
    morphHTML(this.behind, behind);
    this.root.querySelectorAll('[data-bottom]').forEach((el) => {
      if (el._h !== el.scrollHeight) { el.scrollTop = el.scrollHeight; el._h = el.scrollHeight; }
    });
    this.focus.refresh();
    // an app being moved with keys / a pad: the highlight goes where it went (maybe another page)
    const mv = os.s.moving;
    if (mv) {
      const el = this.front.querySelector(`.home [data-app="${mv.app}"]`);
      if (el && el !== this.focus.el) { this.focus.set(el, false); os.paintHints(this, this.focus); }
    }
    return true;
  }
  paintWallpaper(wp) {
    const o = this.mode === 'phone' ? 0 : 1;
    paintPanel(this.sky.getContext('2d'), wp, this.key, o, ['sky']);
    paintPanel(this.fg.getContext('2d'), wp, this.key, o, ['mountain', 'dune']);
  }
}

// ---------------------------------------------------------------- shared contacts (framework data: whip_phone:contacts:*)
class Contacts {
  constructor(os) { this.os = os; this.list = []; this.loaded = false; this._p = null; }
  load(force = false) {
    if (this._p && !force) return this._p;
    this._p = this.os.request('whip_phone:contacts:list').then((l) => { this.list = Array.isArray(l) ? l : []; }, () => {})
      .then(() => { this.loaded = true; this.os.update(); return this.list; });
    return this._p;
  }
  find(number) { const d = digits(number); return d ? this.list.find((c) => digits(c.number) === d) || null : null; }
  /** contact name for a number, else the number formatted */
  name(number) { const c = this.find(number); return c ? c.name : kit.fmtNumber(number); }
  get sorted() { return [...this.list].sort((a, b) => String(a.name).localeCompare(String(b.name))); }
  async save(c) { const r = await this.os.request('whip_phone:contacts:save', c); await this.load(true); return r; }
  async remove(id) { await this.os.request('whip_phone:contacts:delete', { id }); await this.load(true); }
}

// ---------------------------------------------------------------- the block list (framework data: whip_phone:blocks:*)
// The SIM's, like its contacts, read with each session and shared by every app: Messages and Phone offer Block / Unblock
// by it, Settings lists it. The blocking itself is the server's (whip_phone/server/blocks.lua): a blocked number's texts
// and calls never reach this page, so nothing here filters.
class Blocks {
  constructor(os) { this.os = os; this.list = []; this.loaded = false; this._p = null; this._gen = 0; }
  load(force = false) {
    if (this._p && !force) return this._p;
    // A read that answers after a newer one began (the last SIM's, landing late) is dropped.
    const gen = ++this._gen;
    this._p = this.os.request('whip_phone:blocks:list').then((l) => { if (gen === this._gen) this.list = Array.isArray(l) ? l : []; }, () => {})
      .then(() => { if (gen === this._gen) { this.loaded = true; this.os.update(); } return this.list; });
    return this._p;
  }
  /** is this number on the SIM's list? */
  has(number) { const d = digits(number); return !!d && this.list.some((b) => digits(b.number) === d); }
  async add(number) { await this.os.request('whip_phone:blocks:add', { number: digits(number) }); await this.load(true); }
  async remove(number) { await this.os.request('whip_phone:blocks:remove', { number: digits(number) }); await this.load(true); }
}

// ---------------------------------------------------------------- the OS
export class PhoneOS {
  constructor(parent, opts = {}) {
    this.opts = opts; this.bridge = opts.bridge;
    this.coreCss = shieldCss(CSS) + MOUNT_CSS;                      // the phone's CSS, kept out of mount-mode apps
    if (!document.getElementById('whipos-css')) document.head.appendChild(Object.assign(document.createElement('style'), { id: 'whipos-css', textContent: this.coreCss }));
    this.themeStyle = document.getElementById('whipos-theme') || document.head.appendChild(Object.assign(document.createElement('style'), { id: 'whipos-theme' }));
    this.modStyle = document.getElementById('whipos-mods') || document.head.appendChild(Object.assign(document.createElement('style'), { id: 'whipos-mods' }));
    this.s = {
      locked: true, app: null, cc: false, theme: THEMES[opts.theme] ? opts.theme : DEFAULT_THEME, wallpaper: null, boot: true,
      layout: opts.layout || 'auto', input: 'mouse', homePage: 0, touch: false, dnd: false,
      stack: [], hidden: false, toast: null, lastToast: '', notifs: [], origin: { x: 50, y: 50 },
      session: { number: '', name: '' }, clock: null, battery: 100, signal: 4,
      // the home screen's arrangement ({ phone: { [appId]: slot }, tablet: {...} }), from the session (it is
      // the SIM's); drag: an app being dragged by the mouse; moving: an app being moved with keys / a pad
      home: { phone: {}, tablet: {} }, drag: null, moving: null,
    };
    this.mods = new Map();          // id -> { def, ns, external, state, ctx }
    this.modCss = {};
    this.contacts = new Contacts(this);
    this.blocks = new Blocks(this);
    // The ringtone, the tones and the volume (sounds.js), the SIM's like its wallpaper (Josh, 12 Oct 2026).
    this.sounds = new PhoneSounds();
    this.settingsApi = {
      get: (k) => (SOUND_KEYS.includes(k) ? this.sounds.prefs[k] : this.s[k]),
      all: () => ({ wallpaper: this.s.wallpaper, dnd: this.s.dnd, ...this.sounds.prefs }),
      set: (k, v) => this.setSetting(k, v),
      wallpapers: () => PALETTES,
      /** the ringtones ('ringtone') or the tones ('alert') to pick from: [{ id, label }] */
      sounds: (kind) => PhoneSounds.list(kind),
      /** hear one before picking it; stopPreview ends it (leaving the page) */
      preview: (kind, id) => this.sounds.previewTone(kind, id),
      stopPreview: () => this.sounds.stopPreview(),
      isConsole: () => this.isConsole(),
    };
    this.views = { phone: new View(this, 'phone', 'phone', parent), tablet: new View(this, 'tablet', 'tablet', parent), tabletP: new View(this, 'tabletP', 'tablet', parent) };
    this.themeCss = shieldCss(themeCSS(this.s.theme));
    this.themeStyle.textContent = this.themeCss;
    this.setWallpaper(opts.wallpaper || this.theme.wallpaper || DEFAULT_WALLPAPER, true);
    this.render();
    this.bootDone();
    this._minute = -1;
    setInterval(() => this.tick(), 1000);
  }

  // ---------------------------------------------------------------- modules
  /** register a module definition (window.WhipPhone.module). meta: { ns, external } from whoever loaded its script. */
  register(def, meta = {}) {
    if (!def || typeof def.id !== 'string' || !ID_RE.test(def.id)) { console.warn('[whip_phone] module ignored: id must match', ID_RE, def && def.id); return false; }
    if (typeof def.render !== 'function' && typeof def.mount !== 'function') { console.warn(`[whip_phone] module ${def.id} ignored: it needs render() or mount()`); return false; }
    if (this.mods.has(def.id)) this.unregister(def.id);
    let base = document.baseURI;                                  // relative asset paths are relative to the module's script
    try { if (meta.script) base = new URL(meta.script, document.baseURI).href; } catch { /* keep the page's */ }
    const m = { def, ns: meta.ns || `whip_phone:${def.id}`, external: !!meta.external, base, state: {} };
    try { m.state = typeof def.state === 'function' ? def.state() || {} : {}; } catch (e) { console.error(`[whip_phone] ${def.id}.state()`, e); }
    m.ctx = this.makeCtx(m);
    this.mods.set(def.id, m);
    this.modCss[def.id] = (typeof def.css === 'string' ? scopeCss(def.css, def.id, base, { mount: typeof def.mount === 'function' }) : '') +
      (typeof def.globalCss === 'string' ? '\n' + resolveUrls(def.globalCss, base) : '');
    this.applyModCss();
    this.call(m, 'init');
    if (this.s.session.sim || this.s.session.number || this.s.session.name) this.call(m, 'session', this.s.session);   // one has arrived
    this.update();
    this.opts.onModules?.(this.list());
    return true;
  }
  unregister(id) {
    const m = this.mods.get(id);
    if (!m) return;
    if (m.root) this.unmountMod(m);
    this.call(m, 'destroy');
    if (this.s.app === id) this.s.app = null;
    this.mods.delete(id); delete this.modCss[id]; this.applyModCss();
    this.update();
    this.opts.onModules?.(this.list());
  }
  applyModCss() { this.modStyle.textContent = Object.values(this.modCss).join('\n'); this.bump(); }
  /** installed apps in home-screen order */
  get apps() { return [...this.mods.values()].filter((m) => !m.def.hidden).sort((a, b) => (a.def.order ?? 100) - (b.def.order ?? 100) || String(a.def.name).localeCompare(String(b.def.name))); }
  list() { return [...this.mods.values()].map((m) => ({ id: m.def.id, name: m.def.name || m.def.id, version: m.def.version || '', external: m.external, ns: m.ns })); }
  /** call a module hook safely: a broken module never takes the phone down */
  call(m, fn, ...args) {
    const f = m && m.def[fn];
    if (typeof f !== 'function') return undefined;
    try {
      const r = f.call(m.def, m.ctx, ...args);
      if (r && typeof r.then === 'function') r.then(() => this.update(), (e) => this.modError(m, fn, e));
      return r;
    } catch (e) { this.modError(m, fn, e); return undefined; }
  }
  modError(m, where, e, quiet = false) {
    // log each failure once (a hook that throws on every render would flood the console), and never ask for a render
    // from inside one: that would loop forever
    const key = m.def.id + ':' + where + ':' + (e && e.message);
    if (!this._errSeen) this._errSeen = new Set();
    if (!this._errSeen.has(key)) { this._errSeen.add(key); console.error(`[whip_phone] module ${m.def.id} ${where}:`, e); }
    if (quiet || this._rendering) return;
    if (e && e.reason) this.toast(String(e.reason));
    this.update();
  }
  makeCtx(m) {
    const os = this, id = m.def.id;
    return {
      id, kit, icons: I, esc,
      get state() { return m.state; },
      set state(v) { m.state = v; os.update(); },
      /** re-render (the OS also re-renders after every action, binding, push and resolved request) */
      render: () => os.update(),
      /** ask the framework: resolves with its answer, throws (err.reason) when it refuses or isn't there */
      request: (action, data) => os.request(`${m.ns}:${action}`, data).finally(() => os.update()),
      /** a notification capsule from this app; returns its id (false when Do Not Disturb holds it back) */
      notify: (n = {}) => os.notify({ ...n, app: id }),
      /** take down this app's capsule by its key (or the id notify returned) */
      dismiss: (key) => os.dismiss(id, key),
      toast: (t) => os.toast(t),
      open: (app = id, args) => os.openApp(app, args),
      close: () => { if (os.s.app === id) { os.goHome(); os.update(); } },
      back: () => os.back(),
      /** raise the phone into view even if it is put away (an incoming call); false when done */
      attention: (on = true) => os.attention(id, on),
      /** the call's sound: 'ring' (ringing in: the SIM's ringtone, until told otherwise), 'back' (calling out: the line
       *  ringing at the other end) or null (quiet) */
      ring: (kind) => os.sounds.ring(kind || null),
      fold: () => os.opts.onFold?.(),
      /** the phone is held to this app (client/main.lua RunApp: a skill check game): no home, no folding, no other app */
      get forced() { return !!os.s.forced && os.s.forced.app === id; },
      /** a held app's answer: the phone lets go and Lua gets `result` (a table). Nothing when the phone is not held to it. */
      done: (result) => os.forcedDone(id, result),
      /** shake the controller (in game: Lua's pad shake; a mouse and keyboard feel nothing). strength 0-1 */
      rumble: (ms = 150, strength = 0.6) => os.opts.onRumble?.(ms, strength),
      get session() { return os.s.session; },
      get console() { return os.isConsole(); },
      get active() { return os.s.app === id; },
      get visible() { return !os.s.hidden; },
      /** what the player sees: { visible, app (open app id or null), locked } */
      get presence() { return os.presence(); },
      /** a file next to your module script, as a URL (img src, fetch): app.asset('img/car.png') */
      asset: (path) => new URL(path, m.base).href,
      contacts: os.contacts,
      /** the SIM's block list: list ({ number, time }), loaded, load(), has(number), add(number), remove(number) */
      blocks: os.blocks,
      settings: os.settingsApi,
      /** the call's volume (0-100), the voice system's "Phone call volume" on this PC: callVolume() reads it,
       *  callVolume(n) changes it; resolves with it, or null when no voice system offers it */
      callVolume: async (value) => {
        const r = await os.bridge.post('callVolume', value == null ? {} : { value: Number(value) });
        return r && typeof r.value === 'number' ? r.value : null;
      },
      modules: () => os.list(),
    };
  }
  async request(name, data) {
    const r = await this.bridge.request(name, data ?? {});
    if (!r || r.ok === false) { const e = new Error((r && r.reason) || 'unavailable'); e.reason = (r && r.reason) || 'unavailable'; throw e; }
    return r.data;
  }
  /** framework -> module event (Lua: exports.whip_phone:Push / TriggerClientEvent('whip_phone:client:push')) */
  push(module, event, data) {
    // A call or text rung in brings its SIM's sounds (the server's), for a page that has not had that SIM's session.
    if (data && typeof data === 'object' && data.sounds) this.sounds.setPrefs(data.sounds);
    if (module === 'contacts') { this.contacts.load(true); return; }
    const m = this.mods.get(module);
    if (!m) return;
    const h = m.def.on && m.def.on[event];
    if (typeof h !== 'function') { console.warn(`[whip_phone] ${module}: no handler for push "${event}"`); return; }
    try { const r = h.call(m.def, m.ctx, data); if (r && r.then) r.then(() => this.update(), (e) => this.modError(m, 'on.' + event, e)); } catch (e) { this.modError(m, 'on.' + event, e); }
    this.update();
  }
  setSession(sess = {}) {
    // The new session whole, not merged into the last: a field it leaves out (no number with the SIM taken out, no
    // name) is gone, not the last SIM's.
    this.s.session = { number: '', name: '', ...sess };
    // The home screen's arrangement comes with the SIM: another SIM, another arrangement (none: the default).
    this.s.home = cleanHome(sess.home);
    this.s.drag = null; this.s.moving = null;
    if (sess.settings) this.applySettings(sess.settings);
    // Emptied first (audit 16, CLI-1): the last SIM's or character's contacts showed until the new read landed —
    // and for good when it failed.
    this.contacts.list = []; this.contacts.loaded = false;
    this.contacts.load(true);
    this.blocks.list = []; this.blocks.loaded = false;   // (the same for the block list: another SIM, another list)
    this.blocks.load(true);
    for (const m of this.mods.values()) this.call(m, 'session', this.s.session);
    this.update();
  }

  // ---- settings (stored by the framework: whip_phone:settings:save)
  // The layout is not a setting: always Auto, following the input. (setLayout stays for the browser preview.)
  applySettings(o = {}) {
    if (o.theme && THEMES[o.theme] && o.theme !== this.s.theme) this.setTheme(o.theme, true);
    if (resolveWallpaper(o.wallpaper)) this.setWallpaper(o.wallpaper);   // one saved before the gradients shows its new one
    if (typeof o.dnd === 'boolean') this.s.dnd = o.dnd;
    this.sounds.setPrefs(o);
    this.renderNow();
  }
  setSetting(k, v) {
    if (k === 'theme') { if (!THEMES[v]) return; this.setTheme(v); }
    else if (k === 'wallpaper') { if (!resolveWallpaper(v)) return; this.setWallpaper(v); }
    else if (k === 'dnd') this.s.dnd = !!v;
    else if (SOUND_KEYS.includes(k)) {
      const was = this.sounds.prefs[k];
      this.sounds.setPrefs({ [k]: v });
      if (this.sounds.prefs[k] === was) return;   // not one it has, or the same again: nothing to save
    }
    else return;
    this.update(); this.saveSettings();
  }
  saveSettings() {
    clearTimeout(this._ss);
    this._ss = setTimeout(() => this.request('whip_phone:settings:save', this.settingsApi.all()).catch(() => {}), 700);
  }

  // ---------------------------------------------------------------- API for the 3D viewer and the page
  get hosts() { return { phone: this.views.phone.host, tablet: this.views.tablet.host, tabletP: this.views.tabletP.host }; }
  layers(key) { const v = this.views[key]; return { shell: v.root, behind: v.behind, front: v.front, behindOn: this.s.locked }; }
  renderNow(all = false) { this._pending = false; this.render(all); }
  /** the displays that can be on screen: the cover display and the inner one in use (landscape, or portrait screens) */
  liveKeys() { return ['phone', this.inner === 'tabletP' ? 'tabletP' : 'tablet']; }
  /** a display that can be seen was skipped since something changed: the fold snapshots need a fresh render */
  get stale() { return this.liveKeys().some((k) => this.views[k]._stale); }
  bump() { this.stamp = (this.stamp || 0) + 1; this.stampAt = performance.now(); }
  /** base CSS + the active style + module CSS (the fold snapshots embed this) */
  get css() { return this.coreCss + '\n' + this.themeCss + '\n' + this.modStyle.textContent; }
  get theme() { return THEMES[this.s.theme] || THEMES[DEFAULT_THEME]; }
  endBoot() { if (this.s.boot) { clearTimeout(this._boot); this.s.boot = false; } }
  bootDone(ms = 1700) { clearTimeout(this._boot); this._boot = setTimeout(() => { this.s.boot = false; this.update(); }, ms); }
  setTheme(id, quiet = false) {
    if (!THEMES[id]) return;
    this.s.theme = id;
    this.themeCss = shieldCss(themeCSS(id));
    this.themeStyle.textContent = this.themeCss; this.bump();
    if (!quiet) { this.s.boot = true; this.bootDone(1200); }
    if (!this._wpChosen) this.setWallpaper(THEMES[id].wallpaper || DEFAULT_WALLPAPER, false, true);
    this.renderNow();
    this.opts.onTheme?.(id);
  }
  setMode(mode, key = mode) { this.mode = mode; this.activeKey = key; }
  /** the browser preview's dev bar only: in game the layout is always Auto */
  setLayout(l) { this.s.layout = ['auto', 'console', 'mk'].includes(l) ? l : 'auto'; this.renderNow(); this.opts.onLayout?.(this.s.layout); }
  /** layout in effect: Auto follows the last input (controller -> Console, mouse / keyboard -> Mouse & keyboard) */
  isConsole() { const l = this.s.layout; return l === 'console' || (l === 'auto' && this.s.input === 'pad'); }
  showFocus() { return this.isConsole() || this.s.input === 'keys'; }
  setInput(m) {
    if (this.s.input === m) return;
    const was = this.isConsole();
    this.s.input = m;
    if (was !== this.isConsole()) this.renderNow(); else this.update();
  }
  setWallpaper(name, quiet = false, auto = false) {
    name = resolveWallpaper(name) || DEFAULT_WALLPAPER;
    if (!auto) this._wpChosen = !quiet || this._wpChosen;
    this.s.wallpaper = name; this.wp = makeWallpaper(name);
    for (const v of Object.values(this.views)) v.paintWallpaper(this.wp);
    if (!quiet) this.opts.onWallpaper?.(this.wp);
  }
  setHidden(on) {
    if (this.s.hidden !== on) {
      this.s.hidden = on;
      if (on) { this.s.cc = false; this.s.moving = null; this.s.drag = null; this._press = null; }   // put away: nothing stays held
      this.renderNow();
    }
  }
  presence() { return { visible: !this.s.hidden, app: this.s.app || null, locked: !!this.s.locked }; }
  /** phone-view px from the top of the cover display down to just under the n-th notification */
  peekHeight(n) { return STACK.top + n * STACK.pitch - STACK.gap + 12; }
  setClock(h, m) { this.s.clock = h == null ? null : { h: +h, m: +m }; this.update(); }
  setStatus(o = {}) {
    if (o.battery != null) this.s.battery = Math.max(0, Math.min(100, +o.battery));
    if (o.signal != null) this.s.signal = Math.max(0, Math.min(4, +o.signal));
    // whip_voice (the sound of calls) not running: a screen over everything until it is (client/main.lua)
    if (o.voiceDown != null) { this.s.voiceDown = !!o.voiceDown; if (typeof o.voiceDownText === 'string') this.s.voiceDownText = o.voiceDownText; }
    this.update();
  }
  typing(on) {
    if (this._typing === on) return;
    this._typing = on;
    this.bridge.post('typing', { on });
  }

  // ---- an app the phone is held to (Lua's RunApp)
  /**
   * Hold the phone to one app (a skill check game): until it answers (app.done) or Lua lets go there is no home,
   * folding, Control Centre or other app, and Back is the app's own. What was open comes back afterwards (unforce).
   */
  force(id, args = {}) {
    const m = this.mods.get(id);
    if (!m) return false;
    const s = this.s;
    if (!s.forced) s.forced = { app: id, was: { app: s.app, locked: s.locked, homePage: s.homePage } };
    s.forced.app = id;
    s.cc = false; s.moving = null; s.drag = null;
    if (s.app && s.app !== id) this.call(this.mods.get(s.app), 'close');
    s.locked = false; s.app = id; s.origin = { x: 50, y: 50 };
    this.call(m, 'open', args || {});
    this.renderNow();
    return true;
  }
  /** let go of a held app: what was open before comes back (an app that is gone since: home) */
  unforce() {
    const s = this.s, f = s.forced;
    if (!f) return;
    s.forced = null;
    if (s.app) this.call(this.mods.get(s.app), 'close');
    const was = f.was.app && f.was.app !== f.app && this.mods.has(f.was.app) ? f.was.app : null;
    s.app = was; s.locked = f.was.locked; s.homePage = f.was.homePage || 0;
    this.renderNow();
  }
  forcedDone(id, result) {
    const f = this.s.forced;
    if (!f || f.app !== id) return false;
    this.opts.onForcedDone?.(id, result && typeof result === 'object' ? result : {});
    return true;
  }
  /** does the open app take every key (def.keys 'all': WASD, Space, Q, E as well as the arrows)? */
  wantsAllKeys() {
    const s = this.s, m = s.app && this.mods.get(s.app);
    return !!(m && m.def.keys === 'all' && !s.hidden && !s.cc && !s.locked);
  }

  // ---------------------------------------------------------------- navigation
  openApp(id, args = {}, el = null, view = null) {
    const m = this.mods.get(id);
    if (!m) { this.toast('Not installed'); return false; }
    const s = this.s;
    if (s.forced && s.forced.app !== id) return false;                 // held to one app (force)
    if (el && view && el.closest('.home')) {
      const r = view.root.getBoundingClientRect(), b = (el.querySelector('.ico') || el).getBoundingClientRect();
      if (r.width) s.origin = { x: ((b.left + b.width / 2) - r.left) / r.width * 100, y: ((b.top + b.height / 2) - r.top) / r.height * 100 };
    } else s.origin = { x: 50, y: 60 };
    if (s.app && s.app !== id) this.call(this.mods.get(s.app), 'close');
    s.locked = false; s.cc = false; s.app = id;
    s.moving = null;                                                  // an app being moved is put down where it is
    this.call(m, 'open', args || {});
    this.update();
    return true;
  }
  goHome() { const s = this.s; if (s.forced) return; if (s.app) this.call(this.mods.get(s.app), 'close'); s.app = null; s.cc = false; }
  attention(id, on) { this.opts.onAttention?.(id, on); }
  /** any module showing an overlay (calls)? */
  overlayHtml(m, info) {
    if (typeof m.def.overlay !== 'function') return '';
    try { return m.def.overlay(m.ctx, info || this.views.phone.info) || ''; } catch (e) { console.error(`[whip_phone] ${m.def.id}.overlay`, e); return ''; }
  }
  overlays() { return [...this.mods.values()].filter((m) => this.shownOverlay(m) && this.overlayHtml(m)); }
  /** while the phone is held to an app, only that app's overlay shows (a call screen waits as its capsule) */
  shownOverlay(m) { return !this.s.forced || this.s.forced.app === m.def.id; }
  route() { const m = this.mods.get(this.s.app); return m ? String(this.call(m, 'route') ?? '') : ''; }
  scopeFor(view) {
    const f = view.front, s = this.s;
    const pick = (sel, name) => { const el = f.querySelector(sel); return el ? { el, name } : null; };
    return pick('.sheet', 'sheet:' + (s.app || '')) || (s.cc && pick('.cc-panel', 'cc')) || pick('.overlay', 'overlay') ||
      (s.locked && pick('.lock', 'lock')) || (s.app && pick('.app-win', 'app:' + s.app + ':' + this.route())) ||
      pick('.home', 'home:' + (s.homePage || 0));
  }
  back() {
    const s = this.s;
    // held to one app: Back is that app's (true: the phone is not put away). An app that does not take it (no back, or
    // at its top level) is given up on: an app with no back→done held a pad player in it for good (audit 20, PHN-8).
    if (s.forced) {
      const f = s.forced, m = this.mods.get(f.app);
      const took = m ? this.call(m, 'back') === true : false;
      if (!took && this.s.forced === f) this.forcedDone(f.app, { passed: false, why: 'cancelled' });
      this.update();
      return true;
    }
    if (s.cc) { s.cc = false; this.update(); return true; }
    for (const m of this.overlays()) if (this.call(m, 'back') === true) { this.update(); return true; }
    if (this.overlays().length) return false;
    if (s.locked) return false;
    if (s.app) {
      const m = this.mods.get(s.app);
      if (!(m && this.call(m, 'back') === true)) this.goHome();
      this.update(); return true;
    }
    if (s.homePage) { s.homePage = 0; this.update(); return true; }
    return false;
  }
  backLabel() {
    const s = this.s;
    if (s.moving) return 'Done';
    if (s.cc) return 'Close';
    const ov = this.overlays()[0];
    if (ov) return this.call(ov, 'backLabel') || null;
    if (s.locked) return 'Put away';
    if (s.app) { const m = this.mods.get(s.app); return (m && this.call(m, 'backLabel')) || (this.route() ? 'Back' : 'Home'); }
    return s.homePage ? 'Back' : 'Put away';
  }

  // ---- controller / keyboard: commands from the page or Lua (SendNUIMessage { type: 'cmd' })
  /**
   * cmd: up down left right a b x y lb rb menu home; down = pressed (false = released).
   * info: { repeat, from: 'pad' | 'keys' }.
   * An open app with an `input(app, cmd, down, info)` hook hears the buttons first: true is handled, anything else
   * goes on to the phone.
   */
  command(cmd, down = true, info = {}) {
    const v = this.activeKey && this.views[this.activeKey];
    if (!v) return false;
    const s0 = this.s;
    // no voice system: the phone can only be put away (B), nothing else (the screen over everything). A held app (a
    // skill check game) needs no voice: it plays on.
    if (s0.voiceDown && !s0.forced) { if (down && cmd === 'b') this.opts.onClose?.(); return true; }
    if (s0.app && !s0.cc && !s0.locked && !this.overlays().some((m) => m.def.id !== s0.app)) {
      const m = this.mods.get(s0.app);
      if (m && typeof m.def.input === 'function' && this.call(m, 'input', cmd, down, info) === true) return true;
    }
    if (s0.forced) {
      // held to one app: only its own buttons (Back is its own, X its own); home, folding and the Control Centre wait
      if (!down) return cmd === 'a' ? v.focus.press(false) : true;
      if (cmd === 'b') { this.back(); return true; }
      if (cmd === 'x') { const x = this.xAction(); if (x) { x.run(); this.update(); } return true; }
      if (cmd === 'y' || cmd === 'menu' || cmd === 'home') return true;
    }
    // carrying an app (Move): the D-pad carries it, LB / RB to another page, A / B / X put it down
    if (this.s.moving) {
      if (['up', 'down', 'left', 'right', 'lb', 'rb'].includes(cmd)) { if (down) this.moveBy(cmd); return true; }
      if (cmd === 'a' || cmd === 'b' || cmd === 'x') { if (down) this.endMove(); return true; }
    }
    if (cmd === 'a') return v.focus.press(down);
    if (!down) return true;
    const s = this.s;
    switch (cmd) {
      case 'up': case 'down': case 'left': case 'right': return v.focus.move(cmd);
      case 'b': if (!this.back()) this.opts.onClose?.(); return true;     // Back at the top level puts the phone away
      case 'lb': case 'rb': return this.tab(cmd === 'lb' ? -1 : 1);
      case 'x': { const x = this.xAction(); if (!x) return false; x.run(); this.update(); return true; }
      case 'y': this.opts.onFold?.(); return true;
      case 'menu': s.cc = !s.cc; break;
      case 'home': this.goHome(); s.homePage = 0; break;
      default: return false;
    }
    this.update(); return true;
  }
  tabLabel(view) {
    const s = this.s;
    if (s.cc || s.locked || this.overlays().length) return null;
    if (!s.app) return this.pages(view.mode) > 1 ? 'Page' : null;
    const m = this.mods.get(s.app);
    return m && typeof m.def.tab === 'function' ? (this.call(m, 'tabLabel') || 'Tab') : null;
  }
  tab(dir) {
    const s = this.s;
    if (s.cc || s.locked || this.overlays().length) return false;
    if (!s.app) {
      const n = this.pages(this.mode || 'phone'), p = Math.max(0, Math.min(n - 1, s.homePage + dir));
      if (p === s.homePage) return false;
      s.homePage = p; this.update(); return true;
    }
    const m = this.mods.get(s.app);
    const r = m ? this.call(m, 'tab', dir) : false;
    this.update();
    return r === true;
  }
  /** D-pad pushed past the last item on the home screen: flip pages */
  edge(dir) { return !this.s.app && !this.s.locked && !this.s.cc && (dir === 'left' || dir === 'right') ? this.tab(dir === 'left' ? -1 : 1) : false; }
  /** X: the screen's main extra action */
  xAction() {
    const s = this.s;
    if (s.moving) return { label: 'Done', run: () => this.endMove() };
    if (s.cc || s.locked) return null;
    const ov = this.overlays()[0];
    if (ov) return this.call(ov, 'x') || null;
    const b = s.stack.find((x) => x.st !== 'out' && x.tap);       // a capsule asking for the player (incoming call)
    if (b) return { label: b.tap.label || 'Open', banner: true, run: () => this.act('os:bopen', { id: String(b.id) }) };
    if (s.app) { const m = this.mods.get(s.app); return (m && this.call(m, 'x')) || null; }
    // on the home screen, the app with the highlight can be picked up and moved (not the dock's)
    const v = this.views[this.activeKey], f = v && v.focus.el, id = f && f.closest('.home') && f.dataset.app;
    if (id && !this.dockApps(v.mode).some((m) => m.def.id === id)) return { label: 'Move', run: () => this.startMove(id) };
    return { label: 'Control', run: () => { s.cc = true; } };
  }
  nudge() {}   // [data-drag] up / down from the controller: nothing uses it now
  glyph(c) { const g = GLYPHS[this.s.input]; return g ? `<i class="kg k-${this.s.input}">${esc(g[c])}</i>` : ''; }
  /** fills the button-hint bar and the home info line for a view (called by its focus engine) */
  paintHints(view, focus) {
    if (!this.isConsole()) return;
    const box = view.front.querySelector('.hints');
    const s = this.s, el = focus.el, list = [];
    const a = s.moving ? 'Place' : el ? (el.dataset.hint || (el.type === 'range' ? '' : el.matches('input, textarea') ? 'Type' : ACT_HINT[el.dataset.act] || 'Select')) : '';   // a slider has no A: left / right
    if (a && s.input !== 'mouse') list.push(['a', a]);
    const b = this.backLabel(); if (b) list.push(['b', b]);
    const t = this.tabLabel(view); if (t) list.push(['lbrb', t]);
    const x = this.xAction(); if (x) list.push(['x', x.label]);
    list.push(['y', view.mode === 'phone' ? 'Unfold' : 'Fold']);
    const drop = x && x.banner ? 'lbrb' : 'x';                       // the phone fits four; a capsule's X outranks tabs
    const shown = view.mode === 'phone' && list.length > 4 ? list.filter(([c]) => c !== drop).slice(0, 4) : list;
    const html = shown.map(([c, label]) => `<button class="hint" data-act="os:cmd" data-c="${c}">${c === 'lbrb' ? this.glyph('lb') + this.glyph('rb') : this.glyph(c)}<span>${esc(label)}</span></button>`).join('');
    if (box && box.innerHTML !== html) box.innerHTML = html;
    const info = view.front.querySelector('.ch-info');
    if (info) {
      const m = el && el.dataset.app && this.mods.get(el.dataset.app);
      const line = m ? `<b>${esc(m.def.name)}</b><span>${esc(this.call(m, 'info') || '')}</span>` : '<b>&#160;</b><span>&#160;</span>';
      if (info.innerHTML !== line) info.innerHTML = line;
    }
  }

  // ---------------------------------------------------------------- notifications
  /**
   * n: { app, title, text, kind: chat|command|success|error|warning|call, args, force, life,
   *      key, persist, actions: [{ act, label, tone: accept|reject|on, icon }], tap: { act, label }, data, icon }
   * key: a capsule with the same app + key is updated in place. persist: stays up until dismissed. actions: round
   * buttons that run the app module's actions with `data`; tap: the module action a tap (or X) runs instead of opening
   * the app. icon: a glyph (SVG) drawn in place of the app's icon. pic: a picture link shown round over the icon,
   * framed by `frame` (kit.frameStyle). Returns the capsule id.
   * A new capsule makes a sound: Messages' the SIM's message tone, any other app's its notification sound. Not one
   * updated in place, not a call's, not under Do Not Disturb (`force` shows quietly), not with `sound: false`.
   */
  notify(n = {}) {
    const s = this.s, app = n.app || 'system', kind = n.kind || 'chat', key = n.key != null ? String(n.key) : null;
    if (n.sounds) this.sounds.setPrefs(n.sounds);
    const tap = typeof n.tap === 'string' ? { act: n.tap } : n.tap && n.tap.act ? { act: String(n.tap.act), label: n.tap.label ? String(n.tap.label) : '' } : null;
    const fields = {
      title: String(n.title || ''), text: String(n.text || ''), kind, args: n.args || null, data: n.data || null, tap, persist: !!n.persist,
      icon: typeof n.icon === 'string' && n.icon ? n.icon : null,
      pic: picUrl(n.pic) || null, frame: n.frame && typeof n.frame === 'object' ? n.frame : null,
      actions: Array.isArray(n.actions) ? n.actions.filter((a) => a && a.act).slice(0, 3) : [],
    };
    const same = key && s.stack.find((b) => b.app === app && b.key === key && b.st !== 'out');
    if (same) {                                                       // same key: update it where it is, no new pop-in
      clearTimeout(same.timer); Object.assign(same, fields);
      if (!same.persist) { this.toLock(same); same.timer = setTimeout(() => this.dropBanner(same), n.life || STACK_LIFE); }
      this.update(); return same.id;
    }
    if (s.dnd && !n.force && kind !== 'call') return false;
    const item = { id: (this._bid = (this._bid || 0) + 1), app, key, ...fields, st: 'in' };
    if (!item.persist) this.toLock(item);
    const vis = s.stack.filter((b) => b.st !== 'out');
    if (vis.length >= STACK_MAX) this.dropBanner(vis.find((b) => !b.persist) || vis[0], true);   // full: the oldest makes way
    s.stack.push(item); this.update(); this.stackChanged();
    if (kind !== 'call' && !s.dnd && n.sound !== false) this.sounds.alert(app === 'messages' ? 'message' : 'notify');
    setTimeout(() => { if (item.st === 'in') { item.st = 'on'; this.update(); } }, 40);   // next frame: pop in
    if (!item.persist) item.timer = setTimeout(() => this.dropBanner(item), n.life || STACK_LIFE);
    return item.id;
  }
  /** on the lock screen, notifications also go into its list */
  toLock(item) { if (this.s.locked) this.s.notifs = [{ id: item.id, app: item.app, title: item.title, text: item.text, args: item.args, pic: item.pic, frame: item.frame, time: Date.now() }, ...this.s.notifs.filter((x) => x.id !== item.id)].slice(0, 4); }
  dismiss(app, key) {
    for (const b of [...this.s.stack]) if (b.app === app && b.st !== 'out' && (b.key === String(key) || b.id === key)) this.dropBanner(b);
  }
  dropBanner(item, quiet = false) {
    if (!item || item.st === 'out') return;
    clearTimeout(item.timer); item.st = 'out'; this.update();
    if (!quiet) this.stackChanged();
    setTimeout(() => { this.s.stack = this.s.stack.filter((b) => b !== item); this.update(); }, 420);
  }
  /** tells the viewer how many notifications are up (it raises a hidden phone just enough to show them) */
  stackChanged() {
    const n = this.s.stack.filter((b) => b.st !== 'out').length;
    if (n !== this._stackN) { this._stackN = n; this.opts.onStack?.(n); }
  }
  toast(text) {
    this.s.toast = text; this.s.lastToast = text; this.update();
    clearTimeout(this._tt); this._tt = setTimeout(() => { this.s.toast = null; this.update(); }, 2200);
  }
  iconFor(app) { const m = this.mods.get(app); return appIcon(app, m ? m.def.icon : I.bell); }
  /** a capsule's icon: its own glyph or its app's, with its picture round on top. The glyph is hidden while the
   *  picture shows; a picture that fails to load takes itself off and the icon is back. */
  bannerIcon(b) {
    const icon = b.icon ? appIcon(b.app, b.icon) : this.iconFor(b.app);
    if (!b.pic) return icon;
    return icon.replace('class="ico"', 'class="ico b-pic"').replace(/<\/div>$/,
      `<img class="av-pic" src="${esc(b.pic)}" alt="" style="${frameStyle(b.frame)}" onerror="this.parentNode.classList.remove('b-pic');this.remove()"></div>`);
  }

  // ---------------------------------------------------------------- actions (data-act) and bindings (data-bind)
  act(a, d, el, view) {
    if (this.s.voiceDown && !this.s.forced) return;                     // (the screen over everything takes every click)
    const modEl = el && el.closest('[data-mod]');
    if (modEl && !a.startsWith('os:')) return this.modAct(this.mods.get(modEl.dataset.mod), a, d, el, view);
    a = a.replace(/^os:/, '');
    const s = this.s;
    // held to one app: nothing that leaves it (home, the Control Centre, folding, another app, a capsule's tap)
    if (s.forced && ['unlock', 'open', 'notif', 'bopen', 'home', 'cc', 'fold', 'tablet', 'phone', 'hpage'].includes(a)) return;
    switch (a) {
      case 'noop': return;
      case 'unlock': s.locked = false; break;
      case 'open': this.openApp(d.app, {}, el, view); return;
      case 'notif': {
        const n = s.notifs.find((x) => String(x.id) === d.id);
        s.notifs = s.notifs.filter((x) => x !== n);
        if (n && this.mods.has(n.app)) this.openApp(n.app, n.args || {}); else s.locked = false;
        break;
      }
      case 'bopen': {
        const b = s.stack.find((x) => String(x.id) === d.id);
        if (b && b.tap && this.mods.has(b.app)) { this.modAct(this.mods.get(b.app), b.tap.act, { ...(b.data || {}) }, el, view); return; }
        this.dropBanner(b);
        if (b && this.mods.has(b.app)) { this.openApp(b.app, b.args || {}); this.opts.onOpenRequest?.(); }
        break;
      }
      case 'bact': {                                                  // a button on a capsule: the app module's action
        const b = s.stack.find((x) => String(x.id) === d.id);
        if (b && b.st !== 'out' && this.mods.has(b.app)) this.modAct(this.mods.get(b.app), d.a, { ...(b.data || {}) }, el, view);
        return;
      }
      case 'home':
        if (s.cc) s.cc = false;
        else if (s.app) this.goHome();
        else if (s.locked) s.locked = false;
        break;
      case 'back': this.back(); return;
      case 'cc': s.cc = !s.cc; break;
      case 'cc-close': s.cc = false; break;
      case 'dnd': this.setSetting('dnd', !s.dnd); return;
      case 'fold': s.cc = false; this.renderNow(); this.opts.onFold?.(); return;
      case 'tablet': this.opts.onTabletRequest?.(); return;
      case 'phone': this.opts.onPhoneRequest?.(); return;
      case 'cmd': this.command(d.c); return;
      case 'hpage': s.homePage = +d.page || 0; break;
      default: console.warn('[whip_phone] unknown action', a); return;
    }
    this.update();
  }
  modAct(m, a, d, el, view) {
    if (!m) return;
    const fn = m.def.actions && m.def.actions[a];
    if (typeof fn !== 'function') { console.warn(`[whip_phone] ${m.def.id}: no action "${a}"`); return; }
    try {
      const r = fn.call(m.def, m.ctx, { ...d }, el, view ? view.info : null);
      if (r && typeof r.then === 'function') r.then(() => this.update(), (e) => this.modError(m, a, e));
    } catch (e) { this.modError(m, a, e); }
    this.update();
  }
  bind(key, v, el) {
    const modEl = el && el.closest('[data-mod]');
    const m = modEl && this.mods.get(modEl.dataset.mod);
    if (!m) return;
    const fn = m.def.bind && m.def.bind[key];
    if (typeof fn !== 'function') { console.warn(`[whip_phone] ${m.def.id}: no binding "${key}"`); return; }
    try { fn.call(m.def, m.ctx, v, el); } catch (e) { this.modError(m, 'bind.' + key, e); }
    this.update();
  }
  hold(el, down) {
    const modEl = el.closest('[data-mod]'), m = modEl && this.mods.get(modEl.dataset.mod);
    if (m) this.modAct(m, el.dataset.hold, { ...el.dataset, down: down ? '1' : '' }, el, null);
  }
  drag() {}
  /** a data-pan element dragged or wheeled: its module's action (named by data-pan) with { dx, dy } or { zoom } */
  pan(el, d) {
    const modEl = el.closest('[data-mod]'), m = modEl && this.mods.get(modEl.dataset.mod);
    if (m) this.modAct(m, el.dataset.pan, { ...el.dataset, ...d }, el, null);
  }

  // ---------------------------------------------------------------- render
  update() { if (this._rendering) return; if (!this._pending) { this._pending = true; queueMicrotask(() => { if (this._pending) { this._pending = false; this.render(); } }); } }
  /**
   * all: every display that can be seen. Otherwise only the display in use renders; the other is marked stale.
   */
  render(all = false) {
    this._rendering = true;
    try {
      const live = this.liveKeys(), keys = all || !this.views[this.activeKey] ? live : [this.activeKey];
      let changed = false;
      for (const k of keys) { if (this.views[k].render()) changed = true; this.views[k]._stale = false; }
      if (changed) for (const k of live) if (!keys.includes(k)) this.views[k]._stale = true;
      this.syncMounts();
    } finally { this._rendering = false; }
    // presence: modules hear when the phone is put away / taken out, or an app opens or closes (after the render,
    // never during it)
    const p = this.presence(), k = `${p.visible}|${p.app}|${p.locked}`;
    if (k !== this._presenceKey) {
      const prev = this._presence || p;
      this._presenceKey = k; this._presence = p;
      queueMicrotask(() => { for (const m of this.mods.values()) this.call(m, 'presence', p, prev); this.update(); });
    }
    // an app that takes every key opened or closed: Lua holds walking and jumping off meanwhile (WASD and Space are its)
    const keys = this.wantsAllKeys();
    if (keys !== !!this._allKeys) { this._allKeys = keys; this.opts.onKeys?.(keys); }
  }
  tick() {
    const d = new Date(), m = d.getMinutes();
    if (m !== this._minute) { this._minute = m; this.update(); }
  }
  clockText() {
    const c = this.s.clock;
    if (c) return `${c.h % 12 || 12}:${pad2(c.m)}`;
    const d = new Date();
    return `${d.getHours() % 12 || 12}:${pad2(d.getMinutes())}`;
  }
  tplFront(m, view) {
    const s = this.s, info = view.info;
    let ovl = '';
    for (const mod of this.mods.values()) {
      const h = this.shownOverlay(mod) ? this.overlayHtml(mod, info) : '';
      if (h) ovl += `<div class="overlay mod m-${mod.def.id}" data-k="ov-${mod.def.id}" data-mod="${mod.def.id}">${h}</div>`;
    }
    view._overlay = !!ovl;
    return `${this.tplLock(m)}${this.tplHome(m)}` +
      `<div class="app-win" style="--ox:${s.origin.x.toFixed(1)}%;--oy:${s.origin.y.toFixed(1)}%">${s.app ? this.tplApp(s.app, info) : ''}</div>` +
      `${ovl}${this.tplSB(m)}${this.tplBanner()}${this.tplCC(m)}` +
      `<div class="toast${s.toast ? ' show' : ''}">${esc(s.toast || s.lastToast)}</div>` +
      // held to one app: it draws its own button hints, and there is no home to go to
      (this.isConsole() && !s.forced ? '<div class="hints" data-nofocus></div>' : '') +
      (s.forced ? '' : `<div class="home-bar" data-act="os:home" aria-label="Home"></div>`) +
      (this.theme.logo ? `<div class="boot${s.boot ? ' on' : ''}">${whipLogo('whip-logo', true)}</div>` : '') +
      (s.voiceDown && !s.forced ? `<div class="voice-down" data-k="voice-down" data-nofocus>${VOICE_DOWN_ICON}` +
        `<div class="vd-text">${esc(s.voiceDownText || 'Voice connection failed, is the voice resource started?')}</div></div>` : '') +
      (m === 'phone' ? '<div class="punch"></div>' : '');
  }
  tplApp(id, info) {
    const m = this.mods.get(id);
    if (!m) return '';
    if (typeof m.def.mount === 'function') return `<div class="app-wrap mod m-${id}" data-k="${id}" data-mod="${id}"><div class="mount" data-mount="${id}" data-k="mount-${id}"></div></div>`;
    let html;
    try { html = m.def.render(m.ctx, info) || ''; } catch (e) {
      console.error(`[whip_phone] ${id}.render`, e);
      html = kit.screen('err', `${kit.nav({ back: 'Home', act: 'os:home' })}<div class="app-err"><b>${esc(m.def.name || id)} hit an error</b><code>${esc(e && e.message)}</code></div>`);
    }
    return `<div class="app-wrap mod m-${id}" data-k="${id}" data-mod="${id}">${html}</div>`;
  }
  /**
   * Mount-mode apps (def.mount): the app renders into its own box with any library. One live box per app, in the
   * display in use, moving when the phone folds. Hooks: mount(app, el, view) once, update(app, el, view, changed)
   * after every phone render, unmount(app, el) when the app closes.
   */
  syncMounts() {
    for (const m of this.mods.values()) {
      if (typeof m.def.mount !== 'function') continue;
      if (this.s.app !== m.def.id) { if (m.root) this.unmountMod(m); continue; }
      const key = this.activeKey || m.mountKey || 'phone';           // while folding there is no display in use: stay put
      const view = this.views[key], slot = view && view.front.querySelector(`[data-mount="${m.def.id}"]`);
      if (!slot) continue;
      const info = view.info;
      if (!m.root) {
        const root = m.root = document.createElement('div');
        root.className = 'mount-root'; root.setAttribute('data-mount-root', m.def.id);
        slot.appendChild(root);
        m.mountKey = key; m.mountInfo = info;
        m.obs = new MutationObserver(() => this.bump());               // the app changed its DOM: fold snapshots are stale
        m.obs.observe(root, { subtree: true, childList: true, attributes: true, characterData: true });
        this.hook(m, 'mount', root, info);
        continue;
      }
      const moved = m.root.parentNode !== slot;
      if (moved) slot.appendChild(m.root);
      const changed = moved || m.mountKey !== key || m.mountInfo.console !== info.console;
      m.mountKey = key; m.mountInfo = info;
      this.hook(m, 'update', m.root, info, changed);
    }
  }
  /** an open mount-mode app draws on a canvas / video: its pixels change without the DOM changing */
  liveMedia() { for (const m of this.mods.values()) if (m.root && m.root.querySelector('canvas, video')) return true; return false; }
  unmountMod(m) {
    const root = m.root;
    if (m.obs) m.obs.disconnect();
    m.root = null; m.obs = null;
    this.hook(m, 'unmount', root);
    root.remove();
  }
  /** mount-mode hooks: a throw or rejection is logged, and never asks for a render (they run inside one) */
  hook(m, fn, ...args) {
    const f = m && m.def[fn];
    if (typeof f !== 'function') return;
    try {
      const r = f.call(m.def, m.ctx, ...args);
      if (r && typeof r.then === 'function') r.catch((e) => this.modError(m, fn, e, true));
    } catch (e) { this.modError(m, fn, e, true); }
  }
  /** the open app's status bar ink: def.statusBar 'dark' (for light apps) / 'light', or a function of app returning one */
  statusBarFor(id) {
    const m = this.mods.get(id);
    if (!m) return '';
    let v = m.def.statusBar;
    if (typeof v === 'function') { try { v = v.call(m.def, m.ctx); } catch (e) { this.modError(m, 'statusBar', e, true); v = ''; } }
    return v === 'dark' || v === 'light' ? v : '';
  }
  tplBehind() {
    const c = this.s.clock, d = new Date();
    return `<div class="lock-clock"><div class="lc-date">${d.toLocaleDateString('en-AU', { weekday: 'long', day: 'numeric', month: 'long' })}</div><div class="lc-time">${this.clockText()}</div></div>`;
  }
  tplSB(m) {
    const s = this.s, d = new Date();
    const date = m === 'tablet' ? `<span class="sb-date">${d.toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short' })}</span>` : '';
    const modeButton = m === 'phone'
      ? `<button class="sb-tablet" data-act="os:tablet" aria-label="Open tablet mode" title="Open tablet mode">${GLYPH.tablet}</button>`
      : `<button class="sb-tablet" data-act="os:phone" aria-label="Fold to phone" title="Fold to phone">${GLYPH.fold}</button>`;
    return `<div class="sb"><div class="sb-l"><span>${this.clockText()}</span>${modeButton}${date}${s.dnd ? `<span style="width:13px;display:inline-block">${GLYPH.moon.replace('#fff', 'currentColor')}</span>` : ''}</div>` +
      `<div class="sb-r" data-act="os:cc" aria-label="Control Centre"><span class="${s.signal ? '' : 'off'}">${GLYPH.signal}</span>${m === 'tablet' ? `<span class="pct">${s.battery}%</span>` : ''}<span class="bat">${GLYPH.battery(s.battery)}</span></div></div>`;
  }
  tplLock() {
    const s = this.s;
    const notifs = s.notifs.map((n) => `<button class="notif" data-k="n${n.id}" data-act="os:notif" data-id="${n.id}" data-app="${esc(n.app)}">${this.bannerIcon(n)}` +
      `<div class="n-body"><div class="n-top"><span class="n-title">${esc(n.title)}</span><span>${kit.fmtWhen(n.time)}</span></div><div class="n-text">${esc(n.text)}</div></div></button>`).join('');
    return `<div class="lock" data-act="os:unlock">${this.theme.logo ? whipLogo('lock-logo') : ''}<div class="notifs">${notifs}</div>` +
      `<div class="lock-btns"><span></span><div class="unlock-hint">${this.isConsole() ? '' : s.touch ? 'Tap to unlock' : 'Click to unlock'}</div><span></span></div></div>`;
  }
  badgeFor(m) { const n = +(this.call(m, 'badge') || 0); return n > 0 ? `<b class="badge">${n > 99 ? '99+' : n}</b>` : ''; }
  icon(m, label = true, slot = null) {
    const id = m.def.id, s = this.s;
    const held = (s.drag && s.drag.app === id && s.drag.live) || (s.moving && s.moving.app === id);
    const over = s.drag && s.drag.live && slot != null && s.drag.over === slot && s.drag.app !== id;
    // aria-label: the dock's icons show no name, and a badge's number is no name either (screen readers, the AI link)
    return `<button class="app-icon tap${held ? ' held' : ''}${over ? ' over' : ''}" data-act="os:open" data-app="${id}" aria-label="${esc(m.def.name || id)}"` +
      `${slot != null ? ` data-slot="${slot}"` : ''}>${appIcon(id, m.def.icon)}${this.badgeFor(m)}${label ? `<span>${esc(m.def.name || id)}</span>` : ''}</button>`;
  }
  tile(m) {
    const id = m.def.id, held = this.s.moving && this.s.moving.app === id;
    return `<button class="tile${held ? ' held' : ''}" data-act="os:open" data-app="${id}">${appIcon(id, m.def.icon)}${this.badgeFor(m)}<span>${esc(m.def.name || id)}</span></button>`;
  }

  // ---- the home screen's arrangement
  // Every slot of a page is a place an app can be; apps are moved and swapped. The arrangement belongs to the SIM and
  // is kept per grid: the phone's 4 x 4, the tablet's (24 a page). The controller layout's tiles are the phone's
  // arrangement in reading order, gaps closed.
  /** the grid a display arranges on */
  homeKey(mode) { return mode === 'phone' ? 'phone' : 'tablet'; }
  dockApps(mode) { return this.apps.filter((x) => x.def.dock).slice(0, DOCK_MAX[mode] || 4); }
  /** where every app is on a grid: at (slot -> module), of (id -> slot), pages. An app with no place (new) takes
   *  the first free slot; two claiming one slot, the first in app order keeps it. */
  arrange(mode) {
    const g = this.homeKey(mode), per = PER_PAGE[mode] || 16;
    const dock = this.dockApps(mode), rest = this.apps.filter((x) => !dock.includes(x));
    const want = (this.s.home && this.s.home[g]) || {};
    const at = new Map(), of = new Map();
    for (const m of rest) {
      const i = want[m.def.id];
      if (Number.isInteger(i) && i >= 0 && i < MAX_SLOT && !at.has(i)) { at.set(i, m); of.set(m.def.id, i); }
    }
    let next = 0;
    for (const m of rest) {
      if (of.has(m.def.id)) continue;
      while (at.has(next)) next++;
      at.set(next, m); of.set(m.def.id, next);
    }
    let max = -1;
    for (const i of at.keys()) if (i > max) max = i;
    return { g, per, at, of, dock, pages: Math.max(1, Math.floor(max / per) + 1) };
  }
  /** an app is being moved on this display's grid: one more page to the right, to move it to */
  arranging(mode) {
    const s = this.s, g = this.homeKey(mode);
    return !!((s.drag && s.drag.live && s.drag.g === g) || (s.moving && s.moving.g === g));
  }
  /** Put app `id` in `target` on this display's grid: swapped with what is there, or moved into the gap. The whole
   *  arrangement is written down (so new apps stop moving about), and saved to the SIM. */
  place(mode, id, target) {
    const L = this.arrange(mode), from = L.of.get(id);
    if (from == null || !Number.isInteger(target) || target < 0 || target >= MAX_SLOT || target === from) return false;
    const pos = { ...((this.s.home && this.s.home[L.g]) || {}) };
    for (const [i, m] of L.at) pos[m.def.id] = i;
    const other = L.at.get(target);
    pos[id] = target;
    if (other) pos[other.def.id] = from;
    this.s.home = { ...this.s.home, [L.g]: pos };
    this.saveHome();
    return true;
  }
  saveHome() {
    clearTimeout(this._sh);
    this._sh = setTimeout(() => this.request('whip_phone:home:save', { home: this.s.home }).catch(() => {}), 600);
  }
  /** columns of the home grid on a display (4 on the phone; the tablet's depend on how it is turned) */
  gridCols(view) {
    const grid = view && view.front.querySelector('.home .grid');
    const n = grid ? getComputedStyle(grid).gridTemplateColumns.split(' ').filter(Boolean).length : 0;
    return n > 0 ? n : 4;
  }

  // ---- with keys or a pad: X on an app picks it up (Move), the D-pad carries it, A / B / X put it down
  startMove(id) {
    const v = this.views[this.activeKey];
    if (!v || !this.mods.has(id)) return;
    this.s.moving = { app: id, g: this.homeKey(v.mode) };
    this.update();
  }
  endMove() { if (this.s.moving) { this.s.moving = null; this.update(); } }
  moveBy(dir) {
    const s = this.s, v = this.views[this.activeKey];
    if (!s.moving || !v) return;
    const id = s.moving.app;
    if (this.isConsole()) {
      // the tiles: the phone's arrangement in reading order; a step swaps with the neighbour
      const L = this.arrange('phone'), order = [...L.at.entries()].sort((a, b) => a[0] - b[0]);
      const k = order.findIndex(([, m]) => m.def.id === id);
      const t = k + ({ left: -1, right: 1, up: -3, down: 3 }[dir] || 0);
      if (k < 0 || t < 0 || t >= order.length || t === k) return;
      this.place('phone', id, order[t][0]);
      if (v.mode === 'phone') s.homePage = Math.floor((t + L.dock.length) / CONSOLE_PER_PAGE);   // the dock's tiles come first
    } else {
      const L = this.arrange(v.mode), from = L.of.get(id), cols = this.gridCols(v);
      if (from == null) return;
      const step = { left: -1, right: 1, up: -cols, down: cols, lb: -L.per, rb: L.per }[dir] || 0;
      const to = from + step;
      if (to < 0 || to >= Math.min(MAX_SLOT, (L.pages + 1) * L.per)) return;
      this.place(v.mode, id, to);
      s.homePage = Math.floor(to / L.per);
    }
    this.update();
  }

  // ---- with the mouse: press an app and drag it onto another slot (an app there swaps), or to the left / right
  // edge to carry it to the next page. A click that never moved still opens it.
  homePointerDown(view, el, e) {
    if (e.button !== 0 || this.isConsole() || !el.dataset.app || el.dataset.slot == null) return;
    this._press = { view, id: el.dataset.app, x: e.clientX, y: e.clientY };
    if (!this._dragWired) {
      this._dragWired = true;
      window.addEventListener('pointermove', (ev) => this.homePointerMove(ev));
      window.addEventListener('pointerup', (ev) => this.homePointerUp(ev));
    }
  }
  homePointerMove(e) {
    const p = this._press, s = this.s;
    if (!p) return;
    if (!s.drag) {
      if (Math.hypot(e.clientX - p.x, e.clientY - p.y) < 8) return;      // still a click
      s.drag = { app: p.id, g: this.homeKey(p.view.mode), mode: p.view.mode, over: null, live: true };
    }
    const hit = document.elementFromPoint(e.clientX, e.clientY);
    const slotEl = hit && hit.closest('[data-slot]');
    const over = slotEl && p.view.root.contains(slotEl) ? +slotEl.dataset.slot : null;
    const edge = hit && hit.closest('[data-edge]');
    if (edge && p.view.root.contains(edge)) {
      if (!this._edgeT) {
        const dir = +edge.dataset.edge;
        this._edgeT = setTimeout(() => {
          this._edgeT = null;
          if (!s.drag) return;
          const L = this.arrange(s.drag.mode), max = L.pages;                // one page past the last, to make a new one
          s.homePage = Math.max(0, Math.min(max, (s.homePage || 0) + dir));
          this.update();
        }, 650);
      }
    } else if (this._edgeT) { clearTimeout(this._edgeT); this._edgeT = null; }
    if (over !== s.drag.over) { s.drag.over = over; this.update(); }
  }
  homePointerUp() {
    const s = this.s, d = s.drag;
    this._press = null;
    if (this._edgeT) { clearTimeout(this._edgeT); this._edgeT = null; }
    if (!d) return;
    s.drag = null;
    this._noClickUntil = performance.now() + 250;                         // the drag's release is not a tap
    if (d.over != null) this.place(d.mode, d.app, d.over);
    this.update();
  }

  /** home pages for a display */
  pages(mode) {
    const apps = this.apps;
    if (this.isConsole()) return mode === 'phone' ? Math.max(1, Math.ceil(apps.length / CONSOLE_PER_PAGE)) : 1;
    return this.arrange(mode).pages + (this.arranging(mode) ? 1 : 0);
  }
  tplHome(m) {
    const apps = this.apps, s = this.s;
    if (!apps.length) return `<div class="home empty-home">${this.theme.logo ? whipLogo('eh-logo') : ''}<b>No apps installed</b><span>Apps are modules. Install one and it shows up here.</span></div>`;
    if (this.isConsole()) return this.tplHomeConsole(m, apps);
    const L = this.arrange(m), moving = this.arranging(m);
    const n = L.pages + (moving ? 1 : 0), page = Math.min(s.homePage, n - 1);
    // Every slot of the page, the empty ones too: a slot is where an app can go, so the grid keeps its places.
    let grid = '';
    for (let k = 0; k < L.per; k++) {
      const i = page * L.per + k, mod = L.at.get(i);
      if (mod) grid += this.icon(mod, true, i);
      else grid += `<div class="slot${s.drag && s.drag.live && s.drag.over === i ? ' over' : ''}" data-slot="${i}"><i class="ico-ghost"></i><span>&#160;</span></div>`;
    }
    const dots = n > 1 ? `<div class="dots">${Array.from({ length: n }, (_, i) => `<button class="${i === page ? 'on' : ''}" data-act="os:hpage" data-page="${i}"></button>`).join('')}</div>` : '';
    const edges = s.drag && s.drag.live ? '<div class="hedge l" data-edge="-1" data-nofocus></div><div class="hedge r" data-edge="1" data-nofocus></div>' : '';
    return `<div class="home${moving ? ' arranging' : ''}" data-k="h-${page}"><div class="grid">${grid}</div>${dots}${edges}` +
      `${L.dock.length ? `<div class="dock">${L.dock.map((x) => this.icon(x, false)).join('')}</div>` : ''}</div>`;
  }
  tplHomeConsole(m, apps) {
    const s = this.s, phone = m === 'phone';
    // the dock's apps first, then the phone's arrangement in reading order (its gaps closed)
    const L = this.arrange('phone');
    const ordered = [...L.dock, ...[...L.at.entries()].sort((a, b) => a[0] - b[0]).map(([, x]) => x)];
    const n = phone ? Math.max(1, Math.ceil(ordered.length / CONSOLE_PER_PAGE)) : 1, page = phone ? Math.min(s.homePage, n - 1) : 0;
    const ids = phone ? ordered.slice(page * CONSOLE_PER_PAGE, (page + 1) * CONSOLE_PER_PAGE) : ordered;
    const tabs = phone && n > 1 ? `<div class="pgs">${this.glyph('lb')}${Array.from({ length: n }, (_, i) => `<button class="pg${i === page ? ' on' : ''}" data-act="os:hpage" data-page="${i}">${i + 1}</button>`).join('')}${this.glyph('rb')}</div>` : '';
    return `<div class="home chome" data-k="ch-${page}"><div class="ch-head"><div class="ch-title">Apps</div>${tabs}</div>` +
      `<div class="tiles">${ids.map((x) => this.tile(x)).join('')}</div><div class="ch-info"></div></div>`;
  }
  /** notification stack: up to 3 capsules, oldest on top, newest arriving at the bottom (st: in -> on -> out) */
  tplBanner() {
    const vis = this.s.stack.filter((b) => b.st !== 'out');
    return this.s.stack.map((b) => {
      const acts = b.actions.length ? `<div class="b-acts">${b.actions.map((a) => `<button class="b-act t-${esc(a.tone || 'plain')}" data-act="os:bact" data-id="${b.id}" data-a="${esc(a.act)}" ` +
        `title="${esc(a.label || a.act)}" aria-label="${esc(a.label || a.act)}">${a.icon || esc(String(a.label || a.act).slice(0, 1))}</button>`).join('')}</div>` : '';
      return `<div class="banner ${b.st}${acts ? ' has-acts' : ''}" data-k="b${b.id}" data-act="os:bopen" data-id="${b.id}" data-app="${esc(b.app)}" data-kind="${esc(b.kind)}" style="--i:${b.st === 'out' ? -1 : vis.indexOf(b)}">` +
        `${this.bannerIcon(b)}<div class="b-main"><div class="b-t">${esc(b.title)}${b.persist ? '' : '<span>now</span>'}</div><div class="b-x">${esc(b.text)}</div></div>${acts}</div>`;
    }).join('');
  }
  tplCC(m) {
    const s = this.s, settings = this.mods.get('settings');
    return `<div class="cc" data-act="os:cc-close"><div class="cc-panel" data-act="noop">` +
      `<button class="cc-tile cc-wide2 c-purple${s.dnd ? ' on' : ''}" data-act="os:dnd" data-hint="Toggle">${GLYPH.moon}<span>Do Not Disturb</span></button>` +
      (settings ? `<button class="cc-tile cc-wide2" data-act="os:open" data-app="settings" data-hint="Open">${appIcon('settings', settings.def.icon).replace('class="ico"', 'class="ico cc-ico"')}<span>Settings</span></button>` : '') +
      `<button class="cc-tile cc-fold" data-act="os:fold">${GLYPH.fold}<span>${m === 'phone' ? 'Unfold to tablet' : 'Fold to phone'}</span></button>` +
      `</div></div>`;
  }
}
