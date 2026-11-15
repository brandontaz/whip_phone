// Rasterise a live DOM subtree into a canvas via SVG <foreignObject> (no libraries). A clone of the screen plus the OS
// stylesheet renders the same as the live page, with three gaps an SVG image can't fill by itself, which this closes:
// - it may not load anything: images (img, svg image, url() in styles) and the stylesheet's url()s (module fonts,
//   backgrounds) are copied in as data: URLs, fetched once and cached;
// - canvases and videos inside apps become an <img> of what they show right now (the OS's own wallpaper canvases are
//   skipped: the wallpaper is composed separately in WebGL);
// - a mount-mode app lives in one display only, so the other display's snapshot gets a copy of it.
const XHTML = 'http://www.w3.org/1999/xhtml', XLINK = 'http://www.w3.org/1999/xlink';

function freeze(src, dst) {
  // carry over state that lives in properties, not attributes: input values, scroll offsets
  const s = src.querySelectorAll('input, textarea, [data-scroll]'), d = dst.querySelectorAll('input, textarea, [data-scroll]');
  s.forEach((el, i) => {
    const c = d[i]; if (!c) return;
    if (el.tagName === 'INPUT') {
      if (el.type === 'checkbox' || el.type === 'radio') { if (el.checked) c.setAttribute('checked', ''); else c.removeAttribute('checked'); }
      else c.setAttribute('value', el.value);
    } else if (el.tagName === 'TEXTAREA') c.textContent = el.value;
    if (el.hasAttribute('data-scroll') && (el.scrollTop || el.scrollLeft)) {
      const inner = c.firstElementChild;
      c.style.overflow = 'hidden';
      if (inner) inner.style.transform = `translate(${-el.scrollLeft}px, ${-el.scrollTop}px)`;
    }
  });
  dst.querySelectorAll('canvas, script').forEach((n) => n.remove());
}
/** any scrolled element (apps that scroll without data-scroll): its children shift by the scroll offset */
function freezeScroll(src, dst) {
  const s = [src, ...src.querySelectorAll('*')], d = [dst, ...dst.querySelectorAll('*')];
  if (s.length !== d.length) return;
  for (let i = 0; i < s.length; i++) {
    const el = s[i], x = el.scrollLeft, y = el.scrollTop;
    if ((!x && !y) || el.hasAttribute('data-scroll')) continue;
    d[i].style.overflow = 'hidden';
    for (const ch of d[i].children) ch.style.translate = `${-x}px ${-y}px`;
  }
}
/** canvases / videos -> <img> of their current pixels (cross-origin pixels can't be read: those stay blank) */
function paintMedia(src, dst, sel) {
  const s = src.querySelectorAll(sel), d = dst.querySelectorAll(sel);
  s.forEach((el, i) => {
    const c = d[i];
    if (!c || c.tagName !== el.tagName) return;
    let url = null;
    try {
      if (el.tagName === 'CANVAS') url = el.width && el.height ? el.toDataURL() : null;
      else if (el.videoWidth) {
        const cv = document.createElement('canvas'); cv.width = el.videoWidth; cv.height = el.videoHeight;
        cv.getContext('2d').drawImage(el, 0, 0); url = cv.toDataURL('image/jpeg', 0.85);
      }
    } catch { url = null; }
    const img = c.ownerDocument.createElement('img');
    for (const { name, value } of c.attributes) if (name !== 'src' && name !== 'srcset' && name !== 'poster') img.setAttribute(name, value);
    // CSS aimed at canvas / video doesn't reach an img: carry its box over. A canvas that fills its parent (a 3D view)
    // fills it in the copy too, so it also fits the other display's size; a fixed one (a gauge) keeps its size
    const cs = getComputedStyle(el), par = el.parentElement, w = el.clientWidth, h = el.clientHeight;
    const fillW = par && w && Math.abs(w - par.clientWidth) < 2, fillH = par && h && Math.abs(h - par.clientHeight) < 2;
    if (w && h) { img.style.width = fillW ? '100%' : w + 'px'; img.style.height = fillH ? '100%' : h + 'px'; }
    img.style.display = cs.display === 'inline' ? 'inline-block' : cs.display;
    if (cs.position === 'absolute' || cs.position === 'fixed') {
      img.style.position = 'absolute';
      for (const k of ['top', 'right', 'bottom', 'left']) if (cs[k] !== 'auto') img.style[k] = cs[k];
    }
    img.style.objectFit = el.tagName === 'VIDEO' ? (cs.objectFit || 'contain') : fillW && fillH ? 'contain' : 'fill';   // a full-screen view keeps its shape
    if (url) img.setAttribute('src', url);
    c.replaceWith(img);
  });
}
/** mount-mode apps: freeze the live box's scroll in the display that holds it; give the other display a copy */
function mounts(layer, clone) {
  for (const slot of clone.querySelectorAll('[data-mount]')) {
    const live = document.querySelector(`[data-mount-root="${CSS.escape(slot.getAttribute('data-mount'))}"]`);
    if (!live) continue;
    const here = slot.querySelector('[data-mount-root]');
    if (here) continue;                                       // handled with the layer (it is part of it)
    const copy = live.cloneNode(true);
    freezeScroll(live, copy); paintMedia(live, copy, 'canvas, video'); freeze(live, copy);
    slot.appendChild(copy);
  }
}

// ---------------------------------------------------------------- assets as data: URLs
const assets = new Map();                     // absolute url -> Promise<data url | null>
const MAX_ASSET = 4 * 1024 * 1024;
const INLINE = /^(?:data:|blob:|#|about:|javascript:)/i;
const URL_RE = /url\(\s*(['"]?)(.*?)\1\s*\)/g;
let loader = null;
/** fallback reader for files fetch() can't get (in game: another resource's files, read by Lua) */
export function setAssetLoader(fn) { loader = typeof fn === 'function' ? fn : null; }
const abs = (u) => { try { return new URL(u, document.baseURI).href; } catch { return null; } };
const readBlob = (b) => new Promise((res) => { const fr = new FileReader(); fr.onload = () => res(String(fr.result)); fr.onerror = () => res(null); fr.readAsDataURL(b); });
// KEPT, BUT NOT FOR EVER (audit 20, PHN-9): every picture it ever inlined (contacts' and callers' card pictures, up to
// 4 MB each) stayed as a data: URL for the whole session. The last MAX_KEPT, at most MAX_KEPT_BYTES; the least
// recently used go first, and are fetched again if a snapshot needs them.
const MAX_KEPT = 40, MAX_KEPT_BYTES = 20 * 1024 * 1024;
const keptBytes = new Map();                  // url -> its data URL's length, once it answered
let keptTotal = 0;
function forget(url) { keptTotal -= keptBytes.get(url) || 0; keptBytes.delete(url); assets.delete(url); }
function trim() {
  for (const url of assets.keys()) {          // oldest first (a Map keeps its order; a use moves one to the end)
    if (assets.size <= MAX_KEPT && keptTotal <= MAX_KEPT_BYTES) break;
    forget(url);
  }
}
function asset(url) {
  if (!url || INLINE.test(url)) return Promise.resolve(null);
  let p = assets.get(url);
  if (p) { assets.delete(url); assets.set(url, p); return p; }   // used: the newest now
  p = fetch(url).then((r) => (r.ok ? r.blob() : null)).then((b) => (b && b.size && b.size <= MAX_ASSET ? readBlob(b) : null)).catch(() => null)
    .then((d) => d || (loader ? Promise.resolve().then(() => loader(url)).catch(() => null) : null))
    .then((d) => {
      if (assets.get(url) === p) { const n = d ? d.length : 0; keptBytes.set(url, n); keptTotal += n; trim(); }
      return d;
    });
  assets.set(url, p);
  trim();
  return p;
}
async function inlineUrls(text) {
  const found = new Set();
  text.replace(URL_RE, (all, q, u) => { if (u && !INLINE.test(u)) found.add(u); return all; });
  if (!found.size) return text;
  const map = new Map();
  await Promise.all([...found].map(async (u) => map.set(u, await asset(abs(u)))));
  return text.replace(URL_RE, (all, q, u) => (map.get(u) ? `url("${map.get(u)}")` : all));
}
let cssMemo = { src: null, out: null };
async function inlineCss(css) {
  if (css === cssMemo.src) return cssMemo.out;
  const out = await inlineUrls(css);
  cssMemo = { src: css, out };
  return out;
}
async function inlineDom(root) {
  const jobs = [];
  for (const img of root.querySelectorAll('img[src]')) {
    const src = img.getAttribute('src');
    if (INLINE.test(src)) continue;
    img.removeAttribute('srcset'); img.removeAttribute('loading');
    jobs.push(asset(abs(src)).then((d) => { if (d) img.setAttribute('src', d); }));
  }
  for (const im of root.querySelectorAll('image')) {
    const href = im.getAttribute('href') || im.getAttributeNS(XLINK, 'href');
    if (!href || INLINE.test(href)) continue;
    jobs.push(asset(abs(href)).then((d) => { if (d) { im.removeAttributeNS(XLINK, 'href'); im.setAttribute('href', d); } }));
  }
  for (const el of root.querySelectorAll('[style*="url("]')) jobs.push(inlineUrls(el.getAttribute('style')).then((s) => el.setAttribute('style', s)));
  await Promise.all(jobs);
}

/**
 * shell: element whose tag/class/style is copied as the wrapper (keeps theme / mode selectors working)
 * layer: element to render inside it.  -> canvas (w*scale x h*scale), or null if the browser refuses.
 */
export async function rasterize({ shell, layer, css, width, height, scale = 2, into }) {
  const doc = document.implementation.createHTMLDocument('');
  const root = doc.createElementNS(XHTML, 'div');
  root.setAttribute('style', `width:${width}px;height:${height}px;position:relative;overflow:hidden`);
  const style = doc.createElementNS(XHTML, 'style'); root.appendChild(style);
  const wrap = shell.cloneNode(false);
  wrap.classList.add('snap');
  wrap.style.transform = 'none'; wrap.style.opacity = '1'; wrap.style.visibility = 'visible';
  wrap.style.position = 'absolute'; wrap.style.left = '0'; wrap.style.top = '0'; wrap.style.display = 'block';
  wrap.style.background = 'none';           // the live screen's black backing sits under the wallpaper canvases
  const clone = layer.cloneNode(true);
  const liveBox = layer.querySelector('[data-mount-root]'), boxCopy = liveBox && clone.querySelector('[data-mount-root]');
  if (boxCopy) freezeScroll(liveBox, boxCopy);
  paintMedia(layer, clone, '[data-mod] canvas, [data-mod] video');
  freeze(layer, clone);
  mounts(layer, clone);
  wrap.appendChild(clone);
  const [cssText] = await Promise.all([inlineCss(css), inlineDom(wrap)]);
  style.textContent = cssText;
  root.appendChild(doc.importNode(wrap, true));
  const xml = new XMLSerializer().serializeToString(root);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width * scale}" height="${height * scale}" viewBox="0 0 ${width} ${height}">` +
    `<foreignObject x="0" y="0" width="${width}" height="${height}">${xml}</foreignObject></svg>`;
  // data: URL, not a blob: URL - Chrome taints canvases drawn from blob-URL SVGs that contain foreignObject
  const url = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
  try {
    const img = new Image(); img.decoding = 'async'; img.src = url;
    await img.decode();
    const cv = into || document.createElement('canvas');
    cv.width = width * scale; cv.height = height * scale;
    const g = cv.getContext('2d');
    g.clearRect(0, 0, cv.width, cv.height);
    g.drawImage(img, 0, 0, cv.width, cv.height);
    g.getImageData(0, 0, 1, 1);           // throws if the browser tainted the canvas (then WebGL could not use it either)
    return cv;
  } catch (e) {
    console.warn('[duo] snapshot failed', e);
    return null;
  }
}
