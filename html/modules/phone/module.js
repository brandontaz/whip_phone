// Phone: recents, contacts, keypad and the call screen. UI only: every call action is a request the framework answers
// (whip_phone:phone:*, see docs/FRAMEWORK.md) and call progress arrives as pushes; contacts use the shared contacts
// service (whip_phone:contacts:*). Delete this folder and the phone simply has no Phone app.
// BLOCKING (14 Nov 2026): a number's page (a contact's, or a Recents call's through its info button) blocks or
// unblocks it (the shared block list, app.blocks). The server keeps a blocked number's calls from ringing here and out
// of Recents; a lore character's number (noBlock) and the SIM's own get no Block.
(() => {
  const { kit: K, icons: I } = window.WhipPhone;
  const GLYPH = '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M7.2 3.2c.6-.3 1.3-.1 1.6.5l1.5 3.1c.3.6.1 1.3-.4 1.7l-1.3 1c.9 2.1 2.6 3.8 4.7 4.7l1-1.3c.4-.5 1.1-.7 1.7-.4l3.1 1.5c.6.3.8 1 .5 1.6l-.9 1.9c-.4.8-1.3 1.3-2.2 1.2C9.9 18.3 4.5 12.9 4.1 6.3C4 5.4 4.5 4.5 5.3 4.1z"/></svg>';
  const KEYS = [['1', ''], ['2', 'ABC'], ['3', 'DEF'], ['4', 'GHI'], ['5', 'JKL'], ['6', 'MNO'], ['7', 'PQRS'], ['8', 'TUV'], ['9', 'WXYZ'], ['*', ''], ['0', '+'], ['#', '']];
  const TABS = [['recents', 'Recents', I.recent], ['contacts', 'Contacts', I.person], ['keypad', 'Keypad', I.keypad]];
  const ENDED = { ended: 'Call ended', declined: 'Declined', busy: 'Busy', unavailable: 'Unavailable', missed: 'No answer', failed: 'Call failed' };
  const CALL_KEY = 'call';                                   // the incoming-call capsule's notify key
  let ticker = null, clearer = null;

  const digits = K.digits;
  const missed = (s) => s.recents.filter((r) => r.dir === 'missed' && K.toMs(r.time) > s.seen).length;

  // Mute and Speaker: shown at once, and put back (saying why) if the server says no — the sound is the voice system's,
  // and the button must never show what the call is not doing.
  function toggle(app, key, action) {
    const c = app.state.call;
    if (!c || c.state === 'ended') return;
    const on = !c[key];
    c[key] = on;
    capsule(app);
    app.request(action, { callId: c.id, on }).catch((e) => {
      if (app.state.call === c && c[key] === on) c[key] = !on;
      if (e && e.reason) app.toast(e.reason);
      capsule(app);
      app.render();
    });
  }
  // every second of a call: the call screen's time, or the capsule's while the screen is not in front
  function startTick(app) {
    if (!ticker) ticker = setInterval(() => { const c = app.state.call; if (c && !c.full) capsule(app); app.render(); }, 1000);
  }
  function stopTick() { clearInterval(ticker); ticker = null; }
  /**
   * A call shows one of two ways (c.full):
   * - capsule: the phone is put away, the player is in an app, or the call screen was hidden (B, or its Hide
   *   button). One capsule for the whole call: Decline / Answer while it rings in, then its time (or "Calling…")
   *   with Speaker and End call (Josh, 12 Oct 2026). Up until the call is over.
   * - full screen: the call screen. Calls you make start on it; an incoming one takes the home or lock screen, or
   *   comes up when the phone is taken out. Tapping the capsule brings it back.
   */
  const homeInFront = (p) => p.visible && !p.app;
  /** the call's state in words: the call screen's line and the capsule's */
  function stateText(c) {
    return c.state === 'incoming' ? 'Incoming call' : c.state === 'dialing' ? 'Calling…' : c.state === 'ringing' ? 'Ringing…'
      : c.state === 'connecting' ? 'Connecting…' : c.state === 'active' ? K.fmtDuration((Date.now() - c.since) / 1000) : c.reason || 'Call ended';
  }
  /** THE CALL'S SOUND (Josh, 12 Oct 2026): the SIM's ringtone while a call rings in, the line ringing while one you
   *  made rings at the other end, and quiet otherwise. Asked at every change of the call (capsule, finish). */
  function callSound(app) {
    const c = app.state.call;
    app.ring(!c ? null : c.state === 'incoming' ? 'ring' : c.state === 'ringing' ? 'back' : null);
  }
  function capsule(app) {
    const c = app.state.call;
    callSound(app);
    if (!c || c.state === 'ended' || c.full) { app.dismiss(CALL_KEY); return; }
    const ringing = c.state === 'incoming';
    const actions = ringing
      ? [{ act: 'decline', label: 'Decline', tone: 'reject', icon: GLYPH }, { act: 'answer', label: 'Answer', tone: 'accept', icon: GLYPH }]
      : [...(c.state === 'active' ? [{ act: 'speaker', label: c.speaker ? 'Speaker off' : 'Speaker', tone: c.speaker ? 'on' : 'plain', icon: I.speaker }] : []),
        { act: 'hangup', label: 'End call', tone: 'reject', icon: GLYPH }];
    app.notify({
      key: CALL_KEY, kind: 'call', persist: true, title: app.contacts.name(c.number), text: stateText(c), data: { callId: c.id },
      tap: { act: 'showCall', label: 'Show call' }, actions, ...picOf(app, c.number),
    });
  }
  /** THE CALLER'S PICTURE (Josh, 25 Oct 2026): a saved contact's picture, framed as its owner framed it, shows in place
   *  of the call icon (the capsule, a missed call, Recents); a contact without one, or a number not saved, keeps the
   *  icon. { pic, frame } */
  const picOf = (app, number) => { const c = app.contacts.find(number) || {}; return { pic: c.picture || '', frame: c.pictureFrame || null }; };
  /** full screen for this call; a put-away phone comes up to show it (and drops again when the call is over) */
  function showFull(app) {
    const c = app.state.call;
    if (!c) return;
    c.full = true; capsule(app);
    if (!app.visible) app.attention(true);
  }
  /** the call screen steps aside (B, or its Hide button): the call goes on in the capsule */
  function hideCall(app) {
    const c = app.state.call;
    if (!c || c.state === 'ended') return;
    c.full = false; capsule(app);
  }
  /** a call is over: the full screen shows the reason for a moment; a capsule becomes a missed-call note (or just goes) */
  function finish(app, reason) {
    const s = app.state, c = s.call;
    if (!c) return;
    const ringing = c.state === 'incoming';
    c.state = 'ended'; c.reason = reason || 'Call ended';
    callSound(app);
    stopTick(); clearTimeout(clearer);
    if (!c.full) {
      if (ringing && reason !== 'Declined') app.notify({ key: CALL_KEY, kind: 'error', title: app.contacts.name(c.number), text: 'Missed call', args: { tab: 'recents' }, ...picOf(app, c.number) });
      else app.dismiss(CALL_KEY);
      s.call = null;
    } else clearer = setTimeout(() => { s.call = null; app.attention(false); app.render(); }, 1600);
    loadRecents(app);
  }
  /**
   * AN INVITE IS A YES / NO NOTIFICATION THAT STAYS UNTIL IT IS ANSWERED (Josh, 8-9 Oct 2026): whip_core's yes/no
   * questions sent to the phone (the Director's job invite, server/calls.lua's 'phone' ask channel) show as one
   * generic capsule — a '?' for its icon, a cross and a tick for its buttons (the question's own words as their
   * labels), shown through Do Not Disturb, since an unseen one would only run out — and nothing else: not a call's
   * look, no call screen (it could end up behind a real call's screen — audit 11, CLI-3). The answer goes back to
   * whip_core (inviteAnswer). One at a time: whip_core asks one question at a time. 'inviteGone' (whip_core gave up:
   * its timeout, the run's end) takes it down.
   */
  const INVITE_KEY = 'invite';
  function inviteCapsule(app) {
    const v = app.state.invite;
    if (!v) { app.dismiss(INVITE_KEY); return; }
    app.notify({
      key: INVITE_KEY, kind: 'command', force: true, persist: true, icon: I.ask, title: v.title, text: v.message,
      actions: [{ act: 'inviteNo', label: v.no, tone: 'reject', icon: I.x }, { act: 'inviteYes', label: v.yes, tone: 'accept', icon: I.check }],
    });
  }
  function inviteDone(app) {
    if (!app.state.invite) return;
    app.state.invite = null;
    app.dismiss(INVITE_KEY);
  }
  async function inviteAnswer(app, yes) {
    const v = app.state.invite;
    if (!v) return;
    inviteDone(app);
    try { await app.request('inviteAnswer', { token: v.token, yes }); }
    catch (e) { app.toast((e && e.reason) || 'That invite is gone'); }
  }
  async function loadRecents(app) {
    try { const r = await app.request('recents'); app.state.recents = Array.isArray(r) ? r : []; } catch (e) { /* framework not answering yet: empty list */ }
    app.state.loaded = true;
  }
  async function dial(app, number) {
    const s = app.state, n = digits(number);
    if (!n) return;
    if (s.call) { app.toast('You are already on a call'); return; }
    clearTimeout(clearer);
    const call = { id: null, number: n, state: 'dialing', since: 0, muted: false, speaker: false, pad: false, dtmf: '', full: true };
    s.call = call;
    app.render();
    try {
      const r = await app.request('dial', { number: n });
      // Hung up while the server answered (End before the id came back): the call it made is ended now. It rang on and,
      // answered, opened a line to a caller with no call screen (audit 20, PHN-1).
      if (s.call !== call || call.state === 'ended') {
        if (r && r.callId != null) app.request('end', { callId: r.callId }).catch(() => {});
        return;
      }
      if (r && r.callId != null) call.id = r.callId;
      if (r && r.state) applyState(app, { callId: call.id, state: r.state, startedAt: r.startedAt, reason: r.reason });
    } catch (e) {
      const reason = (e && e.reason) || 'Call failed';
      // No answer is not "no call": the server may have made one. Its own call, by no id (server/calls.lua mine).
      if (NO_ANSWER[reason]) app.request('end', {}).catch(() => {});
      if (s.call === call) finish(app, NO_ANSWER[reason] ? 'Call failed' : reason);
    }
  }
  // What a request answers when nothing came back (core/bridge.js, core/os.js), not a refusal of the dial
  const NO_ANSWER = { 'no response': true, unavailable: true, refused: true, timeout: true };
  function applyState(app, d = {}) {
    const c = app.state.call;
    if (!c) return;
    if (c.id == null && d.callId != null && c.state === 'dialing') c.id = d.callId;   // the push beat dial()'s answer
    if (d.callId != null && c.id != null && String(d.callId) !== String(c.id)) return;
    // 'ringing' is the caller's news (it rings at the other end). The one being called hears it too, and an incoming
    // call turned into "Ringing…" could no longer be answered (Josh, 12 Oct 2026).
    if (d.state === 'ringing') { if (c.state === 'dialing') c.state = 'ringing'; }
    // Timed from THIS PC's clock, from the moment the call is up here. The server's startedAt is its own clock: a PC a
    // few seconds behind the server's showed 0:00 that long while the call talked, then counted from 0 (Josh, 7 Nov
    // 2026). Told twice (the push and the answer), the first one starts it.
    else if (d.state === 'active') { if (c.state !== 'active') c.since = Date.now(); c.state = 'active'; startTick(app); }
    else if (ENDED[d.state] || d.state === 'ended') { finish(app, d.reason || ENDED[d.state]); return; }
    capsule(app);   // a hidden call's capsule follows it
  }

  // ---------------------------------------------------------------- blocking
  /** a number this phone may block: not the SIM's own, and not a lore character's (the server says which: noBlock, on
   *  a contact or a Recents call) */
  function canBlock(app, number) {
    const n = digits(number), c = app.contacts.find(n);
    return !!n && n !== digits(app.session.number) && !(c && c.noBlock) && !app.state.recents.some((r) => digits(r.number) === n && r.noBlock);
  }
  /** Block asks first (what it does, and that they are not told); Unblock does not */
  function blockSheet(app) {
    const s = app.state, n = s.sheet && s.sheet.number;
    if (!n || n !== s.contact) return '';
    return K.sheet({ title: `Block ${app.contacts.name(n)}?`, close: 'closeSheet', body:
      '<p class="ct-p">Their texts and calls stop reaching this SIM. They are not told: to them, texts send and calls ring out.</p>' +
      `<div class="ct-btns">${K.button({ label: 'Cancel', act: 'closeSheet', kind: 'gray' })}${K.button({ label: s.sheet.busy ? '…' : 'Block', act: 'block', kind: 'red', d: { number: n } })}</div>` });
  }
  async function setBlocked(app, number, on) {
    const s = app.state;
    if (s.blocking) return;
    s.blocking = true;
    if (s.sheet) s.sheet.busy = true;
    try {
      await (on ? app.blocks.add(number) : app.blocks.remove(number));
      app.toast(on ? 'Number blocked' : 'Number unblocked');
      s.sheet = null;
      if (on) loadRecents(app);   // (a call of theirs ringing just now leaves Recents)
    } catch (e) { app.toast(e.reason || 'Could not change that'); if (s.sheet) s.sheet.busy = false; }
    s.blocking = false;
  }

  // ---------------------------------------------------------------- screens
  function recentsList(app) {
    const s = app.state;
    if (!s.recents.length) return K.empty({ icon: I.recent, title: s.loaded ? 'No recent calls' : 'Loading…', text: s.loaded ? 'Calls you make and get show up here.' : '' });
    return `<div class="list" style="--inset:58px">${s.recents.map((r) => {
      const name = app.contacts.name(r.number), miss = r.dir === 'missed';
      const sub = miss ? 'Missed' : (r.dir === 'out' ? 'Outgoing' : 'Incoming') + (r.duration ? ' · ' + K.fmtDuration(r.duration) : '');
      // A contact's picture in place of the call's icon (the line under the name says which way it went).
      const p = picOf(app, r.number);
      const row = K.row({ icon: p.pic ? '' : miss ? I.missed : r.dir === 'out' ? I.out : I.call, av: p.pic ? K.avatar({ name, size: 30, pic: p.pic, frame: p.frame }) : '',
        label: `<span${miss ? ' style="color:var(--red)"' : ''}>${K.esc(name)}</span>`,
        sub: K.esc(sub), value: K.esc(K.fmtWhen(r.time)), act: 'dial', d: { number: r.number }, chev: false, hint: 'Call', html: true });
      // The row calls back; its info button opens the number's page (Add, Message, Block).
      return `<div class="rc">${row}<button class="rc-i" data-act="contact" ${K.data({ number: digits(r.number) })} data-hint="Info">${I.info}</button></div>`;
    }).join('')}</div>`;
  }
  function contactsList(app) {
    const s = app.state, q = s.query.trim().toLowerCase();
    const list = app.contacts.sorted.filter((c) => !q || String(c.name).toLowerCase().includes(q) || digits(c.number).includes(digits(q) || '\u0000'));
    const body = list.length ? K.list(list.map((c) => K.row({ av: K.avatar({ name: c.name, size: 36, pic: c.picture, frame: c.pictureFrame }), label: c.name, sub: K.fmtNumber(c.number), act: 'contact', d: { number: c.number }, hint: 'Open' })), { inset: 62 })
      : K.empty({ icon: I.person, title: app.contacts.loaded ? (q ? 'No matches' : 'No contacts') : 'Loading…', text: q || !app.contacts.loaded ? '' : 'Add people you call and text.', action: q ? null : { label: 'New contact', act: 'newContact' } });
    return K.search({ bind: 'query', value: s.query, placeholder: 'Search contacts' }) + body;
  }
  function keypad(app) {
    const s = app.state;
    return `<div class="keypad"><input class="kp-num" data-bind="num" data-enter="dialPad" value="${K.esc(K.fmtNumber(s.num))}" placeholder=" " inputmode="tel" autocomplete="off" spellcheck="false">` +
      (s.num && app.contacts.find(s.num) ? `<div class="kp-who">${K.esc(app.contacts.name(s.num))}</div>` : '<div class="kp-who">&#160;</div>') +
      `<div class="kp-grid">${KEYS.map(([k, l]) => `<button class="kp-key" data-act="key" data-key="${k}"><b>${k}</b><span>${l || '&#160;'}</span></button>`).join('')}</div>` +
      `<div class="kp-row"><span></span><button class="kp-call" data-act="dialPad" data-hint="Call">${GLYPH}</button><button class="kp-del" data-act="del" data-hint="Delete">${s.num ? I.del : ''}</button></div></div>`;
  }
  function contactScreen(app, number, inSplit) {
    const c = app.contacts.find(number), name = c ? c.name : K.fmtNumber(number), hasMsg = app.modules().some((m) => m.id === 'messages');
    const blocked = app.blocks.has(number);
    const act = (icon, label, a, d = {}) => `<button class="ct-act" data-act="${a}" ${K.data(d)} data-hint="${K.esc(label)}"><i>${icon}</i>${K.esc(label)}</button>`;
    // Block (or Unblock: one blocked before it became a lore character's can still come off), then Delete contact
    const lower = [
      ...(blocked || canBlock(app, number) ? [K.row({ label: blocked ? 'Unblock this caller' : 'Block this caller', act: blocked ? 'unblock' : 'askBlock', d: { number },
        chev: false, tone: blocked ? '' : 'danger', hint: blocked ? 'Unblock' : 'Block' })] : []),
      ...(c ? [K.row({ label: 'Delete contact', act: 'deleteContact', d: { id: c.id }, chev: false, tone: 'danger', hint: 'Delete' })] : []),
    ];
    const body = `<div class="ct-head">${K.avatar({ name: c ? c.name : '', size: 92, pic: c && c.picture, frame: c && c.pictureFrame })}<b>${K.esc(name)}</b>${c ? `<span>${K.esc(K.fmtNumber(c.number))}</span>` : ''}</div>` +
      `<div class="ct-acts">${act(GLYPH, 'Call', 'dial', { number })}${hasMsg ? act(I.msg, 'Message', 'message', { number }) : ''}${act(c ? I.edit : I.plus, c ? 'Edit' : 'Add', c ? 'editContact' : 'newContact', { number })}</div>` +
      K.list([K.row({ label: 'mobile', sub: K.fmtNumber(number), act: 'dial', d: { number }, chev: false, hint: 'Call' })], { inset: 14 }) +
      (blocked ? '<div class="list-f">You blocked this number: its texts and calls don\'t reach this SIM.</div>' : '') +
      (lower.length ? K.list(lower, { inset: 14 }) : '');
    if (inSplit) return K.scroll(body);
    return K.screen('ct-' + number, K.nav({ back: app.state.tab === 'recents' ? 'Recents' : 'Contacts', act: 'closeContact' }) + K.scroll(body) + blockSheet(app), { slide: true });
  }
  function editScreen(app) {
    const e = app.state.edit;
    const nav = K.nav({ back: 'Cancel', act: 'cancelEdit', title: e.id != null ? 'Edit contact' : 'New contact', right: `<button class="nb-t" data-act="saveContact" data-hint="Save">Save</button>` });
    const body = K.list([K.field({ label: 'Name', bind: 'editName', value: e.name, placeholder: 'Name' }), K.field({ label: 'Number', bind: 'editNumber', value: e.number, placeholder: '000-000-0000', mode: 'tel', enter: 'saveContact' })], { inset: 14 }) +
      (e.error ? `<div class="list-f" style="margin-top:-10px;color:var(--red)">${K.esc(e.error)}</div>` : '');
    return K.screen('edit', nav + K.scroll(body), { slide: true });
  }

  WhipPhone.module({
    id: 'phone', name: 'Phone', version: '1.0.0', order: 10, dock: true, icon: GLYPH,
    css: `
/* ---------- phone: keypad ---------- */
.keypad{display:flex;flex-direction:column;align-items:center;flex:1;justify-content:center;gap:8px}
.kp-num{font-size:34px;font-weight:500;height:46px;letter-spacing:1px;font-variant-numeric:tabular-nums;text-align:center;width:100%;caret-color:var(--accent)}
.kp-who{font-size:14px;color:var(--accent);height:18px;margin-top:-4px}
.kp-grid{display:grid;grid-template-columns:repeat(3,72px);gap:12px 26px}
.kp-key{width:72px;height:72px;border-radius:50%;background:var(--fill);display:flex;flex-direction:column;align-items:center;justify-content:center}
.kp-key b{font-size:30px;font-weight:500;line-height:1}
.kp-key span{font-size:9.5px;font-weight:700;letter-spacing:2px;color:var(--text2)}
.kp-key:active{background:var(--fill2)}
.kp-call{width:72px;height:72px;border-radius:50%;background:var(--green);color:#fff;display:grid;place-items:center;margin-top:6px}
.kp-call svg{width:30px;height:30px}
.kp-row{display:grid;grid-template-columns:repeat(3,72px);gap:0 26px;align-items:center;justify-items:center}
.kp-del{width:44px;height:44px;color:var(--text2);display:grid;place-items:center}
.kp-del svg{width:28px;height:22px}
.phone .keypad{gap:6px;justify-content:flex-start;padding-top:6px}
.phone .kp-num{font-size:30px;height:40px}
.phone .kp-grid,.phone .kp-row{grid-template-columns:repeat(3,64px);gap:9px 24px}
.phone .kp-key,.phone .kp-call{width:64px;height:64px}
.phone .kp-key b{font-size:27px}
.tablet .kp-grid,.tablet .kp-row{grid-template-columns:repeat(3,80px);gap:14px 34px}
.tablet .kp-key,.tablet .kp-call{width:80px;height:80px}
.tablet .kp-row{gap:0 34px}
/* ---------- phone: contact ---------- */
.ct-head{display:flex;flex-direction:column;align-items:center;gap:6px;padding:10px 20px 18px;text-align:center}
.ct-head b{font-size:24px;font-weight:700;margin-top:6px}
.ct-head span{font-size:15px;color:var(--text2)}
.ct-acts{display:flex;justify-content:center;gap:12px;padding:0 16px 22px}
.ct-act{flex:1;max-width:110px;display:flex;flex-direction:column;align-items:center;gap:6px;padding:10px 6px;border-radius:12px;background:var(--bg2);font-size:12.5px;font-weight:600;color:var(--accent)}
.ct-act i{width:24px;height:24px}
.ct-act i svg{width:100%;height:100%}
.nb-t{color:var(--accent);font-size:16px;font-weight:700;padding:6px 6px}
.ct-p{font-size:14.5px;color:var(--text2);line-height:1.4;margin:0 2px 16px}
.ct-btns{display:flex;gap:10px}
.ct-btns .btn{flex:1}
/* ---------- phone: a Recents call and its info button ---------- */
.rc{display:flex;align-items:center;position:relative}
.rc>.row{flex:1;min-width:0;padding-right:4px}
.rc+.rc::before{content:'';position:absolute;top:0;left:var(--inset,56px);right:0;border-top:.5px solid var(--sep);z-index:1}
.rc-i{width:42px;align-self:stretch;display:grid;place-items:center;color:var(--accent);flex:none}
.rc-i svg{width:22px;height:22px}
.m-phone .side .seg{margin-top:4px}
.ph-main{flex:1;display:flex;flex-direction:column;justify-content:center;min-height:0}
/* ---------- phone: call screen ---------- */
.call{position:absolute;inset:0;background:linear-gradient(180deg,#2c3a4f,#121722);color:#fff;display:flex;flex-direction:column;align-items:center;
  padding-top:calc(var(--sb-h) + 30px);animation:fade .3s both}
.call .av{box-shadow:inset 0 0 0 1px rgba(255,255,255,.12)}
.call .c-name{font-size:30px;font-weight:500;margin-top:14px;text-align:center;padding:0 20px}
.call .c-num{font-size:15px;opacity:.6;margin-top:2px}
.call .c-state{font-size:16px;opacity:.75;margin-top:4px;font-variant-numeric:tabular-nums}
.call .c-dtmf{font-size:22px;letter-spacing:2px;min-height:28px;margin-top:10px;font-variant-numeric:tabular-nums}
.call .c-grid{display:grid;grid-template-columns:repeat(3,72px);gap:22px 30px;margin-top:auto}
.call .c-btn{display:flex;flex-direction:column;align-items:center;gap:6px;font-size:12px}
.call .c-btn i{width:72px;height:72px;border-radius:50%;background:rgba(255,255,255,.16);display:grid;place-items:center}
.call .c-btn.on i{background:#fff;color:rgb(10,12,18)}
.call .c-btn svg{width:28px;height:28px}
.call .c-end{width:72px;height:72px;border-radius:50%;background:#f87171;display:grid;place-items:center;margin:26px 0 calc(var(--bot) + 30px)}
.call .c-end svg{width:32px;height:32px;transform:rotate(135deg)}
.call .c-inc{display:flex;gap:90px;margin:auto 0 calc(var(--bot) + 40px)}
.call .c-inc button{display:flex;flex-direction:column;align-items:center;gap:8px;font-size:13px;font-weight:600}
.call .c-inc i{width:72px;height:72px;border-radius:50%;display:grid;place-items:center}
.call .c-inc i svg{width:32px;height:32px}
.call .c-ans i{background:#4ade80}
.call .c-dec i{background:#f87171}
.call .c-dec i svg{transform:rotate(135deg)}
.call .c-pad{display:grid;grid-template-columns:repeat(3,64px);gap:10px 24px;margin-top:auto}
.call .c-pad .kp-key{width:64px;height:64px;background:rgba(255,255,255,.16)}
.call .c-hide{position:absolute;left:16px;top:calc(var(--sb-h) + 4px);width:40px;height:40px;border-radius:50%;background:rgba(255,255,255,.12);
  display:grid;place-items:center;color:#fff}
.call .c-hide svg{width:18px;height:18px;transform:rotate(90deg)}
.call.ended .c-state{color:#f87171;opacity:1}
.tablet .call .c-grid{grid-template-columns:repeat(3,80px)}
.phone .call{padding-top:calc(var(--sb-h) + 12px)}
.phone .call .c-name{font-size:27px;margin-top:10px}
.phone .call .c-grid{gap:16px 30px}
.phone .call .c-btn i{width:66px;height:66px}
.phone .call .c-end{width:66px;height:66px;margin:16px 0 calc(var(--bot) + 12px)}
.console .call .c-end,.console .call .c-inc{margin-bottom:62px}
`,
    // the call capsule's Decline and End handsets turn down like the call screen's (the capsule is outside the app: not scoped)
    globalCss: '.banner[data-app="phone"] .b-act:is([data-a="decline"],[data-a="hangup"]) svg{transform:rotate(135deg)}',
    // seen: missed calls before this are read. sheet: Block's question ({ number, busy }); blocking: a block or unblock on its way
    state: () => ({ tab: 'recents', num: '', recents: [], loaded: false, query: '', contact: null, edit: null, call: null, invite: null, seen: 0, sheet: null, blocking: false }),

    session(app) { app.state.loaded = false; app.state.recents = []; app.state.sheet = null; loadRecents(app); },   // the last SIM's go (audit 16, CLI-1)
    open(app, args = {}) {
      const s = app.state;
      if (!s.loaded) loadRecents(app);
      app.contacts.load();
      if (args.number && args.call) dial(app, args.number);
      else if (args.number) { s.contact = digits(args.number); s.edit = null; }
      else if (args.keypad) { s.tab = 'keypad'; s.contact = null; }
      else if (args.tab) { s.tab = args.tab; s.contact = null; }
      if (s.tab === 'recents') s.seen = Date.now();
    },
    route: (app) => (app.state.edit ? 'edit' : app.state.contact ? 'contact' : app.state.tab),
    backLabel(app) { const c = app.state.call; return c && c.full && c.state !== 'ended' ? 'Hide call' : null; },
    back(app) {
      const s = app.state;
      if (s.call && s.call.full && s.call.state !== 'ended') { hideCall(app); return true; }   // the call goes on in the capsule
      if (s.sheet) { s.sheet = null; return true; }
      if (s.edit) { s.edit = null; return true; }
      if (s.contact) { s.contact = null; return true; }
      return false;
    },
    tab(app, dir) {
      const s = app.state;
      if (s.edit || s.contact) return false;
      const ids = TABS.map((t) => t[0]);
      s.tab = ids[(ids.indexOf(s.tab) + dir + ids.length) % ids.length];
      if (s.tab === 'recents') s.seen = Date.now();
      return true;
    },
    x(app) {
      const s = app.state;
      if (s.call && s.call.state === 'incoming') return { label: 'Decline', run: () => this.actions.decline(app) };
      if (s.call && s.call.state !== 'ended') return { label: s.call.muted ? 'Unmute' : 'Mute', run: () => toggle(app, 'muted', 'mute') };
      if (s.invite) return { label: s.invite.no, run: () => inviteAnswer(app, false) };
      if (s.contact) return { label: 'Call', run: () => dial(app, s.contact) };
      if (s.tab === 'keypad' && s.num) return { label: 'Call', run: () => dial(app, s.num) };
      return null;
    },
    badge: (app) => missed(app.state),
    info(app) { const n = missed(app.state); return n ? `${n} missed call${n > 1 ? 's' : ''}` : app.state.call ? 'On a call' : 'No missed calls'; },

    render(app, v) {
      const s = app.state;
      if (s.edit) return editScreen(app);
      if (v.size === 'tablet') {
        const side = K.title('Phone') + K.seg([['recents', 'Recents'], ['contacts', 'Contacts']], s.tab === 'contacts' ? 'contacts' : 'recents', 'tabSeg') +
          K.scroll(s.tab === 'contacts' ? contactsList(app) : recentsList(app));
        const main = s.contact ? contactScreen(app, s.contact, true) : `<div class="ph-main">${keypad(app)}</div>`;
        return K.screen('tab', `${K.nav({ right: K.navBtn(I.plus, 'newContact', {}, 'New contact') })}${K.split(side, main, s.contact ? 'c' + s.contact : 'pad')}${blockSheet(app)}`);
      }
      if (s.contact) return contactScreen(app, s.contact, false);
      const title = { recents: 'Recents', contacts: 'Contacts', keypad: '' }[s.tab];
      const body = s.tab === 'keypad' ? keypad(app) : K.scroll(s.tab === 'contacts' ? contactsList(app) : recentsList(app));
      const nav = s.tab === 'contacts' ? K.nav({ right: K.navBtn(I.plus, 'newContact', {}, 'New contact') }) : '';
      return K.screen('t-' + s.tab, `${nav}${title ? K.title(title) : ''}${body}${K.tabs(TABS.map(([v1, l, ic]) => [v1, l, ic, v1 === 'recents' ? missed(s) : 0]), s.tab, 'setTab')}`);
    },

    /** the phone was put away / taken out, or an app opened / closed: move a ringing call between capsule and full screen */
    presence(app, p, prev) {
      const c = app.state.call;
      if (!c || c.state === 'ended') return;
      if (!p.visible) c.full = false;                                   // put away: the capsule
      else if (!prev.visible) c.full = true;                            // taken out: the call screen
      else if (c.state === 'incoming' && homeInFront(p)) c.full = true; // a call ringing in takes the home / lock screen
      capsule(app);
    },

    /** the full call screen sits over everything (and over other apps) */
    overlay(app, v) {
      const c = app.state.call;
      if (!c || !c.full) return '';
      const name = app.contacts.name(c.number), saved = app.contacts.find(c.number), known = !!saved;
      // Hide: the call screen steps aside and the call goes on in the capsule (B does the same)
      const hide = c.state === 'ended' ? '' : `<button class="c-hide" data-act="hide" data-hint="Hide call">${I.chev}</button>`;
      let controls;
      if (c.state === 'incoming') {
        controls = `<div class="c-inc"><button class="c-dec" data-act="decline" data-hint="Decline"><i>${GLYPH}</i>Decline</button><button class="c-ans" data-act="answer" data-hint="Answer"><i>${GLYPH}</i>Answer</button></div>`;
      } else if (c.state === 'ended') {
        controls = '<div style="margin-top:auto"></div>';
      } else {
        const btn = (k, icon, label) => `<button class="c-btn${c[k] ? ' on' : ''}" data-act="${k}" data-hint="${label}"><i>${icon}</i>${label}</button>`;
        const pad = c.pad ? `<div class="c-pad">${KEYS.map(([k]) => `<button class="kp-key" data-act="dtmf" data-key="${k}"><b>${k}</b></button>`).join('')}</div>` : '';
        controls = (pad || `<div class="c-grid">${btn('muted', I.mic, 'Mute')}${btn('pad', I.keypad, 'Keypad')}${btn('speaker', I.speaker, 'Speaker')}</div>`) +
          `<button class="c-end" data-act="hangup" data-hint="End call">${GLYPH}</button>`;
      }
      return `<div class="call${c.state === 'ended' ? ' ended' : ''}">${hide}${K.avatar({ name: known ? name : '', size: v.size === 'phone' ? 84 : 96, pic: saved && saved.picture, frame: saved && saved.pictureFrame })}<div class="c-name">${K.esc(name)}</div>` +
        `${known ? `<div class="c-num">${K.esc(K.fmtNumber(c.number))}</div>` : ''}<div class="c-state">${K.esc(stateText(c))}</div>${c.pad ? `<div class="c-dtmf">${K.esc(c.dtmf)}</div>` : ''}${controls}</div>`;
    },

    actions: {
      setTab(app, d) { app.state.tab = d.tab; app.state.contact = null; if (d.tab === 'recents') app.state.seen = Date.now(); },
      tabSeg(app, d) { app.state.tab = d.v; app.state.contact = null; if (d.v === 'recents') app.state.seen = Date.now(); },
      key(app, d) { const s = app.state; if (s.num.length < 15) s.num += d.key; },
      del(app) { app.state.num = app.state.num.slice(0, -1); },
      dialPad(app) { dial(app, app.state.num); },
      dial(app, d) { dial(app, d.number); },
      contact(app, d) { app.state.contact = digits(d.number); app.state.sheet = null; },
      closeContact(app) { app.state.contact = null; app.state.sheet = null; },
      askBlock(app, d) { if (canBlock(app, d.number)) app.state.sheet = { number: digits(d.number), busy: false }; },
      closeSheet(app) { app.state.sheet = null; },
      block(app, d) { return setBlocked(app, d.number, true); },
      unblock(app, d) { return setBlocked(app, d.number, false); },
      message(app, d) { app.open('messages', { number: d.number }); },
      newContact(app, d) { app.state.edit = { id: null, name: '', number: d.number ? K.fmtNumber(d.number) : app.state.tab === 'keypad' ? K.fmtNumber(app.state.num) : '' }; },
      editContact(app, d) { const c = app.contacts.find(d.number); if (c) app.state.edit = { id: c.id, name: c.name, number: K.fmtNumber(c.number) }; },
      cancelEdit(app) { app.state.edit = null; },
      async saveContact(app) {
        const e = app.state.edit;
        if (!e) return;
        const name = e.name.trim(), number = digits(e.number);
        if (!name) { e.error = 'Give the contact a name.'; return; }
        if (number.length < 3) { e.error = 'Enter a phone number.'; return; }
        try { await app.contacts.save({ id: e.id, name, number }); app.state.edit = null; app.state.contact = number; }
        catch (err) { e.error = err.reason || 'Could not save the contact.'; }
      },
      async deleteContact(app, d) {
        const c = app.contacts.list.find((x) => String(x.id) === String(d.id));   // keep the framework's id type
        try { await app.contacts.remove(c ? c.id : d.id); app.state.contact = null; app.toast('Contact deleted'); }
        catch (err) { app.toast(err.reason || 'Could not delete the contact'); }
      },
      showCall(app) { const c = app.state.call; if (c && c.state !== 'ended') showFull(app); },
      hide(app) { hideCall(app); },
      inviteYes(app) { return inviteAnswer(app, true); },
      inviteNo(app) { return inviteAnswer(app, false); },
      async answer(app, d, el) {
        const c = app.state.call;
        if (!c || c.state !== 'incoming') return;
        // From the capsule it stays the capsule, now the call's (Josh, 12 Oct 2026); from the call screen, the screen;
        // from the answer key (on.callKey, no button), wherever the call is now.
        const inCapsule = el ? !!el.closest('.banner') : !c.full;
        c.state = 'connecting';
        if (inCapsule) capsule(app); else showFull(app);
        try { const r = await app.request('answer', { callId: c.id }); applyState(app, { callId: c.id, state: (r && r.state) || 'active', startedAt: r && r.startedAt }); }
        catch (e) { finish(app, e.reason || 'Call failed'); }
      },
      decline(app) {
        const c = app.state.call;
        if (!c || c.state === 'ended') return;
        app.request('decline', { callId: c.id }).catch(() => {});
        finish(app, 'Declined');
      },
      hangup(app) {
        const c = app.state.call;
        if (!c) return;
        app.request('end', { callId: c.id }).catch(() => {});
        finish(app, 'Call ended');
      },
      muted(app) { toggle(app, 'muted', 'mute'); },
      speaker(app) { toggle(app, 'speaker', 'speaker'); },
      pad(app) { const c = app.state.call; if (c) c.pad = !c.pad; },
      dtmf(app, d) { const c = app.state.call; if (!c) return; c.dtmf = (c.dtmf + d.key).slice(-16); app.request('dtmf', { callId: c.id, key: d.key }).catch(() => {}); },
    },
    bind: {
      num(app, v) { app.state.num = digits(v).slice(0, 15); },
      query(app, v) { app.state.query = v; },
      editName(app, v) { if (app.state.edit) { app.state.edit.name = v.slice(0, 40); app.state.edit.error = ''; } },
      editNumber(app, v) { if (app.state.edit) { app.state.edit.number = v.slice(0, 20); app.state.edit.error = ''; } },
    },
    on: {
      /** { callId, number } someone is calling */
      incoming(app, d = {}) {
        const s = app.state;
        if (s.call && s.call.state !== 'ended') { app.notify({ title: 'Call waiting', text: app.contacts.name(d.number), kind: 'call' }); return; }
        clearTimeout(clearer);
        if (s.call) app.attention(false);                               // the last call's screen was still up: let it go
        s.call = { id: d.callId, number: digits(d.number), state: 'incoming', since: 0, muted: false, speaker: false, pad: false, dtmf: '', full: homeInFront(app.presence) };
        capsule(app);
      },
      /** { callId, state: ringing | active | ended | declined | busy | unavailable | missed, startedAt?, reason? } */
      state(app, d = {}) { applyState(app, d); },
      /** { key: 'answer' | 'decline' } the player's key for it (client/main.lua: "Phone: answer a call" / "Phone: decline
       *  a call" in GTA's key bindings, Josh 7 Nov 2026): what the buttons do, to a call ringing in only */
      callKey(app, d = {}) {
        const c = app.state.call;
        if (!c || c.state !== 'incoming') return;
        if (d.key === 'answer') return this.actions.answer(app, {}, null);
        if (d.key === 'decline') this.actions.decline(app);
      },
      /** the framework replaced the recents list */
      recents(app, d) { if (Array.isArray(d)) { app.state.recents = d; app.state.loaded = true; } },
      /** { token, title, message, yes, no }: whip_core asks a yes/no on the phone (a job invite) */
      invite(app, d = {}) {
        if (d.token == null) return;
        const s = app.state;
        if (s.invite) inviteDone(app);                                  // whip_core asks one at a time: the last is over
        s.invite = { token: d.token, title: String(d.title || 'Invite'), message: String(d.message || ''),
          yes: String(d.yes || 'Accept'), no: String(d.no || 'Decline') };
        inviteCapsule(app);
      },
      /** { token }: whip_core gave up on that question (its timeout, the run's end) */
      inviteGone(app, d = {}) {
        const v = app.state.invite;
        if (v && String(v.token) === String(d.token)) inviteDone(app);
      },
    },
  });
})();
