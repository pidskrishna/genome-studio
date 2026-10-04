import { describe, expect, it } from 'vitest';
import { MeshPhysicalMaterial, ShaderChunk, ShaderLib, type WebGLProgramParametersWithUniforms, type WebGLRenderer } from 'three';
import { geneTable, pigmentsOf, wildType, writeGene, type Pigments } from '../../src/genome';
import { bloomKernel, MAX_TAPS, paddedRect, type BloomKernel } from '../../src/render/bloom';
import { buildBranchMesh } from '../../src/render/branch-mesh';
import {
  DRIVERS,
  gradientWeight,
  hslToRgb,
  mixHue,
  nodeColours,
  normaliseDrivers,
  plateTones,
  srgbToLinear,
  vertexColours,
} from '../../src/render/colour';
import { buildExactMesh, setExactColours } from '../../src/render/exact-mesh';
import { fluorescenceGlow, glossyFinish } from '../../src/render/looks';
import { buildSheetMesh } from '../../src/render/sheet-mesh';
import { snapVertices, WHOLE_IMAGE_SHADOW_CHUNK, wholeImage } from '../../src/render/snap';
import { tileRects, toStraightAlpha, type Rect } from '../../src/render/tiles';
import { mulberry32 } from '../../src/genome/test-helpers';
import { wildA, wildB } from './fixtures';

const base: Pigments = { hueA: 120, hueB: 40, saturation: 0.6, lightness: 0.5, driver: 0, contrast: 0.5, gloss: 0.5, glow: 0.2 };

describe('pigment genes', () => {
  it('decode to their spec ranges for both species, at both ends of every gene', () => {
    for (const species of ['A', 'B'] as const) {
      for (const raw of [0, 4095]) {
        let code = wildType(species);
        for (const def of geneTable(species).filter((g) => g.group === 'pigment')) code = writeGene(code, def.locus, raw);
        const p = pigmentsOf(code);
        const lo = raw === 0;
        expect(p).toEqual({
          hueA: lo ? 0 : 360,
          hueB: lo ? 0 : 360,
          saturation: lo ? 0 : 1,
          lightness: lo ? 0.1 : 0.9,
          driver: lo ? 0 : 3,
          contrast: lo ? 0 : 1,
          gloss: lo ? 0 : 1,
          glow: lo ? 0 : 1,
        });
      }
    }
  });
});

describe('pigment colours', () => {
  it('scale each driver to 0..1 between its 1st and 99th percentiles', () => {
    const n = 1000;
    const raw = new Float64Array(n * DRIVERS);
    for (let i = 0; i < n; i++) {
      raw[i * 4] = i; // even spread
      raw[i * 4 + 1] = i === 0 ? -1e9 : i; // one outlier
      raw[i * 4 + 2] = 7; // no spread
      raw[i * 4 + 3] = Number.NaN; // never trusted
    }
    const d = normaliseDrivers(raw);
    expect(d[0]).toBe(0);
    expect(d[(n - 1) * 4]).toBe(1);
    expect(d[500 * 4]).toBeCloseTo((500 - 9) / (990 - 9), 5);
    expect(d[0 * 4 + 1]).toBe(0);
    expect(d[500 * 4 + 1]).toBeGreaterThan(0.4);
    for (let i = 0; i < n; i++) {
      expect(d[i * 4 + 2]).toBe(0.5);
      expect(Number.isFinite(d[i * 4 + 3]!)).toBe(true);
    }
  });

  it('turn A into B more sharply as contrast rises', () => {
    expect(gradientWeight(0, 0)).toBe(0);
    expect(gradientWeight(1, 0)).toBe(1);
    expect(gradientWeight(0.5, 0.3)).toBeCloseTo(0.5, 12);
    expect(gradientWeight(0.4, 1)).toBe(0);
    expect(gradientWeight(0.6, 1)).toBe(1);
    expect(gradientWeight(0.4, 0)).toBeGreaterThan(gradientWeight(0.4, 0.5));
  });

  it('mix hues the short way round', () => {
    expect(mixHue(350, 10, 0.5)).toBeCloseTo(0, 9);
    expect(mixHue(10, 350, 0.25)).toBeCloseTo(5, 9);
    expect(mixHue(120, 40, 0.5)).toBeCloseTo(80, 9);
    expect(mixHue(0, 360, 0.5)).toBeCloseTo(0, 9);
  });

  it('convert HSL like CSS', () => {
    expect(hslToRgb(0, 1, 0.5)).toEqual([1, 0, 0]);
    expect(hslToRgb(120, 1, 0.25)).toEqual([0, 0.5, 0]);
    expect(hslToRgb(240, 0, 0.3)).toEqual([0.3, 0.3, 0.3]);
    expect(hslToRgb(360, 1, 0.5)).toEqual([1, 0, 0]);
  });

  it('the plate ignores hue and saturation; lightness and the gradient set tone', () => {
    const d = new Float32Array([0, 0, 0, 0, 1, 1, 1, 1]);
    const a = nodeColours(d, base, 'plate');
    const b = nodeColours(d, { ...base, hueA: 300, hueB: 10, saturation: 0, gloss: 1, glow: 1 }, 'plate');
    expect(Array.from(a)).toEqual(Array.from(b));
    const [toneA, toneB] = plateTones(base.lightness);
    expect(a[0]).toBeCloseTo(toneA, 6);
    expect(a[3]).toBeCloseTo(toneB, 6);
    expect(toneB).toBeLessThan(toneA);
    const lighter = nodeColours(d, { ...base, lightness: 0.8 }, 'plate');
    expect(lighter[0]).toBeGreaterThan(a[0]!);
    expect(a[0]).toBe(a[1]);
  });

  it('the glossy look uses hue, saturation and lightness; the fluorescence look ignores lightness', () => {
    const d = new Float32Array([0.5, 0.5, 0.5, 0.5]);
    const g = nodeColours(d, base, 'glossy');
    const [r, gg, b] = hslToRgb(80, 0.6, 0.5);
    expect(g[0]).toBeCloseTo(srgbToLinear(r), 6);
    expect(g[1]).toBeCloseTo(srgbToLinear(gg), 6);
    expect(g[2]).toBeCloseTo(srgbToLinear(b), 6);
    expect(nodeColours(d, { ...base, lightness: 0.2 }, 'glossy')[1]).toBeLessThan(g[1]!);
    const f = nodeColours(d, base, 'fluorescence');
    expect(Array.from(nodeColours(d, { ...base, lightness: 0.2 }, 'fluorescence'))).toEqual(Array.from(f));
    expect(nodeColours(d, { ...base, hueA: 300 }, 'fluorescence')[2]).not.toBe(f[2]);
  });

  it('the gradient driver gene picks which driver the colour follows', () => {
    const d = new Float32Array([0, 1, 0, 0]);
    expect(nodeColours(d, { ...base, contrast: 1, driver: 0 }, 'glossy')[0]).not.toBe(nodeColours(d, { ...base, contrast: 1, driver: 1 }, 'glossy')[0]);
  });

  it('every mesh vertex takes the colour of the node or sheet vertex it was built from', () => {
    for (const [g, nodes] of [
      [buildBranchMesh(wildA()), wildA().parents.length],
      [buildSheetMesh(wildB()), wildB().positions.length / 3],
    ] as const) {
      const source = g.userData.source as Uint32Array;
      expect(source.length).toBe(g.getAttribute('position').count);
      expect(Math.max(...source)).toBeLessThan(nodes);
      const colours = new Float32Array(nodes * 3).map((_, i) => i);
      const out = vertexColours(colours, source);
      for (let v = 0; v < source.length; v += 97) expect(out[v * 3 + 1]).toBe(source[v]! * 3 + 1);
    }
    const sheet = buildSheetMesh(wildB());
    const src = sheet.userData.source as Uint32Array;
    const n = wildB().positions.length / 3;
    for (let v = 0; v < n; v += 53) {
      expect(src[v]).toBe(v);
      expect(src[n + v]).toBe(v);
    }
  });
});

describe('look settings from the genes', () => {
  it('gloss goes from matt to wet', () => {
    const matt = glossyFinish(0, 0);
    const wet = glossyFinish(1, 0);
    expect(wet.roughness).toBeLessThan(matt.roughness);
    expect(wet.clearcoat).toBeGreaterThan(matt.clearcoat);
    expect(glossyFinish(0, 1).emission).toBeGreaterThan(matt.emission);
  });

  it('glow raises fluorescence intensity and bloom', () => {
    const dim = fluorescenceGlow(0);
    const bright = fluorescenceGlow(1);
    expect(bright.intensity).toBeGreaterThan(dim.intensity);
    expect(bright.bloomStrength).toBeGreaterThan(dim.bloomStrength);
    expect(bright.bloomSigma).toBeGreaterThan(dim.bloomSigma);
  });
});

describe('whole-image fragment positions', () => {
  it("three.js's soft-shadow noise is keyed to the whole image, not the tile", () => {
    expect(ShaderChunk.shadowmap_pars_fragment).toContain('interleavedGradientNoise( gl_FragCoord.xy )');
    expect(WHOLE_IMAGE_SHADOW_CHUNK).not.toContain('gl_FragCoord');
    expect(WHOLE_IMAGE_SHADOW_CHUNK).toContain('interleavedGradientNoise( WHOLE_FRAG_COORD )');
  });

  it('snapped materials get WHOLE_FRAG_COORD and the patched shadow chunk', () => {
    const material = snapVertices(new MeshPhysicalMaterial());
    const shader = {
      uniforms: {},
      vertexShader: ShaderLib.physical.vertexShader,
      fragmentShader: ShaderLib.physical.fragmentShader,
    } as unknown as WebGLProgramParametersWithUniforms;
    material.onBeforeCompile(shader, {} as WebGLRenderer);
    expect(shader.fragmentShader).toContain('#define WHOLE_FRAG_COORD (gl_FragCoord.xy + uWholeOrigin)');
    expect(shader.fragmentShader).not.toContain('#include <shadowmap_pars_fragment>');
    expect(shader.uniforms.uWholeOrigin).toBe(wholeImage.origin);
    expect(shader.uniforms.uWholeSize).toBe(wholeImage.size);
  });
});

describe('bloom on tiles', () => {
  it('chooses a power-of-two downsampling and normalised weights', () => {
    for (const sigma of [0.5, 2, 5, 14.4, 60, 160]) {
      const k = bloomKernel(sigma);
      expect(Math.log2(k.factor) % 1).toBe(0);
      expect(k.taps).toBeLessThanOrEqual(MAX_TAPS);
      let sum = k.weights[0]!;
      for (let i = 1; i <= k.taps; i++) sum += 2 * k.weights[i]!;
      expect(sum).toBeCloseTo(1, 6);
    }
  });

  it('pads every tile to the same block grid, counted from the bottom-left corner', () => {
    const rand = mulberry32(5);
    for (let t = 0; t < 200; t++) {
      const H = 50 + Math.floor(rand() * 3000);
      const k = bloomKernel(rand() * 80);
      const rect = { x: Math.floor(rand() * 500), y: Math.floor(rand() * H * 0.5), width: 1 + Math.floor(rand() * 300), height: 1 + Math.floor(rand() * H * 0.5) };
      const pad = paddedRect(rect, H, k);
      const a = Math.max(2, k.factor);
      expect(pad.x % a === 0).toBe(true);
      expect((H - pad.y - pad.height) % a === 0).toBe(true);
      expect(pad.width % a).toBe(0);
      expect(pad.height % a).toBe(0);
      expect(rect.x - pad.x).toBeGreaterThanOrEqual(k.reach);
      expect(pad.x + pad.width - rect.x - rect.width).toBeGreaterThanOrEqual(k.reach);
      expect(rect.y - pad.y).toBeGreaterThanOrEqual(k.reach);
      expect(pad.y + pad.height - rect.y - rect.height).toBeGreaterThanOrEqual(k.reach);
    }
  });

  // The bloom passes of bloom.ts, step for step on the processor: the padded scene, f × f block
  // averages, a horizontal then a vertical Gaussian, and bilinear upsampling from integer positions.
  function bloomRegion(image: Float64Array, W: number, H: number, rect: Rect, k: BloomKernel): Float64Array {
    const pad = paddedRect(rect, H, k);
    const f = k.factor;
    const pw = pad.width;
    const ph = pad.height;
    // Padded scene, bottom-up: local row ly is whole-image row pad.y + ph − 1 − ly from the top.
    const scene = new Float64Array(pw * ph);
    for (let ly = 0; ly < ph; ly++) {
      for (let lx = 0; lx < pw; lx++) {
        const X = pad.x + lx;
        const Y = pad.y + ph - 1 - ly;
        scene[ly * pw + lx] = X >= 0 && Y >= 0 && X < W && Y < H ? image[Y * W + X]! : 0;
      }
    }
    const lw = pw / f;
    const lh = ph / f;
    const low = new Float64Array(lw * lh);
    for (let j = 0; j < lh; j++) {
      for (let i = 0; i < lw; i++) {
        let s = 0;
        for (let b = 0; b < f; b++) for (let a = 0; a < f; a++) s += scene[(j * f + b) * pw + i * f + a]!;
        low[j * lw + i] = s / (f * f);
      }
    }
    const blur = (src: Float64Array, dx: number, dy: number) => {
      const out = new Float64Array(lw * lh);
      const at = (i: number, j: number) => (i < 0 || j < 0 || i >= lw || j >= lh ? 0 : src[j * lw + i]!);
      for (let j = 0; j < lh; j++) {
        for (let i = 0; i < lw; i++) {
          let s = src[j * lw + i]! * k.weights[0]!;
          for (let t = 1; t <= k.taps; t++) s += (at(i + dx * t, j + dy * t) + at(i - dx * t, j - dy * t)) * k.weights[t]!;
          out[j * lw + i] = s;
        }
      }
      return out;
    };
    const blurred = blur(blur(low, 1, 0), 0, 1);
    const lowAt = (i: number, j: number) => blurred[Math.min(lh - 1, Math.max(0, j)) * lw + Math.min(lw - 1, Math.max(0, i))]!;
    const left = rect.x - pad.x;
    const bottom = pad.y + ph - (rect.y + rect.height);
    const out = new Float64Array(rect.width * rect.height);
    for (let qy = 0; qy < rect.height; qy++) {
      for (let qx = 0; qx < rect.width; qx++) {
        const px = qx + left;
        const py = qy + bottom;
        const ux = (px + 0.5) / f - 0.5;
        const uy = (py + 0.5) / f - 0.5;
        const ix = Math.floor(ux);
        const iy = Math.floor(uy);
        const tx = ux - ix;
        const ty = uy - iy;
        const v0 = lowAt(ix, iy) + (lowAt(ix + 1, iy) - lowAt(ix, iy)) * tx;
        const v1 = lowAt(ix, iy + 1) + (lowAt(ix + 1, iy + 1) - lowAt(ix, iy + 1)) * tx;
        // Rows of the result from the top, like the stitched image.
        out[(rect.height - 1 - qy) * rect.width + qx] = scene[py * pw + px]! + v0 + (v1 - v0) * ty;
      }
    }
    return out;
  }

  it.each([
    [97, 61, 2.5],
    [160, 120, 9],
    [161, 119, 30],
  ])('a %d × %d image bloomed (sigma %d) as stitched tiles equals the whole frame bloomed, number for number', (W, H, sigma) => {
    const rand = mulberry32(W);
    const image = new Float64Array(W * H);
    for (let i = 0; i < image.length; i++) image[i] = rand() < 0.05 ? rand() * 4 : 0;
    const k = bloomKernel(sigma);
    const whole = bloomRegion(image, W, H, { x: 0, y: 0, width: W, height: H }, k);
    for (const [c, r] of [
      [2, 2],
      [3, 3],
      [5, 2],
    ]) {
      for (const rect of tileRects(W, H, c!, r!)) {
        const tile = bloomRegion(image, W, H, rect, k);
        for (let y = 0; y < rect.height; y++) {
          for (let x = 0; x < rect.width; x++) {
            expect(tile[y * rect.width + x]).toBe(whole[(rect.y + y) * W + rect.x + x]);
          }
        }
      }
    }
  });
});

describe('the fluorescence mesh', () => {
  it('stores every triangle and vertex for the shader to read, and takes colours', () => {
    const g = buildSheetMesh(wildB());
    const m = buildExactMesh(g);
    const index = g.getIndex()!;
    const pos = g.getAttribute('position');
    expect(m.geometry.getAttribute('position').count).toBe(index.count);
    const tris = m.triangles.image.data as Float32Array;
    const verts = m.vertices.image.data as Float32Array;
    for (let t = 0; t < index.count / 3; t += 101) {
      for (let c = 0; c < 3; c++) expect(tris[t * 4 + c]).toBe(index.getX(t * 3 + c));
    }
    for (let v = 0; v < pos.count; v += 89) {
      expect(verts[v * 8]).toBe(pos.getX(v));
      expect(verts[v * 8 + 2]).toBe(pos.getZ(v));
    }
    const rgb = new Float32Array(pos.count * 3).fill(0.25);
    setExactColours(m, rgb);
    expect((m.colours.image.data as Float32Array)[4 * 7 + 1]).toBe(0.25);
  });
});

describe('transparent pixels', () => {
  it('convert from premultiplied-in-linear sRGB to straight alpha', () => {
    const encode = (l: number) => Math.round((l <= 0.0031308 ? l * 12.92 : 1.055 * l ** (1 / 2.4) - 0.055) * 255);
    // Colour 0.5 linear at alpha 0.5 is stored as encode(0.25).
    const img = { width: 3, height: 1, data: new Uint8Array([10, 20, 30, 255, encode(0.25), 0, 0, 128, 7, 7, 7, 0]) };
    const s = toStraightAlpha(img);
    expect(Array.from(s.data.subarray(0, 4))).toEqual([10, 20, 30, 255]);
    expect(Math.abs(s.data[4]! - encode(0.5))).toBeLessThanOrEqual(1);
    expect(s.data[7]).toBe(128);
    expect(Array.from(s.data.subarray(8, 12))).toEqual([0, 0, 0, 0]);
  });
});
