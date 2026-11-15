// Duo viewer: the Blender-built book-fold phone in three.js. Folded it sits in the bottom-right corner as a phone (cover
// display); unfolding swings it to the middle of the screen as a tablet (inner display). At rest the live WhipOS DOM is
// laid exactly over the display with a CSS homography; while folding, snapshots of the OS run through the screen effect.
// Presence (2026-10-07): hide() slides the folded phone down out of view in the bottom-right; while hidden,
// setPeek(n) raises it just enough to show its n notifications; show('phone' | 'tablet') brings it back, and
// hidden -> tablet rises and unfolds to the middle in one move. onArea(area | null) says where it is going each time
// that changes (#area), so whip's HUD can move out of its way.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { ScreenFX, screenMaterial } from './wipe.js';
import { layerFrame, DEPTH } from './wallpaper.js';
import { rasterize } from './snapshot.js';
import { SIZE } from './os.js';

// geometry constants from duo_build.py (Blender units = metres; glTF: x same, Blender z -> y, Blender y -> -z)
const W = 0.084, H = 0.120, T = 0.0046, B_IN = 0.0026, B_COV = 0.0028, B_COV_H = 0.0040, R_SCR = 0.0092, SZ = 0.00004;
const XI = W - B_IN, ZI = H / 2 - B_IN, ZC = H / 2 - B_COV, X_FAR = -(W - B_COV), X_NEAR = -B_COV_H;
const FX_SIZE = {   // offscreen target px = OS logical size x2; corner radii for u < 0.5 / u >= 0.5
  tablet: [SIZE.tablet[0] * 2, SIZE.tablet[1] * 2, R_SCR / (2 * ZI) * SIZE.tablet[1] * 2, R_SCR / (2 * ZI) * SIZE.tablet[1] * 2],
  phone: [SIZE.phone[0] * 2, SIZE.phone[1] * 2, 0.6 * R_SCR / (2 * ZC) * SIZE.phone[1] * 2, R_SCR / (2 * ZC) * SIZE.phone[1] * 2],
};
const FOV = 18, CAM_Z = 1.2;
const TILT_YAW = 0.045, TILT_PITCH = 0.035;   // radians (~2.6 / ~2 deg): the phone turns a touch toward the mouse / highlight

const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = (x, a, b) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const ease = (t) => 1 - Math.pow(1 - t, 3);   // cubic ease-out: full speed on the first frame, settles into the end
const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

// 2D projective transform taking the w x h element rectangle onto 4 screen points (TL, TR, BR, BL) -> CSS matrix3d
function adj(m) { return [m[4] * m[8] - m[5] * m[7], m[2] * m[7] - m[1] * m[8], m[1] * m[5] - m[2] * m[4], m[5] * m[6] - m[3] * m[8], m[0] * m[8] - m[2] * m[6], m[2] * m[3] - m[0] * m[5], m[3] * m[7] - m[4] * m[6], m[1] * m[6] - m[0] * m[7], m[0] * m[4] - m[1] * m[3]]; }
function mulmm(a, b) { const c = []; for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) c[3 * i + j] = a[3 * i] * b[j] + a[3 * i + 1] * b[3 + j] + a[3 * i + 2] * b[6 + j]; return c; }
function basis(p) {
  const m = [p[0][0], p[1][0], p[2][0], p[0][1], p[1][1], p[2][1], 1, 1, 1], a = adj(m), x = p[3][0], y = p[3][1];
  const v = [a[0] * x + a[1] * y + a[2], a[3] * x + a[4] * y + a[5], a[6] * x + a[7] * y + a[8]];
  return mulmm(m, [v[0], 0, 0, 0, v[1], 0, 0, 0, v[2]]);
}
function homography(w, h, dst) {
  const t = mulmm(basis(dst), adj(basis([[0, 0], [w, 0], [w, h], [0, h]])));
  for (let i = 0; i < 9; i++) t[i] /= t[8];
  if (Math.abs(t[6]) < 1e-9 && Math.abs(t[7]) < 1e-9) return `matrix(${t[0]},${t[3]},${t[1]},${t[4]},${t[2]},${t[5]})`;
  return `matrix3d(${t[0]},${t[3]},0,${t[6]},${t[1]},${t[4]},0,${t[7]},0,0,1,0,${t[2]},${t[5]},0,${t[8]})`;
}

export class DuoViewer {
  constructor({ canvas, os, glb, onChange, onArea = null, topBar = null, hidden = false, phoneScale = 0.56 }) {
    this.canvas = canvas; this.os = os; this.onChange = onChange; this.onArea = onArea; this.topBar = topBar;
    this.aim = 0;   // the fold last asked for (0 phone, 1 tablet): where it is going, for #area
    this.inner = 'tablet'; this.wobble = 1;   // inner: 'tablet' (landscape) or 'tabletP' (rolled upright on portrait screens)
    this.o = 0; this.anim = null; this.scrubbing = false; this.scrubTo = null; this.capturing = false; this.settled = null;
    this.dirty = true; this.fxDirty = true; this.slow = 1; this.capStamp = -1; this.capPromise = null;
    this.tilt = { x: 0, y: 0 }; this.pointerN = null; this.tiltAmount = 1; this.lastFrame = performance.now();
    this.hidden = !!hidden; this.peekN = 0; this.lift = 0; this.liftAnim = null;   // lift: px the device sits below its spot
    this.phoneScale = phoneScale;                                                  // folded phone height as a share of the screen
    if (this.hidden) os.setHidden(true);                                           // in game the phone starts put away
    const r = this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, premultipliedAlpha: true });
    r.setPixelRatio(Math.min(devicePixelRatio, 2));
    r.outputColorSpace = THREE.SRGBColorSpace; r.toneMapping = THREE.ACESFilmicToneMapping; r.toneMappingExposure = 1.05;
    r.setClearColor(0x000000, 0);
    this.scene = new THREE.Scene();
    const pm = new THREE.PMREMGenerator(r);
    this.env = pm.fromScene(new RoomEnvironment(), 0.04).texture; pm.dispose();
    this.scene.environment = this.env; this.scene.environmentIntensity = 0.62;
    const key = new THREE.DirectionalLight(0xffffff, 1.5); key.position.set(-0.5, 0.9, 1); this.scene.add(key);
    const rim = new THREE.DirectionalLight(0xcfe0ff, 0.9); rim.position.set(0.8, -0.3, 0.4); this.scene.add(rim);
    this.camera = new THREE.PerspectiveCamera(FOV, 1, 0.05, 10); this.camera.position.set(0, 0, CAM_Z);
    this.place = new THREE.Group(); this.scene.add(this.place);       // screen position / scale / wobble
    this.pivot = new THREE.Group(); this.place.add(this.pivot);       // keeps the device centred while it folds
    // soft drop shadow behind the device
    const sc = document.createElement('canvas'); sc.width = sc.height = 128;
    const g = sc.getContext('2d'), gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    gr.addColorStop(0, 'rgba(0,0,0,0.5)'); gr.addColorStop(0.55, 'rgba(0,0,0,0.22)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
    this.shadow = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(sc), transparent: true, depthWrite: false, toneMapped: false }));
    this.shadow.position.z = -0.03; this.shadow.renderOrder = -1; this.place.add(this.shadow);

    this.fx = new ScreenFX(r, FX_SIZE);
    this.wpTex = {};
    this.ui = {};
    for (const key of ['phone', 'tablet', 'tabletP']) {
      this.ui[key] = {};
      for (const k of ['behind', 'front']) {
        const cv = document.createElement('canvas'); cv.width = SIZE[key][0]; cv.height = SIZE[key][1];   // sized per capture
        const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace; tex.premultiplyAlpha = true;
        this.ui[key][k] = { cv, tex, ok: false };
      }
    }
    this.view = { w: 1, h: 1 };
    new ResizeObserver(() => this.#resize()).observe(canvas);
    this.ready = this.#load(glb);
    this.#frame(performance.now());   // starts the loop even in a background tab (rAF would wait for it to show)
  }

  async #load(src) {   // src: URL, or the .glb as an ArrayBuffer (embedded build)
    const loader = new GLTFLoader();
    const gltf = typeof src === 'string' ? await loader.loadAsync(src) : await loader.parseAsync(src, '');
    const root = gltf.scene; this.pivot.add(root);
    this.cover = root.getObjectByName('CoverHalf'); this.main = root.getObjectByName('MainHalf'); this.hinge = root.getObjectByName('Hinge');
    if (!this.cover || !this.main || !this.hinge) throw new Error('duo.glb is missing CoverHalf / MainHalf / Hinge');
    this.matInner = screenMaterial(this.fx.texture('tablet'), true, this.env);
    this.matCover = screenMaterial(this.fx.texture('phone'), false, this.env);
    const flipV = (geo) => { const uv = geo.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setY(i, 1 - uv.getY(i)); uv.needsUpdate = true; };
    for (const [name, mat] of [['screen_inner_L', this.matInner], ['screen_inner_R', this.matInner], ['screen_cover', this.matCover]]) {
      const m = root.getObjectByName(name);
      if (!m || !m.isMesh) throw new Error(`duo.glb: ${name} not found`);
      flipV(m.geometry); m.material = mat;
    }
    root.traverse((o) => { if (o.isMesh) o.frustumCulled = false; });
    this.setWallpaper(this.os.wp);
    this.#resize();
    this.#apply();
    this.capturing = true;
    await this.capture();
    this.capturing = false;
    this.renderer.compile(this.scene, this.camera);
  }

  // ---- public
  setWallpaper(wp) {
    this.wake();
    for (const k of ['sky', 'mountain', 'dune']) {
      this.wpTex[k]?.dispose();
      const t = new THREE.CanvasTexture(wp[k]);
      t.colorSpace = THREE.SRGBColorSpace; t.premultiplyAlpha = true; t.anisotropy = 8;
      this.wpTex[k] = t;
    }
    this.fxDirty = this.dirty = true;
  }
  /** snapshot resolution for a display: about its size on screen (with room for the lean), 1x to 2x in quarter steps.
   *  More only costs time and texture memory: the snapshots are only seen during a fold. */
  #snapScale(key) {
    const hp = this.#base(key === 'phone' ? 0 : 1).hp;                                  // device height on screen (px)
    const perCss = hp * (2 * (key === 'phone' ? ZC : ZI) / H) / SIZE[key === 'phone' ? 'phone' : 'tablet'][1];
    return Math.min(2, Math.max(1, Math.ceil(perCss * devicePixelRatio * 1.15 * 4) / 4));
  }
  /** Rasterise both OS views (front UI and, on the lock screen, the clock behind the mountains) into the screen textures. */
  async capture() {
    this.os.renderNow(true);
    const stamp = this.os.stamp, t0 = performance.now(), jobs = [];
    for (const key of ['phone', this.inner]) {
      const L = this.os.layers(key), [w, h] = SIZE[key], scale = this.#snapScale(key);
      const shot = async (k) => {
        const u = this.ui[key][k];
        if (k === 'behind' && !L.behindOn) { u.ok = false; return; }
        if (u.scale !== scale) { if (u.scale) u.tex.dispose(); u.scale = scale; }   // a new size needs a new GPU texture
        const cv = await rasterize({ shell: L.shell, layer: L[k], css: this.os.css, width: w, height: h, scale, into: u.cv });
        u.ok = !!cv; if (cv) u.tex.needsUpdate = true;
      };
      jobs.push(shot('front'), shot('behind'));
    }
    await Promise.all(jobs);
    this.lastCaptureMs = performance.now() - t0;
    this.capStamp = stamp;
    this.fxDirty = this.dirty = true; this.wake();
  }
  /** snapshots match the screen? (they are refreshed while idle, so a fold usually starts on the very next frame) */
  async #fresh() {
    if (this.capPromise) await this.capPromise;
    this.os.renderNow();
    if (this.capStamp !== this.os.stamp || this.os.stale || this.os.liveMedia?.()) await this.capture();   // canvases change unseen
  }
  get mode() { return this.settled; }
  /** re-run the layout after a size option changed (phoneScale) */
  relayout() { this.#resize(); }
  /** 'hidden' | 'peek' | 'phone' | 'tablet' | null (moving) */
  get state() { return this.hidden ? (this.peekN ? 'peek' : 'hidden') : this.settled ? (this.settled === 'phone' ? 'phone' : 'tablet') : null; }
  async toggle() { return this.hidden ? this.show('phone') : this.goTo(this.o < 0.5 ? 1 : 0); }
  /** put the phone away: folds if open, and slides down out of sight in the bottom-right (notifications peek from there) */
  async hide() {
    this.wake();
    if (this.hidden) return;
    this.hidden = true; this.os.setHidden(true); this.#emit(); this.#reportArea();
    if (this.o > 0) { await this.#fold(0); if (this.anim) return this.#liftTo(this.#liftTarget(), this.anim.dur, this.anim.t0); }
    this.#liftTo(this.#liftTarget(), 420 * this.slow);
  }
  /** bring the phone back as the phone (cover display) or straight into tablet mode: from hidden it rises and unfolds at once */
  async show(target = 'phone') {
    this.wake();
    const was = this.hidden;
    this.hidden = false; this.os.setHidden(false); this.#emit();
    const to = target === 'tablet' ? 1 : 0;
    this.aim = to; this.#reportArea();
    if (to !== this.o) { await this.#fold(to, was ? 0.8 : 0.65); if (this.anim) return this.#liftTo(0, this.anim.dur, this.anim.t0); }
    this.#liftTo(0, 520 * this.slow);
  }
  /** n notifications are up: a hidden phone rises just enough to show them (0: back out of sight) */
  setPeek(n) {
    this.wake();
    this.peekN = n; this.#emit(); this.#reportArea();
    if (this.hidden && !this.anim) this.#liftTo(this.#liftTarget(), 460 * this.slow);
  }
  async goTo(target, seconds = 0.65) {
    this.wake();
    if (this.hidden) { this.hidden = false; this.os.setHidden(false); this.#emit(); await this.#fold(target, seconds); return this.#liftTo(0, this.anim ? this.anim.dur : 520, this.anim?.t0); }
    return this.#fold(target, seconds);
  }
  async #fold(target, seconds = 0.65) {
    if (this.capturing) return;
    target = clamp(target, 0, 1);
    if (!this.hidden) { this.aim = target; this.#reportArea(); }
    if (target === this.o && !this.scrubbing) return;
    await this.#leaveRest();
    this.anim = { from: this.o, to: target, t0: performance.now(), dur: Math.max(250, seconds * 1000 * this.slow * Math.max(0.35, Math.abs(target - this.o))) };
  }
  async scrubStart() {
    this.wake();
    if (this.hidden) { this.hidden = false; this.os.setHidden(false); this.#liftTo(0, 400); this.#emit(); }
    this.scrubbing = true; this.anim = null; this.scrubTo = this.o; await this.#leaveRest();
  }
  scrub(o) { if (!this.scrubbing) this.scrubStart(); this.scrubTo = clamp(o, 0, 1); }
  scrubEnd() { this.scrubbing = false; }
  /** mouse position (client px): the phone leans toward it. Touch has no hover, so it doesn't tilt. */
  pointer(x, y, type) {
    if (type === 'touch' || !this.cover) { this.pointerN = null; return; }
    const { cx, cy, hp } = this.#layout(this.o);
    const rolled = this.inner === 'tabletP' && this.o > 0.5;
    let hw = (hp * lerp(W, 2 * W, this.o) / H) / 2, hh = hp / 2;
    if (rolled) [hw, hh] = [hh, hw];
    this.pointerN = { x: clamp((x - cx) / hw, -1, 1), y: clamp((y - cy) / hh, -1, 1) };
  }
  pointerLeave() { this.pointerN = null; }

  // ---- internals
  #emit() { this.onChange?.(this.o, this.state); }
  /** WHERE THE DEVICE WILL SIT once still, as fractions of the screen ({ left, top, right, bottom }), or null when it
   *  is out of sight: the phone in its corner, its notifications peeking up from the bottom edge, or the tablet. The
   *  page hands it to Lua, and whip_core's HUD makes room for it (its vehicle dial moves up or left: SetScreenArea, Josh
   *  7 Nov 2026). Reported when it changes, not per frame, as the move starts: the HUD eases over in step. */
  #area() {
    if (this.hidden && !this.peekN) return null;
    const { w, h } = this.view, o = this.hidden ? 0 : this.aim;
    const b = this.#base(o), cy = b.cy + this.#liftTarget();
    let hw = (b.hp * lerp(W, 2 * W, o) / H) / 2, hh = b.hp / 2;
    if (this.inner === 'tabletP' && o > 0.5) [hw, hh] = [hh, hw];   // rolled upright
    const f = (v, of) => Math.round(clamp(v / of, 0, 1) * 10000) / 10000;
    const a = { left: f(b.cx - hw, w), top: f(cy - hh, h), right: f(b.cx + hw, w), bottom: f(cy + hh, h) };
    return a.right > a.left && a.bottom > a.top ? a : null;
  }
  #reportArea() { this.onArea?.(this.#area()); }
  /** lift for the current presence: 0 when shown; when hidden, the device top just under the bottom edge, or raised so
   *  the cover display shows down to just under its last notification (mapped through the display's on-screen scale) */
  #liftTarget() {
    if (!this.hidden) return 0;
    const { cy, hp } = this.#base(0), { h } = this.view, top = cy - hp / 2;
    if (this.peekN > 0) {
      const scale = hp * (2 * ZC / H) / SIZE.phone[1], dispTop = top + hp * (H / 2 - ZC) / H;
      return h - 4 - dispTop - this.os.peekHeight(this.peekN) * scale;
    }
    return h + 0.12 * hp + 24 - top;   // clear of the edge, drop shadow included
  }
  #liftTo(to, dur, t0 = performance.now()) {
    if (Math.abs(to - this.lift) < 0.5 && !this.liftAnim) { this.lift = to; return; }
    this.liftAnim = { from: this.lift, to, t0, dur: Math.max(1, dur), down: to > this.lift && !this.anim };
  }
  async #leaveRest() {
    if (!this.settled) return;
    this.capturing = true;
    this.os.endBoot?.();   // never fold with the boot logo in the snapshot
    this.os.activeKey = null;  // no navigation while folding
    await this.#fresh();
    this.settled = null;
    for (const host of Object.values(this.os.hosts)) { host.style.transition = 'none'; host.style.visibility = 'hidden'; host.style.opacity = '0'; host.style.pointerEvents = 'none'; }
    document.activeElement?.blur?.();
    this.capturing = false;
    this.onChange?.(this.o, null);
  }
  #settle() {
    const key = this.o >= 1 ? this.inner : 'phone';
    this.settled = key; this.os.setMode(key === 'phone' ? 'phone' : 'tablet', key); this.os.renderNow();
    if (this.hidden && !this.liftAnim) this.#liftTo(this.#liftTarget(), 460 * this.slow);   // a peek changed mid-fold
    this.#placeOverlay();
    const host = this.os.hosts[key];
    host.style.visibility = 'visible'; host.style.pointerEvents = 'auto';
    setTimeout(() => { host.style.transition = 'opacity .14s ease-out'; host.style.opacity = '1'; }, 16);
    this.#emit();
  }
  #placeOverlay() {
    if (!this.settled) return;
    const key = this.settled, [w, h] = SIZE[key], k = this.os.views[key].scale;
    this.os.hosts[key].style.transform = homography(w * k, h * k, this.#corners(key));
  }
  #corners(key) {
    // display corners as the viewer sees them: TL, TR, BR, BL of the OS page
    let pts;
    if (key === 'phone') pts = [[this.cover, X_NEAR, ZC], [this.cover, X_FAR, ZC], [this.cover, X_FAR, -ZC], [this.cover, X_NEAR, -ZC]].map(([n, x, y]) => [n, x, y, -(T + SZ)]);
    else {
      const A = [this.cover, -XI, ZI, SZ], B = [this.main, XI, ZI, SZ], C = [this.main, XI, -ZI, SZ], D = [this.cover, -XI, -ZI, SZ];
      pts = key === 'tablet' ? [A, B, C, D] : [D, A, B, C];   // rolled 90 deg clockwise: the bottom-left corner is now top-left
    }
    this.scene.updateMatrixWorld(true);
    const v = new THREE.Vector3(), { w, h } = this.view;
    return pts.map(([n, x, y, z]) => { v.set(x, y, z).applyMatrix4(n.matrixWorld).project(this.camera); return [(v.x + 1) / 2 * w, (1 - v.y) / 2 * h]; });
  }
  #layout(o) { const b = this.#base(o); b.cy += this.lift; return b; }
  #base(o) {
    // phone: bottom-right corner; tablet: centred under the top bar (rolled upright on portrait screens). Device height in CSS px.
    const { w, h } = this.view, m = Math.max(16, 0.04 * Math.min(w, h)), top = this.topBar ? this.topBar.offsetHeight : 0;
    const ph = clamp(this.phoneScale * h, 240, 900), pw = Math.min(ph * (W / H), w - 2 * m), phs = pw * (H / W);
    const area = h - top;
    const th = this.inner === 'tabletP'
      ? Math.min(0.94 * w, 0.88 * area * (H / (2 * W)))           // rolled: device height H spans the screen width
      : Math.min(0.86 * area, 0.9 * w / (2 * W / H));
    const t = o;   // the slide rides the fold's own ease-out
    return { cx: lerp(w - m - pw / 2, w / 2, t), cy: lerp(h - m - phs / 2, top + area / 2, t), hp: lerp(phs, th, t) };
  }
  #apply() {
    if (!this.cover) return;
    const o = this.o, phi = (1 - o) * Math.PI;
    this.cover.rotation.set(0, phi, 0);
    this.hinge.rotation.set(0, phi / 2, 0);
    this.pivot.position.x = -(W / 2) * (1 - o);
    const { cx, cy, hp } = this.#layout(o), { w, h } = this.view;
    const wpp = (2 * CAM_Z * Math.tan(THREE.MathUtils.degToRad(FOV / 2))) / h;   // world units per px at z = 0
    // lens shift instead of moving the phone off-axis: it is always seen dead-on (no side showing in the corner),
    // the projection centre just moves to where the phone sits on screen
    this.place.position.set(0, 0, 0);
    this.camera.setViewOffset(w, h, w / 2 - cx, h / 2 - cy, w, h);
    this.place.scale.setScalar((hp * wpp) / H);
    const wob = Math.sin(Math.PI * o) * this.wobble;
    const roll = this.inner === 'tabletP' ? -(Math.PI / 2) * smooth(o, 0.2, 0.95) : 0;
    const tx = this.tilt.x * TILT_YAW * this.tiltAmount, ty = this.tilt.y * TILT_PITCH * this.tiltAmount;   // face turns toward the target
    this.place.rotation.set(-0.16 * wob + ty, -0.42 * wob + tx, 0.02 * wob + roll);
    this.shadow.scale.set(lerp(W, 2 * W, o) * 1.45, H * 1.32, 1);
    this.shadow.position.set(0, -0.006, -0.03);
    this.matInner.userData.uniforms.progress.value = 1 - o;
    this.matCover.userData.uniforms.progress.value = 1 - o;
    this.matInner.emissiveIntensity = lerp(0.25, 1, smooth(o, 0.02, 0.3));
  }
  #renderFX() {
    const o = this.o, shut = 1 - o;
    for (const [pass, key] of [['phone', 'phone'], ['tablet', this.inner]]) {
      const frames = { sky: layerFrame(key, DEPTH.sky, o), mountain: layerFrame(key, DEPTH.mountain, o), dune: layerFrame(key, DEPTH.dune, o) };
      const u = this.ui[key];
      const amount = pass === 'tablet' ? shut : Math.max(0, 1 - 2 * Math.abs(shut - 0.5)) / 2;
      this.fx.render(pass, this.wpTex, frames, { behind: u.behind.ok ? u.behind.tex : null, front: u.front.ok ? u.front.tex : null }, amount, key === 'tabletP' ? 1 : 0);
    }
  }
  #resize() {
    const w = this.canvas.clientWidth || innerWidth, h = this.canvas.clientHeight || innerHeight;
    this.view = { w, h };
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h; this.camera.updateProjectionMatrix();
    const inner = w < h * 0.85 ? 'tabletP' : 'tablet';
    this.os.inner = inner;
    if (inner !== this.inner) {
      this.inner = inner;
      if (this.settled && this.settled !== 'phone') {   // open and the screen turned: swap to the other tablet layout
        const old = this.os.hosts[this.settled];
        Object.assign(old.style, { transition: 'none', visibility: 'hidden', opacity: '0', pointerEvents: 'none' });
        this.settled = null;
      }
      this.fxDirty = true;
    }
    if (!this.liftAnim && !this.anim) this.lift = this.#liftTarget();
    this.#reportArea();
    // The folded phone leans (#tiltTarget), so it is drawn bigger and shrunk to stay sharp: at the snapshots' scale
    // (its size on screen, room for the lean). The tablet sits flat, and Chromium draws a flat screen sharp itself.
    this.os.views.phone.setScale(this.#snapScale('phone'));
    this.#apply(); this.#placeOverlay(); this.dirty = true; this.wake();
  }
  #tiltTarget() {
    if (!this.tiltAmount || this.hidden) return { x: 0, y: 0 };
    // NO LEAN ON THE TABLET (Josh, 8 Oct 2026: it looked low resolution). Leaning makes the live screen's homography a
    // perspective matrix3d, which Chromium draws as a texture with perspective, and text in it goes soft; flat, it is a
    // plain matrix and drawn crisp. The tablet is for reading, so it sits flat; the folded phone keeps its lean.
    if (this.o > 0.5) return { x: 0, y: 0 };
    if (this.os.s.input === 'mouse' || !this.settled) return this.os.s.input === 'mouse' && this.pointerN ? this.pointerN : { x: 0, y: 0 };
    const v = this.os.views[this.settled], el = v && v.focus.el;
    if (!el || el === v.root || el.classList.contains('lock')) return { x: 0, y: 0 };
    const r = el.getBoundingClientRect(), R = v.root.getBoundingClientRect();
    if (!R.width) return { x: 0, y: 0 };
    return { x: clamp((r.left + r.width / 2 - (R.left + R.width / 2)) / (R.width / 2), -1, 1), y: clamp((r.top + r.height / 2 - (R.top + R.height / 2)) / (R.height / 2), -1, 1) };
  }
  // ---- the frame loop. It runs every display frame while anything can move, and naps (a 250 ms check, no frames)
  // while the phone is put away and still: that is most of a play session, and an idle loop still costs the page a
  // frame of work every frame. wake() ends a nap at once; everything that moves the phone calls it.
  #sleeping = false; #nap = 0;
  wake() {
    if (!this.#sleeping) return;
    this.#sleeping = false; clearTimeout(this.#nap); requestAnimationFrame(this.#frame);
  }
  #schedule() {
    // rAF stops in hidden tabs; keep a slow timer going so state still settles (e.g. preview in a background window)
    if (document.hidden) { this.#nap = setTimeout(() => this.#frame(performance.now()), 33); return; }
    const still = this.cover && this.hidden && this.settled && !this.anim && !this.liftAnim && !this.scrubbing && !this.capturing && !this.dirty && !this.fxDirty;
    if (still) { this.#sleeping = true; this.#nap = setTimeout(() => { this.#sleeping = false; this.#frame(performance.now()); }, 250); }
    else requestAnimationFrame(this.#frame);
  }
  #frame = (now) => {
    try { this.#step(now); } finally { this.#schedule(); }
  };
  #step(now) {
    if (!this.cover) return;
    let moved = false;
    if (!this.capturing) {
      if (this.anim) {
        const k = clamp((now - this.anim.t0) / this.anim.dur, 0, 1);
        this.o = lerp(this.anim.from, this.anim.to, ease(k));
        if (k >= 1) { this.o = this.anim.to; this.anim = null; }
        moved = true;
      } else if (this.scrubbing && this.scrubTo !== null && this.scrubTo !== this.o) { this.o = this.scrubTo; moved = true; }
    }
    if (this.liftAnim && now >= this.liftAnim.t0) {
      const L = this.liftAnim, k = clamp((now - L.t0) / L.dur, 0, 1);
      this.lift = lerp(L.from, L.to, L.down ? easeInOut(k) : ease(k));   // rising: quick then settling; going away: eased out of sight
      if (k >= 1) { this.lift = L.to; this.liftAnim = null; }
      if (!moved) { this.#apply(); this.#placeOverlay(); this.dirty = true; }
    }
    if (moved) { this.#apply(); this.dirty = this.fxDirty = true; this.onChange?.(this.o, null); }
    // lean: ease toward the mouse (mouse input) or the highlighted item (keyboard / controller); re-fit the live screen
    const dt = Math.min(0.1, (now - this.lastFrame) / 1000); this.lastFrame = now;
    const tgt = this.#tiltTarget(), k = 1 - Math.exp(-dt * 7);
    let nx = this.tilt.x + (tgt.x - this.tilt.x) * k, ny = this.tilt.y + (tgt.y - this.tilt.y) * k;
    // settling at no lean lands on exactly none: an ease that only gets close leaves a sliver of perspective, and the
    // screen stays a soft matrix3d (see #tiltTarget)
    if (tgt.x === 0 && Math.abs(nx) < 1e-3) nx = 0;
    if (tgt.y === 0 && Math.abs(ny) < 1e-3) ny = 0;
    // fully open: none at all, at once — it eased out during the unfold, so the screen is crisp the moment it shows
    if (this.o >= 1) { nx = 0; ny = 0; }
    const toFlat = (nx === 0 && this.tilt.x !== 0) || (ny === 0 && this.tilt.y !== 0);   // however small the last step
    if (toFlat || Math.abs(nx - this.tilt.x) + Math.abs(ny - this.tilt.y) > 1e-4) {
      this.tilt.x = nx; this.tilt.y = ny;
      // every time, folding or not: a fold frame applied the pose above with the lean as it was, and a lean that has
      // just landed on none is never changed again to put that right (the tablet kept a sliver of the old lean)
      this.#apply();
      this.#placeOverlay(); this.dirty = true;
    }
    if (!this.settled && !this.anim && !this.scrubbing && !this.capturing && (this.o === 0 || this.o === 1)) this.#settle();
    // at rest: re-snapshot the OS once it has been still for a second, off the critical path of the next fold (a fold
    // sooner than that snapshots as it starts). Not while put away: nothing folds from there without #fresh
    if (this.settled && !this.hidden && !this.capturing && !this.capPromise && this.os.stamp !== this.capStamp && now - this.os.stampAt > 1000) {
      this.capPromise = this.capture().finally(() => { this.capPromise = null; });
    }
    if (this.fxDirty) { this.#renderFX(); this.fxDirty = false; }
    if (this.dirty) { this.renderer.setRenderTarget(null); this.renderer.render(this.scene, this.camera); this.dirty = false; }
  }
}
