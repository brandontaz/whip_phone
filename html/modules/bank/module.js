// Bank: your accounts, their activity, transfers, sharing an account, opening and closing one. UI only: everything
// comes from whip_phone:bank:* (server/bank.lua), which asks whip_core's bank as the player, so every rule is the
// bank's. Always the character holding the phone, whatever SIM is in it. Money arriving is a push (`changed`, and a
// "Received $X" notification from the server). Delete this folder and the phone has no Bank app.
(() => {
  const { kit: K, icons: I } = window.WhipPhone;
  const GLYPH = '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2.6 2.8 7.4v2.1h18.4V7.4zM4.6 11h2.9v6.6H4.6zm5.95 0h2.9v6.6h-2.9zm5.95 0h2.9v6.6h-2.9zM2.8 19.1h18.4v2.3H2.8z"/></svg>';
  const BRIEF = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linejoin="round"><rect x="3" y="7.5" width="18" height="12" rx="2.2"/><path d="M9 7.5V5.6c0-.6.5-1.1 1.1-1.1h3.8c.6 0 1.1.5 1.1 1.1v1.9M3 12.5h18"/></svg>';
  const PIG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M5 11.5c0-3 3-5.2 7-5.2s7 2.2 7 5.2c0 1.8-1 3.3-2.6 4.2V19h-2.6v-2.1a9 9 0 0 1-3.6 0V19H7.6v-3.3A4.8 4.8 0 0 1 5 11.5z"/><path d="M19 11h1.6M10 6.6 9 4.4c1.3 0 2.3.6 2.8 1.5"/><circle cx="15.3" cy="10.3" r=".4" fill="currentColor"/></svg>';
  const TYPE = { personal: ['Personal', I.card], savings: ['Savings', PIG], shared: ['Shared', I.share], business: ['Business', BRIEF] };
  const ROLE = { owner: 'Owner', manager: 'Manager', withdraw: 'Withdraw', deposit: 'Deposit only', view: 'View only' };
  const RANK = { view: 1, deposit: 2, withdraw: 3, manager: 4, owner: 5 };
  const ROLE_TEXT = {
    view: 'Sees the balance and the activity.', deposit: 'Can also put money in.',
    withdraw: 'Can also take money out and send it.', manager: 'Can also add and remove people.',
  };
  const QUICK = [100, 500, 1000];

  const money = (n) => '$' + Math.floor(Math.abs(+n || 0)).toLocaleString('en-US');
  const typeName = (a) => (TYPE[a.type] || TYPE.personal)[0];
  const typeIcon = (a) => (TYPE[a.type] || TYPE.personal)[1];
  const acct = (s, id) => s.accounts.find((a) => a.id === +id);
  /** the roles someone with `mine` may hand out: the ones below their own */
  const shareable = (mine) => ['view', 'deposit', 'withdraw', 'manager'].filter((r) => RANK[r] < (RANK[mine] || 0));
  /** what the Add page gives: the role picked there, if this account lets you give it */
  const addRoleOf = (s) => { const a = acct(s, s.open), roles = shareable(a && a.role); return roles.includes(s.addRole) ? s.addRole : roles[0] || 'view'; };
  const tick = `<span class="bk-tick">${I.check}</span>`;

  // ---------------------------------------------------------------- data
  /** LIVE ONLY WHILE IT IS SEEN (audit 9, NEW-3): the server pushes `changed` to a phone watching its accounts, and a
   *  watch used to last until the player disconnected, so every sale on a shop's account made each employee's phone
   *  read the bank again, app open or not. Listing the accounts watches them only while the Bank app is in front of
   *  the player; leaving it (or putting the phone away) unwatches, and coming back reads them again. */
  const seen = (app) => app.active && app.visible;
  async function loadAccounts(app) {
    const s = app.state;
    const watch = seen(app);
    s.watched = watch;                                    // at once: a presence change in the wait sees it
    try { const r = await app.request('accounts', { watch }); s.accounts = Array.isArray(r) ? r : []; s.error = null; }
    catch (e) { s.error = e.reason || 'The bank is not answering'; }
    s.loaded = true;
  }
  async function loadAccount(app, id) {
    const s = app.state;
    try { s.detail[id] = await app.request('account', { id }); }
    catch (e) { if (!s.detail[id]) s.detail[id] = { error: e.reason || 'Could not load that account' }; }
  }
  async function loadAccess(app, id) {
    const s = app.state;
    try { const r = await app.request('access', { id }); s.access[id] = Array.isArray(r) ? r : []; }
    catch (e) { s.access[id] = []; app.toast(e.reason || 'Could not load who shares it'); }
  }
  async function loadNearby(app) {
    const s = app.state;
    s.nearby = null;
    try { const r = await app.request('nearby'); s.nearby = Array.isArray(r) ? r : []; } catch (e) { s.nearby = []; }
  }
  /** INVITES (audit 9, NEW-2): adding someone to an account sends them an invite they accept or decline here, and
   *  nobody is on an account until they say yes. These are the ones waiting for this character's answer. */
  async function loadInvites(app) {
    try { const r = await app.request('invites'); app.state.invites = Array.isArray(r) ? r : []; } catch (e) { /* keep */ }
  }
  const inviteKey = (id) => 'invite-' + id;
  /** what Add says: an invite went (they answer on their phone), or someone already on it got a new role */
  const added = (r) => (r.invited ? `Invite sent${r.name ? ' to ' + r.name : ''}: they answer on their phone` : `${r.name || 'They'} can use it now`);
  function dropInvite(app, id) {
    const s = app.state;
    s.invites = s.invites.filter((x) => x.invite !== +id);
    if (s.sheet && s.sheet.kind === 'invite' && s.sheet.invite === +id) s.sheet = null;
    app.dismiss(inviteKey(id));
  }
  /** a write: one at a time; the answer, or null after telling the player why not */
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
    if (!s.detail[s.open]) s.detail[s.open] = null;   // loading
    return loadAccount(app, s.open);
  }
  /** money moved on accounts the page shows: read them again once the burst settles (a shop's sales come in runs) */
  let refreshTimer = null;
  function refreshSoon(app, ids) {
    const s = app.state, want = (ids || []).map(Number);
    s.stale = [...new Set([...(s.stale || []), ...want])];
    clearTimeout(refreshTimer);
    refreshTimer = setTimeout(async () => {
      const stale = s.stale; s.stale = [];
      await loadAccounts(app);
      if (s.open && stale.includes(s.open)) await loadAccount(app, s.open);
      for (const id of Object.keys(s.detail)) if (+id !== s.open && stale.includes(+id)) delete s.detail[id];
      app.render();
    }, 350);
  }

  // ---------------------------------------------------------------- screens
  function card(a, sel) {
    return `<button class="bk-card${sel ? ' sel' : ''}" data-act="view" data-id="${a.id}" data-hint="Open">` +
      `<span class="bk-c-top"><span>${K.esc(a.label)}</span>${a.frozen ? '<em>Frozen</em>' : ''}</span>` +
      `<b>${money(a.balance)}</b><span class="bk-c-num">${K.esc(a.number)} · ${K.esc(typeName(a))}</span></button>`;
  }
  function accountRow(a, sel) {
    return K.row({ icon: typeIcon(a), label: a.label, sub: `${a.job ? a.job + ' · ' : ''}${ROLE[a.role] || a.role}${a.frozen ? ' · Frozen' : ''}`,
      value: money(a.balance), act: 'view', d: { id: a.id }, sel, hint: 'Open' });
  }
  function home(app, sel) {
    const s = app.state;
    if (!s.loaded) return K.title('Bank') + K.empty({ icon: GLYPH, title: 'Loading…' });
    if (s.error && !s.accounts.length) return K.title('Bank') + K.empty({ icon: GLYPH, title: 'No connection', text: s.error, action: { label: 'Try again', act: 'reload' } });
    const main = s.accounts.find((a) => a.default) || null;
    const rest = s.accounts.filter((a) => a !== main);
    const asked = s.invites.map((x) => K.row({ icon: I.share, label: x.account, sub: `${x.from} · ${ROLE[x.role] || x.role}`,
      value: 'Invite', act: 'invite', d: { invite: x.invite }, hint: 'Answer' }));
    return K.title('Bank') + K.scroll(
      (asked.length ? K.list(asked, { header: 'Invitations', inset: 58 }) : '') +
      (main ? card(main, sel === main.id) : '') +
      (rest.length ? K.list(rest.map((a) => accountRow(a, sel === a.id)), { header: main ? 'Other accounts' : 'Accounts', inset: 58 }) : '') +
      (!s.accounts.length ? K.empty({ icon: GLYPH, title: 'No accounts', text: 'You have no bank account yet.' }) : '') +
      K.list([K.row({ icon: I.plus, label: 'Open an account', act: 'page', d: { p: 'new' }, hint: 'Open' })], { inset: 58 }));
  }
  function historyRow(t) {
    const sign = t.dir === 'out' ? '−' : '+';
    // The other side, when the server names it (an account no person owns): "From Big Evil Criminal Boss".
    const party = t.party ? `${t.dir === 'out' ? 'To' : 'From'} ${K.esc(t.party)} · ` : '';
    return K.row({ label: K.esc(t.text), sub: party + K.esc(K.fmtWhen(t.time)) + (t.balance != null ? ` · ${money(t.balance)}` : ''), html: true,
      value: `<span class="bk-amt ${t.dir}">${sign}${money(t.amount)}</span>` });
  }
  function account(app, id, withBack) {
    const s = app.state, d = s.detail[id], a = (d && d.account) || acct(s, id);
    const nav = K.nav({ back: withBack ? 'Bank' : null, act: 'closeAccount', title: '' });
    if (!a) return nav + K.empty({ title: d && d.error ? d.error : 'Loading…' });
    const can = (d && d.can) || {};
    const btn = (icon, label, p) => `<button class="bk-act" data-act="page" data-p="${p}" data-hint="${label}"><i>${icon}</i>${label}</button>`;
    const acts = (can.transfer && !a.frozen ? btn(I.send, 'Transfer', 'transfer') : '') + (can.share ? btn(I.person, 'Sharing', 'sharing') : '');
    const head = `<div class="bk-bal"><span class="bk-l">${K.esc(a.label)}</span><b>${money(a.balance)}</b>` +
      `<span class="bk-s">${K.esc(a.number)} · ${K.esc(typeName(a))}${a.job ? ' · ' + K.esc(a.job) : ''}</span>` +
      `<span class="bk-chips">${a.frozen ? '<em class="frz">Frozen</em>' : ''}<em>${K.esc(ROLE[a.role] || a.role)}</em></span></div>` +
      (acts ? `<div class="bk-acts">${acts}</div>` : '');
    let hist;
    if (!d) hist = K.empty({ title: 'Loading…' });
    else if (d.error) hist = K.empty({ title: d.error });
    else if (!d.history.length) hist = K.list([], { header: 'Activity', footer: 'Nothing has moved yet.' });
    else hist = K.list(d.history.map(historyRow), { header: 'Activity' });
    const close = can.close ? K.list([K.row({ label: 'Close account', act: 'askClose', tone: 'danger', chev: false, hint: 'Close' })]) : '';
    return nav + K.scroll(head + hist + close);
  }
  function transfer(app) {
    const s = app.state, a = acct(s, s.open), tf = s.tf;
    if (!a) return K.empty({ title: 'Loading…' });
    const others = s.accounts.filter((x) => x.id !== a.id && !x.frozen && (RANK[x.role] || 0) >= RANK.deposit);
    const chips = QUICK.map((v) => `<button class="bk-chip" data-act="amt" data-v="${v}" data-hint="Set">${money(v)}</button>`).join('') +
      `<button class="bk-chip" data-act="amt" data-v="${Math.floor(a.balance)}" data-hint="Set">All</button>`;
    const to = tf.mode === 'mine'
      ? (others.length ? K.list(others.map((x) => K.row({ icon: typeIcon(x), label: K.esc(x.label), sub: K.esc(x.number), value: tf.to === x.id ? tick : '',
          html: true, act: 'tfTo', d: { id: x.id }, chev: false, hint: 'Send here' })), { inset: 58 })
        : K.list([], { footer: 'You have no other account to send to. Use an account number.' }))
      : K.list([K.field({ label: 'Number', bind: 'tfNumber', value: tf.number, placeholder: 'WB-000000' })], { inset: 14 });
    return K.scroll(
      K.list([K.row({ icon: typeIcon(a), label: a.label, sub: `${a.number} · ${money(a.balance)}` })], { header: 'From', inset: 58 }) +
      K.list([K.field({ label: 'Amount', bind: 'amount', value: tf.amount, placeholder: '$0', mode: 'numeric' })], { header: 'Amount', inset: 14 }) +
      `<div class="bk-chips-row">${chips}</div>` +
      `<div class="list-h">To</div>` + K.seg([['mine', 'My accounts'], ['number', 'Account number']], tf.mode, 'tfMode') + to +
      K.list([K.field({ label: 'Message', bind: 'tfMsg', value: tf.message, placeholder: 'What for (optional)' })], { inset: 14 }) +
      `<div class="bk-go">${K.button({ label: +tf.amount ? `Send ${money(tf.amount)}` : 'Send', act: 'askSend', block: true, hint: 'Send' })}</div>`);
  }
  function sharing(app) {
    const s = app.state, a = acct(s, s.open), list = s.access[s.open];
    if (!a || !list) return K.empty({ title: 'Loading…' });
    const mine = a.role;
    const rows = list.filter((p) => !p.pending).map((p) => {
      const editable = !p.me && p.role !== 'owner' && RANK[p.role] < RANK[mine];
      return K.row({ av: K.avatar({ name: p.name, size: 34 }), label: p.me ? `${p.name} (you)` : p.name, value: ROLE[p.role] || p.role,
        act: editable ? 'person' : '', d: { charId: p.charId }, hint: 'Change' });
    });
    // invites not answered yet: on the account only once they say yes
    const waiting = list.filter((p) => p.pending).map((p) => K.row({ av: K.avatar({ name: p.name, size: 34 }), label: p.name,
      sub: ROLE[p.role] || p.role, value: 'Waiting', act: 'pending', d: { invite: p.invite }, hint: 'Cancel' }));
    return K.scroll(K.list(rows, { header: a.label, inset: 60 }) +
      (waiting.length ? K.list(waiting, { header: 'Invited', inset: 60, footer: 'They are on the account once they accept on their phone.' }) : '') +
      K.list([K.row({ icon: I.plus, label: 'Add someone', act: 'page', d: { p: 'add' }, hint: 'Add' })], { inset: 58,
        footer: 'You can give people less than you have yourself, and change or remove only those below you.' }));
  }
  function add(app) {
    const s = app.state, a = acct(s, s.open);
    if (!a) return K.empty({ title: 'Loading…' });
    const roles = shareable(a.role), role = addRoleOf(s);
    const near = s.nearby === null ? [K.row({ label: 'Looking…' })]
      : s.nearby.length ? s.nearby.map((p) => K.row({ av: K.avatar({ name: p.name, size: 34 }), label: p.name, sub: `${p.dist} m away`,
          act: 'shareNear', d: { src: p.src }, chev: false, hint: 'Add' }))
        : [K.row({ label: 'Nobody near you', sub: 'Stand next to them, or use their character ID' })];
    near.push(K.row({ icon: I.recent, label: 'Look again', act: 'lookAgain', chev: false, hint: 'Refresh' }));
    return K.scroll(
      `<div class="list-h">They may</div>` + K.seg(roles.map((r) => [r, ROLE[r].replace(' only', '')]), role, 'addRole') +
      `<div class="list-f bk-role-f">${K.esc(ROLE_TEXT[role] || '')}</div>` +
      K.list(near, { header: 'Nearby', inset: 60 }) +
      K.list([K.field({ label: 'ID', bind: 'addId', value: s.addId, placeholder: 'Character ID', mode: 'numeric', enter: 'shareId' })], { header: 'By character ID', inset: 14 }) +
      `<div class="bk-go">${K.button({ label: 'Add', act: 'shareId', block: true, kind: 'gray', hint: 'Add' })}</div>`);
  }
  function opener(app) {
    const s = app.state, nw = s.nw;
    return K.scroll(
      K.list([K.field({ label: 'Name', bind: 'nwLabel', value: nw.label, placeholder: nw.type === 'shared' ? 'House money' : 'Rainy day', enter: 'create' })], { inset: 14 }) +
      K.seg([['savings', 'Savings'], ['shared', 'Shared']], nw.type, 'nwType') +
      `<div class="list-f bk-role-f">${nw.type === 'shared' ? 'Yours, and you can add people to it, each with what they may do.' : 'Just yours. Move money in and out with Transfer.'}</div>` +
      `<div class="bk-go">${K.button({ label: 'Open account', act: 'create', block: true, hint: 'Open' })}</div>`);
  }
  const TITLES = { transfer: 'Transfer', sharing: 'Sharing', add: 'Add someone', new: 'New account' };
  function page(app) {
    const s = app.state, p = s.page;
    const backTo = p === 'add' ? 'Sharing' : p === 'new' ? 'Bank' : ((acct(s, s.open) || {}).label || 'Account');
    const body = p === 'transfer' ? transfer(app) : p === 'sharing' ? sharing(app) : p === 'add' ? add(app) : opener(app);
    return K.nav({ back: backTo, act: 'pageBack', title: TITLES[p] }) + body;
  }
  function sheet(app) {
    const s = app.state, sh = s.sheet;
    if (!sh) return '';
    const btns = (cancel, go, label, kind = '') => `<div class="bk-sheet-btns">${K.button({ label: cancel, act: 'closeSheet', kind: 'gray' })}${K.button({ label, act: go, kind })}</div>`;
    if (sh.kind === 'send') {
      return K.sheet({ title: `Send ${money(sh.amount)}?`, close: 'closeSheet', body:
        K.list([K.row({ label: 'From', value: sh.from }), K.row({ label: 'To', value: sh.to }), ...(sh.message ? [K.row({ label: 'Message', value: sh.message })] : [])], { inset: 14 }) +
        btns('Cancel', 'send', 'Send') });
    }
    if (sh.kind === 'close') {
      return K.sheet({ title: `Close ${sh.label}?`, close: 'closeSheet', body:
        `<p class="bk-p">Empty it first: the bank only closes an account with nothing in it. Anyone you shared it with loses it too.</p>` + btns('Keep it', 'close', 'Close account', 'red') });
    }
    if (sh.kind === 'invite') {
      const x = s.invites.find((i) => i.invite === sh.invite);
      if (!x) return '';
      return K.sheet({ title: x.account, close: 'closeSheet', body:
        `<p class="bk-p">${K.esc(x.from)} invites you to share this account. You may: ${K.esc((ROLE[x.role] || x.role).toLowerCase())}. ${K.esc(ROLE_TEXT[x.role] || '')} Accept, and the people on it see your name.</p>` +
        `<div class="bk-sheet-btns">${K.button({ label: 'Decline', act: 'declineInvite', kind: 'gray' })}${K.button({ label: 'Accept', act: 'acceptInvite' })}</div>` });
    }
    if (sh.kind === 'pending') {
      const p = (s.access[s.open] || []).find((x) => x.pending && x.invite === sh.invite);
      if (!p) return '';
      return K.sheet({ title: p.name, close: 'closeSheet', body:
        `<p class="bk-p">Invited to ${K.esc((ROLE[p.role] || p.role).toLowerCase())}. They have not answered yet.</p>` + btns('Keep it', 'uninvite', 'Cancel invite', 'red') });
    }
    if (sh.kind === 'person') {
      const a = acct(s, s.open), p = (s.access[s.open] || []).find((x) => !x.pending && x.charId === sh.charId);
      if (!a || !p) return '';
      const roles = shareable(a.role);
      return K.sheet({ title: p.name, close: 'closeSheet', body:
        K.seg(roles.map((r) => [r, ROLE[r].replace(' only', '')]), p.role, 'setRole') +
        `<p class="bk-p">${K.esc(ROLE_TEXT[p.role] || '')}</p>` + btns('Done', 'unshare', 'Remove', 'red') });
    }
    return '';
  }

  WhipPhone.module({
    id: 'bank', name: 'Bank', version: '1.0.0', order: 30, icon: GLYPH,
    css: `
.bk-card{display:flex;flex-direction:column;align-items:flex-start;gap:2px;width:calc(100% - 32px);margin:2px 16px 22px;padding:15px 18px 14px;border-radius:18px;text-align:left;color:#fff;
  background:var(--accent);background-image:linear-gradient(135deg,rgba(255,255,255,.2),rgba(255,255,255,0) 55%,rgba(0,0,0,.28));box-shadow:0 8px 22px rgba(0,0,0,.28)}
.bk-card .bk-c-top{display:flex;justify-content:space-between;width:100%;font-size:14px;font-weight:600;opacity:.92}
.bk-card .bk-c-top em{font-style:normal;font-size:11.5px;font-weight:700;padding:2px 8px;border-radius:20px;background:rgba(0,0,0,.25)}
.bk-card b{font-family:var(--font-display);font-size:34px;font-weight:700;letter-spacing:-.8px;font-variant-numeric:tabular-nums;margin-top:10px}
.bk-card .bk-c-num{font-size:13px;opacity:.8;letter-spacing:.4px;font-variant-numeric:tabular-nums}
.bk-card.sel{box-shadow:0 0 0 3px var(--text),0 8px 22px rgba(0,0,0,.28)}
.bk-bal{display:flex;flex-direction:column;align-items:center;text-align:center;gap:3px;padding:4px 20px 18px}
.bk-bal .bk-l{font-size:15px;color:var(--text2);font-weight:600}
.bk-bal b{font-family:var(--font-display);font-size:40px;font-weight:700;letter-spacing:-1px;font-variant-numeric:tabular-nums}
.bk-bal .bk-s{font-size:13.5px;color:var(--text2);font-variant-numeric:tabular-nums}
.bk-chips{display:flex;gap:6px;margin-top:6px}
.bk-chips em{font-style:normal;font-size:12px;font-weight:600;padding:3px 10px;border-radius:20px;background:var(--fill);color:var(--text2)}
.bk-chips em.frz{background:var(--red);color:#fff}
.bk-acts{display:flex;justify-content:center;gap:12px;padding:0 16px 22px}
.bk-act{flex:1;max-width:130px;display:flex;flex-direction:column;align-items:center;gap:6px;padding:11px 6px;border-radius:12px;background:var(--bg2);font-size:13px;font-weight:600;color:var(--accent)}
.bk-act i{width:22px;height:22px}
.bk-act i svg{width:100%;height:100%}
.bk-amt{font-weight:600;font-variant-numeric:tabular-nums}
.bk-amt.in{color:var(--green)}
.bk-amt.out{color:var(--text)}
.bk-chips-row{display:flex;gap:8px;padding:0 16px 22px;margin-top:-12px;flex-wrap:wrap}
.bk-chip{height:32px;padding:0 14px;border-radius:16px;background:var(--fill);font-size:14px;font-weight:600;color:var(--accent);font-variant-numeric:tabular-nums}
.bk-go{padding:0 16px 22px}
.bk-role-f{margin-top:-4px}
.bk-p{font-size:14.5px;color:var(--text2);line-height:1.4;margin:0 2px 16px}
.bk-tick{color:var(--accent);width:18px;display:inline-block}
.bk-tick svg{width:18px;height:18px}
.bk-sheet-btns{display:flex;gap:10px}
.bk-sheet-btns .btn{flex:1}
.sheet .seg{margin:0 0 12px}
.sheet .list{margin:0 0 16px}
`,
    state: () => ({
      accounts: [], loaded: false, error: null, open: null, detail: {}, page: null, sheet: null, busy: false, stale: [], watched: false, invites: [],
      tf: { amount: '', mode: 'mine', to: null, number: '', message: '' },
      access: {}, addRole: 'view', addId: '', nearby: null, nw: { label: '', type: 'savings' },
    }),

    // A new character (or a new phone session): read everything again.
    session(app) {
      const s = app.state;
      Object.assign(s, { loaded: false, accounts: [], detail: {}, access: {}, open: null, page: null, sheet: null, invites: [] });
      loadAccounts(app);
      loadInvites(app);
    },
    open(app, args = {}) {
      const s = app.state;
      loadInvites(app);
      if (args.invite) s.sheet = { kind: 'invite', invite: +args.invite };   // a tap on the invite's capsule
      const first = s.loaded ? Promise.resolve() : loadAccounts(app);
      if (args.id) return first.then(() => view(app, args.id));
      if (s.loaded) loadAccounts(app);
      if (s.open) loadAccount(app, s.open);
    },
    // In front of the player again (the phone taken back out on this app): read and watch again. Gone from in front of
    // them (another app, home, the phone put away): stop watching (see `seen`).
    presence(app, now) {
      const s = app.state, on = now.visible && now.app === 'bank';
      if (on && !s.watched && s.loaded) {
        for (const id of Object.keys(s.detail)) if (+id !== s.open) delete s.detail[id];   // read again when opened
        loadAccounts(app).then(() => (s.open ? loadAccount(app, s.open) : null)).then(() => app.render());
      } else if (!on && s.watched) {
        s.watched = false;
        app.request('unwatch').catch(() => {});
      }
    },
    route: (app) => { const s = app.state; return s.sheet ? 'sheet-' + s.sheet.kind : s.page || (s.open ? 'account' : 'home'); },
    back(app) {
      const s = app.state;
      if (s.sheet) { s.sheet = null; return true; }
      if (s.page === 'add') { s.page = 'sharing'; return true; }
      if (s.page) { s.page = null; return true; }
      if (s.open) { s.open = null; return true; }
      return false;
    },
    x(app) {
      const s = app.state, d = s.open && s.detail[s.open];
      if (s.sheet || s.page) return null;
      if (s.open) return d && d.can && d.can.transfer && !(d.account || {}).frozen ? { label: 'Transfer', run: () => { s.page = 'transfer'; } } : null;
      return { label: 'Open account', run: () => { s.page = 'new'; } };
    },
    info(app) {
      const s = app.state, a = s.accounts.find((x) => x.default);
      if (s.invites.length) return s.invites.length === 1 ? '1 invitation' : `${s.invites.length} invitations`;
      return a ? `${a.label}: ${money(a.balance)}` : 'Your accounts';
    },
    badge: (app) => app.state.invites.length,

    render(app, v) {
      const s = app.state, sh = sheet(app);
      if (v.size === 'tablet') {
        const main = s.page ? page(app) : s.open ? account(app, s.open, false)
          : K.empty({ icon: GLYPH, title: s.accounts.length ? 'Pick an account' : 'Bank' });
        return K.screen('split', K.split(home(app, s.page === 'new' ? null : s.open), main, `bk-${s.open || 'none'}-${s.page || ''}`) + sh);
      }
      if (s.page) return K.screen(`p-${s.page}-${s.open || ''}`, page(app) + sh, { slide: true });
      if (s.open) return K.screen('a-' + s.open, account(app, s.open, true) + sh, { slide: true });
      return K.screen('home', home(app, null) + sh);   // (an invite's sheet opens over the list)
    },

    actions: {
      reload(app) { app.state.loaded = false; return loadAccounts(app); },
      view(app, d) { return view(app, d.id); },
      closeAccount(app) { app.state.open = null; },
      page(app, d) {
        const s = app.state;
        s.page = d.p; s.sheet = null;
        if (d.p === 'transfer') s.tf = { amount: '', mode: 'mine', to: null, number: '', message: '' };
        if (d.p === 'sharing') { s.access[s.open] = s.access[s.open] || null; return loadAccess(app, s.open); }
        if (d.p === 'add') { s.addId = ''; s.addRole = 'view'; return loadNearby(app); }   // the least, every time
        if (d.p === 'new') s.nw = { label: '', type: 'savings' };
      },
      pageBack(app) { const s = app.state; s.page = s.page === 'add' ? 'sharing' : null; },
      closeSheet(app) { app.state.sheet = null; },

      // ---- transfer
      amt(app, d) { app.state.tf.amount = String(Math.max(0, Math.floor(+d.v || 0))); },
      tfMode(app, d) { app.state.tf.mode = d.v; },
      tfTo(app, d) { app.state.tf.to = +d.id; },
      askSend(app) {
        const s = app.state, tf = s.tf, a = acct(s, s.open), amount = Math.floor(+tf.amount || 0);
        if (!a) return;
        if (amount < 1) return app.toast('Enter an amount');
        if (amount > a.balance) return app.toast(`${a.label} has ${money(a.balance)}`);
        let to;
        if (tf.mode === 'mine') { const x = acct(s, tf.to); if (!x) return app.toast('Pick an account to send to'); to = `${x.label} · ${x.number}`; }
        else { if (!K.digits(tf.number)) return app.toast('Type the account number'); to = tf.number.toUpperCase(); }
        s.sheet = { kind: 'send', amount, from: a.label, to, message: tf.message.trim() };
      },
      async send(app) {
        const s = app.state, tf = s.tf, sh = s.sheet;
        if (!sh) return;
        const args = { from: s.open, amount: sh.amount, message: sh.message };
        if (tf.mode === 'mine') args.to = tf.to; else args.number = tf.number;
        const ok = await act(app, 'transfer', args, 'The transfer did not go through');
        if (!ok) return;
        s.sheet = null; s.page = null;
        app.toast(`Sent ${money(sh.amount)}`);
        await loadAccounts(app);
        await loadAccount(app, s.open);
      },

      // ---- invites (to me)
      invite(app, d) { app.state.sheet = { kind: 'invite', invite: +d.invite }; },
      /** the capsule's own tap: open the app on the invite */
      showInvite(app, d) { app.open('bank', { invite: +d.invite }); },
      async acceptInvite(app, d) {
        const s = app.state, id = +((d && d.invite) || (s.sheet && s.sheet.invite));
        const x = s.invites.find((i) => i.invite === id);
        const r = await act(app, 'answer', { invite: id, accept: true }, 'Could not accept it');
        dropInvite(app, id);
        if (!r) return loadInvites(app);
        app.toast(`${x ? x.account : 'The account'} is shared with you now`);
        await loadAccounts(app);
        if (app.active && r.id) await view(app, r.id);
      },
      async declineInvite(app, d) {
        const s = app.state, id = +((d && d.invite) || (s.sheet && s.sheet.invite));
        const r = await act(app, 'answer', { invite: id, accept: false }, 'Could not decline it');
        dropInvite(app, id);
        if (r) app.toast('Declined');
      },
      // ---- invites (I sent)
      pending(app, d) { app.state.sheet = { kind: 'pending', invite: +d.invite }; },
      async uninvite(app) {
        const s = app.state, sh = s.sheet;
        if (!sh) return;
        if (!(await act(app, 'uninvite', { invite: sh.invite }, 'Could not cancel it'))) return;
        s.sheet = null;
        app.toast('Invite cancelled');
        await loadAccess(app, s.open);
      },

      // ---- sharing
      person(app, d) { app.state.sheet = { kind: 'person', charId: +d.charId }; },
      async setRole(app, d) {
        const s = app.state, sh = s.sheet;
        if (!sh) return;
        if (await act(app, 'share', { id: s.open, charId: sh.charId, role: d.v }, 'Could not change that')) await loadAccess(app, s.open);
      },
      async unshare(app) {
        const s = app.state, sh = s.sheet;
        if (!sh) return;
        if (!(await act(app, 'unshare', { id: s.open, charId: sh.charId }, 'Could not remove them'))) return;
        s.sheet = null;
        app.toast('Removed');
        await loadAccess(app, s.open);
      },
      addRole(app, d) { app.state.addRole = d.v; },
      lookAgain(app) { return loadNearby(app); },
      async shareNear(app, d) {
        const s = app.state;
        const r = await act(app, 'share', { id: s.open, src: +d.src, role: addRoleOf(s) }, 'Could not add them');
        if (!r) return;
        app.toast(added(r));
        s.page = 'sharing';
        await loadAccess(app, s.open);
      },
      async shareId(app) {
        const s = app.state, id = Math.floor(+K.digits(s.addId) || 0);
        if (!id) return app.toast('Type their character ID');
        const r = await act(app, 'share', { id: s.open, charId: id, role: addRoleOf(s) }, 'Could not add them');
        if (!r) return;
        app.toast(added(r));
        s.page = 'sharing';
        await loadAccess(app, s.open);
      },

      // ---- open and close
      nwType(app, d) { app.state.nw.type = d.v; },
      async create(app) {
        const s = app.state, label = s.nw.label.trim();
        if (!label) return app.toast('Give it a name');
        const r = await act(app, 'open', { label, type: s.nw.type }, 'The bank refused');
        if (!r) return;
        app.toast(`Opened ${r.number || label}`);
        s.page = null;
        await loadAccounts(app);
        if (r.id) await view(app, r.id);
      },
      askClose(app) { const a = acct(app.state, app.state.open); if (a) app.state.sheet = { kind: 'close', label: a.label }; },
      async close(app) {
        const s = app.state;
        if (!(await act(app, 'close', { id: s.open }, 'Could not close it'))) return;
        app.toast('Account closed');
        delete s.detail[s.open];
        s.sheet = null; s.open = null;
        await loadAccounts(app);
      },
    },
    bind: {
      amount(app, v) { app.state.tf.amount = K.digits(v).slice(0, 10); },
      tfNumber(app, v) { app.state.tf.number = String(v).slice(0, 12); },
      tfMsg(app, v) { app.state.tf.message = String(v).slice(0, 100); },
      addId(app, v) { app.state.addId = K.digits(v).slice(0, 9); },
      nwLabel(app, v) { app.state.nw.label = String(v).slice(0, 50); },
    },
    on: {
      /** { ids } money moved on these accounts (server/bank.lua). Not watching (one sent before the unwatch landed):
       *  nothing read now; coming back reads everything. */
      changed(app, d = {}) { if (app.state.watched) refreshSoon(app, d.ids); },
      /** { invite, account, role, from } someone invites this character to share an account: a capsule to answer */
      invite(app, x = {}) {
        const s = app.state;
        if (!x.invite) return;
        s.invites = [...s.invites.filter((i) => i.invite !== x.invite), x];
        app.notify({
          key: inviteKey(x.invite), title: x.account, text: `${x.from} invites you to share it`, kind: 'chat', life: 20000,
          data: { invite: x.invite }, tap: { act: 'showInvite', label: 'Show' },
          actions: [{ act: 'declineInvite', label: 'Decline', tone: 'reject', icon: I.x }, { act: 'acceptInvite', label: 'Accept', tone: 'accept', icon: I.check }],
        });
      },
      /** { invite } its sender took it back */
      inviteGone(app, d = {}) { if (d.invite) dropInvite(app, d.invite); },
      /** { id } an invite I sent was answered: the Sharing list, if it is up, is read again */
      shared(app, d = {}) { const s = app.state; if (s.page === 'sharing' && s.open === +d.id) loadAccess(app, s.open).then(() => app.render()); },
    },
  });
})();
