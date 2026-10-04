import {
  AmbientLight,
  BackSide,
  Color,
  Curve,
  CylinderGeometry,
  DirectionalLight,
  DoubleSide,
  Fog,
  Group,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PerspectiveCamera,
  Quaternion,
  Raycaster,
  Scene,
  TubeGeometry,
  Vector2,
  Vector3,
  type Object3D,
} from 'three';
import { GENOME_LENGTH, type SpeciesId } from '../genome';
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
  type BandKind,
  type Strand,
  type Vec3,
} from './helix-geometry';

// The helix as a three.js scene, with its camera, picking and projection, but no renderer and no DOM,
// so picking can be tested without WebGL. The camera stays still: travelling moves the helix along
// its axis and rotating spins it about the axis. Only the editor's code is read; nothing here writes
// to the editor or to simulation state.

/** The four fixed base colours (spec section 5): the genome-browser convention (DESIGN.md section 2). */
export const BASE_COLOURS: Readonly<Record<string, number>> = {
  A: 0x1f9d4c,
  C: 0x2d68e8,
  G: 0xe07a12,
  T: 0xdf3a3c,
};

/** Band colours by group: only form and pigment genes have a hue (DESIGN.md section 2). */
export const BAND_COLOURS: Readonly<Record<BandKind, number>> = {
  header: 0x8c8f94,
  form: 0x4f6a8a,
  pigment: 0x8a5a7c,
  seed: 0x8c8f94,
  checksum: 0x8c8f94,
};

const FIELD_OF_VIEW = 24;
const BAND_RADIUS = 1.5;
const PAIR_BACKBONE_RADIUS = 1.05;
const RUNG_RADIUS = 0.85;
/** Half the gap between neighbouring bands, in bases. */
const BAND_GAP = 0.09;
/** Gap where the two halves of a rung meet, in ångströms. */
const RUNG_GAP = 0.25;
/** Outer radius of the helix as drawn, for framing. */
const OUTER_RADIUS = BACKBONE_RADIUS + BAND_RADIUS;

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

export interface ScreenPoint {
  /** Pixels from the left and top of the helix canvas. */
  x: number;
  y: number;
}

export class HelixScene {
  readonly scene = new Scene();
  readonly camera = new PerspectiveCamera(FIELD_OF_VIEW, 1, 1, 4000);
  readonly helix = new Group();
  private readonly rungs: InstancedMesh;
  private readonly pairBackbone: Mesh;
  private readonly outline: Mesh;
  private readonly sleeve = new Mesh(undefined, new MeshBasicMaterial({ transparent: true, opacity: 0.22, depthWrite: false }));
  private bandMeshes: Mesh<TubeGeometry, MeshStandardMaterial>[] = [];
  private species: SpeciesId | null = null;
  private code = '';
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
  private hovered: Band | null = null;
  private focused: number | null = null;

  private readonly fog: Fog;

  constructor(background = 0xffffff) {
    this.scene.add(this.helix);
    this.scene.add(new AmbientLight(0xffffff, 1.1));
    const key = new DirectionalLight(0xffffff, 1.9);
    key.position.set(0.5, 0.7, 1);
    this.scene.add(key);
    this.fog = new Fog(background, 1, 2);
    this.scene.fog = this.fog;

    const rungGeometry = new CylinderGeometry(RUNG_RADIUS, RUNG_RADIUS, 1, 10, 1);
    this.rungs = new InstancedMesh(rungGeometry, new MeshStandardMaterial({ roughness: 0.5 }), GENOME_LENGTH * 2);
    for (let i = 0; i < GENOME_LENGTH; i++) {
      for (const strand of ['code', 'pair'] as const) {
        const { from, to } = halfRung(i, strand);
        this.rungs.setMatrixAt(rungInstance(i, strand), segmentMatrix(from, to));
        this.rungs.setColorAt(rungInstance(i, strand), new Color(0xffffff));
      }
    }
    this.rungs.computeBoundingSphere();
    this.helix.add(this.rungs);

    const pairTube = new TubeGeometry(new BackboneCurve('pair', -0.5, GENOME_LENGTH - 0.5), GENOME_LENGTH * 8, PAIR_BACKBONE_RADIUS, 8);
    this.pairBackbone = new Mesh(pairTube, new MeshStandardMaterial({ color: 0xb4b8bf, roughness: 0.6 }));
    this.helix.add(this.pairBackbone);

    this.outline = new Mesh(new CylinderGeometry(1, 1, 1, 14, 1), new MeshBasicMaterial({ color: 0x1d1d1d, side: BackSide }));
    this.outline.visible = false;
    this.helix.add(this.outline);
    this.sleeve.visible = false;
    this.helix.add(this.sleeve);
  }

  /** Depth fades into the column's backdrop, which follows the look. */
  setBackdrop(hex: number): void {
    this.fog.color.setHex(hex);
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
      mesh.material.dispose();
    }
    this.bands = helixBands(species);
    this.bandMeshes = this.bands.map((band) => {
      const curve = new BackboneCurve('code', band.start - 0.5 + BAND_GAP, band.start + band.length - 0.5 - BAND_GAP);
      const geometry = new TubeGeometry(curve, band.length * 10, BAND_RADIUS, 10);
      const material = new MeshStandardMaterial({ color: BAND_COLOURS[band.kind], roughness: 0.45, side: DoubleSide });
      const mesh = new Mesh(geometry, material);
      mesh.userData.band = band;
      this.helix.add(mesh);
      return mesh;
    });
    this.hovered = null;
    this.focused = null;
    this.sleeve.visible = false;
  }

  /** Sets the canvas size in CSS pixels and frames the helix for it. */
  setSize(width: number, height: number): void {
    this.width = Math.max(1, width);
    this.height = Math.max(1, height);
    // The helix takes about a quarter of the column's width, leaving room for labels and the inspector.
    this.pixelsPerUnit = Math.min(7, Math.max(3.5, (this.width * 0.28) / (2 * OUTER_RADIUS)));
    this.axisX = 18 + OUTER_RADIUS * this.pixelsPerUnit;
    const distance = this.height / (2 * Math.tan(((FIELD_OF_VIEW / 2) * Math.PI) / 180) * this.pixelsPerUnit);
    this.camera.aspect = this.width / this.height;
    this.camera.position.set((this.width / 2 - this.axisX) / this.pixelsPerUnit, 0, distance);
    this.camera.near = Math.max(1, distance - OUTER_RADIUS * 4);
    this.camera.far = distance + OUTER_RADIUS * 4;
    this.camera.updateProjectionMatrix();
    this.camera.updateMatrixWorld();
    const fog = this.scene.fog as Fog;
    fog.near = distance - OUTER_RADIUS * 0.4;
    fog.far = distance + OUTER_RADIUS * 3.2;
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

  setHover(band: Band | null): void {
    if (band === this.hovered) return;
    this.hovered = band;
    this.paintBands();
  }

  setFocus(locus: number | null): void {
    if (locus === this.focused) return;
    this.focused = locus;
    const band = this.bands.find((b) => b.locus === locus);
    this.sleeve.geometry.dispose();
    if (!band) {
      this.sleeve.visible = false;
    } else {
      const curve = new BackboneCurve('code', band.start - 0.5 + BAND_GAP, band.start + band.length - 0.5 - BAND_GAP);
      this.sleeve.geometry = new TubeGeometry(curve, band.length * 10, BAND_RADIUS * 1.9, 12);
      (this.sleeve.material as MeshBasicMaterial).color.setHex(BAND_COLOURS[band.kind]);
      this.sleeve.visible = true;
    }
    this.paintBands();
  }

  /** Outlines the selected base (0-based index), or nothing. */
  setSelected(index: number | null): void {
    if (index === null) {
      this.outline.visible = false;
      return;
    }
    const { from, to } = halfRung(index, 'code');
    this.outline.matrixAutoUpdate = false;
    this.outline.matrix.copy(segmentMatrix(from, to, RUNG_RADIUS + 0.45, 0.7));
    this.outline.matrixWorldNeedsUpdate = true;
    this.outline.visible = true;
  }

  private paintBands(): void {
    this.bandMeshes.forEach((mesh, i) => {
      const band = this.bands[i]!;
      const lit = band === this.hovered ? 0.28 : band.locus !== null && band.locus === this.focused ? 0.12 : 0;
      mesh.material.emissive.setHex(BAND_COLOURS[band.kind]).multiplyScalar(lit);
    });
  }

  private update(): void {
    this.helix.position.y = this.travel * RISE;
    this.helix.rotation.y = this.spin;
    this.scene.updateMatrixWorld(true);
  }

  /** What is under a canvas pixel: a base, a gene's band, the header or checksum band, or nothing. */
  pick(x: number, y: number): HelixPick {
    return this.probe(x, y).pick;
  }

  /** What is under a canvas pixel, and the band it belongs to (for hover). */
  probe(x: number, y: number): { pick: HelixPick; band: Band | null } {
    const hit = this.hitAt(x, y);
    if (!hit) return { pick: null, band: null };
    if (hit.object === this.rungs && hit.instanceId !== undefined) {
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
    const targets: Object3D[] = [this.rungs, this.pairBackbone, ...this.bandMeshes];
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

  /** Screen point of the axis at base index t (labels and the inspector line up with it). */
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

  /** The point of a band nearest the viewer, and whether the band is in sight there. */
  bandPoint(band: Band): ScreenPoint & { visible: boolean } {
    let best: Vec3 = backbonePoint('code', bandMiddle(band), BACKBONE_RADIUS + BAND_RADIUS * 0.6);
    let bestZ = -Infinity;
    for (let k = 0; k <= 8; k++) {
      const t = band.start - 0.5 + BAND_GAP + ((band.length - 2 * BAND_GAP) * k) / 8;
      const p = backbonePoint('code', t, BACKBONE_RADIUS + BAND_RADIUS * 0.6);
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
