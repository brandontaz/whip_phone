// Example: an app from another resource, in mount mode, with its own look. Preview only (html/dev is not shipped).
// In game this file would sit in that resource (listed in its files {}) and be registered from its client script:
//   exports.whip_phone:RegisterModule({ id = 'garage', script = 'html/app.js' })   -- ns = the resource name
// What it shows:
// - mount mode: the app renders itself with Preact + htm (any library works the same way). The phone hands it a box
//   and never touches what is inside; the box moves with the fold, so component state survives it;
// - its own style: a light theme with a serif face and its own mono font. The css is scoped by the phone, so even
//   the bare `button {}` below only reaches this app's buttons;
// - statusBar: 'dark' so the status bar reads on the light background;
// - an image, a web font and a canvas, which the fold animation's snapshots copy in;
// - plain <button>s: the controller reaches them without data-act.
// Data comes from its own callbacks (example_garage:cars / :toggle); the preview's mock answers them.
// The font is DM Mono (SIL OFL 1.1); the garage glyph is Boxicons' "garage" (MIT).
(() => {
  // a bundler would normally include the library; the preview loads it from a CDN
  const LIB = 'https://cdn.jsdelivr.net/npm/htm@3.1.1/preact/standalone.module.js';
  let lib = null;
  const load = () => lib || (lib = import(LIB));
  const GLYPH = '<svg viewBox="0 0 24 24" fill="currentColor"><path d="m21.55 8.17l-9-6c-.34-.22-.77-.22-1.11 0l-8.99 6c-.28.19-.45.5-.45.83v11c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V9c0-.33-.17-.65-.45-.83M16 16H8v-2h8zm-8 4v-2h8v2zm10 0v-6c0-1.1-.9-2-2-2H8c-1.1 0-2 .9-2 2v6H4V9.54l8-5.33l8 5.33V20z"/></svg>';
  const WHERE = { garage: 'In the garage', out: 'Out', impound: 'Impounded' };

  function makeApp({ html, useState, useEffect, useRef }) {
    function Gauge({ value }) {
      const ref = useRef(null);
      useEffect(() => {
        const c = ref.current, g = c.getContext('2d'), w = c.width, r = w / 2 - 7;
        g.clearRect(0, 0, w, w);
        g.lineWidth = 7; g.lineCap = 'round';
        g.strokeStyle = '#e5dfd2'; g.beginPath(); g.arc(w / 2, w / 2, r, Math.PI * 0.75, Math.PI * 2.25); g.stroke();
        g.strokeStyle = value < 15 ? '#d1462f' : value < 40 ? '#e0a21b' : '#2f8f5b';
        g.beginPath(); g.arc(w / 2, w / 2, r, Math.PI * 0.75, Math.PI * (0.75 + 1.5 * value / 100)); g.stroke();
        g.fillStyle = '#1c1a16'; g.font = '600 22px Georgia, serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
        g.fillText(String(value), w / 2, w / 2 + 2);
      }, [value]);
      return html`<canvas ref=${ref} width="88" height="88" aria-hidden="true"></canvas>`;
    }
    function Car({ app, car, busy, open, onOpen, onToggle }) {
      const label = car.state === 'garage' ? 'Take out' : car.state === 'out' ? 'Store' : 'Release';
      return html`<div class=${'car' + (open ? ' open' : '')}>
        <button class="pick" onClick=${onOpen} aria-label=${car.name}>
          <img src=${app.asset('car.svg')} style=${'--hue:' + car.hue + 'deg'} alt="" />
          <div class="info"><b>${car.name}</b><span class="plate">${car.plate}</span><span class=${'where s-' + car.state}>${WHERE[car.state]} · ${car.where}</span></div>
          <${Gauge} value=${car.fuel} />
        </button>
        ${open && html`<div class="more">
          <span>Fuel ${car.fuel}%</span>
          <button class=${car.state === 'garage' ? '' : 'alt'} disabled=${busy} onClick=${onToggle}>${busy ? '…' : label}</button>
        </div>`}
      </div>`;
    }
    return function Garage({ app, view }) {
      const [cars, setCars] = useState(null);
      const [open, setOpen] = useState(null);
      const [busy, setBusy] = useState(null);
      useEffect(() => { app.request('cars').then(setCars, (e) => { setCars([]); app.toast(e.reason || 'Could not load your cars'); }); }, []);
      const toggle = async (car) => {
        setBusy(car.plate);
        try {
          const r = await app.request('toggle', { plate: car.plate });
          setCars((list) => list.map((c) => (c.plate === r.plate ? r : c)));
          app.toast(r.state === 'out' ? `${r.name} is out front` : `${r.name} stored`);
        } catch (e) { app.toast(e.reason || 'Not now'); }
        setBusy(null);
      };
      const out = cars ? cars.filter((c) => c.state === 'out').length : 0;
      return html`<div class=${'garage ' + view.size}>
        <header><small>Los Santos</small><h1>Garage</h1><p>${cars ? `${cars.length} cars · ${out} out` : 'Loading…'}</p></header>
        <div class="list">${(cars || []).map((c) => html`<${Car} key=${c.plate} app=${app} car=${c} busy=${busy === c.plate}
          open=${open === c.plate} onOpen=${() => setOpen(open === c.plate ? null : c.plate)} onToggle=${() => toggle(c)} />`)}</div>
      </div>`;
    };
  }

  WhipPhone.module({
    id: 'garage', name: 'Garage', version: '1.0.0', order: 40, icon: GLYPH,
    statusBar: 'dark',
    css: `
@font-face{font-family:'Garage Mono';src:url(mono.woff2) format('woff2');font-weight:500}
*{box-sizing:border-box;margin:0}
:host{background:#f3efe6;color:#1c1a16}
.garage{position:absolute;inset:0;display:flex;flex-direction:column;padding:var(--safe-top) 0 var(--safe-bottom);font-family:Georgia,'Times New Roman',serif}
header{padding:2px 22px 10px}
header small{font:600 11px/1 system-ui,sans-serif;letter-spacing:2.5px;text-transform:uppercase;color:#9a8f7a}
h1{font-size:34px;font-weight:700;letter-spacing:-.8px;margin-top:4px}
header p{font-size:14px;color:#6f6656;margin-top:2px;font-style:italic}
.list{flex:1;min-height:0;overflow-y:auto;padding:4px 14px 18px;display:grid;gap:10px;align-content:start}
.tablet .list{grid-template-columns:1fr 1fr;padding:4px 26px 22px;gap:14px}
.car{background:#fff;border-radius:18px;box-shadow:0 1px 0 rgba(60,40,10,.06),0 8px 22px rgba(60,40,10,.08);overflow:hidden}
.pick{display:grid;grid-template-columns:92px 1fr 44px;gap:10px;align-items:center;width:100%;padding:10px 12px;text-align:left;border-radius:18px}
.pick img{width:92px;height:44px;object-fit:contain;filter:hue-rotate(var(--hue))}
.info{display:flex;flex-direction:column;gap:3px;min-width:0}
.info b{font-size:15.5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.plate{align-self:flex-start;font:500 11.5px/1 'Garage Mono',monospace;letter-spacing:1px;background:#ffd23f;color:#1c1a16;border-radius:4px;padding:3px 6px}
.where{font:12px/1.2 system-ui,sans-serif;color:#7d7362}
.s-out{color:#2f8f5b}
.s-impound{color:#d1462f}
canvas{width:44px;height:44px}
.more{display:flex;align-items:center;justify-content:space-between;padding:0 12px 12px 16px;font:13px system-ui,sans-serif;color:#6f6656;animation:drop .25s ease-out}
@keyframes drop{from{opacity:0;transform:translateY(-6px)}}
button{border:0;padding:0;background:none;color:inherit;font:inherit;border-radius:999px;cursor:pointer}
.more button{padding:9px 16px;font:600 13px system-ui,sans-serif;background:#1c1a16;color:#f3efe6}
.more button.alt{background:#e5dfd2;color:#1c1a16}
.more button:disabled{opacity:.6}
`,
    async mount(app, el, view) {
      this.el = el;
      const P = await load();
      if (this.el !== el) return;                                // closed again while the library loaded
      this.P = P; this.Garage = this.Garage || makeApp(P);
      P.render(P.html`<${this.Garage} app=${app} view=${view} />`, el);
    },
    update(app, el, view, changed) {                             // moved to the other display: re-render for its size
      if (changed && this.P && this.el === el) this.P.render(this.P.html`<${this.Garage} app=${app} view=${view} />`, el);
    },
    unmount(app, el) { this.el = null; if (this.P) this.P.render(null, el); },
  });
})();
