// The Duo screens' wallpapers: COLOURFUL GRADIENTS (Josh, 13 Oct 2026: "colourful gradients rather than detailed photos";
// they were painted skies, mountains, dunes and skylines). Each is a base blend with soft glows of colour over it, and a
// faint grain so the big gradient never shows bands. The layers still cover the same world rectangle (aspect = the inner
// display's) so the fold zooms them at different depths: the gradient is the far layer (sky), a glow or two the near
// one (dune), which keeps a little depth as the phone opens.
export const ASPECT = 0.1628 / 0.1148;          // inner display width / height (duo_build.py: 2*(W-B_IN) / 2*(H/2-B_IN))
export const LAYER_W = 2048, LAYER_H = Math.round(LAYER_W / ASPECT);

// A gradient: `base` [angle (CSS degrees: 0 to the top, 90 to the right), [[stop, colour], ...]], `glows` over it
// [x, y (0..1 of the layer, y down), radius (of the layer's width), colour, strength], `float` the near layer's glows
// (the same shape, kept faint: they drift as the phone opens). The folded phone shows the layer's right half, so every
// one has colour there. Kept deep enough for the white clock and icons over them.
export const PALETTES = {
  dusk: { label: 'Dusk',
    base: [165, [[0, '#1b1446'], [0.55, '#5b2a86'], [1, '#c2416b']]],
    glows: [[0.78, 0.86, 0.42, '#ff8a4c', 0.85], [0.22, 0.58, 0.34, '#ff5fa2', 0.55], [0.62, 0.18, 0.3, '#6c4cff', 0.45]],
    float: [[0.7, 0.62, 0.16, '#ffb38a', 0.18]] },
  aurora: { label: 'Aurora',
    base: [180, [[0, '#06121f'], [1, '#0c3b4f']]],
    glows: [[0.32, 0.36, 0.36, '#19d3a2', 0.8], [0.76, 0.26, 0.34, '#7b4dff', 0.75], [0.6, 0.74, 0.28, '#6dff9e', 0.45]],
    float: [[0.66, 0.46, 0.14, '#9cffd8', 0.16]] },
  ocean: { label: 'Ocean',
    base: [200, [[0, '#031c3d'], [0.55, '#0a4a8f'], [1, '#1aa3c9']]],
    glows: [[0.82, 0.2, 0.34, '#3ee0ff', 0.6], [0.2, 0.82, 0.38, '#1b3dff', 0.6], [0.6, 0.62, 0.22, '#00d1b2', 0.35]],
    float: [[0.74, 0.7, 0.15, '#7fe9ff', 0.16]] },
  sunset: { label: 'Sunset',
    base: [180, [[0, '#2a0f3d'], [0.55, '#b8325c'], [1, '#ff9a3d']]],
    glows: [[0.62, 0.96, 0.36, '#ffd36b', 0.7], [0.14, 0.42, 0.32, '#ff4d4d', 0.5], [0.86, 0.32, 0.26, '#ff6fb5', 0.45]],
    float: [[0.72, 0.8, 0.16, '#ffe0a0', 0.18]] },
  berry: { label: 'Berry',
    base: [150, [[0, '#1d0b2e'], [0.5, '#6a1b6e'], [1, '#d63384']]],
    glows: [[0.72, 0.3, 0.34, '#ff6ac1', 0.6], [0.2, 0.76, 0.36, '#7a3cff', 0.6], [0.9, 0.84, 0.24, '#ff9e7a', 0.4]],
    float: [[0.64, 0.56, 0.15, '#ffb3e0', 0.15]] },
  lagoon: { label: 'Lagoon',
    base: [190, [[0, '#00262e'], [0.55, '#00796b'], [1, '#2bb894']]],
    glows: [[0.82, 0.82, 0.32, '#b4ff6a', 0.5], [0.2, 0.2, 0.34, '#00b3ff', 0.55], [0.64, 0.4, 0.24, '#29ffc6', 0.35]],
    float: [[0.7, 0.66, 0.14, '#d6ff9e', 0.15]] },
  citrus: { label: 'Citrus',
    base: [175, [[0, '#3a1400'], [0.55, '#b4380a'], [1, '#e8a317']]],
    glows: [[0.76, 0.2, 0.3, '#fde047', 0.55], [0.2, 0.82, 0.36, '#f97316', 0.6], [0.88, 0.7, 0.24, '#ff4f6d', 0.35]],
    float: [[0.66, 0.4, 0.14, '#fff1a6', 0.15]] },
  neon: { label: 'Neon',
    base: [180, [[0, '#0b0221'], [1, '#2b0a5c']]],
    glows: [[0.26, 0.3, 0.32, '#ff2ea6', 0.7], [0.8, 0.7, 0.34, '#00e5ff', 0.6], [0.62, 0.16, 0.26, '#8a2be2', 0.6]],
    float: [[0.72, 0.46, 0.14, '#ff8ad4', 0.16]] },
  ember: { label: 'Ember',
    base: [190, [[0, '#120303'], [0.55, '#4a0d0d'], [1, '#a01919']]],
    glows: [[0.66, 0.88, 0.38, '#ff6b2c', 0.7], [0.18, 0.3, 0.3, '#ff2d55', 0.45], [0.86, 0.36, 0.22, '#ffb02e', 0.35]],
    float: [[0.74, 0.7, 0.15, '#ffc08a', 0.16]] },
  glacier: { label: 'Glacier',
    base: [195, [[0, '#062a3a'], [0.55, '#0d6680'], [1, '#2a9fba']]],
    glows: [[0.82, 0.16, 0.3, '#a5f3fc', 0.5], [0.24, 0.76, 0.34, '#22d3ee', 0.5], [0.6, 0.5, 0.24, '#818cf8', 0.35]],
    float: [[0.7, 0.3, 0.14, '#e0fbff', 0.16]] },
  orchid: { label: 'Orchid',
    base: [160, [[0, '#1e1036'], [0.55, '#5b21b6'], [1, '#a66ef0']]],
    glows: [[0.76, 0.76, 0.34, '#f0abfc', 0.55], [0.2, 0.24, 0.34, '#6366f1', 0.55], [0.88, 0.22, 0.22, '#ff7ab8', 0.4]],
    float: [[0.66, 0.58, 0.15, '#f7d1ff', 0.15]] },
  midnight: { label: 'Midnight',
    base: [180, [[0, '#020409'], [1, '#0b1834']]],
    glows: [[0.78, 0.2, 0.36, '#1e3a8a', 0.7], [0.2, 0.86, 0.34, '#312e81', 0.6], [0.6, 0.6, 0.22, '#0e7490', 0.35]],
    float: [[0.7, 0.46, 0.14, '#3b5bdb', 0.14]] },
};

/** What a phone shows when it has none. */
export const DEFAULT_WALLPAPER = 'dusk';

/** The wallpapers before the gradients, saved on SIMs and phones: each shows the gradient closest to it. */
const ALIASES = {
  night: 'midnight', dawn: 'sunset', whipnight: 'midnight', whipdusk: 'dusk', whiplit: 'midnight',
  black: 'midnight', blueprint: 'ocean',
};

/** A wallpaper's id as one of these: itself, the one an old id became, or null for one there never was. */
export function resolveWallpaper(name) {
  if (PALETTES[name]) return name;
  if (typeof name === 'string' && PALETTES[ALIASES[name]]) return ALIASES[name];
  return null;
}

const hexRgb = (h) => { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
const rgba = (h, a) => { const [r, g, b] = hexRgb(h); return `rgba(${r},${g},${b},${a})`; };
const canvas = () => { const c = document.createElement('canvas'); c.width = LAYER_W; c.height = LAYER_H; return c; };

/** The base blend's line through a W x H box, as CSS draws a linear-gradient at that angle. */
function lineFor(angle, W, H) {
  const t = angle * Math.PI / 180, dx = Math.sin(t), dy = -Math.cos(t);
  const half = (Math.abs(W * dx) + Math.abs(H * dy)) / 2;
  return [W / 2 - dx * half, H / 2 - dy * half, W / 2 + dx * half, H / 2 + dy * half];
}

/** A glow: its colour at full strength in the middle, gone at its edge ((1 - d²)², flat at both ends: no rim). */
const GLOW_STOPS = [[0, 1], [0.2, 0.92], [0.4, 0.71], [0.6, 0.41], [0.8, 0.13], [1, 0]];
function glow(g, [x, y, r, col, a]) {
  const cx = x * LAYER_W, cy = y * LAYER_H, rr = r * LAYER_W;
  const gr = g.createRadialGradient(cx, cy, 0, cx, cy, rr);
  for (const [o, k] of GLOW_STOPS) gr.addColorStop(o, rgba(col, (a * k).toFixed(3)));
  g.fillStyle = gr; g.fillRect(cx - rr, cy - rr, rr * 2, rr * 2);
}

/** A faint grain over the whole layer: no gradient bands on a big screen (or in the 3D texture). */
let grain = null;
function addGrain(g) {
  if (!grain) {
    grain = document.createElement('canvas'); grain.width = grain.height = 256;
    const ng = grain.getContext('2d'), id = ng.createImageData(256, 256);
    let s = 1337;
    const rand = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
    for (let i = 0; i < id.data.length; i += 4) {
      const v = rand() < 0.5 ? 255 : 0;
      id.data[i] = id.data[i + 1] = id.data[i + 2] = v; id.data[i + 3] = Math.floor(rand() * 10);
    }
    ng.putImageData(id, 0, 0);
  }
  g.fillStyle = g.createPattern(grain, 'repeat'); g.fillRect(0, 0, LAYER_W, LAYER_H);
}

function drawGradient(pal) {
  const c = canvas(), g = c.getContext('2d');
  const [angle, stops] = pal.base;
  const lin = g.createLinearGradient(...lineFor(angle, LAYER_W, LAYER_H));
  for (const [o, col] of stops) lin.addColorStop(o, col);
  g.fillStyle = lin; g.fillRect(0, 0, LAYER_W, LAYER_H);
  for (const gl of pal.glows) glow(g, gl);
  addGrain(g);
  return c;
}

function drawFloat(pal) {
  const c = canvas(), g = c.getContext('2d');
  for (const gl of pal.float || []) glow(g, gl);
  return c;
}

/** -> { sky, mountain, dune } canvases (LAYER_W x LAYER_H, world aspect ASPECT). sky is opaque, the others have alpha. */
export function makeWallpaper(name = DEFAULT_WALLPAPER) {
  const id = resolveWallpaper(name) || DEFAULT_WALLPAPER;
  const pal = PALETTES[id];
  return { name: id, sky: drawGradient(pal), mountain: canvas(), dune: drawFloat(pal) };
}

// ---- parallax framing (shared by the WebGL compose pass and the live DOM wallpaper so the two match exactly) ----
export const CLOSED_ZOOM = 1.47;
export const DEPTH = { sky: 0.47, mountain: 1, dune: 0.7 };
// Display rectangles in world units (inner display height = 1). Shut, the cover display sits over the right half.
export const PANEL = {
  tablet: [-ASPECT / 2, -0.5, ASPECT, 1],
  phone: [0.004 / 0.1148, -0.0572 / 0.1148, 0.0772 / 0.1148, 0.1144 / 0.1148],
  tabletP: [-(722 / 1024) / 2, -0.5, 722 / 1024, 1],   // open + rolled upright (portrait screens): a portrait crop
};
const smooth = (x, a, b) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
export function zoomFor(depth, openness) {
  const shut = 1 + (CLOSED_ZOOM - 1) * depth;
  return shut + (1 - shut) * smooth(openness, 0.3, 1);
}
/** uv frame [x, y, w, h] of a panel inside a layer: layerUV = frame.xy + screenUV * frame.zw (uv y up). */
export function layerFrame(panel, depth, openness) {
  const z = zoomFor(depth, openness), lw = ASPECT * z, lh = z, lx = -lw / 2, ly = -lh / 2;
  const p = PANEL[panel];
  return [(p[0] - lx) / lw, (p[1] - ly) / lh, p[2] / lw, p[3] / lh];
}
/** Draw layers into a 2D canvas the size of a panel (live DOM wallpaper). which: ['sky'] or ['mountain','dune'] */
export function paintPanel(ctx, wp, panel, openness, which) {
  const { width: W, height: H } = ctx.canvas;
  ctx.clearRect(0, 0, W, H);
  ctx.imageSmoothingQuality = 'high';
  for (const layer of which) {
    const [fx, fy, fw, fh] = layerFrame(panel, DEPTH[layer], openness);
    // uv y up -> canvas y down
    const sx = fx * LAYER_W, sw = fw * LAYER_W, sh = fh * LAYER_H, sy = (1 - fy - fh) * LAYER_H;
    ctx.drawImage(wp[layer], sx, sy, sw, sh, 0, 0, W, H);
  }
}

/** The same gradient as CSS for the picker's swatch (`pal.css`): the slice of it the folded phone shows. */
function cssOf(pal) {
  const [fx, fy, fw, fh] = layerFrame('phone', DEPTH.sky, 0);
  const x0 = fx, y0 = 1 - fy - fh;                     // the slice's top left in the layer (y down)
  const W = fw * LAYER_W, H = fh * LAYER_H;
  const pct = (v) => `${(v * 100).toFixed(1)}%`;
  const parts = pal.glows.map(([x, y, r, col, a]) =>
    `radial-gradient(ellipse ${pct(r * LAYER_W / W)} ${pct(r * LAYER_W / H)} at ${pct((x - x0) / fw)} ${pct((y - y0) / fh)}, `
    + `${GLOW_STOPS.map(([o, k]) => `${rgba(col, (a * k).toFixed(3))} ${pct(o)}`).join(', ')})`);
  // the base blend's stops moved onto the slice's own line (CSS draws its line across the box it fills)
  const [angle, stops] = pal.base, t = angle * Math.PI / 180, ux = Math.sin(t), uy = -Math.cos(t);
  const [ax, ay, bx, by] = lineFor(angle, LAYER_W, LAYER_H), [cx, cy, ex, ey] = lineFor(angle, W, H);
  const L = Math.hypot(bx - ax, by - ay), Lc = Math.hypot(ex - cx, ey - cy);
  const shift = (ax - (x0 * LAYER_W + cx)) * ux + (ay - (y0 * LAYER_H + cy)) * uy;
  parts.push(`linear-gradient(${angle}deg, ${stops.map(([o, col]) => `${col} ${pct((o * L + shift) / Lc)}`).join(', ')})`);
  return parts.join(', ');
}
for (const pal of Object.values(PALETTES)) pal.css = cssOf(pal);
