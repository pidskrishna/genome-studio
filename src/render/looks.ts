import { AddEquation, BackSide, Color, CustomBlending, DoubleSide, MeshPhysicalMaterial, OneFactor, ShaderMaterial } from 'three';
import type { Pigments } from '../genome';
import type { LookId } from './colour';
import { EXACT_FRAGMENT_PRELUDE, EXACT_VERTEX, type ExactMesh } from './exact-mesh';
import { snapViewport, snapVertices, wholeImage } from './snap';

// The materials of the three looks (spec section 7). Each is snapped (snap.ts), so it draws the same
// in a tile as in the whole frame, and any screen-space pattern is keyed to whole-image pixels.
//
// - Monochrome plate: ink on paper. The vertex colour holds the ink tone (lightness and gradient
//   genes; hue ignored). It is drawn with an exact mesh (exact-mesh.ts), so a hatch line never
//   shifts by a level between a tile and the whole frame. A fixed light from the upper left, as is usual for scientific plates, shades
//   the tone, and the result is drawn as hatching: lines at 45°, crossed at −45° in the darker tones and
//   by vertical lines in the darkest, each line widening with the tone. Outlines are the back faces
//   pushed out a fixed width on screen (a second mesh). Line spacing and outline width are fractions of
//   the whole image's short side, so an export at any size looks like the screen.
// - Fluorescence microscope: the vertex colour is the pigment hue as emitted light. As in a widefield
//   fluorescence image, light from every depth adds up: all surfaces, front and back, are summed with
//   additive blending and no depth test, so the organism reads as translucent. Edges seen at a grazing
//   angle glow more, as a fluorescent membrane does, and depth fades into darkness across the
//   organism's bounding sphere. The glow gene sets intensity and bloom (bloom.ts). The bloom spreads
//   any pixel's difference over its whole radius, so this look must draw a tile exactly as the whole
//   frame: a sum in drawing order has no depth ties (a tie can resolve differently in a tile), and the
//   mesh interpolates its own values from whole-image positions (exact-mesh.ts).
// - Glossy render: the vertex colour is the surface colour; the gloss gene sets roughness and clear
//   coat, with soft shadows from the key light and reflections of a studio environment. The glow gene
//   adds a faint self-illumination in the surface colour.

export const BACKGROUNDS: Readonly<Record<LookId, number>> = {
  plate: 0xf3efe4,
  fluorescence: 0x000000,
  glossy: 0x9a9c9f,
};

export const PAPER = BACKGROUNDS.plate;
export const INK = 0x1c1a17;

/** Hatch lines across the whole image's short side. */
export const HATCH_LINES = 200;
/** Outline width as a fraction of the whole image's short side (at least 1 pixel). */
export const OUTLINE_WIDTH = 1 / 800;

/** How the glossy look reads the gloss and glow genes. */
export function glossyFinish(gloss: number, glow: number) {
  const g = Math.min(1, Math.max(0, gloss));
  return {
    roughness: 0.9 - 0.8 * g,
    clearcoat: g,
    clearcoatRoughness: 0.6 - 0.55 * g,
    // Kept low so a surface seen straight down (the flat view) does not mirror the room's ceiling
    // lights to white. Off-screen targets skip tone mapping, so the screen does too, and the two match.
    envMapIntensity: 0.3 + 0.25 * g,
    emission: 0.3 * Math.min(1, Math.max(0, glow)),
  };
}

/** How the fluorescence look reads the glow gene. Bloom sigma is a fraction of the image's short side. */
export function fluorescenceGlow(glow: number) {
  const g = Math.min(1, Math.max(0, glow));
  return { intensity: 0.45 + 1.2 * g, bloomStrength: 0.2 + 1.3 * g, bloomSigma: 0.004 + 0.02 * g };
}

const VIEW_DIR = /* glsl */ `
vec3 viewDir() {
  return isOrthographic ? vec3(0.0, 0.0, 1.0) : normalize(-vViewPos);
}
`;

const PLATE_FRAGMENT = /* glsl */ `
uniform vec3 uPaper;
uniform vec3 uInk;
uniform bool uTransparent;
uniform float uLines;
${EXACT_FRAGMENT_PRELUDE}
${VIEW_DIR}
// Coverage of a family of parallel lines through whole-image pixel p, each line 'cover' of the period wide.
float hatch(vec2 p, vec2 dir, float period, float cover) {
  float d = abs(fract(dot(p, dir) / period) - 0.5) * period;
  return clamp(cover * period * 0.5 - d + 0.5, 0.0, 1.0);
}
void main() {
  interpolateCorners();
  vec3 n = normalize(vNormalV);
  vec3 v = viewDir();
  float facing = clamp(dot(n, v), 0.0, 1.0);
  float lambert = max(dot(n, normalize(vec3(-0.5, 0.6, 0.62))), 0.0);
  // Ink from the tone (lightness and gradient genes), deepened away from the light and towards the
  // contour, as an engraver models form.
  float ink = clamp((1.0 - vCol.r) * (1.3 - lambert) + 0.35 * pow(1.0 - facing, 3.0), 0.0, 1.0);
  float period = max(3.0, min(uWholeSize.x, uWholeSize.y) / uLines);
  vec2 p = WHOLE_FRAG_COORD;
  float a1 = hatch(p, vec2(0.70710678, 0.70710678), period, 0.5 * clamp((ink - 0.1) / 0.5, 0.0, 1.0));
  float a2 = hatch(p, vec2(0.70710678, -0.70710678), period, 0.45 * clamp((ink - 0.55) / 0.3, 0.0, 1.0));
  float a3 = hatch(p, vec2(1.0, 0.0), period, 0.5 * clamp((ink - 0.85) / 0.15, 0.0, 1.0));
  float a = 1.0 - (1.0 - a1) * (1.0 - a2) * (1.0 - a3);
  // Transparent: ink only (premultiplied alpha), so the plate can be laid over other work.
  gl_FragColor = uTransparent ? vec4(uInk * a, a) : vec4(mix(uPaper, uInk, a), 1.0);
  #include <colorspace_fragment>
}
`;

const OUTLINE_VERTEX = /* glsl */ `
uniform vec2 uOutlineHalfViewport;
uniform vec2 uOutlineImage;
uniform float uOutlineWidth;
void main() {
  vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mvPosition;
  vec3 nv = normalize(normalMatrix * normal);
  vec2 dir = (projectionMatrix * vec4(nv, 0.0)).xy * uOutlineHalfViewport;
  float len = length(dir);
  float width = max(1.0, min(uOutlineImage.x, uOutlineImage.y) * uOutlineWidth);
  if (len > 1e-6) gl_Position.xy += dir / len * width / uOutlineHalfViewport * gl_Position.w;
  // Slightly behind the surface, so the outline never fights the surface for depth.
  gl_Position.z += 0.0006 * gl_Position.w;
  #include <fog_vertex>
}
`;

const OUTLINE_FRAGMENT = /* glsl */ `
uniform vec3 uInk;
void main() {
  gl_FragColor = vec4(uInk, 1.0);
  #include <colorspace_fragment>
}
`;

const FLUORESCENCE_FRAGMENT = /* glsl */ `
uniform float uIntensity;
uniform vec2 uFade;
${EXACT_FRAGMENT_PRELUDE}
${VIEW_DIR}
void main() {
  interpolateCorners();
  vec3 n = normalize(vNormalV);
  float facing = abs(dot(n, viewDir()));
  float rim = (1.0 - facing) * (1.0 - facing);
  float fade = 1.0 - 0.94 * smoothstep(uFade.x, uFade.y, -vViewPos.z);
  gl_FragColor = vec4(vCol * uIntensity * (0.12 + 0.8 * rim) * fade, 1.0);
  #include <colorspace_fragment>
}
`;

/** Uniforms of a material drawn with an exact mesh (exact-mesh.ts). */
function exactUniforms() {
  return {
    uVertices: { value: null },
    uColours: { value: null },
    uTriangles: { value: null },
    uExactHalfViewport: snapViewport,
    uExactWindowOrigin: wholeImage.window,
  };
}

export class LookMaterials {
  readonly glossy: MeshPhysicalMaterial;
  readonly plate: ShaderMaterial;
  readonly outline: ShaderMaterial;
  readonly fluorescence: ShaderMaterial;
  private readonly glowEmission = { value: 0 };
  private bloom = fluorescenceGlow(0);

  constructor() {
    this.glossy = new MeshPhysicalMaterial({ vertexColors: true, metalness: 0 });
    const emission = this.glowEmission;
    this.glossy.onBeforeCompile = (shader) => {
      shader.uniforms.uGlowEmission = emission;
      shader.fragmentShader = `uniform float uGlowEmission;\n${shader.fragmentShader.replace(
        '#include <emissivemap_fragment>',
        '#include <emissivemap_fragment>\n\ttotalEmissiveRadiance += diffuseColor.rgb * uGlowEmission;',
      )}`;
    };
    this.glossy.customProgramCacheKey = () => 'glossy-glow';
    snapVertices(this.glossy);

    this.plate = snapVertices(
      new ShaderMaterial({
        vertexShader: EXACT_VERTEX,
        fragmentShader: PLATE_FRAGMENT,
        uniforms: {
          ...exactUniforms(),
          uPaper: { value: new Color(PAPER) },
          uInk: { value: new Color(INK) },
          uTransparent: { value: false },
          uLines: { value: HATCH_LINES },
        },
      }),
    );
    this.outline = snapVertices(
      new ShaderMaterial({
        vertexShader: OUTLINE_VERTEX,
        fragmentShader: OUTLINE_FRAGMENT,
        side: BackSide,
        uniforms: {
          uInk: { value: new Color(INK) },
          uOutlineHalfViewport: snapViewport,
          uOutlineImage: wholeImage.size,
          uOutlineWidth: { value: OUTLINE_WIDTH },
        },
      }),
    );
    this.fluorescence = snapVertices(
      new ShaderMaterial({
        vertexShader: EXACT_VERTEX,
        fragmentShader: FLUORESCENCE_FRAGMENT,
        side: DoubleSide,
        depthTest: false,
        depthWrite: false,
        blending: CustomBlending,
        blendEquation: AddEquation,
        blendSrc: OneFactor,
        blendDst: OneFactor,
        uniforms: { ...exactUniforms(), uIntensity: { value: 1 }, uFade: { value: [0, 1] } },
      }),
    );
  }

  /** The material of the exact mesh in a look; the glossy look draws the ordinary mesh instead. */
  exactSurface(look: LookId): ShaderMaterial {
    return look === 'plate' ? this.plate : this.fluorescence;
  }

  setPigments(p: Pigments): void {
    const finish = glossyFinish(p.gloss, p.glow);
    this.glossy.roughness = finish.roughness;
    this.glossy.clearcoat = finish.clearcoat;
    this.glossy.clearcoatRoughness = finish.clearcoatRoughness;
    this.glossy.envMapIntensity = finish.envMapIntensity;
    this.glowEmission.value = finish.emission;
    this.bloom = fluorescenceGlow(p.glow);
    this.fluorescence.uniforms.uIntensity!.value = this.bloom.intensity;
  }

  /** Bloom strength and sigma (as a fraction of the image's short side) for the current glow gene. */
  get bloomSettings(): { strength: number; sigma: number } {
    return { strength: this.bloom.bloomStrength, sigma: this.bloom.bloomSigma };
  }

  setTransparent(transparent: boolean): void {
    this.plate.uniforms.uTransparent!.value = transparent;
  }

  /** The organism's data for the looks drawn with an exact mesh. */
  setExactMesh(mesh: ExactMesh): void {
    for (const m of [this.plate, this.fluorescence]) {
      m.uniforms.uVertices!.value = mesh.vertices;
      m.uniforms.uColours!.value = mesh.colours;
      m.uniforms.uTriangles!.value = mesh.triangles;
    }
  }

  /** View depths over which the fluorescence look fades to darkness. */
  setFade(near: number, far: number): void {
    this.fluorescence.uniforms.uFade!.value = [near, Math.max(far, near + 1e-6)];
  }

  dispose(): void {
    for (const m of [this.glossy, this.plate, this.outline, this.fluorescence]) m.dispose();
  }
}
