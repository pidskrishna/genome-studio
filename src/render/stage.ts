import {
  Box3,
  Color,
  DirectionalLight,
  Mesh,
  MeshPhysicalMaterial,
  NoToneMapping,
  OrthographicCamera,
  PerspectiveCamera,
  PMREMGenerator,
  Scene,
  Sphere,
  SRGBColorSpace,
  Vector2,
  WebGLRenderer,
  WebGLRenderTarget,
  type BufferGeometry,
} from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import type { BranchGeometry } from '../sim/speciesA';
import type { SheetGeometry } from '../sim/speciesB';
import { buildBranchMesh } from './branch-mesh';
import { buildSheetMesh } from './sheet-mesh';
import { snapVertices, snapViewport } from './snap';
import { FIELD_OF_VIEW, frame3D, frameFlat, START_VIEW } from './framing';
import { flipRows, imageTiles, planRegion, stitch, type Pixels, type Rect } from './tiles';

// The stage: draws the organism in the glossy look, in the flat or the 3D view. It only reads the
// geometry it is given; nothing here writes back into simulation state. Drawing happens on demand
// (a new organism, a view change, an orbit or a resize), not every frame.

export type ViewMode = '3d' | 'flat';

export type Organism = { species: 'A'; geometry: BranchGeometry } | { species: 'B'; geometry: SheetGeometry };

/** Studio grey of the glossy look. */
const BACKGROUND = 0x9a9c9f;
/** Fixed surface colour until the pigment genes are wired to the renderer (milestone 9). */
const SURFACE = 0xc7a27a;

/** Multisampling for off-screen drawing, matching the on-screen antialiasing. */
const SAMPLES = 4;

export class Stage {
  readonly canvas: HTMLCanvasElement;
  private readonly renderer: WebGLRenderer;
  private readonly scene = new Scene();
  private readonly perspective = new PerspectiveCamera(FIELD_OF_VIEW, 1, 0.1, 1000);
  private readonly orthographic = new OrthographicCamera(-1, 1, 1, -1, 0.1, 1000);
  private readonly controls: OrbitControls;
  private readonly material: MeshPhysicalMaterial;
  private readonly resizeObserver: ResizeObserver;
  private mesh: Mesh | null = null;
  private species: Organism['species'] = 'A';
  private mode: ViewMode = '3d';
  private width = 1;
  private height = 1;
  private userMoved = false;
  private frameRequested = false;

  constructor(private readonly container: HTMLElement) {
    this.renderer = new WebGLRenderer({ antialias: true });
    this.renderer.outputColorSpace = SRGBColorSpace;
    this.renderer.toneMapping = NoToneMapping;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.canvas = this.renderer.domElement;
    this.canvas.style.display = 'block';
    this.canvas.style.width = '100%';
    this.canvas.style.height = '100%';
    container.appendChild(this.canvas);

    this.scene.background = new Color(BACKGROUND);
    const pmrem = new PMREMGenerator(this.renderer);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    pmrem.dispose();
    const key = new DirectionalLight(0xffffff, 1.3);
    key.position.set(1, 1.1, 1.4);
    this.scene.add(key);
    const rim = new DirectionalLight(0xffffff, 0.5);
    rim.position.set(-1.5, 0.5, -1);
    this.scene.add(rim);

    this.material = snapVertices(new MeshPhysicalMaterial({
      color: SURFACE,
      roughness: 0.42,
      metalness: 0,
      clearcoat: 0.6,
      clearcoatRoughness: 0.22,
      // Kept low so a surface seen straight down (the flat view) does not mirror the room's ceiling
      // lights to white. Off-screen targets skip tone mapping, so the screen does too, and the two match.
      envMapIntensity: 0.45,
    }));

    this.controls = new OrbitControls(this.perspective, this.canvas);
    this.controls.enableDamping = false;
    this.controls.enablePan = false;
    this.controls.addEventListener('start', () => (this.userMoved = true));
    this.controls.addEventListener('change', () => {
      // Orbit and zoom change the distance, so the depth range follows the camera.
      const b = this.bounds();
      if (b) fitDepthRange(this.perspective, b.sphere);
      this.requestRender();
    });

    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(container);
    this.resize();
  }

  get view(): ViewMode {
    return this.mode;
  }

  /** Replaces the organism on the stage and frames it from the starting direction. */
  setOrganism(organism: Organism): void {
    const geometry: BufferGeometry =
      organism.species === 'A' ? buildBranchMesh(organism.geometry) : buildSheetMesh(organism.geometry);
    if (this.mesh) {
      this.scene.remove(this.mesh);
      this.mesh.geometry.dispose();
    }
    this.mesh = new Mesh(geometry, this.material);
    this.scene.add(this.mesh);
    this.species = organism.species;
    this.userMoved = false;
    this.frame();
    this.requestRender();
  }

  setView(mode: ViewMode): void {
    this.mode = mode;
    this.controls.enabled = mode === '3d';
    this.frame();
    this.requestRender();
  }

  /** Returns the 3D view to its starting framing. */
  resetView(): void {
    this.userMoved = false;
    this.frame();
    this.requestRender();
  }

  /** Bounding box and sphere of the drawn organism (including radii and thickness). */
  bounds(): { box: Box3; sphere: Sphere } | null {
    const g = this.mesh?.geometry;
    if (!g?.boundingBox || !g.boundingSphere) return null;
    return { box: g.boundingBox, sphere: g.boundingSphere };
  }

  requestRender(): void {
    if (this.frameRequested) return;
    this.frameRequested = true;
    requestAnimationFrame(() => {
      this.frameRequested = false;
      this.renderNow();
    });
  }

  renderNow(): void {
    this.renderer.setRenderTarget(null);
    const size = this.renderer.getDrawingBufferSize(new Vector2());
    snapViewport.value.set(size.x / 2, size.y / 2);
    this.renderer.render(this.scene, this.activeCamera());
  }

  /**
   * Draws one sub-rectangle of a virtual image of fullWidth × fullHeight pixels, framed as the stage
   * is framed now (with the virtual image's aspect). Rows come back from the top. See tiles.ts for
   * why tiles are drawn with a shifted viewport rather than a cropped projection.
   */
  renderRegion(fullWidth: number, fullHeight: number, rect: Rect): Pixels {
    const plan = planRegion(fullWidth, fullHeight, rect, this.maxViewport);
    const camera = this.cameraFor(fullWidth / fullHeight);
    if (!plan.whole) {
      const w = plan.window;
      camera.setViewOffset(fullWidth, fullHeight, w.x, w.y, w.width, w.height);
      camera.updateProjectionMatrix();
    }
    const target = new WebGLRenderTarget(rect.width, rect.height, { samples: SAMPLES });
    target.texture.colorSpace = SRGBColorSpace;
    const v = plan.viewport;
    target.viewport.set(v.x, v.y, v.width, v.height);
    snapViewport.value.set(v.width / 2, v.height / 2);
    const data = new Uint8Array(rect.width * rect.height * 4);
    try {
      this.renderer.setRenderTarget(target);
      this.renderer.render(this.scene, camera);
      this.renderer.readRenderTargetPixels(target, 0, 0, rect.width, rect.height, data);
    } finally {
      this.renderer.setRenderTarget(null);
      target.dispose();
    }
    return flipRows({ width: rect.width, height: rect.height, data });
  }

  /** Draws a virtual image as (at least) cols × rows tiles and stitches them. */
  renderImage(width: number, height: number, cols = 1, rows = 1): Pixels {
    const rects = imageTiles(width, height, cols, rows, this.maxViewport);
    return stitch(width, height, rects, (rect) => this.renderRegion(width, height, rect));
  }

  /** Largest side of a viewport, and so of one window of a tiled image. */
  get maxViewport(): number {
    const gl = this.renderer.getContext();
    const dims = gl.getParameter(gl.MAX_VIEWPORT_DIMS) as Int32Array;
    return Math.min(dims[0]!, dims[1]!);
  }

  /** Largest side of one tile (one render target). */
  get maxTileSize(): number {
    return Math.min(this.renderer.capabilities.maxTextureSize, 4096);
  }

  dispose(): void {
    this.resizeObserver.disconnect();
    this.controls.dispose();
    this.mesh?.geometry.dispose();
    this.material.dispose();
    this.scene.environment?.dispose();
    this.renderer.dispose();
    this.canvas.remove();
  }

  private activeCamera(): PerspectiveCamera | OrthographicCamera {
    return this.mode === '3d' ? this.perspective : this.orthographic;
  }

  /** A copy of the current camera for an image of the given aspect. */
  private cameraFor(aspect: number): PerspectiveCamera | OrthographicCamera {
    if (this.mode === '3d') {
      const camera = this.perspective.clone();
      camera.aspect = aspect;
      camera.updateProjectionMatrix();
      return camera;
    }
    const camera = this.orthographic.clone();
    const b = this.bounds();
    if (b) frameFlat(camera, b.box, aspect);
    return camera;
  }

  private frame(): void {
    const b = this.bounds();
    if (!b) return;
    if (this.mode === 'flat') {
      frameFlat(this.orthographic, b.box, this.width / this.height);
    } else if (!this.userMoved) {
      frame3D(this.perspective, b.sphere, START_VIEW[this.species]);
      this.controls.target.copy(b.sphere.center);
      // Outside the bounding sphere, every vertex is in front of the camera (needed by snap.ts).
      this.controls.minDistance = b.sphere.radius * 1.1;
      this.controls.maxDistance = b.sphere.radius * 20;
      this.controls.update();
    }
  }

  private resize(): void {
    const w = Math.max(1, this.container.clientWidth);
    const h = Math.max(1, this.container.clientHeight);
    this.width = w;
    this.height = h;
    this.renderer.setSize(w, h, false);
    this.perspective.aspect = w / h;
    this.perspective.updateProjectionMatrix();
    this.frame();
    this.renderNow();
  }
}

function fitDepthRange(camera: PerspectiveCamera, sphere: Sphere): void {
  const d = camera.position.distanceTo(sphere.center);
  camera.near = Math.max(d - sphere.radius * 1.5, d * 0.01);
  camera.far = d + sphere.radius * 1.5;
  camera.updateProjectionMatrix();
}
