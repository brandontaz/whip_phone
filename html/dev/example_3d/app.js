// Example: a 3D app from another resource. Preview only (html/dev is not shipped); in game it would sit in that
// resource and be registered with exports.whip_phone:RegisterModule({ id = 'atlas', script = 'html/app.js' }).
// Atlas is a map of a made-up Los Santos County: a low-poly island drawn in code (no game assets), the player's
// position as a pulsing pin, places to fly to, and a waypoint request for the framework.
// What it shows:
// - three.js inside the phone's screen, in mount mode. `import('three')` gets the copy the phone page already has
//   (its import map), so the app ships no 3D library of its own;
// - drag to orbit, scroll to zoom, tap a pin; the controller moves through the chips, LB / RB step through places,
//   X recentres and B goes back to you;
// - the app's data: places / me / waypoint requests (example_atlas:*) and a `moved` push that walks the pin;
// - good manners: it stops drawing while the phone is put away (presence), draws at 30 fps when nothing moves,
//   resizes when it moves display (update), and frees the GPU on close (unmount).
(() => {
  const { esc } = window.WhipPhone.kit;
  const GLYPH = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linejoin="round" stroke-linecap="round"><path d="M3 6.5L9 4l6 2.5L21 4v13.5L15 20l-6-2.5L3 20z"/><path d="M9 4v13.5M15 6.5V20"/></svg>';
  const PIN = '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2.5a6.8 6.8 0 0 0-6.8 6.8c0 5.1 6.8 12.2 6.8 12.2s6.8-7.1 6.8-12.2A6.8 6.8 0 0 0 12 2.5zm0 9.4a2.6 2.6 0 1 1 0-5.2 2.6 2.6 0 0 1 0 5.2z"/></svg>';
  const AIM = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="6.5"/><circle cx="12" cy="12" r="1.6" fill="currentColor"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/></svg>';
  const KIND = { you: '#3b82f6', garage: '#f59e0b', bank: '#22c55e', medical: '#ef4444', landmark: '#a855f7', airport: '#94a3b8', town: '#ec4899', county: '#38bdf8' };
  const KIND_NAME = { garage: 'Garage', bank: 'Bank', medical: 'Hospital', landmark: 'Landmark', airport: 'Airport', town: 'Town' };

  // ---------------------------------------------------------------- the island (km; GTA x = east, y = north)
  const wave = (x, y) => Math.sin(x * 1.7 + Math.sin(y * 0.9)) * 0.5 + Math.sin(y * 1.3 + Math.sin(x * 1.1) * 1.4) * 0.5 +
    Math.sin((x + y) * 3.1) * 0.25 + Math.sin((x - y) * 5.3) * 0.12;
  const blob = (x, y, bx, by, r) => Math.exp(-((x - bx) ** 2 + (y - by) ** 2) / (r * r));
  const coastAt = (x, y) => {
    const cy = 1.9, d = Math.hypot((x - 0.3) / (y < cy ? 4.2 : 3.4), (y - cy) / 6.3);
    return 1 - d + wave(x * 0.8, y * 0.8) * 0.055;
  };
  const city = (x, y) => blob(x, y, -0.4, -1.3, 1.6);
  const desert = (x, y) => blob(x, y, 1.6, 3.5, 1.3);
  function heightAt(x, y) {
    const coast = coastAt(x, y);
    if (coast < 0) return -0.1 + coast * 0.5;
    let h = 0.03 + coast * 0.22 + blob(x, y, 0.45, 5.56, 1.05) * 1.3 + blob(x, y, -1.7, 4.7, 1.3) * 0.45 + blob(x, y, 2.5, 1.1, 1.3) * 0.6 +
      blob(x, y, -0.1, 1.3, 0.9) * 0.32 + blob(x, y, 3.1, 5.1, 1.0) * 0.38;
    h += wave(x * 1.7, y * 1.7) * 0.03 * (0.4 + h);
    h *= (1 - 0.88 * city(x, y)) * (1 - 0.6 * desert(x, y));
    h -= blob(x, y, 1.25, 4.25, 0.55) * 0.3;                         // a lake in the desert
    return Math.min(h, coast * 3);                                   // beaches run down to the sea
  }
  function colorAt(x, y, h) {
    if (h < 0.025) return '#d8c08b';
    if (h < 0.2 && city(x, y) > 0.42) return city(x, y) > 0.75 ? '#59606e' : '#6f7684';
    if (desert(x, y) > 0.38 && h < 0.4) return h < 0.12 ? '#cfab6c' : '#b98f57';
    if (h < 0.32) return (Math.sin(x * 9) + Math.sin(y * 11)) > 0.6 ? '#4f8a45' : '#5e9a4f';
    if (h < 0.78) return '#7c6b59';
    return '#eef2f6';
  }
  const pos = (THREE, gx, gy, lift = 0) => { const x = gx / 1000, y = gy / 1000; return new THREE.Vector3(x, Math.max(0, heightAt(x, y)) + lift, -y); };
  const dist = (a, b) => { const m = Math.hypot(a.x - b.x, a.y - b.y); return m < 1000 ? `${Math.round(m / 10) * 10} m` : `${(m / 1000).toFixed(1)} km`; };

  function seeded(n) { let s = n; return () => (s = (s * 16807) % 2147483647) / 2147483647; }

  function buildWorld(THREE) {
    const scene = new THREE.Scene();
    scene.fog = new THREE.Fog(0x1b2448, 9, 30);
    scene.add(new THREE.HemisphereLight(0xa8bfff, 0x3a2c1c, 1.15));
    const sun = new THREE.DirectionalLight(0xffe0b0, 2.4); sun.position.set(-6, 9, 5); scene.add(sun);
    const disposables = [];
    const keep = (...o) => { disposables.push(...o); return o[0]; };

    // terrain: one displaced grid, flat-shaded, coloured per vertex
    const W = 9.8, D = 13.2, cx = 0.3, cz = -1.85;
    const land = keep(new THREE.PlaneGeometry(W, D, 150, 200));
    land.rotateX(-Math.PI / 2); land.translate(cx, 0, cz);
    const p = land.attributes.position, cols = new Float32Array(p.count * 3), c = new THREE.Color();
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = -p.getZ(i), h = heightAt(x, y);
      p.setY(i, h);
      c.setStyle(colorAt(x, y, h)); cols.set([c.r, c.g, c.b], i * 3);
    }
    land.setAttribute('color', new THREE.BufferAttribute(cols, 3));
    land.computeVertexNormals();
    scene.add(new THREE.Mesh(land, keep(new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.95 }))));

    // sea, with a slow swell
    const sea = keep(new THREE.PlaneGeometry(40, 40, 60, 60));
    sea.rotateX(-Math.PI / 2); sea.translate(cx, 0, cz);
    const seaMesh = new THREE.Mesh(sea, keep(new THREE.MeshStandardMaterial({ color: 0x1d6a92, transparent: true, opacity: 0.84, roughness: 0.3, metalness: 0.15, flatShading: true })));
    scene.add(seaMesh);

    // the city: instanced blocks, towers downtown
    const rnd = seeded(7), blocks = [];
    for (let k = 0; k < 2600 && blocks.length < 460; k++) {
      const x = -2.1 + rnd() * 3.6, y = -2.9 + rnd() * 2.9, h = heightAt(x, y);
      if (h < 0.01 || h > 0.12 || city(x, y) < 0.45) continue;
      const down = blob(x, y, 0.1, -0.85, 0.45);
      blocks.push({ x, y, h, s: 0.05 + rnd() * 0.07, t: 0.03 + rnd() * 0.07 + down * (0.15 + rnd() * 0.45), down });
    }
    for (const [tx, ty, n] of [[1.85, 3.65, 26], [-0.15, 6.3, 22], [-1.35, -2.75, 14]]) {         // Sandy, Paleto, the airport
      for (let k = 0; k < n; k++) { const x = tx + (rnd() - 0.5) * 0.7, y = ty + (rnd() - 0.5) * 0.5, h = heightAt(x, y); if (h > 0.005) blocks.push({ x, y, h, s: 0.04 + rnd() * 0.05, t: 0.02 + rnd() * 0.03, down: 0 }); }
    }
    const box = keep(new THREE.BoxGeometry(1, 1, 1)); box.translate(0, 0.5, 0);
    const town = new THREE.InstancedMesh(box, keep(new THREE.MeshStandardMaterial({ roughness: 0.55, metalness: 0.1, flatShading: true })), blocks.length);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), at = new THREE.Vector3();
    blocks.forEach((b, i) => {
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), 0.32); sc.set(b.s, b.t, b.s); at.set(b.x, b.h, -b.y);
      town.setMatrixAt(i, m4.compose(at, q, sc));
      town.setColorAt(i, c.setStyle(b.down > 0.35 ? (rnd() > 0.5 ? '#8fb3e8' : '#c8d6ea') : ['#e4ddd0', '#cfc6b8', '#b8bfca', '#ddd5c9'][i % 4]));
    });
    scene.add(town);

    // the coast highway
    const ring = [];
    for (let i = 0; i < 90; i++) {
      const a = (i / 90) * Math.PI * 2, rx = Math.sin(a) < 0 ? 3.45 : 2.85;
      let x = 0.3 + Math.cos(a) * rx, y = 1.9 + Math.sin(a) * 5.15;
      for (let k = 0; k < 6 && coastAt(x, y) < 0.08; k++) { x = 0.3 + (x - 0.3) * 0.96; y = 1.9 + (y - 1.9) * 0.96; }
      ring.push(new THREE.Vector3(x, Math.max(0.01, heightAt(x, y)) + 0.012, -y));
    }
    const road = keep(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(ring, true), 600, 0.016, 5, true));
    scene.add(new THREE.Mesh(road, keep(new THREE.MeshStandardMaterial({ color: 0x2a2e38, roughness: 0.8 }))));

    // pins
    const stem = keep(new THREE.CylinderGeometry(0.007, 0.007, 0.32, 6)); stem.translate(0, 0.16, 0);
    const head = keep(new THREE.SphereGeometry(0.055, 16, 12)); head.translate(0, 0.35, 0);
    const ringGeo = keep(new THREE.RingGeometry(0.06, 0.085, 40)); ringGeo.rotateX(-Math.PI / 2);
    const pins = new Map();
    function pin(id, kind) {
      const g = new THREE.Group(), mat = keep(new THREE.MeshStandardMaterial({ color: KIND[kind] || '#ffffff', emissive: KIND[kind] || '#ffffff', emissiveIntensity: 0.35, roughness: 0.4 }));
      const h = new THREE.Mesh(head, mat); h.userData.id = id;
      g.add(new THREE.Mesh(stem, keep(new THREE.MeshStandardMaterial({ color: 0xe8ecf4 }))), h);
      const halo = new THREE.Mesh(ringGeo, keep(new THREE.MeshBasicMaterial({ color: KIND[kind] || '#ffffff', transparent: true, depthWrite: false })));
      halo.position.y = 0.006; g.add(halo);
      g.userData = { id, head: h, halo };
      scene.add(g); pins.set(id, g);
      return g;
    }
    return { scene, sea, pins, pin, dispose: () => disposables.forEach((d) => d.dispose && d.dispose()) };
  }

  // ---------------------------------------------------------------- the app
  WhipPhone.module({
    id: 'atlas', name: 'Atlas', version: '1.0.0', order: 45, icon: GLYPH, statusBar: 'light',
    css: `
*{box-sizing:border-box;margin:0}
:host{background:linear-gradient(180deg,#070b1a 0%,#121a3d 45%,#1e2a55 100%);color:#eef2ff}
.atlas{position:absolute;inset:0;font:14px/1.3 system-ui,'Segoe UI',sans-serif;overflow:hidden;user-select:none}
canvas{position:absolute;inset:0;width:100%;height:100%;display:block;touch-action:none;cursor:grab}
canvas.drag{cursor:grabbing}
.top{position:absolute;left:0;right:0;top:0;padding:calc(var(--safe-top) + 2px) 16px 0 20px;display:flex;align-items:flex-start;justify-content:space-between;pointer-events:none}
h1{font-size:30px;font-weight:800;letter-spacing:-.6px;text-shadow:0 2px 14px rgba(0,0,0,.55)}
.sub{font-size:12.5px;opacity:.72;margin-top:1px;text-shadow:0 1px 8px rgba(0,0,0,.6)}
button{border:0;font:inherit;color:inherit;cursor:pointer}
.round{pointer-events:auto;width:42px;height:42px;border-radius:50%;background:rgba(10,14,28,.8);display:grid;place-items:center;box-shadow:inset 0 0 0 1px rgba(255,255,255,.12)}
.round svg{width:21px;height:21px}
.bottom{position:absolute;left:0;right:0;bottom:0;padding:0 12px calc(var(--safe-bottom) + 10px);display:flex;flex-direction:column;gap:9px;pointer-events:none}
.chips{display:flex;gap:7px;overflow-x:auto;scrollbar-width:none;pointer-events:auto;padding:3px 2px}
.chips::-webkit-scrollbar{display:none}
.chip{flex:none;display:flex;align-items:center;gap:7px;height:34px;padding:0 13px 0 11px;border-radius:17px;background:rgba(10,14,28,.82);font-weight:600;font-size:13px;box-shadow:inset 0 0 0 1px rgba(255,255,255,.1)}
.chip i{width:9px;height:9px;border-radius:50%;background:var(--c)}
.chip.on{background:#fff;color:#0b1022}
.card{pointer-events:auto;background:rgba(10,14,28,.9);border-radius:20px;padding:13px 14px 13px 13px;display:grid;grid-template-columns:auto 1fr auto;gap:1px 12px;align-items:center;
  box-shadow:0 12px 30px rgba(0,0,0,.4),inset 0 0 0 1px rgba(255,255,255,.08)}
.dot{grid-row:span 2;width:40px;height:40px;border-radius:13px;background:var(--c);display:grid;place-items:center;color:#fff}
.dot svg{width:22px;height:22px}
.card b{grid-column:2;font-size:17px;letter-spacing:-.2px}
.card span{grid-column:2;font-size:12.5px;opacity:.68}
.go{grid-column:3;grid-row:1 / span 2;border-radius:999px;padding:10px 15px;background:#3b82f6;color:#fff;font-weight:700;font-size:13px}
.go.done{background:#22c55e}
.hint{position:absolute;left:50%;top:44%;transform:translate(-50%,-50%);padding:8px 14px;border-radius:14px;background:rgba(10,14,28,.7);font-size:12.5px;pointer-events:none;
  transition:opacity .6s;white-space:nowrap}
.hint.gone{opacity:0}
.tablet .bottom{right:auto;width:460px;padding-left:24px}
.tablet .top{padding-left:28px;padding-right:26px}
`,
    state: () => ({ places: null, me: null, sel: 'me', wp: null }),   // wp: the place the waypoint is on

    async mount(app, el, view) {
      this.el = el;
      const s = app.state;
      const [THREE, places, me] = await Promise.all([
        import('three'),
        s.places ? s.places : app.request('places').catch(() => []),
        s.me ? s.me : app.request('me').catch(() => ({ x: 0, y: 0, street: 'Unknown' })),
      ]);
      if (this.el !== el) return;                                    // closed again while loading
      s.places = places; s.me = me;
      this.v = makeView(THREE, app, el, view);
    },
    update(app, el, view, changed) { if (changed && this.v) this.v.resize(); },
    presence(app, now) { if (this.v) this.v.running = now.visible; },
    unmount() { this.el = null; if (this.v) { this.v.destroy(); this.v = null; } },
    back(app) { if (this.v && app.state.sel !== 'me') { this.v.select('me'); return true; } return false; },
    tab(app, dir) { if (this.v) this.v.cycle(dir); return true; },
    tabLabel: () => 'Place',
    x() { return this.v ? { label: 'Recenter', run: () => this.v.select('me') } : null; },
    on: {
      /** { x, y, street }: the player moved (the framework pushes this) */
      moved(app, d) { app.state.me = { ...app.state.me, ...d }; if (this.v) this.v.moved(); },
    },
  });

  function makeView(THREE, app, el, view) {
    const s = app.state;
    const world = buildWorld(THREE), { scene, sea, pins } = world;
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true, powerPreference: 'low-power' });
    renderer.setPixelRatio(1.5);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    const cam = new THREE.PerspectiveCamera(42, 1, 0.05, 60);
    el.innerHTML = `<div class="atlas"><div class="top"><div><h1>Atlas</h1><div class="sub"></div></div>
      <button class="round" data-hint="Recenter" aria-label="Recenter">${AIM}</button></div>
      <div class="bottom"><div class="chips"></div><div class="card"></div></div><div class="hint">Drag to look around · scroll to zoom</div></div>`;
    const root = el.firstChild, canvas = renderer.domElement;
    root.prepend(canvas);
    const $ = (sel) => root.querySelector(sel);

    // places: you, the county, then the framework's list
    const all = () => [{ id: 'me', name: 'You', kind: 'you', x: s.me.x, y: s.me.y }, { id: 'county', name: 'County', kind: 'county' }, ...s.places];
    const you = world.pin('me', 'you');
    for (const p of s.places) world.pin(p.id, p.kind).position.copy(pos(THREE, p.x, p.y));
    const meAt = pos(THREE, s.me.x, s.me.y), meGoal = meAt.clone();
    you.position.copy(meAt);

    // camera: orbits a target; flying = easing target and distance toward a goal
    const rig = { theta: 0.5, phi: 0.92, dist: 5.2, target: meAt.clone() };
    const goal = { dist: 5.2, target: meAt.clone(), follow: true };
    const v = { running: true, busyUntil: performance.now() + 2500, idleAt: 0 };
    const busy = (ms = 1500) => { v.busyUntil = Math.max(v.busyUntil, performance.now() + ms); };

    function resize() {
      const w = el.clientWidth, h = el.clientHeight;
      if (!w || !h) return;
      renderer.setSize(w, h, false); cam.aspect = w / h; cam.updateProjectionMatrix(); busy(400);
    }
    function paint() {
      const sel = s.sel, list = all(), p = list.find((x) => x.id === sel) || list[0];
      $('.sub').textContent = `${s.me.street || 'Los Santos'} · Los Santos County`;
      $('.chips').innerHTML = list.map((x) => `<button class="chip${x.id === sel ? ' on' : ''}" data-id="${esc(x.id)}" data-hint="Show" style="--c:${KIND[x.kind] || '#fff'}"><i></i>${esc(x.name)}</button>`).join('');
      const sub = p.id === 'me' ? `${s.me.street || 'Somewhere'} · live` : p.id === 'county' ? `${s.places.length} places on the map` : `${KIND_NAME[p.kind] || 'Place'} · ${dist(s.me, p)} away`;
      $('.card').style.setProperty('--c', KIND[p.kind] || '#fff');
      $('.card').innerHTML = `<div class="dot">${p.id === 'county' ? GLYPH : PIN}</div><b>${esc(p.id === 'me' ? 'You are here' : p.name)}</b>` +
        (p.id === 'me' || p.id === 'county' ? '' : s.wp === p.id ? `<button class="go done" data-id="${esc(p.id)}" data-hint="Waypoint">Waypoint set</button>`
          : `<button class="go" data-id="${esc(p.id)}" data-hint="Waypoint">Set waypoint</button>`) + `<span>${esc(sub)}</span>`;
    }
    function select(id) {
      s.sel = id;
      const p = all().find((x) => x.id === id);
      if (id === 'county') { goal.target.set(0.3, 0.2, -2.1); goal.dist = 14.5; goal.follow = false; }
      else if (id === 'me' || !p) { goal.target.copy(meGoal); goal.dist = 5.2; goal.follow = true; s.sel = 'me'; }
      else { goal.target.copy(pos(THREE, p.x, p.y, 0.1)); goal.dist = 2.8; goal.follow = false; }
      for (const [pid, g] of pins) g.scale.setScalar(pid === s.sel ? 1.45 : 1);
      busy(2600); paint();
    }
    function cycle(dir) {
      const ids = all().map((x) => x.id), i = ids.indexOf(s.sel);
      select(ids[(i + dir + ids.length) % ids.length]);
    }
    function moved() { meGoal.copy(pos(THREE, s.me.x, s.me.y)); if (goal.follow) goal.target.copy(meGoal); busy(1800); paint(); }

    // input: drag to orbit, wheel to zoom, tap a pin
    let drag = null;
    const top = new THREE.Vector3();
    /** the pin nearest a tap, within a finger's reach (pins are small when zoomed out, so no exact ray hit needed) */
    function pinAt(lx, ly) {
      let best = null, bd = 24;
      for (const [id, g] of pins) {
        top.set(0, 0.35, 0).applyMatrix4(g.userData.head.matrixWorld).project(cam);
        if (top.z > 1) continue;                                       // behind the camera
        const d = Math.hypot((top.x + 1) / 2 * canvas.clientWidth - lx, (1 - top.y) / 2 * canvas.clientHeight - ly);
        if (d < bd) { bd = d; best = id; }
      }
      return best;
    }
    canvas.addEventListener('pointerdown', (e) => { drag = { x: e.clientX, y: e.clientY, moved: 0 }; canvas.setPointerCapture(e.pointerId); canvas.classList.add('drag'); $('.hint').classList.add('gone'); });
    canvas.addEventListener('pointermove', (e) => {
      if (!drag) return;
      const dx = e.clientX - drag.x, dy = e.clientY - drag.y; drag.x = e.clientX; drag.y = e.clientY; drag.moved += Math.abs(dx) + Math.abs(dy);
      rig.theta -= dx * 0.008; rig.phi = Math.min(1.38, Math.max(0.3, rig.phi - dy * 0.006)); v.idleAt = performance.now() + 4000; busy(800);
    });
    canvas.addEventListener('pointerup', (e) => {
      canvas.classList.remove('drag');
      if (drag && drag.moved < 6) { const id = pinAt(e.offsetX, e.offsetY); if (id) select(id); }   // a tap: on a pin?
      drag = null;
    });
    canvas.addEventListener('wheel', (e) => { e.preventDefault(); goal.dist = Math.min(16, Math.max(1.6, goal.dist * Math.exp(e.deltaY * 0.0012))); busy(900); }, { passive: false });
    root.addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      if (b.classList.contains('round')) select('me');
      else if (b.classList.contains('chip')) select(b.dataset.id);
      else if (b.classList.contains('go')) {
        const p = s.places.find((x) => x.id === b.dataset.id);
        app.request('waypoint', { id: p.id }).then(() => { s.wp = p.id; app.toast(`Waypoint set: ${p.name}`); paint(); },
          (err) => app.toast(err.reason || 'Could not set the waypoint'));
      }
    });
    setTimeout(() => { const h = $('.hint'); if (h) h.classList.add('gone'); }, 3500);

    // the loop: 60 fps while something moves, 30 when idle, nothing while the phone is put away
    const sp = sea.attributes.position, base = Float32Array.from(sp.array);
    let raf = 0, last = 0;
    const frame = (t) => {
      raf = requestAnimationFrame(frame);
      if (!v.running) { last = 0; return; }
      if (t > v.busyUntil && t - last < 32) return;
      const dt = last ? Math.min(0.1, (t - last) / 1000) : 1 / 60, sec = t / 1000; last = t;
      const k = 1 - Math.exp(-dt * 3.2);
      rig.target.lerp(goal.target, k); rig.dist += (goal.dist - rig.dist) * k;
      if (t > v.idleAt && !drag) rig.theta += dt * 0.05;                // a slow drift when nobody is touching it
      you.position.lerp(meGoal, k);
      const r = rig.dist, sin = Math.sin(rig.phi);
      cam.position.set(rig.target.x + r * sin * Math.sin(rig.theta), rig.target.y + r * Math.cos(rig.phi), rig.target.z + r * sin * Math.cos(rig.theta));
      cam.lookAt(rig.target);
      for (let i = 0; i < sp.count; i++) { const x = base[i * 3], z = base[i * 3 + 2]; sp.setY(i, Math.sin(x * 2.1 + sec * 1.3) * 0.012 + Math.sin(z * 2.7 - sec * 1.1) * 0.009); }
      sp.needsUpdate = true;
      const ph = (sec % 2) / 2, halo = you.userData.halo;                // the "you" pulse
      halo.scale.setScalar(1 + ph * 3.2); halo.material.opacity = 1 - ph;
      for (const [id, g] of pins) if (id !== 'me') g.userData.halo.material.opacity = id === s.sel ? 0.6 + Math.sin(sec * 4) * 0.3 : 0;
      renderer.render(scene, cam);
    };
    resize(); paint(); select(s.sel || 'me');
    raf = requestAnimationFrame(frame);

    return {
      get running() { return v.running; }, set running(on) { v.running = on; if (on) busy(400); },
      resize, select, cycle, moved,
      destroy() { cancelAnimationFrame(raf); world.dispose(); renderer.dispose(); el.innerHTML = ''; },
    };
  }
})();
