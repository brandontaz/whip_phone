// Module CSS scoping. A module's `css` is rewritten when it registers, so it can only style its own app:
// - every selector gets the app's class in front: `button {}` becomes `:where(.m-<id>) button {}`. :where() adds no
//   specificity, so the rule weighs exactly what it did before (the phone's own styles still win where they did);
// - display context stays in front of it: `.tablet .grid {}` -> `.tablet :where(.m-<id>) .grid {}` (.phone, .tablet,
//   .portrait, .console, .mk, ... sit on the screen above the app);
// - `:host`, `html`, `body` and `:root` mean the app's own box (mount mode: the box the app draws into);
// - @keyframes names get the app's id, so two apps can both have a `spin`;
// - relative url()s resolve against the module's script, so `url(img/bg.png)` finds the file next to it.
// A selector that already names `.m-<id>` is left alone (hand-scoped CSS keeps working). `globalCss` is not scoped.
const CONTEXT = new Set(['os-screen', 'phone', 'tablet', 'portrait', 'console', 'mk', 'in-pad', 'in-keys', 'in-mouse', 'app-open',
  'in-call', 'peek', 'locked', 'cc-open', 'light', 'snap', 'sb-dark', 'sb-light']);
const ABS = /^(?:[a-z][a-z0-9+.-]*:|\/\/|#)/i;
const COMB = /^[ >+~]$/;

/** url(...) in css -> absolute, against base (the module script's URL) */
export function resolveUrls(css, base) {
  if (!base) return css;
  return css.replace(/url\(\s*(['"]?)(.*?)\1\s*\)/g, (all, q, u) => {
    if (!u || ABS.test(u)) return all;
    try { return `url("${new URL(u, base).href}")`; } catch { return all; }
  });
}

/** split at top-level characters in `seps` (outside (), [] and strings) */
function topSplit(s, seps) {
  const out = [];
  let cur = '', depth = 0, quote = '';
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (quote) { cur += c; if (c === '\\') cur += s[++i] || ''; else if (c === quote) quote = ''; continue; }
    if (c === '\\') { cur += c + (s[++i] || ''); continue; }
    if (c === '"' || c === "'") { quote = c; cur += c; continue; }
    if (c === '(' || c === '[') depth++;
    else if (c === ')' || c === ']') depth--;
    if (depth === 0 && seps.includes(c)) { out.push(cur, c); cur = ''; continue; }
    cur += c;
  }
  out.push(cur);
  return out;
}
/** a complex selector -> [compound, combinator, compound, ...] (combinators ' ' '>' '+' '~') */
function parts(sel) {
  const out = [];
  for (let t of topSplit(sel, ' \t\n>+~')) {
    if (t === '\t' || t === '\n') t = ' ';
    if (COMB.test(t)) {
      const last = out[out.length - 1];
      if (!out.length) continue;
      if (COMB.test(last)) { if (t !== ' ') out[out.length - 1] = t; } else out.push(t);
    } else if (t) out.push(t);
  }
  while (out.length && COMB.test(out[out.length - 1])) out.pop();
  return out;
}
const join = (p) => p.map((x) => (x === ' ' ? ' ' : COMB.test(x) ? ` ${x} ` : x)).join('');
const isContext = (c) => /^(\.[\w-]+)+$/.test(c) && c.split('.').filter(Boolean).every((k) => CONTEXT.has(k));

function scopeOne(sel, cls, scope, host) {
  sel = sel.trim();
  if (!sel) return sel;
  const own = new RegExp(cls.replace(/[.*+?^${}()|[\]\\-]/g, '\\$&') + '(?![-\\w])');
  if (own.test(sel)) return sel;                                                // scoped by hand
  if (/:host(?![-\w])/.test(sel)) return sel.replace(/:host(?![-\w])/g, host);  // :host = the app's box
  const p = parts(sel);
  let i = 0;
  while (i + 2 < p.length && p[i + 1] === ' ' && isContext(p[i])) i += 2;     // .tablet .x -> .tablet <scope> .x
  const root = /^(?:html|body|:root)(?![-\w])/i.exec(p[i] || '');
  if (root) {                                                                     // body {} -> the app's box
    p[i] = host + p[i].slice(root[0].length);
    while (i + 2 < p.length && p[i + 1] === ' ' && /^(?:html|body)$/i.test(p[i + 2])) p.splice(i + 1, 2);
    return join(p);
  }
  p.splice(i, 0, scope, ' ');
  return join(p);
}

/** index of the first top-level '::' (a pseudo-element) in a compound selector, or -1 */
function pseudoAt(c) {
  let depth = 0, quote = '';
  for (let i = 0; i < c.length; i++) {
    const ch = c[i];
    if (quote) { if (ch === '\\') i++; else if (ch === quote) quote = ''; continue; }
    if (ch === '"' || ch === "'") quote = ch;
    else if (ch === '(' || ch === '[') depth++;
    else if (ch === ')' || ch === ']') depth--;
    else if (depth === 0 && ch === ':' && c[i + 1] === ':') return i;
  }
  return -1;
}
const SHIELD = ':where(:not(.mount-root *))';
function shieldOne(sel) {
  const p = parts(sel.trim());
  if (!p.length) return sel;
  const last = p[p.length - 1], i = pseudoAt(last);
  p[p.length - 1] = i < 0 ? last + SHIELD : last.slice(0, i) + SHIELD + last.slice(i);
  return join(p);
}

function parse(css) {
  try { const sh = new CSSStyleSheet(); sh.replaceSync(css); return sh; } catch { /* older engines: an inert document */ }
  try {
    const doc = document.implementation.createHTMLDocument('');
    const st = doc.createElement('style'); st.textContent = css; doc.head.appendChild(st);
    return st.sheet;
  } catch { return null; }
}

/**
 * The other direction: the phone's own stylesheet must not reach into mount-mode apps. Their DOM is theirs, so a
 * class called .list there is not the kit's list. Every selector of the phone's CSS gets :where(:not(.mount-root *))
 * on its subject: zero specificity, so the phone's own cascade is unchanged. The controller highlight (.kf), the
 * snapshot rules (.snap: no animations in the fold pictures) and the off-screen rule (.os-off: animations hold still)
 * still apply inside apps.
 */
export function shieldCss(css) {
  const sheet = parse(css);
  if (!sheet) return css;
  const walk = (list) => {
    for (const r of list) {
      if (r instanceof CSSStyleRule) {
        if (!/\.(?:kf|snap|os-off)(?![-\w])/.test(r.selectorText)) r.selectorText = topSplit(r.selectorText, ',').filter((x) => x !== ',').map(shieldOne).join(', ');
      } else if (r.cssRules && !(r instanceof CSSKeyframesRule)) walk(r.cssRules);
    }
  };
  walk(sheet.cssRules);
  return [...sheet.cssRules].map((r) => r.cssText).join('\n');
}

/**
 * Scope a module's CSS to its app. id: module id; base: URL its relative url()s are relative to.
 * Returns the rewritten CSS (rules the browser can't parse are dropped, as they would be anyway).
 */
export function scopeCss(css, id, base, { mount = false } = {}) {
  if (!css || !css.trim()) return '';
  const cls = `.m-${id}`, scope = `:where(${cls})`, host = mount ? `:where(${cls} .mount-root)` : `:where(.app-wrap${cls})`, warn = (m) => console.warn(`[whip_phone] module ${id} css: ${m}`);
  const sheet = parse(resolveUrls(css, base));
  if (!sheet) { warn('could not be parsed, so it was left out'); return ''; }
  const frames = new Map();
  const collect = (list) => { for (const r of list) { if (r instanceof CSSKeyframesRule) frames.set(r.name, `${id}--${r.name}`); else if (r.cssRules && !(r instanceof CSSStyleRule)) collect(r.cssRules); } };
  collect(sheet.cssRules);
  const anim = (st) => {
    if (!frames.size || !st) return;
    const v = st.getPropertyValue('animation-name');
    if (!v) return;
    const nv = v.split(',').map((t) => frames.get(t.trim()) || t.trim()).join(', ');
    if (nv !== v) st.setProperty('animation-name', nv, st.getPropertyPriority('animation-name'));
  };
  const walk = (list, top) => {
    for (let k = list.length - 1; k >= 0; k--) {
      const r = list[k];
      if (r instanceof CSSStyleRule) {
        if (top) {
          const want = topSplit(r.selectorText, ',').filter((x) => x !== ',').map((s) => scopeOne(s, cls, scope, host)).join(', ');
          r.selectorText = want;
          if (!r.selectorText.includes(cls)) {
            warn(`dropped "${r.selectorText}" (it could not be scoped)`);
            r.parentRule ? r.parentRule.deleteRule(k) : sheet.deleteRule(k);
            continue;
          }
        }
        anim(r.style);
        if (r.cssRules && r.cssRules.length) walk(r.cssRules, false);           // CSS nesting: relative to this rule
      } else if (r instanceof CSSKeyframesRule) {
        r.name = frames.get(r.name) || r.name;
      } else if (r instanceof CSSImportRule) {
        warn('@import is not supported in module css (put the rules in css, or load fonts with @font-face)');
        r.parentRule ? r.parentRule.deleteRule(k) : sheet.deleteRule(k);
      } else if (r.cssRules) walk(r.cssRules, top);                              // @media, @supports, @layer, @container
    }
  };
  walk(sheet.cssRules, true);
  return [...sheet.cssRules].map((r) => r.cssText).join('\n');
}
