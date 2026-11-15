// Business: the jobs you work at, going on and off duty, and — for the ranks that may — the staff (hire, change a
// rank, fire) and the ranks themselves. UI only: everything comes from whip_phone:business:* (server/business.lua),
// which asks whip_core's jobs as the player, so every rule (permissions, the rank rule) is the jobs system's own.
// Always the character holding the phone, whatever SIM is in it. Delete this folder and the phone has no Business app.
(() => {
  const { kit: K, icons: I } = window.WhipPhone;
  const GLYPH = '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M9.2 3.6h5.6c1 0 1.8.8 1.8 1.8v1.3h3.1c1.1 0 2 .9 2 2v3.5H2.3V8.7c0-1.1.9-2 2-2h3.1V5.4c0-1 .8-1.8 1.8-1.8zm.2 3.1h5.2V5.6H9.4zM2.3 13.9h8.2v1.4h3v-1.4h8.2v4.3c0 1.1-.9 2-2 2H4.3c-1.1 0-2-.9-2-2z"/></svg>';
  const BANK = [['none', 'None'], ['view', 'View'], ['deposit', 'Deposit'], ['withdraw', 'Withdraw'], ['manager', 'Manage']];
  const BANK_TEXT = { none: 'No access to the business account.', view: 'Sees the business account.', deposit: 'Can put money in.',
    withdraw: 'Can take money out and send it.', manager: 'Can also share the account.' };
  const STEPS = [-10, -1, 1, 10];
  const dot = (on) => `<i class="bz-dot${on ? ' on' : ''}"></i>`;
  const tick = `<span class="bz-tick">${I.check}</span>`;

  // ---------------------------------------------------------------- data
  /** LIVE ONLY WHILE IT IS SEEN (audit 9, NEW-3, as the Bank app): reading the jobs watches them only while this app
   *  is in front of the player; leaving it (or putting the phone away) unwatches, and coming back reads them again. */
  const seen = (app) => app.active && app.visible;
  async function loadJobs(app) {
    const s = app.state;
    const watch = seen(app);
    s.watched = watch;
    try { const r = await app.request('jobs', { watch }); s.jobs = Array.isArray(r) ? r : []; s.error = null; }
    catch (e) { s.error = e.reason || 'Could not reach your jobs'; }
    s.loaded = true;
  }
  async function loadJob(app, id) {
    const s = app.state;
    try { s.detail[id] = await app.request('job', { id, watch: seen(app) }); }
    catch (e) { s.detail[id] = { error: e.reason || 'Could not load that job' }; }
  }
  async function loadRoles(app, id) {
    const s = app.state;
    try { s.ranks[id] = await app.request('roles', { id }); }
    catch (e) { s.ranks[id] = { error: e.reason || 'Could not load the ranks', roles: [], perms: [] }; }
  }
  async function loadNearby(app) {
    const s = app.state;
    s.nearby = null;
    try { const r = await app.request('nearby'); s.nearby = Array.isArray(r) ? r : []; } catch (e) { s.nearby = []; }
  }
  /** JOB OFFERS (audit 9, NEW-2, as the Bank's invites): hiring someone sends them an offer they accept or decline here,
   *  and nobody is hired until they say yes. These are the ones waiting for this character's answer. */
  async function loadOffers(app) {
    try { const r = await app.request('offers'); app.state.offers = Array.isArray(r) ? r : []; } catch (e) { /* keep */ }
  }
  const offerKey = (id) => 'offer-' + id;
  function dropOffer(app, id) {
    const s = app.state;
    s.offers = s.offers.filter((x) => x.offer !== +id);
    if (s.sheet && s.sheet.kind === 'offer' && s.sheet.offer === +id) s.sheet = null;
    app.dismiss(offerKey(id));
  }
  async function act(app, name, args, fail) {
    const s = app.state;
    if (s.busy) return null;
    s.busy = true;
    try { return (await app.request(name, args)) ?? true; }
    catch (e) { app.toast(e.reason || fail); return null; }
    finally { s.busy = false; }
  }
  function view(app, id) {
    const s = app.state;
    s.open = +id; s.page = null; s.sheet = null;
    if (!s.detail[s.open]) s.detail[s.open] = null;
    return loadJob(app, s.open);
  }
  let refreshTimer = null;
  function refreshSoon(app, id) {
    const s = app.state;
    s.stale = [...new Set([...(s.stale || []), +id])];
    clearTimeout(refreshTimer);
    refreshTimer = setTimeout(async () => {
      const stale = s.stale; s.stale = [];
      await loadJobs(app);
      if (s.open && stale.includes(s.open)) {
        if (!s.jobs.some((j) => j.id === s.open)) { s.open = null; s.page = null; s.sheet = null; }   // fired from it
        else await loadJob(app, s.open);
      }
      app.render();
    }, 350);
  }

  // what the player may do to someone: below them in rank (anything at level 100), never themselves or an unhired owner
  const myLevel = (d) => (d && d.job ? +d.job.level || 0 : 0);
  const outranks = (d, level) => myLevel(d) >= 100 || level < myLevel(d);
  const canTouch = (d, p) => !p.me && !p.unhired && outranks(d, p.level) && (d.can.fire || d.can.promote || d.can.demote);

  // ---------------------------------------------------------------- screens
  function home(app, sel) {
    const s = app.state;
    if (!s.loaded) return K.title('Business') + K.empty({ icon: GLYPH, title: 'Loading…' });
    if (s.error && !s.jobs.length) return K.title('Business') + K.empty({ icon: GLYPH, title: 'No connection', text: s.error, action: { label: 'Try again', act: 'reload' } });
    const offerRows = s.offers.map((o) => K.row({ icon: GLYPH, label: o.job, sub: `${o.role} · from ${o.from}`, value: 'Offer',
      act: 'offer', d: { offer: o.offer }, hint: 'Answer' }));
    const offersList = offerRows.length ? K.list(offerRows, { header: 'Job offers', inset: 58 }) : '';
    if (!s.jobs.length) {
      return K.title('Business') + (offersList ? K.scroll(offersList)
        : K.empty({ icon: GLYPH, title: 'No jobs', text: 'When someone hires you, the job shows here.' }));
    }
    const rows = s.jobs.map((j) => K.row({ icon: GLYPH, label: K.esc(j.name), sub: `${K.esc(j.role || '')} · ${j.onDuty ? 'On duty' : 'Off duty'}`,
      value: dot(j.onDuty), html: true, act: 'view', d: { id: j.id }, sel: sel === j.id, hint: 'Open' }));
    return K.title('Business') + K.scroll(offersList + K.list(rows, { inset: 58 }));
  }
  function job(app, id, withBack) {
    const s = app.state, d = s.detail[id], j = (d && d.job) || s.jobs.find((x) => x.id === id);
    const nav = K.nav({ back: withBack ? 'Business' : null, act: 'closeJob', title: '' });
    if (!d || d.error || !j) return nav + K.empty({ title: d && d.error ? d.error : 'Loading…' });
    const duty = j.onDuty
      ? `<button class="bz-duty on" data-act="clockOff" data-hint="Clock off">${dot(true)}<span><b>On duty</b><small>Tap to clock off</small></span></button>`
      : j.selfClock ? `<button class="bz-duty" data-act="clockOn" data-hint="Clock on">${dot(false)}<span><b>Off duty</b><small>Tap to clock on</small></span></button>`
        : `<div class="bz-duty off">${dot(false)}<span><b>Off duty</b><small>This job puts you on duty itself</small></span></div>`;
    let body = `<div class="bz-head"><b>${K.esc(j.name)}</b><span>${K.esc(j.role || '')} · Level ${j.level}</span></div>${duty}`;
    if (d.staff) {
      const ownerSub = (p) => (String(p.role).toLowerCase() === 'owner' ? p.role : `${p.role} · owner`);
      const rows = d.staff.map((p) => K.row({ av: K.avatar({ name: p.name, size: 34 }), label: K.esc(p.me ? `${p.name} (you)` : p.name),
        sub: K.esc(p.unhired ? ownerSub(p) : p.role) + (p.onDuty ? ' · on duty' : ''), value: dot(p.onDuty), html: true,
        act: canTouch(d, p) ? 'emp' : '', d: { charId: p.charId }, hint: 'Manage' }));
      body += K.list(rows, { header: `Staff · ${d.staff.length}`, inset: 60 });
      // offers not answered yet: on the staff only once they accept
      const waiting = (d.offers || []).map((o) => K.row({ av: K.avatar({ name: o.name, size: 34 }), label: o.name, sub: o.role,
        value: 'Waiting', act: d.can.hire ? 'pending' : '', d: { offer: o.offer }, hint: 'Cancel' }));
      if (waiting.length) body += K.list(waiting, { header: 'Offered', inset: 60, footer: 'They join once they accept on their phone.' });
      const more = [];
      if (d.can.hire) more.push(K.row({ icon: I.plus, label: 'Hire someone', act: 'page', d: { p: 'hire' }, hint: 'Hire' }));
      if (d.can.manage) more.push(K.row({ icon: I.gear, label: 'Ranks', value: String((d.roles || []).length), act: 'page', d: { p: 'ranks' }, hint: 'Open' }));
      if (more.length) body += K.list(more, { inset: 58 });
    }
    return nav + K.scroll(body);
  }
  function roleRows(app, d, current, actName, filter) {
    return (d.roles || []).filter(filter).map((r) => K.row({ label: K.esc(r.name), sub: `Level ${r.level}`, html: true, chev: false,
      value: r.roleId === current ? tick : '', act: actName === 'setRole' && r.roleId === current ? '' : actName, d: { roleId: r.roleId }, hint: 'Pick' }));
  }
  function emp(app) {
    const s = app.state, d = s.detail[s.open], p = d && d.staff && d.staff.find((x) => x.charId === s.emp);
    if (!p) return K.empty({ title: 'They are not on the staff any more' });
    const head = `<div class="bz-head">${K.avatar({ name: p.name, size: 64 })}<b>${K.esc(p.name)}</b><span>${K.esc(p.role)} · ${p.onDuty ? 'On duty' : 'Off duty'}</span></div>`;
    // only the ranks they could give: below their own, and nothing in it their own rank can't do (whip_core decides)
    const ranks = d.can.promote || d.can.demote
      ? K.list(roleRows(app, d, p.roleId, 'setRole', (r) => r.give || r.roleId === p.roleId),
        { header: 'Rank', footer: 'You can give ranks below your own that can do no more than yours.' }) : '';
    const fire = d.can.fire ? K.list([K.row({ label: `Fire ${p.name}`, act: 'askFire', tone: 'danger', chev: false, hint: 'Fire' })]) : '';
    return K.scroll(head + ranks + fire);
  }
  function hire(app) {
    const s = app.state, d = s.detail[s.open];
    if (!d || !d.roles) return K.empty({ title: 'Loading…' });
    const roles = (d.roles || []).filter((r) => r.give);
    const role = roles.some((r) => r.roleId === s.hireRole) ? s.hireRole : (roles[roles.length - 1] || {}).roleId;
    const near = s.nearby === null ? [K.row({ label: 'Looking…' })]
      : s.nearby.length ? s.nearby.map((p) => K.row({ av: K.avatar({ name: p.name, size: 34 }), label: p.name, sub: `${p.dist} m away`,
          act: 'hireNear', d: { src: p.src }, chev: false, hint: 'Hire' }))
        : [K.row({ label: 'Nobody near you', sub: 'Stand next to them, or use their character ID' })];
    near.push(K.row({ icon: I.recent, label: 'Look again', act: 'lookAgain', chev: false, hint: 'Refresh' }));
    return K.scroll(
      K.list(roleRows(app, d, role, 'hireRole', (r) => r.give), { header: 'As', inset: 14 }) +
      K.list(near, { header: 'Nearby', inset: 60 }) +
      K.list([K.field({ label: 'ID', bind: 'hireId', value: s.hireId, placeholder: 'Character ID', mode: 'numeric', enter: 'hireById' })], { header: 'By character ID', inset: 14 }) +
      `<div class="bz-go">${K.button({ label: 'Hire', act: 'hireById', block: true, kind: 'gray', hint: 'Hire' })}</div>`);
  }
  function permText(r, perms) {
    if (r.level >= 100) return 'Everything';
    const on = perms.filter((p) => r.permissions && r.permissions[p.key]).map((p) => p.label);
    const bank = r.permissions && r.permissions.bankAccess;
    if (bank) on.push('Bank: ' + (BANK.find((b) => b[0] === bank) || [, bank])[1]);
    return on.length ? on.join(', ') : 'Nothing extra';
  }
  function ranks(app) {
    const s = app.state, R = s.ranks[s.open];
    if (!R) return K.empty({ title: 'Loading…' });
    if (R.error) return K.empty({ title: R.error });
    const mine = +R.level || 0;
    const rows = R.roles.map((r) => {
      const editable = mine >= 100 || r.level < mine;
      return K.row({ label: K.esc(r.name), sub: `Level ${r.level} · ${K.esc(permText(r, R.perms))}`, html: true,
        act: editable ? 'rank' : '', d: { roleId: r.roleId }, hint: 'Edit' });
    });
    return K.scroll(K.list(rows, { header: 'Highest first', inset: 14 }) +
      K.list([K.row({ icon: I.plus, label: 'New rank', act: 'rank', d: { roleId: 0 }, hint: 'New' })], { inset: 58,
        footer: 'You can change only the ranks below your own, and give a rank a level below yours.' }));
  }
  function rank(app) {
    const s = app.state, R = s.ranks[s.open], f = s.form;
    if (!R || !f) return K.empty({ title: 'Loading…' });
    const top = f.level >= 100;
    // NEVER MORE THAN YOU HAVE (Josh, 8 Oct 2026): below level 100, a permission your own rank lacks can't be switched
    // on (one a superior gave this rank can still be taken away), and the business account goes no higher than yours
    const have = R.have || { perms: {}, bank: 'none' }, boss = (+R.level || 0) >= 100;
    const lacks = (key) => !boss && !have.perms[key] && !f.had[key];
    const BR = Object.fromEntries(BANK.map(([v], i) => [v, i]));
    const bankOpts = BANK.filter(([v]) => boss || BR[v] <= Math.max(BR[have.bank] || 0, BR[f.hadBank] || 0));
    const steps = STEPS.map((n) => `<button class="bz-chip" data-act="lvl" data-n="${n}" data-hint="Level">${n > 0 ? '+' + n : '−' + -n}</button>`).join('');
    const perms = R.perms.map((p) => K.row({ label: p.label, sub: lacks(p.key) ? 'Your rank can\'t do this' : p.custom ? 'This job\'s own' : '',
      toggle: top || !!f.perms[p.key], chev: false, act: top || lacks(p.key) ? '' : 'perm', d: { key: p.key }, hint: 'Toggle' }));
    return K.scroll(
      K.list([K.field({ label: 'Name', bind: 'rkName', value: f.name, placeholder: 'Shift Lead' }),
        K.field({ label: 'Level', bind: 'rkLevel', value: String(f.level), placeholder: '1 to 100', mode: 'numeric' })], { inset: 14 }) +
      `<div class="bz-chips">${steps}</div>` +
      K.list(perms, { header: 'May', inset: 14, footer: top ? 'Level 100 may do everything.' : '' }) +
      `<div class="list-h">Business account</div>` + K.seg(top ? BANK : bankOpts, top ? 'manager' : f.bank, 'bank') +
      `<div class="list-f bz-f">${K.esc(top ? 'Level 100 manages the business account.' : BANK_TEXT[f.bank] || '')}</div>` +
      `<div class="bz-go">${K.button({ label: f.roleId ? 'Save' : 'Make rank', act: 'saveRank', block: true, hint: 'Save' })}</div>` +
      (f.roleId ? K.list([K.row({ label: 'Delete rank', act: 'askDelete', tone: 'danger', chev: false, hint: 'Delete' })]) : ''));
  }
  // (the employee page has no title: their name is right under the bar)
  const TITLES = { emp: '', hire: 'Hire', ranks: 'Ranks', rank: 'Rank' };
  const BACK = { emp: null, hire: null, ranks: null, rank: 'Ranks' };
  /** a job's name short enough for the back button beside a centred title */
  const short = (n) => (String(n).length > 12 ? String(n).slice(0, 11).trim() + '…' : String(n));
  function page(app) {
    const s = app.state, p = s.page, d = s.detail[s.open];
    const back = BACK[p] || (d && d.job ? (p === 'emp' ? d.job.name : short(d.job.name)) : 'Back');
    const body = p === 'emp' ? emp(app) : p === 'hire' ? hire(app) : p === 'ranks' ? ranks(app) : rank(app);
    const title = p === 'rank' && s.form ? (s.form.roleId ? s.form.name || 'Rank' : 'New rank') : TITLES[p];
    return K.nav({ back, act: 'pageBack', title }) + body;
  }
  function sheet(app) {
    const s = app.state, sh = s.sheet;
    if (!sh) return '';
    const btns = (go, label) => `<div class="bz-sheet-btns">${K.button({ label: 'Cancel', act: 'closeSheet', kind: 'gray' })}${K.button({ label, act: go, kind: 'red' })}</div>`;
    if (sh.kind === 'fire') return K.sheet({ title: `Fire ${sh.name}?`, close: 'closeSheet', body: `<p class="bz-p">They lose the job and anything its rank gave them, like the business account.</p>` + btns('fire', 'Fire') });
    if (sh.kind === 'delete') return K.sheet({ title: `Delete ${sh.name}?`, close: 'closeSheet', body: `<p class="bz-p">Only a rank nobody holds can go.</p>` + btns('deleteRank', 'Delete') });
    if (sh.kind === 'offer') {
      const o = s.offers.find((x) => x.offer === sh.offer);
      if (!o) return '';
      return K.sheet({ title: o.job, close: 'closeSheet', body:
        `<p class="bz-p">${K.esc(o.from)} offers you a job here, as ${K.esc(o.role)}. Accept, and the staff there see your name.</p>` +
        `<div class="bz-sheet-btns">${K.button({ label: 'Decline', act: 'declineOffer', kind: 'gray' })}${K.button({ label: 'Accept', act: 'acceptOffer' })}</div>` });
    }
    if (sh.kind === 'pending') {
      const d = s.detail[s.open], o = d && (d.offers || []).find((x) => x.offer === sh.offer);
      if (!o) return '';
      return K.sheet({ title: o.name, close: 'closeSheet', body: `<p class="bz-p">Offered ${K.esc(o.role)}. They have not answered yet.</p>` + btns('unoffer', 'Cancel offer') });
    }
    return '';
  }
  /** what Hire says: an offer went (they answer on their phone) */
  const offered = (r) => (r.offered ? `Offer sent${r.name ? ' to ' + r.name : ''}: they answer on their phone` : `Hired ${r.name || ''}`.trim());

  WhipPhone.module({
    id: 'business', name: 'Business', version: '1.0.0', order: 35, icon: GLYPH,
    css: `
.bz-head{display:flex;flex-direction:column;align-items:center;text-align:center;gap:4px;padding:2px 20px 18px}
.bz-head b{font-size:22px;font-weight:700}
.bz-head span{font-size:14px;color:var(--text2)}
.bz-head .av{margin-bottom:6px}
.bz-duty{display:flex;align-items:center;gap:14px;width:calc(100% - 32px);margin:0 16px 22px;padding:14px 16px;border-radius:14px;background:var(--bg2);text-align:left}
.bz-duty b{display:block;font-size:17px;font-weight:700}
.bz-duty small{display:block;font-size:13px;color:var(--text2);margin-top:1px}
.bz-duty .bz-dot{width:12px;height:12px}
.bz-duty.on{background:var(--green);color:#fff}
.bz-duty.on small{color:rgba(255,255,255,.85)}
.bz-duty.on .bz-dot{background:#fff;box-shadow:0 0 0 4px rgba(255,255,255,.3)}
.bz-dot{display:inline-block;width:9px;height:9px;border-radius:50%;background:var(--text3);flex:none}
.bz-dot.on{background:var(--green)}
.bz-tick{color:var(--accent);width:18px;display:inline-block}
.bz-tick svg{width:18px;height:18px}
.bz-chips{display:flex;gap:8px;padding:0 16px 22px;margin-top:-12px}
.bz-chip{flex:1;height:32px;border-radius:16px;background:var(--fill);font-size:14px;font-weight:600;color:var(--accent);text-align:center;font-variant-numeric:tabular-nums}
.bz-go{padding:0 16px 22px}
.bz-f{margin-top:-4px}
.bz-p{font-size:14.5px;color:var(--text2);line-height:1.4;margin:0 2px 16px}
.bz-sheet-btns{display:flex;gap:10px}
.bz-sheet-btns .btn{flex:1}
`,
    state: () => ({
      jobs: [], loaded: false, error: null, open: null, detail: {}, ranks: {}, page: null, sheet: null, busy: false, stale: [],
      emp: null, hireRole: null, hireId: '', nearby: null, form: null, watched: false, offers: [],
    }),

    session(app) {
      const s = app.state;
      Object.assign(s, { loaded: false, jobs: [], detail: {}, ranks: {}, open: null, page: null, sheet: null, form: null, offers: [] });
      loadJobs(app);
      loadOffers(app);
    },
    open(app, args = {}) {
      const s = app.state;
      loadOffers(app);
      if (args.offer) s.sheet = { kind: 'offer', offer: +args.offer };   // a tap on the offer's capsule
      const first = s.loaded ? Promise.resolve() : loadJobs(app);
      if (args.id) return first.then(() => view(app, args.id));
      if (s.loaded) loadJobs(app);
      if (s.open) loadJob(app, s.open);
    },
    // In front of the player again: read and watch again (fired from the open job meanwhile: back to the list). Gone
    // from in front of them: stop watching (see `seen`).
    presence(app, now) {
      const s = app.state, on = now.visible && now.app === 'business';
      if (on && !s.watched && s.loaded) {
        for (const id of Object.keys(s.detail)) if (+id !== s.open) delete s.detail[id];
        loadJobs(app).then(() => {
          if (!s.open) return null;
          if (!s.jobs.some((j) => j.id === s.open)) { s.open = null; s.page = null; s.sheet = null; return null; }
          return loadJob(app, s.open);
        }).then(() => app.render());
      } else if (!on && s.watched) {
        s.watched = false;
        app.request('unwatch').catch(() => {});
      }
    },
    route: (app) => { const s = app.state; return s.sheet ? 'sheet-' + s.sheet.kind : s.page || (s.open ? 'job' : 'home'); },
    back(app) {
      const s = app.state;
      if (s.sheet) { s.sheet = null; return true; }
      if (s.page === 'rank') { s.page = 'ranks'; s.form = null; return true; }
      if (s.page) { s.page = null; return true; }
      if (s.open) { s.open = null; return true; }
      return false;
    },
    x(app) {
      const s = app.state, d = s.open && s.detail[s.open];
      if (s.sheet) return null;
      // (`this` is the module definition: the OS calls its hooks on it)
      if (s.page === 'ranks') return { label: 'New rank', run: () => this.actions.rank(app, { roleId: 0 }) };
      if (s.page || !d || !d.job) return null;
      if (d.job.onDuty) return { label: 'Clock off', run: () => this.actions.clockOff(app) };
      return d.job.selfClock ? { label: 'Clock on', run: () => this.actions.clockOn(app) } : null;
    },
    info(app) {
      const n = app.state.offers.length;
      if (n) return n === 1 ? '1 job offer' : `${n} job offers`;
      const on = app.state.jobs.filter((j) => j.onDuty);
      return on.length ? `On duty: ${on.map((j) => j.name).join(', ')}` : `${app.state.jobs.length} jobs`;
    },
    badge: (app) => app.state.offers.length,

    render(app, v) {
      const s = app.state, sh = sheet(app);
      if (v.size === 'tablet') {
        const main = s.page ? page(app) : s.open ? job(app, s.open, false) : K.empty({ icon: GLYPH, title: s.jobs.length ? 'Pick a job' : 'Business' });
        return K.screen('split', K.split(home(app, s.open), main, `bz-${s.open || 'none'}-${s.page || ''}`) + sh);
      }
      if (s.page) return K.screen(`p-${s.page}-${s.open || ''}`, page(app) + sh, { slide: true });
      if (s.open) return K.screen('j-' + s.open, job(app, s.open, true) + sh, { slide: true });
      return K.screen('home', home(app, null) + sh);   // (an offer's sheet opens over the list)
    },

    actions: {
      reload(app) { app.state.loaded = false; return loadJobs(app); },
      view(app, d) { return view(app, d.id); },
      closeJob(app) { app.state.open = null; },
      page(app, d) {
        const s = app.state;
        s.page = d.p; s.sheet = null;
        if (d.p === 'hire') { s.hireId = ''; s.hireRole = null; return loadNearby(app); }
        if (d.p === 'ranks') { s.ranks[s.open] = null; return loadRoles(app, s.open); }
      },
      pageBack(app) { const s = app.state; if (s.page === 'rank') { s.page = 'ranks'; s.form = null; } else s.page = null; },
      closeSheet(app) { app.state.sheet = null; },

      // ---- duty
      async clockOn(app) { const s = app.state; if (await act(app, 'clockOn', { id: s.open }, 'Could not clock on')) { app.toast('On duty'); await loadJob(app, s.open); await loadJobs(app); } },
      async clockOff(app) { const s = app.state; if (await act(app, 'clockOff', { id: s.open }, 'Could not clock off')) { app.toast('Off duty'); await loadJob(app, s.open); await loadJobs(app); } },

      // ---- staff
      emp(app, d) { const s = app.state; s.emp = +d.charId; s.page = 'emp'; },
      async setRole(app, d) {
        const s = app.state;
        if (await act(app, 'setRole', { id: s.open, charId: s.emp, roleId: +d.roleId }, 'Could not change their rank')) { app.toast('Rank changed'); await loadJob(app, s.open); }
      },
      askFire(app) { const s = app.state, p = (s.detail[s.open].staff || []).find((x) => x.charId === s.emp); if (p) s.sheet = { kind: 'fire', name: p.name }; },
      async fire(app) {
        const s = app.state;
        if (!(await act(app, 'fire', { id: s.open, charId: s.emp }, 'Could not fire them'))) return;
        s.sheet = null; s.page = null; s.emp = null;
        app.toast('Fired');
        await loadJob(app, s.open);
      },
      // ---- job offers (to me)
      offer(app, d) { app.state.sheet = { kind: 'offer', offer: +d.offer }; },
      /** the capsule's own tap: open the app on the offer */
      showOffer(app, d) { app.open('business', { offer: +d.offer }); },
      async acceptOffer(app, d) {
        const s = app.state, id = +((d && d.offer) || (s.sheet && s.sheet.offer));
        const o = s.offers.find((x) => x.offer === id);
        const r = await act(app, 'answerOffer', { offer: id, accept: true }, 'Could not accept it');
        dropOffer(app, id);
        if (!r) return loadOffers(app);
        app.toast(`You work at ${o ? o.job : 'the business'} now`);
        await loadJobs(app);
        if (app.active && r.id) await view(app, r.id);
      },
      async declineOffer(app, d) {
        const s = app.state, id = +((d && d.offer) || (s.sheet && s.sheet.offer));
        const r = await act(app, 'answerOffer', { offer: id, accept: false }, 'Could not decline it');
        dropOffer(app, id);
        if (r) app.toast('Declined');
      },
      // ---- job offers (I sent)
      pending(app, d) { app.state.sheet = { kind: 'pending', offer: +d.offer }; },
      async unoffer(app) {
        const s = app.state, sh = s.sheet;
        if (!sh) return;
        if (!(await act(app, 'unoffer', { offer: sh.offer }, 'Could not cancel it'))) return;
        s.sheet = null;
        app.toast('Offer cancelled');
        await loadJob(app, s.open);
      },

      hireRole(app, d) { app.state.hireRole = +d.roleId; },
      lookAgain(app) { return loadNearby(app); },
      async hireNear(app, d) { return hireWith(app, { src: +d.src }); },
      async hireById(app) {
        const id = Math.floor(+K.digits(app.state.hireId) || 0);
        if (!id) return app.toast('Type their character ID');
        return hireWith(app, { charId: id });
      },

      // ---- ranks
      rank(app, d) {
        const s = app.state, R = s.ranks[s.open];
        if (!R) return;
        const r = R.roles.find((x) => x.roleId === +d.roleId);
        const mine = +R.level || 0;
        const p = (r && r.permissions) || {};
        // `had` / `hadBank`: what the rank holds now (keeping it is not giving it)
        s.form = r ? { roleId: r.roleId, name: r.name, level: r.level, bank: p.bankAccess || 'none', hadBank: p.bankAccess || 'none',
          perms: Object.fromEntries(R.perms.map((x) => [x.key, !!p[x.key]])), had: Object.fromEntries(R.perms.map((x) => [x.key, !!p[x.key]])) }
          : { roleId: 0, name: '', level: Math.max(1, Math.min(mine >= 100 ? 50 : mine - 1, 99)), bank: 'none', hadBank: 'none', perms: {}, had: {} };
        s.page = 'rank'; s.sheet = null;
      },
      lvl(app, d) { const f = app.state.form; if (f) f.level = Math.max(1, Math.min(100, f.level + (+d.n || 0))); },
      perm(app, d) {
        const s = app.state, f = s.form, R = s.ranks[s.open];
        if (!f || !R) return;
        const have = R.have || { perms: {} };
        if (!f.perms[d.key] && (+R.level || 0) < 100 && !have.perms[d.key] && !f.had[d.key]) return app.toast('Your rank can\'t do this, so you can\'t give it');
        f.perms[d.key] = !f.perms[d.key];
      },
      bank(app, d) { const f = app.state.form; if (f && f.level < 100) f.bank = d.v; },
      async saveRank(app) {
        const s = app.state, f = s.form;
        if (!f) return;
        if (!f.name.trim()) return app.toast('Give the rank a name');
        const permissions = { ...f.perms, bankAccess: f.bank };
        const r = await act(app, 'saveRole', { id: s.open, roleId: f.roleId || null, name: f.name.trim(), level: f.level, permissions }, 'Could not save the rank');
        if (!r) return;
        app.toast(f.roleId ? 'Saved' : 'Rank made');
        s.page = 'ranks'; s.form = null;
        await loadRoles(app, s.open);
        await loadJob(app, s.open);
      },
      askDelete(app) { const f = app.state.form; if (f && f.roleId) app.state.sheet = { kind: 'delete', name: f.name }; },
      async deleteRank(app) {
        const s = app.state, f = s.form;
        if (!f) return;
        if (!(await act(app, 'deleteRole', { id: s.open, roleId: f.roleId }, 'Could not delete the rank'))) return;
        s.sheet = null; s.page = 'ranks'; s.form = null;
        app.toast('Rank deleted');
        await loadRoles(app, s.open);
        await loadJob(app, s.open);
      },
    },
    bind: {
      hireId(app, v) { app.state.hireId = K.digits(v).slice(0, 9); },
      rkName(app, v) { if (app.state.form) app.state.form.name = String(v).slice(0, 60); },
      rkLevel(app, v) { const f = app.state.form; if (f) { const n = Math.floor(+K.digits(v) || 0); if (n) f.level = Math.max(1, Math.min(100, n)); } },
    },
    on: {
      /** { id } someone was hired, fired, re-ranked or went on / off duty at this job (server/business.lua) */
      changed(app, d = {}) { if (d.id && app.state.watched) refreshSoon(app, d.id); },
      /** { offer, job, role, from } someone offers this character a job: a capsule to answer */
      offer(app, o = {}) {
        const s = app.state;
        if (!o.offer) return;
        s.offers = [...s.offers.filter((x) => x.offer !== o.offer), o];
        app.notify({
          key: offerKey(o.offer), title: o.job, text: `${o.from} offers you a job: ${o.role}`, kind: 'chat', life: 20000,
          data: { offer: o.offer }, tap: { act: 'showOffer', label: 'Show' },
          actions: [{ act: 'declineOffer', label: 'Decline', tone: 'reject', icon: I.x }, { act: 'acceptOffer', label: 'Accept', tone: 'accept', icon: I.check }],
        });
      },
      /** { offer } its sender took it back */
      offerGone(app, d = {}) { if (d.offer) dropOffer(app, d.offer); },
    },
  });

  /** hire the picked person at the rank picked on the Hire page (default: the lowest you may give) */
  async function hireWith(app, who) {
    const s = app.state, d = s.detail[s.open];
    const roles = ((d && d.roles) || []).filter((r) => r.give);
    const roleId = roles.some((r) => r.roleId === s.hireRole) ? s.hireRole : (roles[roles.length - 1] || {}).roleId;
    if (!roleId) return app.toast('There is no rank you can hire into');
    const r = await act(app, 'hire', { id: s.open, roleId, ...who }, 'Could not hire them');
    if (!r) return;
    app.toast(offered(r));
    s.page = null;
    await loadJob(app, s.open);
  }
})();
