// NUI bridge. In game, posts go to this resource's RegisterNUICallback handlers (client/main.lua) and Lua talks back
// with SendNUIMessage; the manifest sets nui_callback_strict_mode, so only this page can call them. In a browser
// (the preview) a mock framework stands in for both directions.
//
// page -> Lua posts: ready, request { name, args }, close, state { state, o }, typing { on }, asset { url },
//   callVolume { value? } -> { value }, forcedDone { app, result }, rumble { ms, strength }, keys { on },
//   area { area: { left, top, right, bottom } | null } (where the phone will sit, for whip's HUD)
// Lua -> page messages ({ type }): init, session, open, close, push, notify, cmd { cmd, down, rep }, time, status, module,
//   unmodule, force { app, args, pad }, unforce
export function createBridge({ mock = null } = {}) {
  const inGame = typeof window.GetParentResourceName === 'function';
  const resource = inGame ? window.GetParentResourceName() : 'whip_phone';
  const listeners = new Set();
  const emit = (msg) => { for (const fn of listeners) { try { fn(msg); } catch (e) { console.error('[whip_phone] message handler', e); } } };
  window.addEventListener('message', (e) => { const d = e.data; if (d && typeof d === 'object' && typeof d.type === 'string') emit(d); });
  const bridge = {
    inGame, resource,
    on(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    /** used by the mock to play the Lua side */
    emit,
    async post(name, data = {}) {
      if (inGame) {
        try {
          const r = await fetch(`https://${resource}/${name}`, { method: 'POST', headers: { 'Content-Type': 'application/json; charset=UTF-8' }, body: JSON.stringify(data) });
          const t = await r.text();
          return t ? JSON.parse(t) : {};
        } catch (e) { return { ok: false, reason: 'no response' }; }
      }
      if (mock) { try { return await mock.post(name, data, bridge); } catch (e) { console.error('[whip_phone mock]', e); return { ok: false, reason: String(e && e.message || e) }; } }
      return { ok: false, reason: 'no backend' };
    },
    /** a module / core data request: { ok, data } or { ok: false, reason } */
    request(name, args) { return bridge.post('request', { name, args: args ?? {} }); },
  };
  return bridge;
}
