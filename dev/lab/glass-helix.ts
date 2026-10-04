import {
  CylinderGeometry,
  CatmullRomCurve3,
  DataTexture,
  DoubleSide,
  BackSide,
  FrontSide,
  FloatType,
  InstancedBufferAttribute,
  InstancedMesh,
  Matrix4,
  Mesh,
  NearestFilter,
  PerspectiveCamera,
  Quaternion,
  Raycaster,
  RGBAFormat,
  Scene,
  ShaderMaterial,
  TubeGeometry,
  Vector2,
  Vector3,
  WebGLRenderer,
  Group,
  AmbientLight,
  Color,
  DirectionalLight,
  MeshPhysicalMaterial,
  PMREMGenerator,
  SRGBColorSpace,
  type Texture,
  type Side,
} from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { TorusGeometry } from 'three';
import { geneAt, GENOME_LENGTH, type SpeciesId } from '../../src/genome';
import {
  backbonePoint,
  bandAt,
  facingSpin,
  helixBands,
  helixRungs,
  nearestSpin,
  RISE,
  TWIST,
  GROOVE_ANGLE,
  type Band,
  type Strand,
} from '../../src/ui/helix-geometry';
import { complementStrand } from '../../src/genome';
import { Damped, dur, loop, motion } from './motion';
import type { Reticle } from './surface';

// A frosted-glass double helix for the interaction lab. Every part is glass: the backbones are
// frosted tubes with fine etched rings where one gene ends and the next begins; each half-rung is a
// coloured core lit from inside a frosted shell. One renderer draws several helices side by side
// (one per variant) with scissored viewports. Uses the real B-form geometry from src/ui. Dev only.

export type LabLook = 'plate' | 'fluorescence' | 'glossy';

/** The genome-browser convention: A green, C blue, G orange, T red. Full strength in every look. */
export const BASE_HEX: Record<string, number> = { A: 0x1f9d4c, C: 0x2d68e8, G: 0xe07a12, T: 0xdf3a3c };

interface GlassLook {
  body: number;
  bodyAlpha: number;
  rim: number;
  rimAlpha: number;
  spec: number;
  dim: number;
  glow: number;
  etch: number;
}

const LOOKS: Record<LabLook, GlassLook> = {
  // Frosted white glass on paper: the edges read darker, as real glass does against a white ground.
  plate: { body: 0xfbfbfa, bodyAlpha: 0.34, rim: 0x55606c, rimAlpha: 0.5, spec: 0.35, dim: 0xb6babf, glow: 0x2a323c, etch: 0x2a323c },
  // Smoked glass on black: almost invisible bodies, bright rims, colour carried by the inner light.
  fluorescence: { body: 0xffffff, bodyAlpha: 0.05, rim: 0xdde5ee, rimAlpha: 0.5, spec: 0.55, dim: 0x34383e, glow: 0xffffff, etch: 0xf2f5f8 },
  // Clear glass on studio grey with a soft specular reflection.
  glossy: { body: 0xffffff, bodyAlpha: 0.15, rim: 0xffffff, rimAlpha: 0.62, spec: 0.9, dim: 0x8a8d92, glow: 0xffffff, etch: 0x2c3138 },
};

/**
 * Helix materials on trial. 'lit', 'milk' and 'edge' are drawn by the custom glass shader; the
 * others use three.js physical transmission, which really blurs what lies behind the glass.
 */
export type HelixMaterial = 'lit' | 'frosted' | 'milk' | 'edge' | 'boro' | 'stained';

interface ShaderLook extends GlassLook {
  rimPow: number;
  tint: number;
  cores: boolean;
}

function lookFor(material: HelixMaterial, look: LabLook): ShaderLook {
  const base: ShaderLook = { ...LOOKS[look], rimPow: 2.4, tint: 0.28, cores: true };
  if (material === 'milk') {
    // Milk glass: nearly opaque, soft white, bases as pastel tints in the glass itself.
    const dark = look === 'fluorescence';
    return { ...base, body: dark ? 0x2a2d32 : 0xf3f5f7, bodyAlpha: dark ? 0.6 : 0.84, rim: dark ? 0x8d96a1 : 0xc9cfd6, rimAlpha: 0.3, spec: 0.22, rimPow: 1.4, tint: 0.62, cores: false };
  }
  if (material === 'edge') {
    // Clear glass seen only by its edges, like a precision optic; the coloured cores read sharply.
    return { ...base, bodyAlpha: 0.015, rimAlpha: 0.95, rimPow: 4.2, spec: base.spec * 1.2, tint: 0.12 };
  }
  return base;
}

interface PhysicalSpec {
  roughness: number;
  thickness: number;
  attenuation: number | null;
  cores: boolean;
  /** How much of the base colour tints the rung glass (1 for stained glass). */
  rungTint: number;
  /** Fine frosted rings on the code backbone where each gene begins. */
  rings?: boolean;
  /** Share of light the glass passes; below 1 the white body scatters, as frost does. */
  transmission: number;
}

const PHYSICAL: Partial<Record<HelixMaterial, PhysicalSpec>> = {
  // Acid-etched glass with coloured light inside: blurred cores glow through the frost.
  frosted: { roughness: 0.5, thickness: 2.5, attenuation: null, cores: true, rungTint: 0.12, transmission: 0.72 },
  // Laboratory borosilicate: nearly clear, faintly cool, so the cores read sharply.
  boro: { roughness: 0.16, thickness: 2.5, attenuation: 0xd8ecef, cores: true, rungTint: 0.06, transmission: 1, rings: true },
  // Coloured frosted glass rungs, no inner light; backbones frosted white.
  stained: { roughness: 0.45, thickness: 2, attenuation: null, cores: false, rungTint: 1, transmission: 0.78 },
};

export const BACKDROP_HEX: Record<LabLook, number> = { plate: 0xebe7dc, fluorescence: 0x000000, glossy: 0xa3a5a8 };

function linear(hex: number): Color {
  const [r, g, b] = rgb(hex);
  return new Color().setRGB(r, g, b, SRGBColorSpace);
}

function rgb(hex: number): [number, number, number] {
  return [((hex >> 16) & 255) / 255, ((hex >> 8) & 255) / 255, (hex & 255) / 255];
}
function v3(hex: number): Vector3 {
  return new Vector3(...rgb(hex));
}

// Shaders -------------------------------------------------------------------------------------------
// Colours are sRGB values written straight to the canvas (no colour management), so the glass
// matches the CSS around it exactly.

const GLASS_COMMON = /* glsl */ `
  uniform vec3 uBody; uniform float uBodyAlpha; uniform vec3 uRim; uniform float uRimAlpha;
  uniform float uSpec; uniform vec3 uLightDir; uniform float uFace; uniform float uRimPow;
  vec4 frost(vec3 N, vec3 V) {
    float ndv = clamp(abs(dot(N, V)), 0.0, 1.0);
    float fres = pow(1.0 - ndv, uRimPow);
    float wrap = dot(N, uLightDir) * 0.5 + 0.5;
    vec3 H = normalize(uLightDir + V);
    float spec = pow(max(dot(N, H), 0.0), 70.0) * uSpec;
    vec3 col = mix(uBody, uRim, fres) * (0.84 + 0.16 * wrap) + spec;
    float a = uBodyAlpha + fres * uRimAlpha + spec * 0.4;
    return vec4(col, a);
  }
`;

const BACKBONE_VERT = /* glsl */ `
  uniform float uT0; uniform float uT1;
  varying vec3 vN; varying vec3 vV; varying float vT;
  void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vN = normalize(normalMatrix * normal);
    vV = normalize(-mv.xyz);
    vT = mix(uT0, uT1, uv.x);
    gl_Position = projectionMatrix * mv;
  }
`;

const BACKBONE_FRAG = /* glsl */ `
  ${GLASS_COMMON}
  uniform sampler2D uState; uniform float uCount; uniform vec3 uGlow; uniform vec3 uEtch; uniform float uIsCode;
  varying vec3 vN; varying vec3 vV; varying float vT;
  void main() {
    vec3 N = normalize(vN); if (!gl_FrontFacing) N = -N;
    vec4 g = frost(N, normalize(vV));
    float idx = clamp(floor(vT + 0.5), 0.0, uCount - 1.0);
    vec4 s = texture2D(uState, vec2((idx + 0.5) / uCount, 0.5));
    float inside = step(-0.5, vT) * step(vT, uCount - 0.5);
    float c = vT - (idx - 0.5);
    // Etched ring where a gene starts (code strand only, so the boundary reads on one strand).
    float etch = uIsCode * inside * s.g * (1.0 - smoothstep(0.02, 0.07, c));
    float light = inside * s.r;
    float travelling = inside * s.b * uIsCode;
    float locked = inside * s.a;
    vec3 col = mix(g.rgb, uGlow, clamp(light * 0.16 + travelling * 0.75, 0.0, 1.0));
    float a = g.a + light * 0.05 + travelling * 0.35 + locked * 0.22;
    col = mix(col, uBody, locked * 0.35);
    col = mix(col, uEtch, etch * 0.45);
    a = max(a, etch * 0.5);
    gl_FragColor = vec4(col, clamp(a, 0.0, 1.0) * uFace);
  }
`;

const RUNG_VERT = /* glsl */ `
  attribute vec3 aCol; attribute vec3 aNext; attribute vec3 aPulse; attribute float aLight;
  varying vec3 vCol; varying vec3 vNext; varying vec3 vPulse; varying float vLight; varying float vS;
  varying vec3 vN; varying vec3 vV;
  void main() {
    vS = position.y + 0.5;
    vCol = aCol; vNext = aNext; vPulse = aPulse; vLight = aLight;
    vec4 mv = modelViewMatrix * instanceMatrix * vec4(position, 1.0);
    vN = normalize(normalMatrix * mat3(instanceMatrix) * normal);
    vV = normalize(-mv.xyz);
    gl_Position = projectionMatrix * mv;
  }
`;

const RUNG_PULSE = /* glsl */ `
  uniform vec3 uDim;
  vec3 pulseColour(out float glow) {
    float front = vPulse.x; float dir = vPulse.y; float str = vPulse.z;
    float passed = dir > 0.0 ? step(vS, front) : step(front, vS);
    vec3 base = mix(vCol, vNext, passed * step(0.001, str));
    glow = str * exp(-pow((vS - front) / 0.16, 2.0));
    return base;
  }
`;

const CORE_FRAG = /* glsl */ `
  varying vec3 vCol; varying vec3 vNext; varying vec3 vPulse; varying float vLight; varying float vS;
  varying vec3 vN; varying vec3 vV;
  ${RUNG_PULSE}
  void main() {
    float glow;
    vec3 base = pulseColour(glow);
    vec3 c = mix(uDim, base, 0.18 + 0.82 * vLight);
    c *= 0.62 + 0.38 * vLight;
    c = mix(c, vec3(1.0), glow * 0.7);
    gl_FragColor = vec4(c, 1.0);
  }
`;

const CORE_FRAG_LINEAR = /* glsl */ `
  uniform float uGain;
  varying vec3 vCol; varying vec3 vNext; varying vec3 vPulse; varying float vLight; varying float vS;
  varying vec3 vN; varying vec3 vV;
  ${RUNG_PULSE}
  void main() {
    float glow;
    vec3 base = pulseColour(glow);
    vec3 c = mix(uDim, base, 0.18 + 0.82 * vLight);
    c *= (0.62 + 0.38 * vLight) * uGain;
    c = mix(c, vec3(1.0), glow * 0.75);
    gl_FragColor = vec4(sRGBTransferEOTF(vec4(min(c, vec3(1.0)), 1.0)).rgb, 1.0);
    #include <colorspace_fragment>
  }
`;

const SHELL_FRAG = /* glsl */ `
  ${GLASS_COMMON}
  uniform float uTint;
  varying vec3 vCol; varying vec3 vNext; varying vec3 vPulse; varying float vLight; varying float vS;
  varying vec3 vN; varying vec3 vV;
  ${RUNG_PULSE}
  void main() {
    vec3 N = normalize(vN); if (!gl_FrontFacing) N = -N;
    vec4 g = frost(N, normalize(vV));
    float glow;
    vec3 base = pulseColour(glow);
    // Light from the core scatters in the frost: the shell takes the base colour as it is lit.
    vec3 tint = mix(uDim, base, vLight);
    vec3 col = mix(g.rgb, tint, uTint * vLight + 0.1);
    col = mix(col, vec3(1.0), glow * 0.55);
    float a = g.a * 0.85 + vLight * 0.08 + glow * 0.35;
    gl_FragColor = vec4(col, clamp(a, 0.0, 1.0) * uFace);
  }
`;

function glassUniforms(look: ShaderLook, face: number): Record<string, { value: unknown }> {
  return {
    uRimPow: { value: look.rimPow },
    uTint: { value: look.tint },
    uBody: { value: v3(look.body) },
    uBodyAlpha: { value: look.bodyAlpha },
    uRim: { value: v3(look.rim) },
    uRimAlpha: { value: look.rimAlpha },
    uSpec: { value: look.spec },
    uLightDir: { value: new Vector3(-0.45, 0.7, 0.55).normalize() },
    uFace: { value: face },
    uDim: { value: v3(look.dim) },
    uGlow: { value: v3(look.glow) },
    uEtch: { value: v3(look.etch) },
  };
}

function applyLookTo(material: ShaderMaterial, look: ShaderLook): void {
  const u = material.uniforms;
  const set = (name: string, value: unknown): void => {
    const slot = u[name];
    if (slot) slot.value = value;
  };
  set('uBody', v3(look.body));
  set('uBodyAlpha', look.bodyAlpha);
  set('uRim', v3(look.rim));
  set('uRimAlpha', look.rimAlpha);
  set('uSpec', look.spec);
  set('uDim', v3(look.dim));
  set('uGlow', v3(look.glow));
  set('uEtch', v3(look.etch));
  set('uRimPow', look.rimPow);
  set('uTint', look.tint);
}

// One helix -----------------------------------------------------------------------------------------

const RUNG_GAP = 0.9;
const BACKBONE_T0 = -2;
const BACKBONE_T1 = GENOME_LENGTH + 1;
const FOV = 18;

interface RungPulse {
  start: number;
  ms: number;
  /** 'across': code end to paired end. 'meet': both ends to the middle. */
  mode: 'across' | 'meet';
  next: string;
  resolve: () => void;
}

interface TravelLight {
  from: number;
  to: number;
  start: number;
  ms: number;
  width: number;
}

export interface ViewRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export class HelixModel {
  readonly scene = new Scene();
  readonly camera = new PerspectiveCamera(FOV, 1, 10, 2000);
  readonly group = new Group();
  readonly overlay = document.createElement('div');
  readonly spin: Damped;
  readonly travel: Damped;
  readonly light: Damped[] = [];
  readonly flash = new Float32Array(GENOME_LENGTH);
  readonly locked = new Set<number>();
  bands: Band[];
  focus: Band | null = null;
  code: string;
  rect: ViewRect = { x: 0, y: 0, width: 1, height: 1 };
  /** Idle drift, in radians per second (one turn in 30 s); pauses for a moment after any touch. */
  drift = (2 * Math.PI) / 30;
  touchedAt = -Infinity;
  hovering = false;
  breathe = true;
  onFrame: ((m: HelixModel) => void) | null = null;

  private readonly cores: InstancedMesh;
  private readonly shells: InstancedMesh;
  private readonly materials: ShaderMaterial[] = [];
  private readonly state = new Float32Array(GENOME_LENGTH * 4);
  private readonly stateTexture: DataTexture;
  private readonly pulses = new Map<number, RungPulse>();
  private readonly travels: TravelLight[] = [];
  private readonly colA: InstancedBufferAttribute;
  private readonly colB: InstancedBufferAttribute;
  private readonly pulseAttr: InstancedBufferAttribute;
  private readonly lightAttr: InstancedBufferAttribute;
  private look: LabLook;
  private readonly tubes: TubeGeometry[] = [];
  private readonly customMeshes: Mesh[] = [];
  private physical: { spec: PhysicalSpec; shells: InstancedMesh; cores: InstancedMesh | null; frost: InstancedMesh } | null = null;
  /** Pose of each half-rung, so the frost of a locked gene can grow over it. */
  private readonly poses: { pos: Vector3; q: Quaternion; len: number }[] = [];
  /** How far each locked gene's frost has formed, 0 to 1. */
  private readonly lockFrost = new Map<number, Damped>();

  constructor(readonly species: SpeciesId, code: string, look: LabLook, readonly material: HelixMaterial = 'lit') {
    this.code = code;
    this.look = look;
    this.bands = helixBands(species);
    this.spin = new Damped(facingSpin(12), dur('large'));
    this.travel = new Damped(14, dur('large'));
    for (let i = 0; i < GENOME_LENGTH; i++) this.light.push(new Damped(0.62, dur('medium')));
    this.overlay.className = 'helix-overlay';
    this.scene.add(this.group);
    const gl = lookFor(material, look);

    this.stateTexture = new DataTexture(this.state, GENOME_LENGTH, 1, RGBAFormat, FloatType);
    this.stateTexture.magFilter = NearestFilter;
    this.stateTexture.minFilter = NearestFilter;
    for (const b of this.bands) this.state[b.start * 4 + 1] = 1;

    // Backbones: back faces first (fainter), then front faces, so the tube reads as a thin glass wall.
    for (const strand of ['code', 'pair'] as Strand[]) {
      const pts: Vector3[] = [];
      for (let t = BACKBONE_T0; t <= BACKBONE_T1 + 1e-9; t += 0.25) {
        const p = backbonePoint(strand, t);
        pts.push(new Vector3(p.x, p.y, p.z));
      }
      const tube = new TubeGeometry(new CatmullRomCurve3(pts), pts.length * 2, 1.55, 14, false);
      this.tubes.push(tube);
      for (const [side, face, order] of [[BackSide, 0.55, 1], [FrontSide, 1, 3]] as [Side, number, number][]) {
        const m = new ShaderMaterial({
          vertexShader: BACKBONE_VERT,
          fragmentShader: BACKBONE_FRAG,
          uniforms: {
            ...glassUniforms(gl, face),
            uState: { value: this.stateTexture },
            uCount: { value: GENOME_LENGTH },
            uT0: { value: BACKBONE_T0 },
            uT1: { value: BACKBONE_T1 },
            uIsCode: { value: strand === 'code' ? 1 : 0 },
          },
          transparent: true,
          depthWrite: false,
          side,
        });
        this.materials.push(m);
        const mesh = new Mesh(tube, m);
        mesh.renderOrder = order;
        this.group.add(mesh);
        this.customMeshes.push(mesh);
      }
    }

    // Rungs: 320 half-rungs (code half i, paired half 160 + i), each a lit core inside a frost shell.
    const count = GENOME_LENGTH * 2;
    this.colA = new InstancedBufferAttribute(new Float32Array(count * 3), 3);
    this.colB = new InstancedBufferAttribute(new Float32Array(count * 3), 3);
    this.pulseAttr = new InstancedBufferAttribute(new Float32Array(count * 3), 3);
    this.lightAttr = new InstancedBufferAttribute(new Float32Array(count), 1);
    const coreGeo = new CylinderGeometry(0.42, 0.42, 1, 10, 1);
    const shellGeo = new CylinderGeometry(1.2, 1.2, 1, 18, 1);
    for (const geo of [coreGeo, shellGeo]) {
      geo.setAttribute('aCol', this.colA);
      geo.setAttribute('aNext', this.colB);
      geo.setAttribute('aPulse', this.pulseAttr);
      geo.setAttribute('aLight', this.lightAttr);
    }
    const coreMat = new ShaderMaterial({
      vertexShader: RUNG_VERT,
      fragmentShader: CORE_FRAG,
      uniforms: { uDim: { value: v3(gl.dim) } },
    });
    const shellMat = new ShaderMaterial({
      vertexShader: RUNG_VERT,
      fragmentShader: SHELL_FRAG,
      uniforms: glassUniforms(gl, 1),
      transparent: true,
      depthWrite: false,
      side: DoubleSide,
    });
    this.materials.push(coreMat, shellMat);
    this.cores = new InstancedMesh(coreGeo, coreMat, count);
    this.shells = new InstancedMesh(shellGeo, shellMat, count);
    this.cores.renderOrder = 0;
    this.shells.renderOrder = 2;
    const rungs = helixRungs(code);
    for (const rung of rungs) {
      for (const strand of ['code', 'pair'] as Strand[]) {
        const from = new Vector3().copy(strand === 'code' ? rung.codeEnd : rung.pairEnd);
        const middle = new Vector3().copy(rung.middle);
        const to = middle.clone().addScaledVector(from.clone().sub(middle).normalize(), RUNG_GAP / 2);
        // Start the rung inside the backbone so it meets the glass cleanly.
        const start = from.clone().addScaledVector(middle.clone().sub(from).normalize(), 0.8);
        const d = to.clone().sub(start);
        const q = new Quaternion().setFromUnitVectors(new Vector3(0, 1, 0), d.clone().normalize());
        const mat = new Matrix4().compose(start.clone().add(to).multiplyScalar(0.5), q, new Vector3(1, d.length(), 1));
        const inst = strand === 'code' ? rung.index : GENOME_LENGTH + rung.index;
        this.poses[inst] = { pos: start.clone().add(to).multiplyScalar(0.5), q, len: d.length() };
        this.cores.setMatrixAt(inst, mat);
        this.shells.setMatrixAt(inst, mat);
      }
    }
    this.group.add(this.cores, this.shells);
    this.cores.visible = gl.cores;
    this.writeColours();
    const spec = PHYSICAL[material];
    if (spec) this.buildPhysical(spec);
  }

  /** Physical transmission glass in place of the custom shader (the custom meshes still take picks). */
  private buildPhysical(spec: PhysicalSpec): void {
    for (const m of this.customMeshes) m.visible = false;
    this.cores.visible = false;
    this.shells.visible = false;
    const glass = (): MeshPhysicalMaterial =>
      new MeshPhysicalMaterial({
        color: 0xffffff,
        metalness: 0,
        roughness: spec.roughness,
        transmission: spec.transmission,
        thickness: spec.thickness,
        ior: 1.47,
        envMapIntensity: 0.9,
        specularIntensity: 1,
        ...(spec.attenuation !== null ? { attenuationColor: new Color(spec.attenuation), attenuationDistance: 12 } : {}),
      });
    for (const tube of this.tubes) this.group.add(new Mesh(tube, glass()));
    const count = GENOME_LENGTH * 2;
    const shells = new InstancedMesh(new CylinderGeometry(1.2, 1.2, 1, 18, 1), glass(), count);
    // The cores keep the custom light and pulse (they carry what the glass cannot), in linear space.
    const coreMat = new ShaderMaterial({
      vertexShader: RUNG_VERT,
      fragmentShader: CORE_FRAG_LINEAR,
      uniforms: { uDim: { value: v3(LOOKS[this.look].dim) }, uGain: { value: 1.2 } },
    });
    this.materials.push(coreMat);
    const cores = spec.cores ? new InstancedMesh(this.cores.geometry, coreMat, count) : null;
    // Locked genes: a frosted sleeve that condenses over each rung, from inside the clear glass outward.
    const frost = new InstancedMesh(
      new CylinderGeometry(1.3, 1.3, 1, 18, 1),
      new MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.7, transmission: 0.7, thickness: 1.5, ior: 1.47, envMapIntensity: 0.9 }),
      count,
    );
    const m = new Matrix4();
    const zero = new Matrix4().makeScale(0, 0, 0);
    for (let i = 0; i < count; i++) {
      this.shells.getMatrixAt(i, m);
      shells.setMatrixAt(i, m);
      cores?.setMatrixAt(i, m);
      shells.setColorAt(i, new Color(0xffffff));
      frost.setMatrixAt(i, zero);
    }
    if (cores) this.group.add(cores);
    this.group.add(shells, frost);
    if (spec.rings) {
      // A fine frosted ring round the code backbone where each gene begins: the band boundary.
      const ringGeo = new TorusGeometry(1.72, 0.1, 8, 40);
      const ringMat = new MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.75, transmission: 0.5, thickness: 0.4, ior: 1.47, envMapIntensity: 1 });
      for (const band of this.bands) {
        if (band.start === 0) continue;
        const t = band.start - 0.5;
        const a = backbonePoint('code', t - 0.05);
        const b = backbonePoint('code', t + 0.05);
        const tangent = new Vector3(b.x - a.x, b.y - a.y, b.z - a.z).normalize();
        const ring = new Mesh(ringGeo, ringMat);
        const at = backbonePoint('code', t);
        ring.position.set(at.x, at.y, at.z);
        ring.quaternion.setFromUnitVectors(new Vector3(0, 0, 1), tangent);
        this.group.add(ring);
      }
    }
    this.scene.add(new AmbientLight(0xffffff, 0.35));
    const key = new DirectionalLight(0xffffff, 1.6);
    key.position.set(-3, 5, 6);
    this.scene.add(key);
    this.physical = { spec, shells, cores, frost };
    this.scene.background = linear(BACKDROP_HEX[this.look]);
  }

  /** Environment light for the physical materials, shared by the set. */
  setEnvironment(env: Texture): void {
    if (this.physical) this.scene.environment = env;
  }

  private writePhysicalColours(): void {
    const p = this.physical;
    if (!p) return;
    const la = this.lightAttr.array as Float32Array;
    const dim = rgb(LOOKS[this.look].dim);
    const c = new Color();
    for (let inst = 0; inst < GENOME_LENGTH * 2; inst++) {
      const i = inst % GENOME_LENGTH;
      const letter = inst < GENOME_LENGTH ? this.code.charAt(i) : complementStrand(this.code.charAt(i));
      const base = rgb(BASE_HEX[letter] ?? 0x888888);
      const L = la[inst]!;
      const k = 0.18 + 0.82 * L;
      const b = 0.62 + 0.38 * L;
      // Physical glass absorbs some light, so the inner light runs a little brighter than the shader's.
      const core = base.map((v, j) => Math.min(1, (dim[j]! + (v - dim[j]!) * k) * b * 1.25)) as [number, number, number];
      const t = p.spec.rungTint * (p.spec.rungTint >= 1 ? 0.35 + 0.65 * L : L);
      const shell = base.map((v, j) => 1 + (((p.spec.rungTint >= 1 ? core[j]! : v)) - 1) * t) as [number, number, number];
      p.shells.setColorAt(inst, c.setRGB(shell[0], shell[1], shell[2], SRGBColorSpace));
    }
    if (p.shells.instanceColor) p.shells.instanceColor.needsUpdate = true;
  }

  setLook(look: LabLook): void {
    this.look = look;
    for (const m of this.materials) applyLookTo(m, lookFor(this.material, look));
    if (this.physical) this.scene.background = linear(BACKDROP_HEX[look]);
  }

  get currentLook(): LabLook {
    return this.look;
  }

  setCode(code: string): void {
    this.code = code;
    this.writeColours();
  }

  /** Changes one base without animation (the pulse helpers call this when they finish). */
  setBase(index: number, base: string): void {
    this.code = this.code.slice(0, index) + base + this.code.slice(index + 1);
    this.writeColours(index);
  }

  private writeColours(only?: number): void {
    const a = this.colA.array as Float32Array;
    const b = this.colB.array as Float32Array;
    const from = only ?? 0;
    const to = only === undefined ? GENOME_LENGTH : only + 1;
    for (let i = from; i < to; i++) {
      const base = this.code.charAt(i);
      for (const [inst, letter] of [[i, base], [GENOME_LENGTH + i, complementStrand(base)]] as [number, string][]) {
        const c = rgb(BASE_HEX[letter] ?? 0x888888);
        a.set(c, inst * 3);
        b.set(c, inst * 3);
      }
    }
    this.colA.needsUpdate = true;
    this.colB.needsUpdate = true;
  }

  // Motion primitives -------------------------------------------------------------------------------

  /** Turns the base pair at t to face the viewer and brings it to mid-view. */
  turnTo(t: number, ms = dur('large')): void {
    this.spin.setSettle(ms);
    this.travel.setSettle(ms);
    this.spin.target = nearestSpin(this.spin.value, facingSpin(t));
    this.travel.target = t;
    if (motion.reduced) {
      this.spin.snap(this.spin.target);
      this.travel.snap(this.travel.target);
    }
  }

  /** Lights a gene and dims the rest to frosted grey; null returns every base to the resting light. */
  setFocus(band: Band | null, ms = dur('medium')): void {
    this.focus = band;
    for (let i = 0; i < GENOME_LENGTH; i++) {
      const s = this.light[i] as Damped;
      s.setSettle(motion.reduced ? 140 : ms);
      s.target = this.restingLight(i);
    }
  }

  private restingLight(i: number): number {
    if (!this.focus) return 0.62;
    return i >= this.focus.start && i < this.focus.start + this.focus.length ? 1 : 0.16;
  }

  /** Light passes along a rung and leaves the new base behind it. */
  pulseRung(index: number, next: string, mode: 'across' | 'meet', ms: number): Promise<void> {
    return new Promise((resolve) => {
      const prev = this.pulses.get(index);
      if (prev) {
        this.setBase(index, prev.next);
        prev.resolve();
      }
      const nb = this.colB.array as Float32Array;
      nb.set(rgb(BASE_HEX[next] ?? 0x888888), index * 3);
      nb.set(rgb(BASE_HEX[complementStrand(next)] ?? 0x888888), (GENOME_LENGTH + index) * 3);
      this.colB.needsUpdate = true;
      this.pulses.set(index, { start: performance.now(), ms: motion.reduced ? 1 : ms, mode, next, resolve });
    });
  }

  /** A soft band of light that slides along the code backbone from one base index to another. */
  travelLight(from: number, to: number, ms: number, width = 3): Promise<void> {
    if (motion.reduced) return Promise.resolve();
    this.travels.push({ from, to, start: performance.now(), ms, width });
    return new Promise((r) => setTimeout(r, ms));
  }

  /** Grows or clears the frost over a locked gene's rungs (physical glass only). */
  private stepLockFrost(dt: number): boolean {
    const p = this.physical;
    if (!p) return false;
    let busy = false;
    const m = new Matrix4();
    const scale = new Vector3();
    for (const [locus, a] of this.lockFrost) {
      a.step(dt);
      const band = this.bands.find((b) => b.locus === locus);
      if (!band) continue;
      // The sleeve starts inside the clear rung and grows out through it, like condensation forming.
      const v = a.value;
      const r = v < 0.01 ? 0 : 0.8 + 0.25 * v;
      for (let i = band.start; i < band.start + band.length; i++) {
        for (const inst of [i, GENOME_LENGTH + i]) {
          const pose = this.poses[inst]!;
          p.frost.setMatrixAt(inst, m.compose(pose.pos, pose.q, scale.set(r, r === 0 ? 0 : pose.len * (0.9 + 0.1 * v), r)));
        }
      }
      if (!a.settled) busy = true;
    }
    p.frost.instanceMatrix.needsUpdate = true;
    return busy;
  }

  setLocked(locus: number, locked: boolean): void {
    let a = this.lockFrost.get(locus);
    if (!a) {
      a = new Damped(0, dur('large'));
      this.lockFrost.set(locus, a);
    }
    a.setSettle(dur('large'));
    a.target = locked ? 1 : 0;
    if (motion.reduced) a.snap(a.target);
    if (locked) this.locked.add(locus);
    else this.locked.delete(locus);
    for (const b of this.bands) {
      if (b.locus === null) continue;
      for (let i = b.start; i < b.start + b.length; i++) this.state[i * 4 + 3] = this.locked.has(b.locus) ? 1 : 0;
    }
  }

  /** Called every frame. Returns true while anything is still moving. */
  step(dt: number, now: number): boolean {
    let busy = false;
    const idle = !this.focus && now - this.touchedAt > 2500 && !motion.reduced;
    if (idle && this.drift !== 0 && this.spin.settled) {
      this.spin.snap(this.spin.value + this.drift * dt);
      busy = true;
    }
    this.spin.step(dt);
    this.travel.step(dt);
    busy ||= !this.spin.settled || !this.travel.settled;
    const breathing = this.breathe && this.focus && !motion.reduced;
    const phase = breathing ? 0.5 + 0.5 * Math.cos((now / 4200) * 2 * Math.PI) : 1;
    const la = this.lightAttr.array as Float32Array;
    for (let i = 0; i < GENOME_LENGTH; i++) {
      const s = this.light[i] as Damped;
      if (breathing && this.focus && i >= this.focus.start && i < this.focus.start + this.focus.length && s.target >= 0.85) {
        s.target = 0.86 + 0.14 * phase;
      }
      s.step(dt);
      if (!s.settled) busy = true;
      if (this.flash[i]! > 0.001) {
        this.flash[i] = this.flash[i]! * Math.exp(-dt * 9);
        busy = true;
      } else this.flash[i] = 0;
      const v = Math.min(1, s.value + this.flash[i]!);
      la[i] = v;
      la[GENOME_LENGTH + i] = v;
      this.state[i * 4] = v - 0.62 > 0 ? (v - 0.62) / 0.38 : 0;
    }
    this.lightAttr.needsUpdate = true;
    this.writePhysicalColours();
    if (this.stepLockFrost(dt)) busy = true;
    if (breathing) busy = true;

    // Rung pulses.
    const pa = this.pulseAttr.array as Float32Array;
    pa.fill(0);
    for (const [index, p] of this.pulses) {
      const f = Math.min(1, (now - p.start) / p.ms);
      if (p.mode === 'across') {
        // Code half: backbone (0) to middle (1) in the first half; paired half: middle to backbone.
        const a = Math.min(1, f * 2);
        const b = Math.max(0, f * 2 - 1);
        pa.set([a * 1.1, 1, f < 0.5 ? 1 : 0.4 * (1 - b)], index * 3);
        pa.set([1 - b * 1.1, -1, f >= 0.5 ? 1 : 0], (GENOME_LENGTH + index) * 3);
      } else {
        pa.set([f * 1.1, 1, 1 - f * 0.4], index * 3);
        pa.set([f * 1.1, 1, 1 - f * 0.4], (GENOME_LENGTH + index) * 3);
      }
      if (f >= 1) {
        this.pulses.delete(index);
        this.setBase(index, p.next);
        this.flash[index] = Math.max(this.flash[index]!, 0.25);
        p.resolve();
      }
      busy = true;
    }
    this.pulseAttr.needsUpdate = true;

    // Travelling light along the backbone.
    for (let i = 0; i < GENOME_LENGTH; i++) this.state[i * 4 + 2] = 0;
    for (let k = this.travels.length - 1; k >= 0; k--) {
      const t = this.travels[k]!;
      const f = Math.min(1, (now - t.start) / t.ms);
      const e = 1 - (1 - f) * (1 - f) * (1 - f);
      const at = t.from + (t.to - t.from) * e;
      const fade = f < 0.85 ? 1 : (1 - f) / 0.15;
      for (let i = Math.max(0, Math.floor(at - t.width * 2)); i <= Math.min(GENOME_LENGTH - 1, Math.ceil(at + t.width * 2)); i++) {
        const d = (i - at) / t.width;
        this.state[i * 4 + 2] = Math.max(this.state[i * 4 + 2]!, Math.exp(-d * d) * fade);
      }
      if (f >= 1) this.travels.splice(k, 1);
      busy = true;
    }
    this.stateTexture.needsUpdate = true;

    this.group.rotation.y = this.spin.value;
    this.camera.position.set(0, -this.travel.value * RISE, this.distance());
    this.camera.lookAt(0, -this.travel.value * RISE, 0);
    this.onFrame?.(this);
    return busy;
  }

  private distance(): number {
    return this.span / (2 * Math.tan((FOV * Math.PI) / 360));
  }

  /** Pixels per ångström at the axis. */
  get pixelsPerUnit(): number {
    return this.rect.height / this.span;
  }

  /** Screen y (relative to the view) of a base index on the axis. */
  axisY(t: number): number {
    return this.rect.height / 2 + (t - this.travel.value) * RISE * this.pixelsPerUnit;
  }

  /** Where the axis sits across the view, as a fraction of its width. */
  axisFraction = 0.56;

  /** Ångströms of axis visible from top to bottom of the view. */
  span = 36 * RISE;

  /** View-relative screen point of a model-space point. */
  project(p: Vector3): { x: number; y: number } {
    const q = p.clone().applyMatrix4(this.group.matrixWorld).project(this.camera);
    return { x: ((q.x + 1) / 2) * this.rect.width, y: ((1 - q.y) / 2) * this.rect.height };
  }

  /** View-relative screen point of the middle of a half-rung. */
  basePoint(index: number, strand: Strand = 'code'): { x: number; y: number; front: boolean } {
    const r = helixRungs(this.code)[index]!;
    const from = new Vector3().copy(strand === 'code' ? r.codeEnd : r.pairEnd);
    const mid = new Vector3().copy(r.middle);
    const p = from.clone().lerp(mid, 0.45);
    const world = p.clone().applyMatrix4(this.group.matrixWorld);
    const front = world.z > 0;
    const s = this.project(p);
    return { ...s, front };
  }

  pick(x: number, y: number, raycaster: Raycaster): { index: number; strand: Strand } | null {
    const ndc = new Vector2((x / this.rect.width) * 2 - 1, -(y / this.rect.height) * 2 + 1);
    raycaster.setFromCamera(ndc, this.camera);
    const hit = raycaster.intersectObject(this.shells, false)[0];
    if (!hit || hit.instanceId === undefined) return null;
    return hit.instanceId < GENOME_LENGTH
      ? { index: hit.instanceId, strand: 'code' }
      : { index: hit.instanceId - GENOME_LENGTH, strand: 'pair' };
  }

  bandOf(index: number): Band | undefined {
    return bandAt(this.bands, index);
  }

  /** The spin at which the nearest base pair faces the viewer. */
  detent(spin: number): number {
    const k = Math.round((spin + GROOVE_ANGLE / 2) / TWIST);
    return k * TWIST - GROOVE_ANGLE / 2;
  }

  /** Index of the base pair facing the viewer nearest mid-view, for the detent's small flash. */
  facingIndex(): number {
    const centre = Math.round(this.travel.target);
    let best = centre;
    let bestErr = Infinity;
    for (let i = centre - 6; i <= centre + 6; i++) {
      if (i < 0 || i >= GENOME_LENGTH) continue;
      const target = nearestSpin(this.spin.target, facingSpin(i));
      const err = Math.abs(target - this.spin.target);
      if (err < bestErr) {
        bestErr = err;
        best = i;
      }
    }
    return best;
  }
}

// Several helices on one canvas ---------------------------------------------------------------------

export interface HelixSetOptions {
  count: number;
  /** Base pairs visible from top to bottom (default 36). */
  visiblePairs?: number;
  /** One material per view (default: the lit-core glass everywhere). */
  materials?: HelixMaterial[];
  species: SpeciesId;
  code: string;
  look: LabLook;
  reticle?: Reticle;
  onBase?: (view: number, index: number, strand: Strand) => void;
  onBand?: (view: number, band: Band) => void;
}

/**
 * One WebGL canvas holding `count` helices side by side, each with its own camera, state and DOM
 * overlay (for the ruler and anything a section attaches). Handles drag (spin with detents), wheel
 * (travel), hover (reticle frames the base) and clicks.
 */
export class GlassHelixSet {
  readonly el = document.createElement('div');
  readonly models: HelixModel[] = [];
  private readonly renderer: WebGLRenderer;
  private readonly raycaster = new Raycaster();
  private visible = false;
  private stopLoop: (() => void) | null = null;
  private drag: { view: number; x: number; lastX: number; lastT: number; v: number; moved: boolean } | null = null;

  constructor(readonly opts: HelixSetOptions) {
    this.el.className = 'helix-set';
    this.renderer = new WebGLRenderer({ antialias: true, alpha: true, premultipliedAlpha: true });
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    const canvas = this.renderer.domElement;
    canvas.className = 'helix-canvas';
    this.el.append(canvas);
    for (let i = 0; i < opts.count; i++) {
      const m = new HelixModel(opts.species, opts.code, opts.look, opts.materials?.[i] ?? 'lit');
      if (opts.visiblePairs) m.span = opts.visiblePairs * RISE;
      this.models.push(m);
      this.el.append(m.overlay);
      buildRuler(m, (band) => opts.onBand?.(i, band));
    }
    if (opts.materials?.some((k) => k in PHYSICAL)) {
      const pmrem = new PMREMGenerator(this.renderer);
      const env = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
      pmrem.dispose();
      for (const m of this.models) m.setEnvironment(env);
    }
    new ResizeObserver(() => this.layout()).observe(this.el);
    new IntersectionObserver((entries) => {
      this.visible = entries.some((e) => e.isIntersecting);
      if (this.visible) this.wake();
    }).observe(this.el);
    this.bindPointer(canvas);
  }

  setLook(look: LabLook): void {
    for (const m of this.models) m.setLook(look);
    this.wake();
  }

  /** Keeps the frame loop running until nothing moves (drift keeps it going while visible). */
  wake(): void {
    if (this.stopLoop) return;
    this.stopLoop = loop((dt, now) => {
      if (!this.visible) {
        this.stopLoop = null;
        return false;
      }
      let busy = false;
      for (const m of this.models) busy = m.step(dt, now) || busy;
      this.render();
      if (!busy) this.stopLoop = null;
      return busy;
    });
  }

  private layout(): void {
    const w = this.el.clientWidth;
    const h = this.el.clientHeight;
    this.renderer.setSize(w, h, true);
    const n = this.models.length;
    const gap = 1;
    const width = (w - gap * (n - 1)) / n;
    this.models.forEach((m, i) => {
      m.rect = { x: i * (width + gap), y: 0, width, height: h };
      m.camera.aspect = width / h;
      // Shift the projection so the axis sits right of centre, leaving the ruler room on the left.
      m.camera.setViewOffset(width, h, -(m.axisFraction - 0.5) * width, 0, width, h);
      m.camera.updateProjectionMatrix();
      Object.assign(m.overlay.style, { left: `${m.rect.x}px`, top: '0px', width: `${width}px`, height: `${h}px` });
    });
    this.wake();
  }

  private render(): void {
    const r = this.renderer;
    const h = this.el.clientHeight;
    r.setScissorTest(true);
    for (const m of this.models) {
      r.setViewport(m.rect.x, 0, m.rect.width, h);
      r.setScissor(m.rect.x, 0, m.rect.width, h);
      r.render(m.scene, m.camera);
    }
    r.setScissorTest(false);
  }

  private viewAt(clientX: number): { view: number; x: number; y: number; model: HelixModel } | null {
    const box = this.el.getBoundingClientRect();
    const x = clientX - box.left;
    for (let i = 0; i < this.models.length; i++) {
      const m = this.models[i]!;
      if (x >= m.rect.x && x < m.rect.x + m.rect.width) return { view: i, x: x - m.rect.x, y: 0, model: m };
    }
    return null;
  }

  private bindPointer(canvas: HTMLCanvasElement): void {
    const box = (): DOMRect => this.el.getBoundingClientRect();
    canvas.addEventListener('pointerdown', (e) => {
      const at = this.viewAt(e.clientX);
      if (!at) return;
      canvas.setPointerCapture(e.pointerId);
      at.model.touchedAt = performance.now();
      at.model.spin.snap(at.model.spin.value);
      this.drag = { view: at.view, x: e.clientX, lastX: e.clientX, lastT: performance.now(), v: 0, moved: false };
    });
    canvas.addEventListener('pointermove', (e) => {
      const at = this.viewAt(e.clientX);
      for (const m of this.models) m.hovering = m === at?.model;
      if (this.drag) {
        const m = this.models[this.drag.view]!;
        const now = performance.now();
        const dx = e.clientX - this.drag.lastX;
        if (Math.abs(e.clientX - this.drag.x) > 3) this.drag.moved = true;
        const dSpin = dx * 0.012;
        m.spin.snap(m.spin.value + dSpin);
        const dt = Math.max(1, now - this.drag.lastT) / 1000;
        this.drag.v = this.drag.v * 0.6 + (dSpin / dt) * 0.4;
        this.drag.lastX = e.clientX;
        this.drag.lastT = now;
        m.touchedAt = now;
        this.opts.reticle?.claim(null);
        this.wake();
        return;
      }
      if (!at) return;
      const y = e.clientY - box().top;
      const hit = at.model.pick(at.x, y, this.raycaster);
      canvas.style.cursor = hit ? 'pointer' : 'grab';
      at.model.overlay.dispatchEvent(new CustomEvent('hoverbase', { detail: hit }));
      if (hit && this.opts.reticle) {
        const p = at.model.basePoint(hit.index, hit.strand);
        const b = box();
        this.opts.reticle.claim({ x: b.left + at.model.rect.x + p.x - 11, y: b.top + p.y - 11, width: 22, height: 22, radius: 11 });
      } else this.opts.reticle?.claim(null);
      this.wake();
    });
    canvas.addEventListener('pointerleave', () => {
      for (const m of this.models) m.hovering = false;
      for (const m of this.models) m.overlay.dispatchEvent(new CustomEvent('hoverbase', { detail: null }));
      this.opts.reticle?.claim(null);
    });
    canvas.addEventListener('pointerup', (e) => {
      const d = this.drag;
      this.drag = null;
      if (!d) return;
      const m = this.models[d.view]!;
      m.touchedAt = performance.now();
      if (d.moved) {
        // Glide on with the release speed, then settle so the nearest base pair faces the viewer.
        m.spin.setSettle(dur('large'));
        m.spin.target = m.detent(m.spin.value + d.v * 0.14);
        m.spin.velocity = motion.reduced ? 0 : d.v;
        if (motion.reduced) m.spin.snap(m.spin.target);
        const facing = m.facingIndex();
        setTimeout(() => {
          m.flash[facing] = 0.3;
          this.wake();
        }, motion.reduced ? 0 : dur('large') * 0.7);
        this.wake();
        return;
      }
      const at = this.viewAt(e.clientX);
      if (!at) return;
      const hit = at.model.pick(at.x, e.clientY - box().top, this.raycaster);
      if (hit) this.opts.onBase?.(at.view, hit.index, hit.strand);
      this.wake();
    });
    this.el.addEventListener(
      'wheel',
      (e) => {
        const at = this.viewAt(e.clientX);
        if (!at) return;
        e.preventDefault();
        const m = at.model;
        m.touchedAt = performance.now();
        m.travel.setSettle(dur('medium'));
        m.travel.target = Math.max(0, Math.min(GENOME_LENGTH - 1, m.travel.target + e.deltaY * 0.035));
        if (motion.reduced) m.travel.snap(m.travel.target);
        this.wake();
      },
      { passive: false },
    );
  }
}

// Ruler ---------------------------------------------------------------------------------------------

const GROUP_NAMES: Record<Band['kind'], string> = {
  header: 'Header',
  form: 'Form',
  pigment: 'Pigment',
  seed: 'Seed',
  checksum: 'Checksum',
};

/**
 * The margin ruler: one segment per gene beside the helix, coloured for form and pigment genes,
 * grey for the rest. Group names are always shown; gene names appear as the pointer approaches.
 */
function buildRuler(m: HelixModel, onBand: (band: Band) => void): void {
  const ruler = document.createElement('div');
  ruler.className = 'ruler';
  const groups = document.createElement('div');
  groups.className = 'ruler-groups';
  m.overlay.append(ruler, groups);
  const segs = m.bands.map((band) => {
    const seg = document.createElement('button');
    seg.type = 'button';
    seg.className = `ruler-seg g-${band.kind}`;
    const name = band.locus === null ? GROUP_NAMES[band.kind] : geneAt(m.species, band.locus).name;
    seg.setAttribute('aria-label', name);
    const label = document.createElement('span');
    label.className = 'ruler-label';
    label.textContent = name;
    seg.append(label);
    seg.addEventListener('click', () => onBand(band));
    ruler.append(seg);
    return { band, seg, label };
  });
  const groupLabels = (['header', 'form', 'pigment', 'seed', 'checksum'] as const).map((kind) => {
    const el = document.createElement('span');
    el.className = `ruler-group g-${kind}`;
    el.textContent = GROUP_NAMES[kind];
    groups.append(el);
    const inGroup = m.bands.filter((b) => b.kind === kind);
    return { el, start: inGroup[0]!.start, end: inGroup[inGroup.length - 1]!.start + inGroup[inGroup.length - 1]!.length };
  });

  let pointerY: number | null = null;
  m.overlay.addEventListener('pointermove', (e) => (pointerY = e.clientY - m.overlay.getBoundingClientRect().top));
  m.overlay.addEventListener('pointerleave', () => (pointerY = null));
  let hoverBand: Band | null = null;
  m.overlay.addEventListener('hoverbase', (e) => {
    const hit = (e as CustomEvent<{ index: number } | null>).detail;
    hoverBand = hit ? (m.bandOf(hit.index) ?? null) : null;
  });
  const parent = m.onFrame;
  m.onFrame = (model) => {
    parent?.(model);
    const h = model.rect.height;
    for (const { band, seg, label } of segs) {
      const top = model.axisY(band.start - 0.5);
      const bottom = model.axisY(band.start + band.length - 0.5);
      seg.style.transform = `translateY(${top + 1}px)`;
      seg.style.height = `${Math.max(1, bottom - top - 2)}px`;
      seg.hidden = bottom < -40 || top > h + 40;
      const mid = (top + bottom) / 2;
      // Names fade in within about 70px of the pointer; the focused and hovered genes stay named.
      const near = pointerY === null ? 0 : Math.max(0, 1 - Math.abs(pointerY - mid) / 70);
      const named = band === model.focus || band === hoverBand ? 1 : near;
      label.style.opacity = String(named);
      seg.classList.toggle('focused', band === model.focus);
      seg.classList.toggle('locked', band.locus !== null && model.locked.has(band.locus));
    }
    for (const g of groupLabels) {
      const top = model.axisY(g.start - 0.5);
      const bottom = model.axisY(g.end - 0.5);
      const y = Math.min(Math.max(top, 8), bottom - 18);
      g.el.style.transform = `translateY(${y}px)`;
      g.el.hidden = bottom < 0 || top > h;
    }
  };
}
