import {
  BufferAttribute,
  BufferGeometry,
  HalfFloatType,
  Mesh,
  NoBlending,
  OrthographicCamera,
  Scene,
  ShaderMaterial,
  Vector2,
  WebGLRenderTarget,
  type WebGLRenderer,
} from 'three';
import type { Rect } from './tiles';

// Bloom for the fluorescence look, computed so a tile matches the same part of the whole frame.
//
// The organism is drawn into a padded target: the tile plus a margin wider than the blur reaches, on
// the same whole-image pixel grid (a whole-pixel viewport shift, as for any tile). The margin is
// rounded out to multiples of the downsampling factor f, measured from the whole image's bottom-left
// corner, so the f × f blocks averaged for the blur are the same blocks in every tile and in the whole
// frame.
// The blur is a separable Gaussian on those blocks; the result is brought back to full resolution by
// bilinear interpolation with weights from integer pixel positions (exact for f a power of two).
// Every texture read is a texelFetch at an integer position, so no sampler rounding depends on where
// the tile sits. Only the middle (the tile itself) is kept. The whole frame is drawn the same way,
// with its own margin; beyond the image's edges nothing is drawn, in a tile or whole.

/** Most taps on each side of the low-resolution Gaussian. */
export const MAX_TAPS = 24;

export interface BloomKernel {
  /** Downsampling factor, a power of two. */
  factor: number;
  /** Taps on each side, in low-resolution pixels. */
  taps: number;
  /** Normalised weights for offsets 0..taps (the kernel is symmetric). */
  weights: Float32Array;
  /** Margin in full-resolution pixels that a tile needs on every side before rounding to the grid. */
  reach: number;
}

/** The blur for a Gaussian of standard deviation sigma, in pixels of the whole image. */
export function bloomKernel(sigma: number): BloomKernel {
  const s = Math.max(0.5, sigma);
  let factor = 1;
  while ((3 * s) / factor > MAX_TAPS) factor *= 2;
  const taps = Math.max(1, Math.ceil((3 * s) / factor));
  const low = s / factor;
  const raw = new Float64Array(taps + 1);
  let sum = 0;
  for (let k = 0; k <= taps; k++) {
    raw[k] = Math.exp(-(k * k) / (2 * low * low));
    sum += k === 0 ? raw[k]! : 2 * raw[k]!;
  }
  const weights = new Float32Array(MAX_TAPS + 1);
  for (let k = 0; k <= taps; k++) weights[k] = raw[k]! / sum;
  return { factor, taps, weights, reach: (taps + 2) * factor };
}

/**
 * The padded rectangle drawn for a tile of an image `imageHeight` pixels high, in whole-image pixels
 * from the top-left (it may extend beyond the image). It reaches at least `reach` beyond the tile on
 * every side, and its left and bottom edges sit on multiples of the factor (and of 2) counted from the
 * image's bottom-left corner, the corner graphics cards count pixels from. So downsampled blocks, and
 * the 2 × 2 pixel groups in which a graphics card takes screen-space derivatives, line up with the
 * whole frame's.
 */
export function paddedRect(rect: Rect, imageHeight: number, kernel: BloomKernel): Rect {
  const a = Math.max(2, kernel.factor);
  const bottom = imageHeight - rect.y - rect.height;
  const x0 = Math.floor((rect.x - kernel.reach) / a) * a;
  const b0 = Math.floor((bottom - kernel.reach) / a) * a;
  const x1 = Math.ceil((rect.x + rect.width + kernel.reach) / a) * a;
  const b1 = Math.ceil((bottom + rect.height + kernel.reach) / a) * a;
  return { x: x0, y: imageHeight - b1, width: x1 - x0, height: b1 - b0 };
}

const QUAD_VERTEX = /* glsl */ `
void main() {
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

const DOWNSAMPLE_FRAGMENT = /* glsl */ `
uniform highp sampler2D uSource;
uniform int uFactor;
void main() {
  ivec2 base = ivec2(gl_FragCoord.xy) * uFactor;
  vec4 sum = vec4(0.0);
  for (int j = 0; j < uFactor; j++) {
    for (int i = 0; i < uFactor; i++) sum += texelFetch(uSource, base + ivec2(i, j), 0);
  }
  gl_FragColor = sum / float(uFactor * uFactor);
}
`;

const BLUR_FRAGMENT = /* glsl */ `
uniform highp sampler2D uSource;
uniform ivec2 uStep;
uniform int uTaps;
uniform float uWeights[${MAX_TAPS + 1}];
vec4 tap(ivec2 p, ivec2 size) {
  if (p.x < 0 || p.y < 0 || p.x >= size.x || p.y >= size.y) return vec4(0.0);
  return texelFetch(uSource, p, 0);
}
void main() {
  ivec2 size = textureSize(uSource, 0);
  ivec2 p = ivec2(gl_FragCoord.xy);
  vec4 sum = texelFetch(uSource, p, 0) * uWeights[0];
  for (int k = 1; k <= ${MAX_TAPS}; k++) {
    if (k > uTaps) break;
    sum += (tap(p + uStep * k, size) + tap(p - uStep * k, size)) * uWeights[k];
  }
  gl_FragColor = sum;
}
`;

const COMPOSITE_FRAGMENT = /* glsl */ `
uniform highp sampler2D uScene;
uniform highp sampler2D uBloom;
uniform ivec2 uOffset;
uniform int uFactor;
uniform float uStrength;
uniform bool uTransparent;
uniform bool uScreen;
vec4 low(ivec2 p) {
  ivec2 size = textureSize(uBloom, 0);
  return texelFetch(uBloom, clamp(p, ivec2(0), size - 1), 0);
}
vec3 encode(vec3 c) {
  return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(vec3(0.0031308), c));
}
void main() {
  ivec2 p = ivec2(gl_FragCoord.xy) + uOffset;
  vec3 scene = texelFetch(uScene, p, 0).rgb;
  vec2 u = (vec2(p) + 0.5) / float(uFactor) - 0.5;
  vec2 i0 = floor(u);
  vec2 t = u - i0;
  ivec2 q = ivec2(i0);
  vec3 bloom = mix(
    mix(low(q).rgb, low(q + ivec2(1, 0)).rgb, t.x),
    mix(low(q + ivec2(0, 1)).rgb, low(q + ivec2(1, 1)).rgb, t.x),
    t.y);
  vec3 rgb = clamp(scene + uStrength * bloom, 0.0, 1.0);
  // Transparent: light only, so dark parts let the layer below show (premultiplied alpha).
  float a = uTransparent ? max(max(rgb.r, rgb.g), rgb.b) : 1.0;
  // The canvas wants premultiplied sRGB; a render target encodes linear values itself.
  if (uScreen) rgb = a > 0.0 ? encode(rgb / a) * a : vec3(0.0);
  gl_FragColor = vec4(rgb, a);
}
`;

function quadMaterial(fragmentShader: string, uniforms: Record<string, { value: unknown }>): ShaderMaterial {
  return new ShaderMaterial({
    vertexShader: QUAD_VERTEX,
    fragmentShader,
    uniforms,
    depthTest: false,
    depthWrite: false,
    blending: NoBlending,
  });
}

/** Multisampling for the padded scene, matching the other looks. */
const SAMPLES = 4;

export interface BloomJob {
  /** The padded target's size. */
  width: number;
  height: number;
  /** Draws the organism into the (multisampled, linear, half-float) padded target. */
  drawScene: (target: WebGLRenderTarget) => void;
  kernel: BloomKernel;
  strength: number;
  transparent: boolean;
  /** Where the output's bottom-left pixel sits in the padded target, from its bottom-left. */
  offset: Vector2;
  /** The output: a render target the size of the tile, or null for the canvas. */
  output: WebGLRenderTarget | null;
}

export class BloomPass {
  private readonly quad: Mesh;
  private readonly quadScene = new Scene();
  private readonly quadCamera = new OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private readonly down: ShaderMaterial;
  private readonly blur: ShaderMaterial;
  private readonly composite: ShaderMaterial;
  private sceneTarget: WebGLRenderTarget | null = null;
  private lowA: WebGLRenderTarget | null = null;
  private lowB: WebGLRenderTarget | null = null;

  constructor(private readonly renderer: WebGLRenderer) {
    const g = new BufferGeometry();
    g.setAttribute('position', new BufferAttribute(new Float32Array([-1, -1, 0, 3, -1, 0, -1, 3, 0]), 3));
    this.down = quadMaterial(DOWNSAMPLE_FRAGMENT, { uSource: { value: null }, uFactor: { value: 1 } });
    this.blur = quadMaterial(BLUR_FRAGMENT, {
      uSource: { value: null },
      uStep: { value: new Vector2(1, 0) },
      uTaps: { value: 1 },
      uWeights: { value: new Float32Array(MAX_TAPS + 1) },
    });
    this.composite = quadMaterial(COMPOSITE_FRAGMENT, {
      uScene: { value: null },
      uBloom: { value: null },
      uOffset: { value: new Vector2() },
      uFactor: { value: 1 },
      uStrength: { value: 0 },
      uTransparent: { value: false },
      uScreen: { value: false },
    });
    this.quad = new Mesh(g, this.down);
    this.quad.frustumCulled = false;
    this.quadScene.add(this.quad);
  }

  render(job: BloomJob): void {
    const { kernel } = job;
    const f = kernel.factor;
    const lw = job.width / f;
    const lh = job.height / f;
    const scene = (this.sceneTarget = resize(this.sceneTarget, job.width, job.height, SAMPLES, true));
    const lowA = (this.lowA = resize(this.lowA, lw, lh, 0, false));
    const lowB = (this.lowB = resize(this.lowB, lw, lh, 0, false));
    const r = this.renderer;
    const previous = r.getRenderTarget();
    try {
      job.drawScene(scene);

      this.pass(this.down, lowA, { uSource: scene.texture, uFactor: f });
      this.blur.uniforms.uWeights!.value = kernel.weights;
      this.pass(this.blur, lowB, { uSource: lowA.texture, uStep: new Vector2(1, 0), uTaps: kernel.taps });
      this.pass(this.blur, lowA, { uSource: lowB.texture, uStep: new Vector2(0, 1), uTaps: kernel.taps });
      this.pass(this.composite, job.output, {
        uScene: scene.texture,
        uBloom: lowA.texture,
        uOffset: job.offset,
        uFactor: f,
        uStrength: job.strength,
        uTransparent: job.transparent,
        uScreen: job.output === null,
      });
    } finally {
      r.setRenderTarget(previous);
    }
  }

  /** Releases the targets (kept between screen frames of the same size). */
  release(): void {
    for (const t of [this.sceneTarget, this.lowA, this.lowB]) t?.dispose();
    this.sceneTarget = this.lowA = this.lowB = null;
  }

  dispose(): void {
    this.release();
    this.quad.geometry.dispose();
    for (const m of [this.down, this.blur, this.composite]) m.dispose();
  }

  private pass(material: ShaderMaterial, target: WebGLRenderTarget | null, values: Record<string, unknown>): void {
    for (const [k, v] of Object.entries(values)) material.uniforms[k]!.value = v;
    this.quad.material = material;
    this.renderer.setRenderTarget(target);
    this.renderer.render(this.quadScene, this.quadCamera);
  }
}

function resize(target: WebGLRenderTarget | null, width: number, height: number, samples: number, depth: boolean): WebGLRenderTarget {
  if (target && target.width === width && target.height === height) return target;
  target?.dispose();
  return new WebGLRenderTarget(width, height, { type: HalfFloatType, samples, depthBuffer: depth });
}
