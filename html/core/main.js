// whip_phone page entry. Creates the OS, the 3D Duo and the NUI bridge, exposes window.WhipPhone for module scripts,
// loads the modules Lua lists (init), and maps Lua messages and keyboard input onto the phone.
// index.html boots it for the game; preview.html boots it with a mock framework and a dev panel.
import { PhoneOS } from './os.js';
import { DuoViewer } from './duo.js';
import { GLB } from './duo_glb.js';
import { createBridge } from './bridge.js';
import { setAssetLoader } from './snapshot.js';
import { kit } from './kit.js';
import { I } from './icons.js';

export const VERSION = '1.0.0';
// keyboard: in game the keys also reach GTA while the phone is open (SetNuiFocusKeepInput), so only keys the game
// doesn't act on drive the phone there; the preview adds Q / E / X / C as LB / RB / X / menu
const KEYMAP = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right', Enter: 'a', Escape: 'b', Backspace: 'b', Home: 'home' };
const DEV_KEYS = { q: 'lb', Q: 'lb', e: 'rb', E: 'rb', x: 'x', X: 'x', c: 'menu', C: 'menu' };
// an app that takes every key (def.keys 'all': a skill check game) also gets these, by where they sit on the keyboard;
// Lua holds walking and jumping off while one is open, so they do nothing in the world meanwhile
const ALL_KEYS = { KeyW: 'up', KeyS: 'down', KeyA: 'left', KeyD: 'right', Space: 'a', KeyQ: 'lb', KeyE: 'rb' };

const loadScript = (src) => new Promise((resolve) => {
  const s = document.createElement('script');
  s.src = src; s.async = false;
  s.onload = () => resolve(true); s.onerror = () => resolve(false);
  document.head.appendChild(s);
});

/** dev (preview only): { topBar, theme, onChange, onModules, onTheme, onLayout } */
export function boot({ mock = null, dev = null } = {}) {
  const bridge = createBridge({ mock });
  // fold snapshots inline images and fonts; another resource's files may not be fetchable from here, so Lua reads them
  if (bridge.inGame) setAssetLoader(async (url) => { const r = await bridge.post('asset', { url }); return r && typeof r.data === 'string' ? r.data : null; });
  const expected = new Map();                 // module id -> { ns, external } while its script loads
  const st = { focused: !bridge.inGame, attention: null, reported: undefined, area: '' };
  let duo = null;

  const os = new PhoneOS(document.getElementById('os-layer'), {
    bridge, theme: dev && dev.theme,
    onFold: () => { if (duo && !duo.hidden) duo.toggle(); },
    onClose: () => close(true),
    onWallpaper: (wp) => duo && duo.setWallpaper(wp),
    onStack: (n) => duo && duo.setPeek(n),
    onOpenRequest: () => { if (duo && duo.hidden) duo.show('phone'); },
    onTabletRequest: () => open('tablet', true),
    onPhoneRequest: () => open('phone', true),
    onAttention: (id, on) => attention(id, on),
    onModules: (list) => dev && dev.onModules && dev.onModules(list),
    onTheme: (id) => dev && dev.onTheme && dev.onTheme(id),
    onLayout: (l) => dev && dev.onLayout && dev.onLayout(l),
    // a held app answered (app.done): Lua lets the phone go (client/main.lua RunApp)
    onForcedDone: (app, result) => { bridge.post('forcedDone', { app, result }); dev && dev.onForcedDone && dev.onForcedDone(app, result); },
    onRumble: (ms, strength) => bridge.post('rumble', { ms, strength }),
    onKeys: (on) => bridge.post('keys', { on }),
  });
  for (const h of Object.values(os.hosts)) Object.assign(h.style, { visibility: 'hidden', opacity: '0', pointerEvents: 'none' });

  window.WhipPhone = Object.freeze({
    version: VERSION,
    /** a module's script calls this once: WhipPhone.module({ id, name, icon, render, ... }) (see docs/MODULES.md) */
    module: (def) => os.register(def, expected.get(def && def.id) || {}),
    kit, icons: I,
  });

  const glb = Uint8Array.from(atob(GLB), (c) => c.charCodeAt(0)).buffer;
  duo = new DuoViewer({
    canvas: document.getElementById('gl'), os, glb, topBar: (dev && dev.topBar) || null, hidden: !dev, phoneScale: dev ? 0.56 : 0.5,
    onChange: (o, state) => { report(state); if (dev && dev.onChange) dev.onChange(o, state); },
    // where the phone will sit, for whip's HUD to make room (client/main.lua 'area'); sent only when it changes
    onArea: (area) => {
      const key = area ? JSON.stringify(area) : '';
      if (key === st.area) return;
      st.area = key;
      bridge.post('area', { area });
    },
  });
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) { duo.wobble = 0.25; duo.tiltAmount = 0.4; }
  addEventListener('pointermove', (e) => {
    duo.pointer(e.clientX, e.clientY, e.pointerType);
    // a real move anywhere on the page, not only over the phone: the mouse is back, and so is its cursor
    if (Math.abs(e.movementX) + Math.abs(e.movementY) > 3) os.setInput('mouse');
  }, { passive: true });
  document.documentElement.addEventListener('mouseleave', () => duo.pointerLeave());

  /** tell Lua what the player sees (hidden / peek / phone / tablet); null while moving is not reported */
  function report(state) {
    if (!state || state === st.reported) return;
    st.reported = state;
    bridge.post('state', { state });
  }
  function open(mode = 'phone', focus = true) {
    st.focused = focus;
    duo.show(mode === 'tablet' ? 'tablet' : 'phone');
  }
  /** fromUi: the player put it away from the phone itself (Back at the top level), so Lua must drop NUI focus too */
  function close(fromUi = false) {
    st.focused = false; st.attention = null;
    if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
    duo.hide();
    if (fromUi) bridge.post('close');
  }
  /** a module needs to be seen (incoming call): raise a put-away phone, and put it back when done unless opened */
  function attention(id, on) {
    if (on) { if (duo.hidden) { st.attention = id; duo.show('phone'); } }
    else if (st.attention === id) { st.attention = null; if (!st.focused) duo.hide(); }
  }
  const canInput = () => duo && duo.settled && !duo.hidden && st.focused;
  /** info: { repeat, from } (os.command). Y folds, unless the phone is held to an app. */
  function command(cmd, down = true, info = {}) {
    if (cmd === 'y') { if (down && !duo.hidden && !os.s.forced) duo.toggle(); return; }
    if (canInput()) os.command(cmd, down, info);
  }

  async function loadModules(list = []) {
    for (const m of list) {
      if (!m || typeof m.id !== 'string' || typeof m.script !== 'string') continue;
      expected.set(m.id, { ns: m.ns || `whip_phone:${m.id}`, external: !!m.external, script: m.script });
      const ok = await loadScript(m.script + (m.external ? (m.script.includes('?') ? '&' : '?') + 't=' + Date.now() : ''));
      if (!ok) console.warn(`[whip_phone] module ${m.id}: could not load ${m.script}`);
      else if (!os.mods.has(m.id)) console.warn(`[whip_phone] module ${m.id}: the script loaded but never called WhipPhone.module({ id: '${m.id}', ... })`);
    }
  }
  function applyConfig(cfg = {}) {
    if (typeof cfg.phoneScale === 'number') { duo.phoneScale = cfg.phoneScale; duo.relayout(); }
    if (cfg.defaults) os.applySettings(cfg.defaults);
    if (cfg.clock === 'real') os.setClock(null);
  }

  bridge.on((msg) => {
    switch (msg.type) {
      case 'init': applyConfig(msg.config || {}); loadModules(msg.modules || []); break;
      case 'session': os.setSession(msg.session || {}); break;
      // pad: opened with a controller (D-pad up), so it starts in the pad's layout with no mouse cursor
      case 'open': if (msg.pad) os.setInput('pad'); open(msg.mode, msg.focus !== false); break;
      case 'close': close(false); break;
      case 'focus': st.focused = !!msg.on; break;
      case 'push': os.push(msg.module, msg.event, msg.data); break;
      case 'notify': os.notify(msg.notification || {}); break;
      // rep: the D-pad held down, stepping again (whip's padScreen)
      case 'cmd': os.setInput('pad'); command(msg.cmd, msg.down !== false, { repeat: (msg.rep || 0) > 0, from: 'pad' }); break;
      // held to one app (client/main.lua RunApp): it opens, the phone unfolds to a tablet; unforce lets go
      case 'force': if (msg.pad) os.setInput('pad'); os.force(msg.app, msg.args || {}); open('tablet', true); break;
      case 'unforce': os.unforce(); break;
      case 'time': os.setClock(msg.h, msg.m); break;
      case 'status': os.setStatus(msg); break;
      case 'module': loadModules([msg.module]); break;
      case 'unmodule': os.unregister(msg.id); break;
      default: break;
    }
  });

  const keyCmd = (e) => KEYMAP[e.key] || (os.wantsAllKeys() ? ALL_KEYS[e.code] : null) || (dev ? DEV_KEYS[e.key] : null);
  addEventListener('keydown', (e) => {
    if (!canInput() || (e.target.closest && e.target.closest('input, textarea, select'))) return;
    const cmd = keyCmd(e);
    if (!cmd) return;
    os.setInput('keys');
    if (!e.repeat || cmd !== 'a') os.command(cmd, true, { repeat: e.repeat, from: 'keys' });
    e.preventDefault();
  });
  // every key's release (a game holds A, and steps a held direction itself); the phone's own screens use Enter's only
  addEventListener('keyup', (e) => {
    if (!canInput()) return;
    const cmd = keyCmd(e);
    if (cmd) os.command(cmd, false, { from: 'keys' });
  });

  const api = { os, duo, bridge, open, close, command, loadModules, get focused() { return st.focused; } };
  duo.ready.then(() => { document.body.classList.add('ready'); bridge.post('ready', { version: VERSION }); })
    .catch((e) => { console.error('[whip_phone] the Duo could not load', e); bridge.post('ready', { version: VERSION, error: String(e && e.message || e) }); });
  return api;
}
