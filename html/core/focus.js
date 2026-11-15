// Focus engine (controller / keyboard): spatial D-pad / arrow / stick navigation over whatever is clickable in the topmost
// open layer, a "this one" highlight that hover also drives, and per-layer focus memory so Back returns you to the item
// you came from. It reads positions from the DOM, so it works for any module without the module doing anything.
// mount-mode apps (their own DOM, any library) are reachable through ordinary buttons, links and tabindex too
const SEL = '[data-act]:not([data-act="noop"]):not([data-nofocus]), [data-hold], [data-drag], input, textarea, ' +
  '.mount-root :is(button, a[href], select, summary, [role="button"], [role="link"], [role="tab"], [role="option"], [tabindex]:not([tabindex="-1"]))';
const SIG_KEYS = ['act', 'app', 'id', 'key', 'number', 'tab', 'page', 'v', 'i', 'hold', 'drag', 'bind'];

/** A-button label when the element has no data-hint of its own */
export const ACT_HINT = {
  open: 'Open', unlock: 'Unlock', bopen: 'Open', notif: 'Open', home: 'Home', fold: 'Fold', dnd: 'Toggle', cmd: 'Select',
  hpage: 'Page', 'cc-close': 'Close', back: 'Back',
};

const sigOf = (el) => SIG_KEYS.map((k) => el.dataset[k] ?? '').join('|') + '|' + el.tagName +
  (el.dataset.act ? '' : '|' + (el.id || el.getAttribute('aria-label') || el.textContent.trim().slice(0, 32)));   // plain buttons: their label

export class Focus {
  constructor(os, view) { this.os = os; this.view = view; this.el = null; this.mem = {}; }

  /** the topmost open layer of this view ({ el, name }), decided by the OS */
  scope() { return this.os.scopeFor(this.view); }
  items(sc = this.scope()) {
    if (!sc) return [];
    const list = [...sc.el.querySelectorAll(SEL)];
    if (sc.el.matches(SEL)) list.unshift(sc.el);
    return list.filter((el) => {
      if (el.closest('[data-nofocus]')) return false;
      const r = el.getBoundingClientRect();
      return r.width > 4 && r.height > 4;
    });
  }
  /** after every render: re-find the focused element (the morph may have replaced it) and repaint hints */
  refresh() {
    const sc = this.scope(), items = this.items(sc);
    let el = null;
    const want = sc && this.mem[sc.name];
    if (want) el = items.find((x) => sigOf(x) === want) || null;
    if (!el) el = this.firstFor(sc, items);
    this.set(el, false, sc);
    this.os.paintHints(this.view, this);
  }
  firstFor(sc, items) {
    if (!sc || !items.length) return null;
    if (sc.name === 'lock') return items[0];
    if (sc.name.startsWith('home')) return items.find((x) => x.classList.contains('tile') || x.classList.contains('app-icon')) || items[0];
    // inside apps prefer the first thing in the content over nav-bar chrome
    return items.find((x) => !x.closest('.nav, .tabbar, .chat-h, .pgs, .seg')) || items[0];
  }
  set(el, scroll = true, sc = this.scope()) {
    if (this.el && this.el !== el) this.el.classList.remove('kf');
    if (el !== this.el) this.os.bump();
    this.el = el;
    if (!el) return;
    if (this.os.showFocus()) el.classList.add('kf');
    if (sc) this.mem[sc.name] = sigOf(el);
    if (scroll) this.reveal(el);
  }
  reveal(el) {
    const box = el.closest('[data-scroll]');
    if (!box) return;
    const r = el.getBoundingClientRect(), b = box.getBoundingClientRect(), k = b.height / box.clientHeight || 1;   // screen px per css px
    const pad = 16 * k;
    if (r.top < b.top + pad) box.scrollTop -= (b.top + pad - r.top) / k;
    else if (r.bottom > b.bottom - pad) box.scrollTop += (r.bottom - (b.bottom - pad)) / k;
  }
  /** move the highlight in a direction: nearest candidate in that half-plane, favouring alignment */
  move(dir) {
    const items = this.items();
    if (!items.length) return false;
    let cur = this.el && items.includes(this.el) ? this.el : null;
    if (!cur && this.el) { const sig = sigOf(this.el); cur = items.find((x) => sigOf(x) === sig) || null; }   // re-rendered by its app
    if (cur && cur.dataset.drag && (dir === 'up' || dir === 'down')) { this.os.nudge(cur.dataset.drag, dir === 'up' ? 0.1 : -0.1); return true; }
    // a slider: left / right moves it a twentieth of its range (as dragging it does: its input event); up / down leave it
    if (cur && cur.type === 'range' && (dir === 'left' || dir === 'right')) {
      const lo = Number(cur.min) || 0, hi = Number(cur.max) || 100;
      cur.value = String(Math.min(hi, Math.max(lo, Number(cur.value) + (dir === 'right' ? 1 : -1) * (hi - lo) / 20)));
      cur.dispatchEvent(new Event('input', { bubbles: true }));
      return true;
    }
    if (!cur) { this.set(this.firstFor(this.scope(), items)); this.os.paintHints(this.view, this); return true; }
    const a = cur.getBoundingClientRect(), ax = a.left + a.width / 2, ay = a.top + a.height / 2;
    const [dx, dy] = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] }[dir];
    let best = null, bestScore = Infinity;
    for (const el of items) {
      if (el === cur || el.contains(cur) || cur.contains(el)) continue;
      const r = el.getBoundingClientRect();
      const ex = dx > 0 ? r.left : dx < 0 ? r.right : r.left + r.width / 2;
      const ey = dy > 0 ? r.top : dy < 0 ? r.bottom : r.top + r.height / 2;
      const along = (ex - (dx ? (dx > 0 ? a.right : a.left) : ax)) * dx + (ey - (dy ? (dy > 0 ? a.bottom : a.top) : ay)) * dy;
      if (along < -2) continue;
      const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
      const across = dx ? Math.abs(cy - ay) : Math.abs(cx - ax);
      const overlap = dx ? (r.bottom > a.top && r.top < a.bottom) : (r.right > a.left && r.left < a.right);
      const score = Math.max(0, along) + across * (overlap ? 0.3 : 2.2);
      if (score < bestScore) { bestScore = score; best = el; }
    }
    if (!best) return this.os.edge(dir);
    this.set(best); this.os.paintHints(this.view, this);
    return true;
  }
  /** A / Enter: press (and release, for hold actions) the highlighted element */
  press(down) {
    let el = this.el;
    if (el && !el.isConnected) { this.refresh(); el = this.el; }      // its app re-rendered it: find it again
    if (!el || !el.isConnected) return false;
    if (el.dataset.hold) { this.os.hold(el, down); return true; }
    if (!down) return true;
    if (el.type === 'range') return true;   // nothing to press: left / right move it
    if (el.matches('input, textarea')) { el.focus({ preventScroll: true }); return true; }
    el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    return true;
  }
  /** mouse hover drives the same highlight (console layout) */
  hover(target) {
    const sc = this.scope();
    if (!sc) return;
    const el = target.closest(SEL);
    if (!el || el === this.el || !sc.el.contains(el) && el !== sc.el || el.closest('[data-nofocus]')) return;
    this.set(el, false, sc); this.os.paintHints(this.view, this);
  }
}
