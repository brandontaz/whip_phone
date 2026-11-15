// whip_phone UI kit: the HTML builders modules use, so every app shares one look (each whip style restyles these classes),
// works with the controller focus engine (anything with data-act is focusable) and survives the fold snapshots.
// Builders return HTML strings; a module's render() returns one string built from them.
import { I, GLYPH } from './icons.js';

export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const dash = (k) => k.replace(/[A-Z]/g, (c) => '-' + c.toLowerCase());
/** { id: 3, number: '555' } -> data-id="3" data-number="555" (values escaped; null / false skipped) */
export const data = (o = {}) => Object.entries(o).filter(([, v]) => v != null && v !== false).map(([k, v]) => `data-${dash(k)}="${esc(v)}"`).join(' ');
const pad2 = (n) => String(n).padStart(2, '0');

// ---- phone numbers: digits in data, xxx-xxx-xxxx on screen (whip_core's inventory format 'phone')
export const digits = (n) => String(n ?? '').replace(/\D/g, '');
export function fmtNumber(n) {
  const d = digits(n);
  if (d.length > 6) return `${d.slice(0, 3)}-${d.slice(3, 6)}-${d.slice(6)}`;
  if (d.length > 3) return `${d.slice(0, 3)}-${d.slice(3)}`;
  return d;
}

// ---- time: the framework may send unix seconds (os.time()) or milliseconds; both work
export const toMs = (t) => (t == null ? Date.now() : t < 1e12 ? t * 1000 : t);
export const fmtTime = (t) => { const d = new Date(toMs(t)); return `${d.getHours() % 12 || 12}:${pad2(d.getMinutes())} ${d.getHours() < 12 ? 'AM' : 'PM'}`; };
/** list timestamps: time today, "Yesterday", weekday this week, else 7 Oct */
export function fmtWhen(t) {
  const d = new Date(toMs(t)), now = new Date(), day = 864e5;
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  if (d.getTime() >= start) return fmtTime(t);
  if (d.getTime() >= start - day) return 'Yesterday';
  if (d.getTime() >= start - 6 * day) return d.toLocaleDateString('en-AU', { weekday: 'long' });
  return d.toLocaleDateString('en-AU', { day: 'numeric', month: 'short' });
}
export const fmtDuration = (s) => { s = Math.max(0, Math.floor(s)); return `${Math.floor(s / 60)}:${pad2(s % 60)}`; };
export const initials = (name) => String(name || '').trim().split(/\s+/).map((w) => (w.match(/[\p{L}\p{N}]/u) || [''])[0]).filter(Boolean).slice(0, 2).join('').toUpperCase() || '#';
/** a contact's picture link the phone shows: a plain https address (the server gives out only accepted sites'), or '' */
export const picUrl = (pic) => (typeof pic === 'string' && /^https:\/\/[A-Za-z0-9.-]+\/[A-Za-z0-9\-._/]+$/.test(pic) ? pic : '');
/** A picture's FRAMING ({ x, y, z }: the point kept in view, 0-100 across and down, and the zoom, 1-3) as the picture's
 *  style. No gap at any zoom, whatever its shape. whip_core's Director draws lore pictures the same way. */
export function frameStyle(fr) {
  const n = (v, lo, hi, d) => { v = Number(v); return Number.isFinite(v) ? Math.max(lo, Math.min(hi, v)) : d; };
  const x = n(fr && fr.x, 0, 100, 50), y = n(fr && fr.y, 0, 100, 50), z = n(fr && fr.z, 1, 3, 1);
  return `object-position:${x}% ${y}%;transform-origin:${x}% ${y}%;transform:scale(${z})`;
}

// ---- builders
export const kit = {
  esc, data, digits, fmtNumber, toMs, fmtTime, fmtWhen, fmtDuration, initials, picUrl, frameStyle, icons: I,

  /** a full-screen app page; give each sub-screen its own key so switching screens animates (slide: true) */
  screen: (key, inner, { slide = false, cls = '' } = {}) => `<div class="app${slide ? ' slide-in' : ''}${cls ? ' ' + cls : ''}" data-k="${esc(key)}">${inner}</div>`,
  /** nav bar: back button (act defaults to the OS back), centred title, right-hand actions html */
  nav: ({ back = null, title = '', right = '', act = 'os:back', d = {} } = {}) =>
    `<div class="nav">${back != null ? `<button class="back" data-act="${act}" ${data(d)} data-hint="Back">${GLYPH.back}<span>${esc(back)}</span></button>` : '<span></span>'}` +
    `<span class="n-title">${esc(title)}</span><span class="n-act">${right}</span></div>`,
  /** an icon button for the nav bar's right side */
  navBtn: (icon, act, d = {}, hint = '') => `<button class="nb" data-act="${act}" ${data(d)}${hint ? ` data-hint="${esc(hint)}"` : ''}>${icon}</button>`,
  title: (text) => `<div class="big-title">${esc(text)}</div>`,
  search: ({ bind, value = '', placeholder = 'Search' }) =>
    `<label class="search">${I.search}<input data-bind="${bind}" value="${esc(value)}" placeholder="${esc(placeholder)}" autocomplete="off" spellcheck="false"></label>`,
  /** scrolling body; bottom: keep pinned to the end (chats) */
  scroll: (inner, { bottom = false, pad = true } = {}) => `<div class="scroll" data-scroll${bottom ? ' data-bottom' : ''}><div>${inner}${pad ? '<div class="pad-b"></div>' : ''}</div></div>`,
  list: (rows, { header = '', footer = '', inset = null } = {}) =>
    `${header ? `<div class="list-h">${esc(header)}</div>` : ''}<div class="list"${inset != null ? ` style="--inset:${inset}px"` : ''}>${rows.join('')}</div>${footer ? `<div class="list-f">${esc(footer)}</div>` : ''}`,
  /** a list row: icon (svg) or avatar html, label, sub line, right value, chevron or toggle; act makes it pressable */
  row: ({ icon = '', av = '', label = '', sub = '', value = null, act = '', d = {}, chev = !!act, toggle = null, sel = false, hint = '', tone = '', html = false }) =>
    `<${act ? 'button' : 'div'} class="row${sel ? ' sel' : ''}${tone ? ' ' + tone : ''}"${act ? ` data-act="${act}"` : ''} ${data(d)}${hint ? ` data-hint="${esc(hint)}"` : ''}>` +
    `${icon ? `<span class="r-ico">${icon}</span>` : ''}${av}<span class="r-main">${html ? label : esc(label)}${sub ? `<div class="r-sub">${html ? sub : esc(sub)}</div>` : ''}</span>` +
    `${value != null ? `<span class="r-val">${html ? value : esc(value)}</span>` : ''}${toggle != null ? `<span class="sw${toggle ? ' on' : ''}"></span>` : chev ? I.chev : ''}</${act ? 'button' : 'div'}>`,
  button: ({ label = '', act, d = {}, kind = '', icon = '', hint = '', block = false }) =>
    `<button class="btn${kind ? ' ' + kind : ''}${block ? ' block' : ''}" data-act="${act}" ${data(d)}${hint ? ` data-hint="${esc(hint)}"` : ''}>${icon}${esc(label)}</button>`,
  /** a labelled input row (use inside kit.list) */
  field: ({ label = '', bind, value = '', placeholder = '', type = 'text', enter = '', mode = '' }) =>
    `<label class="row field-row"><span class="f-l">${esc(label)}</span><input type="${type}" data-bind="${bind}" value="${esc(value)}" placeholder="${esc(placeholder)}"` +
    `${enter ? ` data-enter="${enter}"` : ''}${mode ? ` inputmode="${mode}"` : ''} autocomplete="off" spellcheck="false"></label>`,
  /** segmented control: options [[value, label]] */
  seg: (options, value, act) => `<div class="seg">${options.map(([v, l]) => `<button class="${v === value ? 'on' : ''}" data-act="${act}" data-v="${esc(v)}">${esc(l)}</button>`).join('')}</div>`,
  /** bottom tab bar: tabs [[value, label, icon, badge]] */
  tabs: (tabs, value, act) => `<div class="tabbar">${tabs.map(([v, l, ic, n]) => `<button class="${v === value ? 'on' : ''}" data-act="${act}" data-tab="${esc(v)}">${ic || ''}${n ? `<b class="t-badge">${n}</b>` : ''}${esc(l)}</button>`).join('')}</div>`,
  empty: ({ icon = '', title = '', text = '', action = null }) =>
    `<div class="kempty">${icon ? `<i>${icon}</i>` : ''}${title ? `<b>${esc(title)}</b>` : ''}${text ? `<span>${esc(text)}</span>` : ''}` +
    `${action ? `<button class="btn" data-act="${action.act}" ${data(action.d || {})}>${esc(action.label)}</button>` : ''}</div>`,
  /** pic: a contact's picture (a lore character's or a player's card's link, checked by the server), framed by
   *  `frame` (frameStyle): drawn over the initials, which show again if it does not load. Only a plain https address. */
  avatar: ({ name = '', size = 44, pic = '', frame = null } = {}) => {
    const img = picUrl(pic) ? `<img class="av-pic" src="${esc(pic)}" alt="" style="${frameStyle(frame)}" onerror="this.remove()">` : '';
    return `<div class="av" style="width:${size}px;height:${size}px;font-size:${Math.round(size * 0.38)}px">${name ? esc(initials(name)) : I.person}${img}</div>`;
  },
  bubble: ({ me = false, text = '', fresh = false, failed = false }) => `<div class="bub ${me ? 'me' : 'them'}${fresh ? ' fresh' : ''}${failed ? ' failed' : ''}">${esc(text)}</div>`,
  day: (text) => `<div class="day">${esc(text)}</div>`,
  /** message composer: an input bound to `bind`, Enter / the send button run `send` */
  composer: ({ bind, value = '', placeholder = 'Message', send = 'send' }) =>
    `<div class="composer"><div class="field"><input data-bind="${bind}" data-enter="${send}" placeholder="${esc(placeholder)}" value="${esc(value)}" autocomplete="off">` +
    `<button class="send${String(value).trim() ? '' : ' off'}" data-act="${send}" data-hint="Send">${GLYPH.send}</button></div></div>`,
  /** a bottom sheet (centred card on the tablet); close = the action that dismisses it */
  sheet: ({ title = '', body = '', close }) =>
    `<div class="sheet-bg" data-act="${close}" data-nofocus></div><div class="sheet"><div class="grab"></div>${title ? `<h3>${esc(title)}</h3>` : ''}${body}</div>`,
  /** two columns on the tablet: a list on the left, the selected item on the right */
  split: (side, main, key = '') => `<div class="split"><div class="side">${side}</div><div class="main"${key ? ` data-k="${esc(key)}"` : ''}>${main}</div></div>`,
};
