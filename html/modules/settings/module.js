// Settings: wallpaper, sounds, Do Not Disturb, the SIM, installed apps and About. The values live in the OS
// (app.settings) and the OS hands them to the framework to save (whip_phone:settings:save); they come back with the
// session. Delete this folder and the phone keeps its defaults (or whatever the framework sends).
// NO LAYOUT CHOICE (Josh, 12 Oct 2026): it follows the input on its own. Picking Mouse & keyboard with a controller in
// hand left a pad player unable to work the phone at all.
// SOUNDS (Josh, 12 Oct 2026): the ringtone, the message tone, the notification sound and the volume, the SIM's (they go
// where it goes). Picking one plays it.
// CALL VOLUME (Josh, 25 Oct 2026): how loud the other side of a call is. Not the SIM's: the voice system's "Phone call
// volume" on this PC (the pause menu's Server Settings), read and changed through app.callVolume, so the two are one.
// MY CARD (Josh, 25 Oct 2026): the profile at the top opens the number's contact card: the name this phone shows as
// yours, and a profile picture (a Fivemanage link) framed by hand (dragged, zoomed: kit.frameStyle). The people who
// have the number saved see the picture (server/card.lua). Only the number's owner changes it.
// BLOCKED NUMBERS (14 Nov 2026): the SIM's block list (app.blocks, whip_phone/server/blocks.lua), each number unblocked
// from here. Numbers are blocked from their conversation in Messages, or their page in Phone.
(() => {
  const { kit: K, icons: I } = window.WhipPhone;
  // The sounds' pick pages: which setting each picks, from which list, and its title.
  const PICKS = {
    ringtone: { key: 'ringtone', list: 'ringtone', title: 'Ringtone' },
    messageTone: { key: 'messageTone', list: 'alert', title: 'Message Tone' },
    notifyTone: { key: 'notifyTone', list: 'alert', title: 'Notifications' },
  };
  const labelOf = (S, list, id) => (S.sounds(list).find((x) => x.id === id) || {}).label || '';
  const CALL_STEPS = [['25', '25%'], ['50', '50%'], ['75', '75%'], ['100', '100%']];

  // ---- my card
  const frame0 = () => ({ x: 50, y: 50, z: 1 });
  const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
  const round = (n, k) => Math.round(n * k) / k;
  /** the name this phone shows as yours: the card's, else the number's owner's */
  const myName = (sess) => (sess.card && sess.card.name) || sess.name || '';
  /** the card being changed, from the one kept (the session's) */
  function openCard(app) {
    const c = app.session.card || {};
    app.state.card = { name: c.name || '', picture: c.picture || '', frame: c.frame ? { ...c.frame } : frame0(), why: '', busy: false };
  }
  function cardPage(app) {
    const sess = app.session, d = app.state.card;
    if (!sess.number) return K.empty({ title: 'No SIM', text: 'Your card is your number\'s: put your SIM in the phone.' });
    if (!sess.mine) return K.empty({ title: 'Not your number', text: 'Only this number\'s owner can change its card.' });
    if (!d) return '';
    const pic = K.picUrl(d.picture);
    const face = `<div class="cd-face${pic ? '' : ' none'}"${pic ? ' data-pan="cardPan"' : ''}>${K.avatar({ name: d.name || sess.name || '', size: 136, pic, frame: d.frame })}</div>`;
    // the zoom: a slider between a small and a big face (left / right on it with a controller). Its box is taller than
    // its 4px track: the focus engine skips anything 4px or less.
    const zoom = pic ? `<div class="cd-zoom">${I.person}<input type="range" min="1" max="3" step="0.01" value="${d.frame.z}" data-bind="cardZoom" aria-label="Zoom">${I.person}</div>` : '';
    return `<div class="cd-pv">${face}${zoom}</div>` +
      K.list([K.field({ label: 'Name', bind: 'cardName', value: d.name, placeholder: sess.name || 'Your name' }),
        K.field({ label: 'Picture', bind: 'cardPic', value: d.picture, placeholder: 'https://r2.fivemanage.com/…' })], { header: 'Your card', inset: 14 }) +
      `<div class="list-f">Upload a picture to Fivemanage and paste its link. Drag it to fit, and zoom with the slider. People who have your number saved see it.</div>` +
      (d.why ? `<div class="cd-why">${K.esc(d.why)}</div>` : '') +
      `<div class="cd-acts">${K.button({ label: d.busy ? 'Saving…' : 'Save', act: 'cardSave', hint: 'Save' })}` +
      `${d.picture ? K.button({ label: 'Remove picture', act: 'cardNoPic', kind: 'gray', hint: 'Remove' }) : ''}</div>`;
  }
  /** the call volume, for the Sounds page (null: no voice system offers it, and the row stays hidden) */
  async function loadCallVol(app) { app.state.callVol = await app.callVolume(); }
  const GLYPH ='<svg viewBox="0 0 512 512"><path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="32" d="M262.29 192.31a64 64 0 1 0 57.4 57.4a64.13 64.13 0 0 0-57.4-57.4M416.39 256a154 154 0 0 1-1.53 20.79l45.21 35.46a10.81 10.81 0 0 1 2.45 13.75l-42.77 74a10.81 10.81 0 0 1-13.14 4.59l-44.9-18.08a16.11 16.11 0 0 0-15.17 1.75A164.5 164.5 0 0 1 325 400.8a15.94 15.94 0 0 0-8.82 12.14l-6.73 47.89a11.08 11.08 0 0 1-10.68 9.17h-85.54a11.11 11.11 0 0 1-10.69-8.87l-6.72-47.82a16.07 16.07 0 0 0-9-12.22a155 155 0 0 1-21.46-12.57a16 16 0 0 0-15.11-1.71l-44.89 18.07a10.81 10.81 0 0 1-13.14-4.58l-42.77-74a10.8 10.8 0 0 1 2.45-13.75l38.21-30a16.05 16.05 0 0 0 6-14.08c-.36-4.17-.58-8.33-.58-12.5s.21-8.27.58-12.35a16 16 0 0 0-6.07-13.94l-38.19-30A10.81 10.81 0 0 1 49.48 186l42.77-74a10.81 10.81 0 0 1 13.14-4.59l44.9 18.08a16.11 16.11 0 0 0 15.17-1.75A164.5 164.5 0 0 1 187 111.2a15.94 15.94 0 0 0 8.82-12.14l6.73-47.89A11.08 11.08 0 0 1 213.23 42h85.54a11.11 11.11 0 0 1 10.69 8.87l6.72 47.82a16.07 16.07 0 0 0 9 12.22a155 155 0 0 1 21.46 12.57a16 16 0 0 0 15.11 1.71l44.89-18.07a10.81 10.81 0 0 1 13.14 4.58l42.77 74a10.8 10.8 0 0 1-2.45 13.75l-38.21 30a16.05 16.05 0 0 0-6.05 14.08c.33 4.14.55 8.3.55 12.47"/></svg>';
  const TITLES = { card: 'My card', wallpaper: 'Wallpaper', sounds: 'Sounds', sim: 'SIM', blocked: 'Blocked numbers', apps: 'Apps', about: 'About',
    ringtone: PICKS.ringtone.title, messageTone: PICKS.messageTone.title, notifyTone: PICKS.notifyTone.title };
  // What the SIM in this phone is doing (the session's `sim`, from the server: whip_phone/server/sim.lua).
  const SIM_TEXT = { ok: '', nosim: 'No SIM card', locked: 'SIM locked', blank: 'SIM not working' };
  const simLine = (sess) => (sess.number ? K.fmtNumber(sess.number) : (SIM_TEXT[sess.sim] || 'No SIM'));

  /** wallpaper swatch: the gradient as CSS (wallpaper.js works it out: what the folded phone shows of it) */
  const swatch = (pal) => `<i style="background:${pal.css}"></i>`;
  function page(app, p) {
    const S = app.settings, sess = app.session;
    if (p === 'card') return cardPage(app);
    if (p === 'wallpaper') {
      const cur = S.get('wallpaper');
      return `<div class="list-h">Choose a wallpaper</div><div class="wp-pick">${Object.entries(S.wallpapers()).map(([k, pal]) =>
        `<button class="${cur === k ? 'on' : ''}" data-act="set" data-key="wallpaper" data-v="${k}" data-hint="Apply">${swatch(pal)}${K.esc(pal.label)}</button>`).join('')}</div>`;
    }
    if (p === 'sounds') {
      const r = (k, icon) => K.row({ icon, label: PICKS[k].title, value: labelOf(S, PICKS[k].list, S.get(k)), act: 'page', d: { p: k }, hint: 'Choose' });
      const vol = String(S.get('soundVolume'));
      const cv = app.state.callVol;
      return K.list([r('ringtone', I.call), r('messageTone', I.msg), r('notifyTone', I.bell)], { header: 'Sounds and tones', inset: 58 }) +
        `<div class="list-h">Volume</div><div class="snd-vol">${K.seg([['25', '25%'], ['50', '50%'], ['75', '75%'], ['100', '100%']], vol, 'volume')}</div>` +
        `<div class="list-f">Kept on the SIM: in another phone it rings the same. Do Not Disturb silences notifications; calls still ring.</div>` +
        (cv == null ? '' :
          `<div class="list-h">Call volume · ${cv}%</div><div class="snd-vol">${K.seg(CALL_STEPS, String(cv), 'callVol')}</div>` +
          `<div class="list-f">How loud the other side of a call is. Kept on this PC: the same as Phone call volume in the pause menu's Server Settings.</div>`);
    }
    if (PICKS[p]) {
      const pick = PICKS[p], cur = S.get(pick.key);
      return K.list(S.sounds(pick.list).map((x) => K.row({ label: x.label, value: x.id === cur ? '✓' : '', act: 'pick', d: { key: pick.key, list: pick.list, v: x.id },
        chev: false, hint: 'Choose' })), { inset: 14, footer: 'Picking one plays it.' });
    }
    if (p === 'sim') {
      // THE SIM IN THIS PHONE, AND THE NUMBERS YOU OWN (Josh, 7 Oct 2026): a SIM works in any phone; a number
      // its owner locks works in none. The list is the character's own, whatever SIM is in.
      // ONLY ITS OWNER LOCKS A SIM (Josh, 12 Oct 2026): the one in this phone carries its lock here, live for its
      // owner and greyed out for anyone else holding it, a stolen phone's thief (the server refuses them anyway).
      const st = app.state.sim, cur = st && st.current;
      const lockRow = (number, locked, sub) => K.row({ icon: I.lock, label: K.fmtNumber(number), chev: false, toggle: !!locked, sub,
        act: 'lock', d: { number, locked: locked ? '0' : '1' }, hint: locked ? 'Unlock' : 'Lock' });
      const hereRow = !cur
        ? K.row({ icon: I.call, label: simLine(sess),
          sub: sess.sim === 'locked' ? 'Its owner locked this number: no service' : sess.number ? 'The SIM in this phone' : 'Put a SIM card in the phone (SIM tray)' })
        : st.currentMine
          ? lockRow(cur, st.currentLocked, st.currentLocked ? 'Locked: works in no phone' : 'Yours, in this phone')
          : K.row({ icon: I.lock, label: K.fmtNumber(cur), chev: false, toggle: !!st.currentLocked, tone: 'dim',
            sub: st.currentLocked ? 'Its owner locked this number: no service' : 'Only its owner can lock this SIM' });
      const here = K.list([hereRow], { header: 'In this phone', inset: 58 });
      if (!st) return here + K.empty({ title: 'Loading…' });
      const others = st.numbers.filter((n) => !(st.currentMine && n.number === cur));   // (yours in this phone is above)
      if (!others.length) {
        return st.currentMine ? here : here + K.list([], { header: 'Your numbers', footer: 'Numbers you own show here. A SIM card bought in a shop is a new number of yours.' });
      }
      const rows = others.map((n) => lockRow(n.number, n.locked, n.locked ? 'Locked: works in no phone' : 'Working'));
      return here + K.list(rows, { header: st.currentMine ? 'Your other numbers' : 'Your numbers', inset: 58,
        footer: 'Lost a SIM? Lock its number: the card stops working in any phone. Unlock it to use it again.' });
    }
    if (p === 'blocked') {
      // The SIM's list, the latest first. Tapping one unblocks it: what it sent while blocked stays hidden.
      if (!sess.number) return K.empty({ icon: I.block, title: SIM_TEXT[sess.sim] || 'No SIM', text: 'The block list is the SIM\'s: put a SIM in the phone.' });
      const B = app.blocks;
      if (!B.loaded) return K.empty({ title: 'Loading…' });
      const how = 'Block a number from its conversation in Messages, or its page in Phone. They are not told.';
      if (!B.list.length) return K.empty({ icon: I.block, title: 'No blocked numbers', text: how });
      const rows = B.list.map((b) => {
        const c = app.contacts.find(b.number);
        return K.row({ icon: I.block, label: c ? c.name : K.fmtNumber(b.number), sub: c ? K.fmtNumber(b.number) : `Blocked ${K.fmtWhen(b.time)}`,
          value: 'Unblock', act: 'unblock', d: { number: b.number }, chev: false, hint: 'Unblock' });
      });
      return K.list(rows, { header: `${B.list.length} blocked`, inset: 58,
        footer: 'Their texts and calls don\'t reach this SIM. Unblocked, what they sent meanwhile stays hidden. ' + how });
    }
    if (p === 'apps') {
      const mods = app.modules();
      return K.list(mods.map((m) => K.row({ icon: I.apps, label: m.name, sub: `${m.external ? 'Module from another resource' : 'Built-in module'}${m.version ? ' · v' + m.version : ''}`, value: '' })), { header: `${mods.length} installed`, inset: 58, footer: 'Apps are modules: removing one removes the app, the phone keeps working.' });
    }
    if (p === 'about') {
      return K.list([['Name', myName(sess) || '—'], ['Number', simLine(sess)], ['Model', 'Duo Fold'], ['Software', 'whip 1.0'], ['Apps', String(app.modules().length)]]
        .map(([a, b]) => K.row({ label: a, value: b })), { inset: 14 });
    }
    return '';
  }
  /** The character's numbers, for the SIM page (whip_phone:settings:numbers). */
  async function loadNumbers(app) {
    try { app.state.sim = await app.request('numbers'); } catch (e) { app.state.sim = { numbers: [] }; }
    if (!app.state.sim || !Array.isArray(app.state.sim.numbers)) app.state.sim = { numbers: [] };
  }
  function main(app, sel) {
    const S = app.settings, sess = app.session;
    const r = (k, icon, label, value) => K.row({ icon, label, value, act: 'page', d: { p: k }, sel: sel === k, hint: 'Open' });
    const card = sess.card || {};
    // The profile at the top: this number's card (its picture, framed), which it opens.
    return K.title('Settings') + K.scroll(
      `<div class="list"><button class="row profile${sel === 'card' ? ' sel' : ''}" data-act="page" data-p="card" data-hint="My card">` +
      `${K.avatar({ name: myName(sess), size: 58, pic: card.picture, frame: card.frame })}<div class="r-main"><b>${K.esc(myName(sess) || 'Your phone')}</b>` +
      `<div class="r-sub">${K.esc(simLine(sess))}${sess.number && sess.mine ? ' · My card' : ''}</div></div>${I.chev}</button></div>` +
      K.list([r('sim', I.call, 'SIM', sess.number ? '' : (SIM_TEXT[sess.sim] || 'No SIM')),
        r('blocked', I.block, 'Blocked numbers', sess.number && app.blocks.list.length ? String(app.blocks.list.length) : '')]) +
      K.list([r('wallpaper', I.sun, 'Wallpaper', ''), r('sounds', I.speaker, 'Sounds', labelOf(S, 'ringtone', S.get('ringtone')))]) +
      K.list([K.row({ icon: I.bell, label: 'Do Not Disturb', sub: 'Only calls get through', toggle: !!S.get('dnd'), act: 'dnd', chev: false, hint: 'Toggle' })]) +
      K.list([r('apps', I.apps, 'Apps', String(app.modules().length)), r('about', I.info, 'About', '')]));
  }

  WhipPhone.module({
    id: 'settings', name: 'Settings', version: '1.0.0', order: 90, icon: GLYPH,
    css: `
.profile{display:flex;align-items:center;gap:14px;min-height:74px}
.profile b{font-size:19px;font-weight:700;display:block}
.wp-pick{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;padding:0 16px 20px}
.tablet .wp-pick{grid-template-columns:repeat(4,1fr)}
.wp-pick button{display:flex;flex-direction:column;align-items:center;gap:8px;font-size:13.5px;font-weight:500}
.wp-pick i{display:block;width:100%;aspect-ratio:.62;border-radius:14px;border:3px solid transparent;position:relative;overflow:hidden}
.wp-pick button.on i{border-color:var(--accent)}
.m-settings .split>.main .scroll{padding-top:10px}
.row.dim .sw{opacity:.35;cursor:default}
.row.dim .r-ico{opacity:.5}
.snd-vol{padding:0 16px 6px}
.cd-pv{display:flex;flex-direction:column;align-items:center;gap:12px;padding:6px 16px 16px}
.cd-face{border-radius:50%;cursor:grab;touch-action:none}
.cd-face:active{cursor:grabbing}
.cd-face.none{cursor:default}
.cd-face img{pointer-events:none;user-select:none}
.cd-zoom{display:flex;align-items:center;gap:12px;width:100%;max-width:260px}
.cd-zoom svg{flex:none;width:14px;height:14px;fill:var(--text2)}
.cd-zoom svg:last-child{width:22px;height:22px}
.cd-zoom input[type=range][data-bind]{height:30px;background:transparent;border-radius:15px}
.cd-zoom input[type=range][data-bind]::-webkit-slider-runnable-track{height:4px;border-radius:2px;background:var(--fill2)}
.cd-zoom input[type=range][data-bind]::-webkit-slider-thumb{margin-top:-11px}
.cd-why{padding:0 16px 8px;color:var(--red);font-size:13.5px}
.cd-acts{display:flex;flex-wrap:wrap;gap:10px;padding:4px 16px 18px}
.row[data-act="unblock"] .r-val{color:var(--accent)}
`,
    state: () => ({ page: null, sim: null, callVol: null, card: null, unblocking: false }),

    route: (app) => app.state.page || '',
    // My card's two boxes, as they are typed, and its zoom slider as it moves
    bind: {
      cardName(app, v) { if (app.state.card) app.state.card.name = String(v).slice(0, 50); },
      cardZoom(app, v) { const f = app.state.card && app.state.card.frame; if (f) f.z = round(clamp(Number(v) || 1, 1, 3), 100); },
      cardPic(app, v) {
        const d = app.state.card;
        if (!d) return;
        const url = String(v).trim();
        if (url !== d.picture) d.frame = frame0();   // a new picture starts in the middle
        d.picture = url; d.why = '';
      },
    },
    back(app) {
      const p = app.state.page;
      if (!p) return false;
      app.settings.stopPreview();
      app.state.page = PICKS[p] ? 'sounds' : null;   // a sound's list goes back to Sounds
      return true;
    },
    info(app) { return `${app.modules().length} apps installed`; },
    // A new session (a SIM put in or taken out, a number locked): the SIM page reads the numbers again.
    session(app) { if (app.state.page === 'sim') loadNumbers(app); },

    render(app, v) {
      const p = app.state.page;
      if (v.size === 'tablet') {
        const cur = p || 'wallpaper';
        // A sound's list keeps Sounds lit on the left, with its own way back.
        const nav = PICKS[cur] ? K.nav({ back: 'Sounds', act: 'page', d: { p: 'sounds' }, title: TITLES[cur] }) : K.nav({ title: TITLES[cur] });
        return K.screen('split', K.split(main(app, PICKS[cur] ? 'sounds' : cur), `${nav}${K.scroll(page(app, cur))}`, 'sp-' + cur));
      }
      if (!p) return K.screen('main', main(app, null));
      const up = PICKS[p] ? { back: 'Sounds', d: { p: 'sounds' } } : { back: 'Settings', d: { p: '' } };
      return K.screen('p-' + p, K.nav({ back: up.back, act: 'page', d: up.d, title: TITLES[p] }) + K.scroll(`<div style="padding-top:8px">${page(app, p)}</div>`), { slide: true });
    },

    actions: {
      page(app, d) {
        if (!PICKS[d.p]) app.settings.stopPreview();   // left a sound's list: its preview stops
        app.state.page = d.p || null;
        if (d.p === 'sim') return loadNumbers(app);
        if (d.p === 'blocked') return app.blocks.load(true);
        if (d.p === 'sounds') return loadCallVol(app);   // (it may have changed in Server Settings)
        if (d.p === 'card') openCard(app);
      },
      // ---- my card: the picture framed (dragged, or wheeled, on it: data-pan; zoomed by the slider), the card saved
      cardPan(app, d) {
        const f = app.state.card && app.state.card.frame;
        if (!f) return;
        if (d.zoom != null) { f.z = round(clamp(f.z + Number(d.zoom) * 0.1, 1, 3), 100); return; }
        // the picture follows the pointer: the point kept in view goes the other way
        f.x = round(clamp(f.x - Number(d.dx || 0) * 100 / f.z, 0, 100), 10);
        f.y = round(clamp(f.y - Number(d.dy || 0) * 100 / f.z, 0, 100), 10);
      },
      cardNoPic(app) { if (app.state.card) { app.state.card.picture = ''; app.state.card.frame = frame0(); } },
      async cardSave(app) {
        const d = app.state.card;
        if (!d || d.busy) return;
        d.busy = true; d.why = '';
        try {
          const r = await app.request('card', { name: d.name.trim(), picture: d.picture.trim(), frame: d.frame });   // -> whip_phone:settings:card
          app.session.card = r && (r.name || r.picture) ? r : null;
          app.toast('Card saved');
        } catch (e) { d.why = e.reason || 'Could not save that'; }
        d.busy = false;
      },
      set(app, d) { app.settings.set(d.key, d.v); },
      /** a ringtone or tone picked: kept (on the SIM), and played */
      pick(app, d) {
        app.settings.set(d.key, d.v);
        app.settings.preview(d.list === 'ringtone' ? 'ringtone' : 'alert', d.v);
      },
      /** the volume: kept, and heard (the notification sound at it) */
      volume(app, d) {
        app.settings.set('soundVolume', Number(d.v));
        app.settings.preview('alert', app.settings.get('notifyTone'));
      },
      /** the call volume: the voice system keeps it; the page shows what it kept */
      async callVol(app, d) { app.state.callVol = await app.callVolume(Number(d.v)); },
      dnd(app) { app.settings.set('dnd', !app.settings.get('dnd')); },
      async unblock(app, d) {
        if (app.state.unblocking) return;
        app.state.unblocking = true;
        try { await app.blocks.remove(d.number); app.toast('Number unblocked'); }   // -> whip_phone:blocks:remove
        catch (e) { app.toast(e.reason || 'Could not change that'); }
        app.state.unblocking = false;
      },
      async lock(app, d) {
        try {
          await app.request('lock', { number: d.number, locked: d.locked === '1' });   // -> whip_phone:settings:lock
          app.toast(d.locked === '1' ? 'Number locked' : 'Number unlocked');
        } catch (e) { app.toast(e.reason || 'Could not change that'); }
        await loadNumbers(app);
      },
    },
  });
})();
