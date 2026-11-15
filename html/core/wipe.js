// Screen fold effect, after the technique in akashtdev/iphone-duo-animation (MIT): each display is composed offscreen
// (wallpaper layers at parallax zoom + the OS UI), then blurred twice through a mip pyramid where the blur radius grows
// away from a "wipe" edge. The display mesh then darkens / glints it (see screenMaterial()).
import * as THREE from 'three';

const VERT = /* glsl */`
in vec3 position;
in vec2 uv;
out vec2 vUv;
void main() { vUv = uv; gl_Position = vec4(position.xy * 2.0, 0.0, 1.0); }`;

const COMPOSE = /* glsl */`
precision highp float;
uniform sampler2D skyMap, mountainMap, duneMap, behindMap, frontMap;
uniform vec4 skyFrame, mountainFrame, duneFrame;
uniform float behindOn, frontOn, roll;   // roll 1: portrait content on the landscape display (rotated 90 deg)
uniform vec2 size;      // target size, px
uniform vec2 radii;     // display corner radius (px) for u < 0.5 / u >= 0.5
in vec2 vUv;
out vec4 fragColor;
// Blend in sRGB space like the browser does, so the folding screen matches the live DOM exactly. Textures are sRGB
// (hardware-decoded) and premultiplied, so toS(sample.rgb) gives back the premultiplied sRGB bytes.
vec3 toS(vec3 c) { return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c)); }
vec3 toL(vec3 c) { return mix(c / 12.92, pow((c + 0.055) / 1.055, vec3(2.4)), step(0.04045, c)); }
vec3 over(vec3 under, vec4 layer) { return under * (1.0 - layer.a) + toS(layer.rgb); }
float sdRound(vec2 p, vec2 b, float r) { vec2 q = abs(p) - b + r; return min(max(q.x, q.y), 0.0) + length(max(q, 0.0)) - r; }
void main() {
  // content occupies the middle 90 % so the blur has a black margin to spread into
  vec2 uv = (vUv - 0.5) / 0.9 + 0.5;
  vec2 content = size * 0.9;
  float r = (uv.x < 0.5 ? radii.x : radii.y) * 0.9;
  float mask = clamp(0.5 - sdRound((uv - 0.5) * content, content * 0.5, r), 0.0, 1.0);
  vec2 t = roll > 0.5 ? vec2(uv.y, 1.0 - uv.x) : uv;   // display space -> image space
  vec3 c = toS(texture(skyMap, skyFrame.xy + t * skyFrame.zw).rgb);
  c = over(c, texture(behindMap, t) * behindOn);
  c = over(c, texture(mountainMap, mountainFrame.xy + t * mountainFrame.zw));
  c = over(c, texture(duneMap, duneFrame.xy + t * duneFrame.zw));
  c = over(c, texture(frontMap, t) * frontOn);
  fragColor = vec4(toL(c) * mask, 1.0);
}`;

const BLUR = /* glsl */`
precision highp float;
uniform sampler2D map;
uniform float wipeAmount, wipePosition;
uniform vec2 blurBounds;
in vec2 vUv;
out vec4 fragColor;
#define MAX_LOD 8.0
// cubic B-spline weights, sampled with 4 bilinear taps per mip level
float w0(float a) { return (1.0/6.0) * (a * (a * (-a + 3.0) - 3.0) + 1.0); }
float w1(float a) { return (1.0/6.0) * (a * a * (3.0 * a - 6.0) + 4.0); }
float w2(float a) { return (1.0/6.0) * (a * (a * (-3.0 * a + 3.0) + 3.0) + 1.0); }
float w3(float a) { return (1.0/6.0) * (a * a * a); }
vec4 cubic(vec2 uv, float lod) {
  vec2 res = vec2(textureSize(map, int(lod)));
  uv = uv * res + 0.5;
  vec2 i = floor(uv), f = fract(uv);
  vec2 g0 = vec2(w0(f.x) + w1(f.x), w0(f.y) + w1(f.y));
  vec2 g1 = vec2(w2(f.x) + w3(f.x), w2(f.y) + w3(f.y));
  vec2 h0 = vec2(-1.0 + w1(f.x) / g0.x, -1.0 + w1(f.y) / g0.y);
  vec2 h1 = vec2(1.0 + w3(f.x) / g1.x, 1.0 + w3(f.y) / g1.y);
  vec2 t = 1.0 / res;
  vec4 a = textureLod(map, (vec2(i.x + h0.x, i.y + h0.y) - 0.5) * t, lod);
  vec4 b = textureLod(map, (vec2(i.x + h1.x, i.y + h0.y) - 0.5) * t, lod);
  vec4 c = textureLod(map, (vec2(i.x + h0.x, i.y + h1.y) - 0.5) * t, lod);
  vec4 d = textureLod(map, (vec2(i.x + h1.x, i.y + h1.y) - 0.5) * t, lod);
  return g0.y * (g0.x * a + g1.x * b) + g1.y * (g0.x * c + g1.x * d);
}
vec4 blurred(vec2 uv, float lod) { return mix(cubic(uv, floor(lod)), cubic(uv, ceil(lod)), fract(lod)); }
float remap(float a, float b, float v) { return (v - a) / (b - a); }
void main() {
  float d = distance(vUv.x, wipePosition);
  float area = remap(0.0, 0.75, clamp(remap(blurBounds.x, blurBounds.y, d) * wipeAmount * 2.5, 0.0, 1.0));
  float shade = smoothstep(1.3, 0.9, area) * smoothstep(1.0, 0.9, distance(vUv.y, 0.5) * 2.0);
  // no blur here: copy the pixel exactly (the cubic filter would soften it); blend into the blur so there is no seam
  vec4 sharp = texelFetch(map, ivec2(gl_FragCoord.xy), 0);
  vec4 col = area < 0.0005 ? sharp : mix(sharp, blurred(vUv, area * MAX_LOD), smoothstep(0.0, 0.06, area));
  fragColor = col * vec4(vec3(shade), 1.0);
}`;

const target = (w, h, aniso) => {
  const t = new THREE.WebGLRenderTarget(w, h, {
    depthBuffer: false, generateMipmaps: true,
    minFilter: THREE.LinearMipmapLinearFilter, magFilter: THREE.LinearFilter,
  });
  t.texture.colorSpace = THREE.SRGBColorSpace; t.texture.anisotropy = aniso;
  return t;
};

const CLEAR = new THREE.DataTexture(new Uint8Array(4), 1, 1); CLEAR.needsUpdate = true;

export class ScreenFX {
  /** sizes: { tablet: [w, h, radiusLeft, radiusRight], phone: [...] } in target px */
  constructor(renderer, sizes) {
    this.renderer = renderer;
    const aniso = renderer.capabilities.getMaxAnisotropy();
    this.scene = new THREE.Scene(); this.camera = new THREE.Camera();
    this.quad = new THREE.Mesh(new THREE.PlaneGeometry(1, 1)); this.quad.frustumCulled = false; this.scene.add(this.quad);
    const raw = (frag, uniforms) => new THREE.RawShaderMaterial({ glslVersion: THREE.GLSL3, vertexShader: VERT, fragmentShader: frag, uniforms, depthTest: false, depthWrite: false });
    this.compose = raw(COMPOSE, {
      skyMap: { value: CLEAR }, mountainMap: { value: CLEAR }, duneMap: { value: CLEAR }, behindMap: { value: CLEAR }, frontMap: { value: CLEAR },
      skyFrame: { value: new THREE.Vector4() }, mountainFrame: { value: new THREE.Vector4() }, duneFrame: { value: new THREE.Vector4() },
      behindOn: { value: 0 }, frontOn: { value: 0 }, roll: { value: 0 }, size: { value: new THREE.Vector2() }, radii: { value: new THREE.Vector2() },
    });
    this.blur = raw(BLUR, { map: { value: null }, wipeAmount: { value: 0 }, wipePosition: { value: 0 }, blurBounds: { value: new THREE.Vector2() } });
    this.pass = {};
    for (const [panel, [w, h, rl, rr]] of Object.entries(sizes)) {
      this.pass[panel] = {
        size: [w, h], radii: [rl, rr],
        frame: target(w, h, aniso), first: target(w, h, aniso), second: target(w, h, aniso),
        position: panel === 'tablet' ? 1 : 0,                                     // inner display: sharp at the main half
        bounds: panel === 'tablet' ? new THREE.Vector2(0.45, 1) : new THREE.Vector2(0, 0.9),
      };
    }
  }
  texture(panel) { return this.pass[panel].second.texture; }
  #draw(material, rt) { this.quad.material = material; this.renderer.setRenderTarget(rt); this.renderer.render(this.scene, this.camera); }
  /** layers: {sky, mountain, dune} textures; frames: {sky, mountain, dune} [x,y,w,h]; ui: {behind, front} textures|null */
  render(panel, layers, frames, ui, amount, roll = 0) {
    const p = this.pass[panel], r = this.renderer, prev = r.getRenderTarget(), tm = r.toneMapping;
    r.toneMapping = THREE.NoToneMapping;
    const u = this.compose.uniforms;
    u.skyMap.value = layers.sky; u.mountainMap.value = layers.mountain; u.duneMap.value = layers.dune;
    u.skyFrame.value.fromArray(frames.sky); u.mountainFrame.value.fromArray(frames.mountain); u.duneFrame.value.fromArray(frames.dune);
    u.behindMap.value = ui?.behind || CLEAR; u.behindOn.value = ui?.behind ? 1 : 0;
    u.frontMap.value = ui?.front || CLEAR; u.frontOn.value = ui?.front ? 1 : 0;
    u.size.value.fromArray(p.size); u.radii.value.fromArray(p.radii); u.roll.value = roll;
    this.#draw(this.compose, p.frame);
    const b = this.blur.uniforms;
    b.wipeAmount.value = amount; b.wipePosition.value = p.position; b.blurBounds.value.copy(p.bounds);
    b.map.value = p.frame.texture; this.#draw(this.blur, p.first);
    b.map.value = p.first.texture; this.#draw(this.blur, p.second);
    r.setRenderTarget(prev); r.toneMapping = tm;
  }
}

/** Display material: emissive = the blurred composite with the wipe darkening and the inner edge falloff. The displays are
 *  unlit (no reflections, no light highlights, no glint) so they show exactly what the OS draws, folded or not.
 *  uniforms.progress = how shut the phone is (0 open .. 1 shut). */
export function screenMaterial(map, inner, env) {
  const uniforms = { progress: { value: 0 }, wipePos: { value: inner ? 1 : 0 }, shadeBounds: { value: new THREE.Vector2(inner ? 0.5 : 0, 1) } };
  const m = new THREE.MeshStandardMaterial({
    color: 0x000000, emissive: 0xffffff, emissiveMap: map,
    roughness: 1, metalness: 0, envMapIntensity: 0, toneMapped: false,
  });
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, uniforms);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <emissivemap_pars_fragment>', `#include <emissivemap_pars_fragment>
uniform float progress, wipePos;
uniform vec2 shadeBounds;
vec3 screenColor() {
  ${inner ? 'float wipeAmount = progress;' : 'float wipeAmount = clamp(1.0 - 2.0 * abs(progress - 0.5), 0.0, 1.0) * 0.5;'}
  vec2 uv = (vEmissiveMapUv - 0.5) * 0.9 + 0.5;   // the composite fills the middle 90 % of its target: map it back 1:1
  float wipe = 1.0 - clamp(smoothstep(shadeBounds.x, shadeBounds.y, distance(vEmissiveMapUv.x, wipePos)) * wipeAmount * 1.5, 0.0, 1.0);
  vec3 color = texture2D(emissiveMap, uv, -0.7).rgb * wipe;   // sharper mip choice: the target is 2x supersampled
  ${inner ? 'color *= mix(1.0, smoothstep(0.05, 0.5, uv.x), smoothstep(0.0, 0.55, wipeAmount));' : ''}
  return color;
}`)
      .replace('#include <emissivemap_fragment>', 'totalEmissiveRadiance *= screenColor();');
    // unlit: drop the diffuse / specular terms so no light or reflection is ever added on top of the screen image
    const lit = 'vec3 outgoingLight = totalDiffuse + totalSpecular + totalEmissiveRadiance;';
    m.userData.unlit = sh.fragmentShader.includes(lit);
    sh.fragmentShader = sh.fragmentShader.replace(lit, 'vec3 outgoingLight = totalEmissiveRadiance;');
  };
  m.customProgramCacheKey = () => (inner ? 'duo-inner' : 'duo-cover');
  m.userData.uniforms = uniforms;
  return m;
}
