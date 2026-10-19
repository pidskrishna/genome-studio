import {
  AmbientLight,
  BackSide,
  Color,
  Curve,
  CylinderGeometry,
  DirectionalLight,
  Group,
  InstancedBufferAttribute,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshPhysicalMaterial,
  PerspectiveCamera,
  Quaternion,
  Raycaster,
  Scene,
  ShaderMaterial,
  TorusGeometry,
  TubeGeometry,
  Vector2,
  Vector3,
  type Object3D,
  type Texture,
} from 'three';
import { complementStrand, GENOME_LENGTH, type SpeciesId } from '../genome';
import type { LookId } from '../render/colour';
import type { HelixPick } from './helix-controls';
import {
  BACKBONE_RADIUS,
  bandAt,
  backbonePoint,
  bandMiddle,
  baseOfInstance,
  facingSpin,
  helixBands,
  rotateY,
  rungAt,
  rungInstance,
  RISE,
  type Band,
  type Strand,
  type Vec3,
} from './helix-geometry';
import { Damped } from './motion';
import { BACKDROP_HEX } from './theme';

// The helix as a three.js scene, with its camera, picking and projection, but no renderer and no DOM,
// so picking can be tested without WebGL. The camera stays still: travelling moves the helix along
// its axis and rotating spins it about the axis. Only the editor's code is read; nothing here writes
// to the editor or to simulation state.
//
// Material (DESIGN.md section 6): borosilicate laboratory glass, nearly clear and faintly cool, that
// physically refracts what lies inside it. The glass cannot carry light, so the coloured cores do:
// each half-rung is a core lit from inside a clear glass shell, brightest for the focused gene. Gene
// boundaries are fine frosted rings on the code backbone; a locked gene's rungs frost over.

/** The four fixed base colours (spec section 5): the genome-browser convention (DESIGN.md section 2). */
export const BASE_COLOURS: Readonly<Record<string, number>> = {
  A: 0x1f9d4c,
  C: 0x2d68e8,
  G: 0xe07a12,
  T: 0xdf3a3c,
};

/** Light levels of a base's core: at rest, focused, and dimmed while another gene is focused. */
export const LIGHT = { rest: 0.62, focus: 1, dim: 0.16 } as const;

/** Colour a core dims towards, per look: a frosted grey that sits quietly on the look's backdrop. */
const DIM_HEX: Readonly<Record<LookId, number>> = { plate: 0xbab5aa, fluorescence: 0x34383e, glossy: 0x8a8d92 };
/** The selected base's outline, per look: the look's ink. */
const OUTLINE_HEX: Readonly<Record<LookId, number>> = { plate: 0x1c1a17, fluorescence: 0xe9ecef, glossy: 0x0f1114 };

const FIELD_OF_VIEW = 18;
/** Radius of both backbone tubes, in ångströms. */
const TUBE_RADIUS = 1.55;
const SHELL_RADIUS = 1.2;
const CORE_RADIUS = 0.42;
const FROST_RADIUS = 1.3;
/** Half the gap between neighbouring bands, in bases (the boundary ring covers it). */
const BAND_GAP = 0.09;
/** Gap where the two halves of a rung meet, in ångströms. */
const RUNG_GAP = 0.45;
/** Outer radius of the helix as drawn, for framing. */
const OUTER_RADIUS = BACKBONE_RADIUS + TUBE_RADIUS;
/** Base pairs visible from the top of the view to the bottom, when the column is tall enough. */
const VISIBLE_PAIRS = 36;

class BackboneCurve extends Curve<Vector3> {
  constructor(
    private readonly strand: Strand,
    private readonly from: number,
    private readonly to: number,
  ) {
    super();
  }

  override getPoint(u: number, target = new Vector3()): Vector3 {
    const p = backbonePoint(this.strand, this.from + (this.to - this.from) * u);
    return target.set(p.x, p.y, p.z);
  }
}

function vec(p: Vec3): Vector3 {
  return new Vector3(p.x, p.y, p.z);
}

/** The two ends of a half-rung: from its backbone to just short of the pair's meeting point. */
function halfRung(index: number, strand: Strand): { from: Vector3; to: Vector3 } {
  const rung = rungAt('', index);
  const from = vec(strand === 'code' ? rung.codeEnd : rung.pairEnd);
  const middle = vec(rung.middle);
  const to = middle.clone().addScaledVector(from.clone().sub(middle).normalize(), RUNG_GAP);
  return { from, to };
}

function segmentMatrix(from: Vector3, to: Vector3, radiusScale = 1, lengthExtra = 0): Matrix4 {
  const d = to.clone().sub(from);
  const length = d.length() + lengthExtra;
  const q = new Quaternion().setFromUnitVectors(new Vector3(0, 1, 0), d.normalize());
  return new Matrix4().compose(from.clone().add(to).multiplyScalar(0.5), q, new Vector3(radiusScale, length, radiusScale));
}

/** Laboratory borosilicate: nearly clear, faintly cool, physically refracting. */
function borosilicate(): MeshPhysicalMaterial {
  return new MeshPhysicalMaterial({
    color: 0xffffff,
    metalness: 0,
    roughness: 0.16,
    transmission: 1,
    thickness: 2.5,
    ior: 1.47,
    attenuationColor: new Color(0xd8ecef),
    attenuationDistance: 12,
    envMapIntensity: 0.9,
    specularIntensity: 1,
  });
}

/** Acid-etched glass for the gene boundaries and the frost on locked genes. */
function frosted(roughness: number, transmission: number, thickness: number): MeshPhysicalMaterial {
  return new MeshPhysicalMaterial({ color: 0xffffff, metalness: 0, roughness, transmission, thickness, ior: 1.47, envMapIntensity: 1 });
}

// The cores carry the light and the pulses. The base colour is the instance colour (exact, so it can be
// read back); the light level and the pulse are per-instance attributes. Mixing is done in sRGB, as in
// the lab, and the result is colour-managed, so a core looks the same seen directly or through glass.
const CORE_VERTEX = /* glsl */ `
  attribute vec3 aPrev;
  attribute vec3 aPulse;
  attribute float aLight;
  varying vec3 vColour;
  varying vec3 vPrev;
  varying vec3 vPulse;
  varying float vLight;
  varying float vS;
  void main() {
    vS = position.y + 0.5;
    vColour = instanceColor;
    vPrev = aPrev;
    vPulse = aPulse;
    vLight = aLight;
    gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0);
  }
`;

const CORE_FRAGMENT = /* glsl */ `
  uniform vec3 uDim;
  uniform float uGain;
  varying vec3 vColour;
  varying vec3 vPrev;
  varying vec3 vPulse;
  varying float vLight;
  varying float vS;
  void main() {
    // Pulse: a front at vPulse.x moving from the backbone (0) to the meeting point (1), with strength
    // vPulse.z; the new colour is left behind the front, the previous one lies ahead of it.
    float front = vPulse.x;
    float strength = vPulse.z;
    float passed = step(vS, front);
    vec3 current = sRGBTransferOETF(vec4(vColour, 1.0)).rgb;
    vec3 previous = sRGBTransferOETF(vec4(vPrev, 1.0)).rgb;
    vec3 base = mix(previous, current, strength > 0.001 ? passed : 1.0);
    float glow = strength * exp(-pow((vS - front) / 0.16, 2.0));
    vec3 c = mix(uDim, base, 0.18 + 0.82 * vLight) * (0.62 + 0.38 * vLight) * uGain;
    c = mix(min(c, vec3(1.0)), vec3(1.0), glow * 0.75);
    gl_FragColor = sRGBTransferEOTF(vec4(c, 1.0));
    #include <colorspace_fragment>
  }
`;

interface Pulse {
  start: number;
  ms: number;
}

export interface ScreenPoint {
  /** Pixels from the left and top of the helix canvas. */
  x: number;
  y: number;
}

export class HelixScene {
  readonly scene = new Scene();
  readonly camera = new PerspectiveCamera(FIELD_OF_VIEW, 1, 1, 4000);
  readonly helix = new Group();
  /** The coloured cores: they hold each base's colour and take picks. */
  private readonly rungs: InstancedMesh;
  /** The clear glass round each core; they take picks too, so a base is easy to hover. */
  private readonly shells: InstancedMesh;
  /** Frost that condenses over the rungs of locked genes. */
  private readonly frost: InstancedMesh;
  private readonly pairBackbone: Mesh;
  private readonly outline: Mesh;
  private readonly rings = new Group();
  private readonly glass = borosilicate();
  private readonly ringGlass = frosted(0.75, 0.5, 0.4);
  private readonly coreMaterial: ShaderMaterial;
  private readonly prevAttr: InstancedBufferAttribute;
  private readonly pulseAttr: InstancedBufferAttribute;
  private readonly lightAttr: InstancedBufferAttribute;
  private readonly poses: { pos: Vector3; q: Quaternion; len: number }[] = [];
  private bandMeshes: Mesh[] = [];
  private species: SpeciesId | null = null;
  private code = '';
  private look: LookId = 'glossy';
  private readonly raycaster = new Raycaster();
  bands: Band[] = [];
  width = 1;
  height = 1;
  travel = 0;
  spin = 0;
  /** Scale at the axis, in pixels per ångström. */
  pixelsPerUnit = 5;
  /** Screen x of the axis, in pixels from the left of the canvas. */
  axisX = 0;
  /** Light level of each base, settling towards its target. */
  private readonly light: Damped[] = [];
  /** A brief extra light on a base (the detent's click, the end of a pulse), fading away. */
  private readonly flash = new Float32Array(GENOME_LENGTH);
  private readonly pulses = new Map<number, Pulse>();
  /** Flashes waiting for their moment (the randomise ripple lights each gene on its turn). */
  private readonly laterFlashes: { index: number; amount: number; at: number }[] = [];
  private readonly lockFrost = new Map<number, Damped>();
  private focusBand: Band | null = null;
  /** The focused gene breathes gently (DESIGN.md section 5); off with reduced motion. */
  breathe = true;

  constructor(background = BACKDROP_HEX.glossy) {
    this.scene.add(this.helix);
    this.scene.background = new Color(background);
    this.scene.add(new AmbientLight(0xffffff, 0.35));
    const key = new DirectionalLight(0xffffff, 1.6);
    key.position.set(-3, 5, 6);
    this.scene.add(key);

    const count = GENOME_LENGTH * 2;
    const coreGeometry = new CylinderGeometry(CORE_RADIUS, CORE_RADIUS, 1, 10, 1);
    this.prevAttr = new InstancedBufferAttribute(new Float32Array(count * 3), 3);
    this.pulseAttr = new InstancedBufferAttribute(new Float32Array(count * 3), 3);
    this.lightAttr = new InstancedBufferAttribute(new Float32Array(count).fill(LIGHT.rest), 1);
    coreGeometry.setAttribute('aPrev', this.prevAttr);
    coreGeometry.setAttribute('aPulse', this.pulseAttr);
    coreGeometry.setAttribute('aLight', this.lightAttr);
    this.coreMaterial = new ShaderMaterial({
      vertexShader: CORE_VERTEX,
      fragmentShader: CORE_FRAGMENT,
      uniforms: { uDim: { value: new Vector3(...rgb(DIM_HEX[this.look])) }, uGain: { value: 1.2 } },
    });
    this.rungs = new InstancedMesh(coreGeometry, this.coreMaterial, count);
    this.shells = new InstancedMesh(new CylinderGeometry(SHELL_RADIUS, SHELL_RADIUS, 1, 18, 1), this.glass, count);
    this.frost = new InstancedMesh(new CylinderGeometry(FROST_RADIUS, FROST_RADIUS, 1, 18, 1), frosted(0.7, 0.7, 1.5), count);
    const zero = new Matrix4().makeScale(0, 0, 0);
    for (let i = 0; i < GENOME_LENGTH; i++) {
      for (const strand of ['code', 'pair'] as const) {
        const { from, to } = halfRung(i, strand);
        // The core starts inside the backbone so it meets the glass cleanly.
        const start = from.clone().addScaledVector(to.clone().sub(from).normalize(), 0.8);
        const inst = rungInstance(i, strand);
        const m = segmentMatrix(start, to);
        this.rungs.setMatrixAt(inst, m);
        this.shells.setMatrixAt(inst, m);
        this.frost.setMatrixAt(inst, zero);
        this.rungs.setColorAt(inst, new Color(0xffffff));
        const pos = new Vector3();
        const q = new Quaternion();
        const scale = new Vector3();
        m.decompose(pos, q, scale);
        this.poses[inst] = { pos, q, len: scale.y };
      }
      this.light.push(new Damped(LIGHT.rest, 220));
    }
    this.rungs.computeBoundingSphere();
    this.shells.computeBoundingSphere();
    this.helix.add(this.rungs, this.shells, this.frost, this.rings);

    const pairTube = new TubeGeometry(new BackboneCurve('pair', -0.5, GENOME_LENGTH - 0.5), GENOME_LENGTH * 8, TUBE_RADIUS, 14);
    this.pairBackbone = new Mesh(pairTube, this.glass);
    this.helix.add(this.pairBackbone);

    this.outline = new Mesh(new CylinderGeometry(1, 1, 1, 14, 1), new MeshBasicMaterial({ color: OUTLINE_HEX[this.look], side: BackSide }));
    this.outline.visible = false;
    this.helix.add(this.outline);
  }

  /** The look sets the backdrop the glass refracts, the colour cores dim towards, and the outline. */
  setLook(look: LookId): void {
    this.look = look;
    (this.scene.background as Color).setHex(BACKDROP_HEX[look]);
    (this.coreMaterial.uniforms.uDim!.value as Vector3).set(...rgb(DIM_HEX[look]));
    (this.outline.material as MeshBasicMaterial).color.setHex(OUTLINE_HEX[look]);
  }

  /** Environment light for the glass (made by the view, which has the renderer). */
  setEnvironment(env: Texture): void {
    this.scene.environment = env;
  }

  /** Shows a code: base colours, and the gene bands of its species. */
  setCode(code: string, species: SpeciesId): void {
    if (species !== this.species) this.buildBands(species);
    this.code = code;
    const colour = new Color();
    for (let i = 0; i < GENOME_LENGTH; i++) {
      const rung = rungAt(code, i);
      this.rungs.setColorAt(rungInstance(i, 'code'), colour.setHex(BASE_COLOURS[rung.base] ?? 0x999999));
      this.rungs.setColorAt(rungInstance(i, 'pair'), colour.setHex(BASE_COLOURS[rung.pair] ?? 0x999999));
    }
    if (this.rungs.instanceColor) this.rungs.instanceColor.needsUpdate = true;
  }

  /** The drawn colour (hex) of one half of a base's rung. */
  rungColour(index: number, strand: Strand): number {
    return this.rungs.getColorAt(rungInstance(index, strand), new Color()).getHex();
  }

  private buildBands(species: SpeciesId): void {
    this.species = species;
    for (const mesh of this.bandMeshes) {
      this.helix.remove(mesh);
      mesh.geometry.dispose();
    }
    for (const ring of [...this.rings.children]) this.rings.remove(ring);
    this.bands = helixBands(species);
    // The code backbone is one glass tube per band, so a band can be picked.
    this.bandMeshes = this.bands.map((band) => {
      const curve = new BackboneCurve('code', band.start - 0.5 + BAND_GAP, band.start + band.length - 0.5 - BAND_GAP);
      const mesh = new Mesh(new TubeGeometry(curve, band.length * 10, TUBE_RADIUS, 14), this.glass);
      mesh.userData.band = band;
      this.helix.add(mesh);
      return mesh;
    });
    // A fine frosted ring round the code backbone where each gene begins: the band boundary.
    const ringGeometry = new TorusGeometry(TUBE_RADIUS + 0.17, 0.1, 8, 40);
    for (const band of this.bands) {
      if (band.start === 0) continue;
      const t = band.start - 0.5;
      const a = backbonePoint('code', t - 0.05);
      const b = backbonePoint('code', t + 0.05);
      const ring = new Mesh(ringGeometry, this.ringGlass);
      ring.position.copy(vec(backbonePoint('code', t)));
      ring.quaternion.setFromUnitVectors(new Vector3(0, 0, 1), new Vector3(b.x - a.x, b.y - a.y, b.z - a.z).normalize());
      this.rings.add(ring);
    }
    this.focusBand = null;
    for (const [locus, frost] of this.lockFrost) {
      frost.snap(0);
      this.lockFrost.delete(locus);
    }
    this.frost.instanceMatrix.needsUpdate = true;
  }

  /** Sets the canvas size in CSS pixels and frames the helix for it. */
  setSize(width: number, height: number): void {
    this.width = Math.max(1, width);
    this.height = Math.max(1, height);
    // About 36 base pairs top to bottom, the helix no wider than about 30% of the column; the axis
    // at 56% of the width, leaving the margin ruler room on the left.
    this.pixelsPerUnit = Math.min(this.height / (VISIBLE_PAIRS * RISE), (this.width * 0.3) / (2 * OUTER_RADIUS));
    this.axisX = this.width * 0.56;
    const distance = this.height / (2 * Math.tan(((FIELD_OF_VIEW / 2) * Math.PI) / 180) * this.pixelsPerUnit);
    this.camera.aspect = this.width / this.height;
    this.camera.position.set((this.width / 2 - this.axisX) / this.pixelsPerUnit, 0, distance);
    this.camera.near = Math.max(1, distance - OUTER_RADIUS * 4);
    this.camera.far = distance + OUTER_RADIUS * 4;
    this.camera.updateProjectionMatrix();
    this.camera.updateMatrixWorld();
    this.update();
  }

  /** Bases visible above and below the middle of the view. */
  get halfView(): number {
    return this.height / 2 / (this.pixelsPerUnit * RISE);
  }

  setView(travel: number, spin: number): void {
    this.travel = Math.max(0, Math.min(GENOME_LENGTH - 1, travel));
    this.spin = spin;
    this.update();
  }

  /** Turns the base pair at index t to face the viewer and brings it to the middle of the view. */
  viewFor(t: number): { travel: number; spin: number } {
    return { travel: t, spin: facingSpin(t) };
  }

  // Light -------------------------------------------------------------------------------------------

  /**
   * Lights a gene's cores and dims the rest to frosted grey, settling over `ms`; null returns every
   * base to its resting light.
   */
  setFocusLight(band: Band | null, ms: number): void {
    this.focusBand = band;
    for (let i = 0; i < GENOME_LENGTH; i++) {
      const s = this.light[i]!;
      s.setSettle(ms);
      s.target = !band ? LIGHT.rest : i >= band.start && i < band.start + band.length ? LIGHT.focus : LIGHT.dim;
      if (ms <= 0) s.snap(s.target);
    }
  }

  get focusedBand(): Band | null {
    return this.focusBand;
  }

  /** A brief extra light on one base, fading in about a tenth of a second; `at` delays it. */
  flashBase(index: number, amount: number, at?: number): void {
    if (index < 0 || index >= GENOME_LENGTH) return;
    if (at !== undefined) this.laterFlashes.push({ index, amount, at });
    else this.flash[index] = Math.max(this.flash[index]!, amount);
  }

  /**
   * Light meets in the middle: two fronts leave both backbones and meet where the bases pair, leaving
   * the base's current colour behind them and the previous one (`previous`) ahead. A pulse that
   * starts later (the randomise ripple) shows the previous colour until it starts.
   */
  pulseBase(index: number, previous: string, ms: number, now: number): void {
    const prev = this.prevAttr.array as Float32Array;
    const c = new Color();
    c.setHex(BASE_COLOURS[previous] ?? 0x999999);
    prev.set([c.r, c.g, c.b], rungInstance(index, 'code') * 3);
    const pair = complementStrand(previous);
    c.setHex(BASE_COLOURS[pair] ?? 0x999999);
    prev.set([c.r, c.g, c.b], rungInstance(index, 'pair') * 3);
    this.prevAttr.needsUpdate = true;
    this.pulses.set(index, { start: now, ms: Math.max(1, ms) });
  }

  /** Frost condenses over (or clears from) a gene's rungs, over `ms`. */
  setLocked(locus: number, locked: boolean, ms: number): void {
    let a = this.lockFrost.get(locus);
    if (!a) {
      if (!locked) return;
      a = new Damped(0, ms);
      this.lockFrost.set(locus, a);
    }
    a.setSettle(ms);
    a.target = locked ? 1 : 0;
    if (ms <= 0) a.snap(a.target);
  }

  /**
   * Moves the light, the pulses and the frost on by dt seconds. Returns true while anything is still
   * changing. Rendering only: nothing here touches the code or the editor.
   */
  step(dt: number, now: number): boolean {
    let busy = false;
    const band = this.focusBand;
    const breathing = this.breathe && band !== null;
    // The focused gene breathes between 86% and 100% light on a 4.2-second cosine.
    const phase = breathing ? 0.5 + 0.5 * Math.cos((now / 4200) * 2 * Math.PI) : 1;
    const la = this.lightAttr.array as Float32Array;
    for (let i = 0; i < GENOME_LENGTH; i++) {
      const s = this.light[i]!;
      if (breathing && band && i >= band.start && i < band.start + band.length && s.target >= 0.85) s.target = 0.86 + 0.14 * phase;
      s.step(dt);
      if (!s.settled) busy = true;
      const f = this.flash[i]!;
      if (f > 0.001) {
        this.flash[i] = f * Math.exp(-dt * 9);
        busy = true;
      } else this.flash[i] = 0;
      const v = Math.min(1, s.value + this.flash[i]!);
      la[rungInstance(i, 'code')] = v;
      la[rungInstance(i, 'pair')] = v;
    }
    this.lightAttr.needsUpdate = true;
    if (breathing) busy = true;

    const pa = this.pulseAttr.array as Float32Array;
    pa.fill(0);
    for (let k = this.laterFlashes.length - 1; k >= 0; k--) {
      const f = this.laterFlashes[k]!;
      if (now >= f.at) {
        this.flashBase(f.index, f.amount);
        this.laterFlashes.splice(k, 1);
      }
      busy = true;
    }
    for (const [index, p] of this.pulses) {
      const f = Math.min(1, (now - p.start) / p.ms);
      // Before it starts: the front sits outside the rung, so the previous colour shows, unlit.
      const value = f < 0 ? [-1, 1, 0.002] : [f * 1.1, 1, 1 - f * 0.4];
      pa.set(value, rungInstance(index, 'code') * 3);
      pa.set(value, rungInstance(index, 'pair') * 3);
      if (f >= 1) {
        this.pulses.delete(index);
        this.flashBase(index, 0.25);
      }
      busy = true;
    }
    this.pulseAttr.needsUpdate = true;

    if (this.stepFrost(dt)) busy = true;
    return busy;
  }

  private stepFrost(dt: number): boolean {
    if (this.lockFrost.size === 0) return false;
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
        for (const strand of ['code', 'pair'] as const) {
          const inst = rungInstance(i, strand);
          const pose = this.poses[inst]!;
          this.frost.setMatrixAt(inst, m.compose(pose.pos, pose.q, scale.set(r, r === 0 ? 0 : pose.len * (0.9 + 0.1 * v), r)));
        }
      }
      if (!a.settled) busy = true;
      if (a.settled && a.value === 0) this.lockFrost.delete(locus);
    }
    this.frost.instanceMatrix.needsUpdate = true;
    return busy;
  }

  /** Outlines the selected base (0-based index), or nothing. */
  setSelected(index: number | null): void {
    if (index === null) {
      this.outline.visible = false;
      return;
    }
    const { from, to } = halfRung(index, 'code');
    this.outline.matrixAutoUpdate = false;
    this.outline.matrix.copy(segmentMatrix(from, to, SHELL_RADIUS + 0.35, 0.7));
    this.outline.matrixWorldNeedsUpdate = true;
    this.outline.visible = true;
  }

  private update(): void {
    this.helix.position.y = this.travel * RISE;
    this.helix.rotation.y = this.spin;
    this.scene.updateMatrixWorld(true);
  }

  // Picking and projection --------------------------------------------------------------------------

  /** What is under a canvas pixel: a base, a gene's band, the header or checksum band, or nothing. */
  pick(x: number, y: number): HelixPick {
    return this.probe(x, y).pick;
  }

  /** What is under a canvas pixel, and the band it belongs to (for hover). */
  probe(x: number, y: number): { pick: HelixPick; band: Band | null } {
    const hit = this.hitAt(x, y);
    if (!hit) return { pick: null, band: null };
    if ((hit.object === this.rungs || hit.object === this.shells) && hit.instanceId !== undefined) {
      const index = baseOfInstance(hit.instanceId).index;
      return { pick: { kind: 'base', index }, band: bandAt(this.bands, index) ?? null };
    }
    const band = hit.object.userData.band as Band | undefined;
    if (!band) return { pick: null, band: null };
    if (band.locus !== null) return { pick: { kind: 'gene', locus: band.locus }, band };
    return { pick: { kind: 'fixed', part: band.kind === 'header' ? 'header' : 'checksum' }, band };
  }

  private hitAt(x: number, y: number): { object: Object3D; instanceId?: number } | null {
    const ndc = new Vector2((x / this.width) * 2 - 1, 1 - (y / this.height) * 2);
    this.raycaster.setFromCamera(ndc, this.camera);
    const targets: Object3D[] = [this.rungs, this.shells, this.pairBackbone, ...this.bandMeshes];
    const hit = this.raycaster.intersectObjects(targets, false)[0];
    return hit ?? null;
  }

  /** Projects a point in helix coordinates to canvas pixels. */
  project(p: Vec3): ScreenPoint & { depth: number } {
    const v = vec(p).applyMatrix4(this.helix.matrixWorld);
    const depth = v.z;
    v.project(this.camera);
    return { x: ((v.x + 1) / 2) * this.width, y: ((1 - v.y) / 2) * this.height, depth };
  }

  /** Screen point of the axis at base index t (the ruler and the inspector line up with it). */
  axisY(t: number): number {
    return this.project({ x: 0, y: -t * RISE, z: 0 }).y;
  }

  /** Middle of the code half of a base's rung (0-based index), and whether it is in sight there. */
  basePoint(index: number): ScreenPoint & { visible: boolean } {
    const { from, to } = halfRung(index, 'code');
    const mid = from.add(to).multiplyScalar(0.5);
    const p = this.project(mid);
    const pick = this.pick(p.x, p.y);
    return { x: p.x, y: p.y, visible: this.inView(p) && pick?.kind === 'base' && pick.index === index };
  }

  /** The point of a band nearest the viewer (clear of its ends), and whether the band is in sight there. */
  bandPoint(band: Band): ScreenPoint & { visible: boolean } {
    let best: Vec3 = backbonePoint('code', bandMiddle(band), BACKBONE_RADIUS + TUBE_RADIUS * 0.6);
    let bestZ = -Infinity;
    // Sample well inside the band: at its very ends a ray can pass into the open end of the tube.
    const inset = BAND_GAP + 0.35;
    for (let k = 0; k <= 8; k++) {
      const t = band.start - 0.5 + inset + ((band.length - 2 * inset) * k) / 8;
      const p = backbonePoint('code', t, BACKBONE_RADIUS + TUBE_RADIUS * 0.6);
      const z = rotateY(p, this.spin).z;
      if (z > bestZ) {
        bestZ = z;
        best = p;
      }
    }
    const p = this.project(best);
    const hit = this.hitAt(p.x, p.y);
    const visible = this.inView(p) && hit !== null && hit.object.userData.band === band;
    return { x: p.x, y: p.y, visible };
  }

  private inView(p: ScreenPoint): boolean {
    return p.x >= 0 && p.x <= this.width && p.y >= 0 && p.y <= this.height;
  }

  /** The code shown, for checks. */
  get shownCode(): string {
    return this.code;
  }

  dispose(): void {
    this.scene.traverse((o) => {
      if (o instanceof Mesh) {
        o.geometry.dispose();
        (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => m.dispose());
      }
    });
  }
}

function rgb(hex: number): [number, number, number] {
  return [((hex >> 16) & 255) / 255, ((hex >> 8) & 255) / 255, (hex & 255) / 255];
}
