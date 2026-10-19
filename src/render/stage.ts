import {
  Box3,
  BufferAttribute,
  Color,
  DirectionalLight,
  Mesh,
  NoToneMapping,
  OrthographicCamera,
  PCFShadowMap,
  PerspectiveCamera,
  PMREMGenerator,
  Scene,
  Sphere,
  SRGBColorSpace,
  Vector2,
  Vector3,
  WebGLRenderer,
  WebGLRenderTarget,
  type BufferGeometry,
  type Camera,
} from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import type { Pigments } from '../genome';
import type { BranchGeometry } from '../sim/speciesA';
import type { SheetGeometry } from '../sim/speciesB';
import { bloomKernel, BloomPass, paddedRect } from './bloom';
import { buildBranchMesh } from './branch-mesh';
import { buildExactMesh, disposeExactMesh, setExactColours, type ExactMesh } from './exact-mesh';
import { nodeColours, normaliseDrivers, vertexColours, type LookId } from './colour';
import { FIELD_OF_VIEW, frame3D, frame3DAlong, frameFlat, START_VIEW } from './framing';
import { BACKGROUNDS, LookMaterials } from './looks';
import { buildSheetMesh } from './sheet-mesh';
import { snapViewport, wholeImage } from './snap';
import { flipRows, imageTiles, planRegion, stitch, type Pixels, type Rect } from './tiles';

// The stage: draws the organism in one of the three looks (looks.ts), in the flat or the 3D view. It
// only reads the geometry and pigments it is given; nothing here writes back into simulation state.
// Drawing happens on demand (a new organism, a pigment edit, a look or view change, an orbit or a
// resize), not every frame. A pigment edit rewrites the vertex colours and material settings only.

export type ViewMode = '3d' | 'flat';
/** Export framing: as the stage is framed now, or the organism fitted to the page with a margin. */
export type Framing = 'stage' | 'fit';
export type { LookId } from './colour';

export type Organism = { species: 'A'; geometry: BranchGeometry } | { species: 'B'; geometry: SheetGeometry };

/** Multisampling for off-screen drawing, matching the on-screen antialiasing. */
const SAMPLES = 4;

/** Shown until the first pigments arrive: the species A wild type's. */
const DEFAULT_PIGMENTS: Pigments = { hueA: 120, hueB: 40, saturation: 0.6, lightness: 0.5, driver: 0, contrast: 0.5, gloss: 0.5, glow: 0.2 };

/** Direction towards the key light, which casts the glossy look's shadows. */
const KEY_DIRECTION = new Vector3(1, 1.1, 1.4).normalize();

interface Drawn {
  mesh: Mesh;
  outline: Mesh;
  /** The mesh the plate and fluorescence looks draw (exact-mesh.ts). */
  exactMesh: Mesh;
  exact: ExactMesh;
  colour: BufferAttribute;
  source: Uint32Array;
  drivers: Float32Array;
}

/** Where a render target sits in the whole image, and the viewport that puts it there. */
interface Placement {
  viewport: { x: number; y: number; width: number; height: number };
  /** Whole-image position (from the bottom-left) of the target's bottom-left corner. */
  origin: Vector2;
}

export class Stage {
  readonly canvas: HTMLCanvasElement;
  private readonly renderer: WebGLRenderer;
  private readonly scene = new Scene();
  private readonly perspective = new PerspectiveCamera(FIELD_OF_VIEW, 1, 0.1, 1000);
  private readonly orthographic = new OrthographicCamera(-1, 1, 1, -1, 0.1, 1000);
  private readonly controls: OrbitControls;
  private readonly looks = new LookMaterials();
  private readonly bloom: BloomPass;
  private readonly key: DirectionalLight;
  private readonly resizeObserver: ResizeObserver;
  private drawn: Drawn | null = null;
  private species: Organism['species'] = 'A';
  private mode: ViewMode = '3d';
  private lookId: LookId = 'glossy';
  private transparentBg = false;
  private pigments: Pigments = DEFAULT_PIGMENTS;
  private width = 1;
  private height = 1;
  private userMoved = false;
  private frameRequested = false;

  constructor(private readonly container: HTMLElement) {
    this.renderer = new WebGLRenderer({ antialias: true, alpha: true });
    this.renderer.outputColorSpace = SRGBColorSpace;
    this.renderer.toneMapping = NoToneMapping;
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    // Shadow maps are drawn from the light, so they do not depend on the tile; the soft-shadow noise
    // is keyed to whole-image pixels (snap.ts).
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = PCFShadowMap;
    this.canvas = this.renderer.domElement;
    this.canvas.style.display = 'block';
    this.canvas.style.width = '100%';
    this.canvas.style.height = '100%';
    container.appendChild(this.canvas);
    this.bloom = new BloomPass(this.renderer);

    const pmrem = new PMREMGenerator(this.renderer);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    pmrem.dispose();
    this.key = new DirectionalLight(0xffffff, 1.3);
    this.key.shadow.mapSize.set(2048, 2048);
    this.key.shadow.radius = 3;
    this.key.shadow.intensity = 0.75;
    this.scene.add(this.key, this.key.target);
    const rim = new DirectionalLight(0xffffff, 0.5);
    rim.position.set(-1.5, 0.5, -1);
    this.scene.add(rim);
    this.looks.setPigments(this.pigments);

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

    this.applyLook();
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(container);
    this.resize();
  }

  get view(): ViewMode {
    return this.mode;
  }

  get look(): LookId {
    return this.lookId;
  }

  get transparent(): boolean {
    return this.transparentBg;
  }

  /** Replaces the organism on the stage and frames it from the starting direction. */
  setOrganism(organism: Organism): void {
    const geometry: BufferGeometry =
      organism.species === 'A' ? buildBranchMesh(organism.geometry) : buildSheetMesh(organism.geometry);
    const source = geometry.userData.source as Uint32Array;
    const colour = new BufferAttribute(new Float32Array(source.length * 3), 3);
    geometry.setAttribute('color', colour);
    if (this.drawn) {
      this.scene.remove(this.drawn.mesh, this.drawn.outline, this.drawn.exactMesh);
      this.drawn.mesh.geometry.dispose();
      disposeExactMesh(this.drawn.exact);
    }
    const mesh = new Mesh(geometry, this.looks.glossy);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    const outline = new Mesh(geometry, this.looks.outline);
    outline.renderOrder = 1;
    outline.frustumCulled = false;
    const exact = buildExactMesh(geometry);
    this.looks.setExactMesh(exact);
    const exactMesh = new Mesh(exact.geometry, this.looks.exactSurface(this.lookId));
    exactMesh.frustumCulled = false;
    this.scene.add(mesh, outline, exactMesh);
    this.drawn = { mesh, outline, exactMesh, exact, colour, source, drivers: normaliseDrivers(organism.geometry.drivers) };
    this.species = organism.species;
    this.userMoved = false;
    this.fitShadow();
    this.applyLook();
    this.frame();
    this.requestRender();
  }

  /** Applies the pigment and surface genes. Never touches geometry, so it never needs a regrow. */
  setPigments(pigments: Pigments): void {
    this.pigments = pigments;
    this.looks.setPigments(pigments);
    this.recolour();
    this.requestRender();
  }

  setLook(look: LookId): void {
    this.lookId = look;
    this.applyLook();
    this.requestRender();
  }

  setTransparent(transparent: boolean): void {
    this.transparentBg = transparent;
    this.applyLook();
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
    const g = this.drawn?.mesh.geometry;
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
    const size = this.renderer.getDrawingBufferSize(new Vector2());
    const camera = this.activeCamera();
    const whole = { x: 0, y: 0, width: size.x, height: size.y };
    if (this.lookId === 'fluorescence') {
      this.drawBloomed(camera, size.x, size.y, whole, { viewport: { x: 0, y: 0, width: size.x, height: size.y }, origin: new Vector2() }, null);
      return;
    }
    this.prepare(camera, size.x, size.y, whole, new Vector2());
    this.renderer.setRenderTarget(null);
    this.renderScene(camera);
  }

  /**
   * Draws one sub-rectangle of a virtual image of fullWidth × fullHeight pixels, framed as the stage
   * is framed now (with the virtual image's aspect). Rows come back from the top. See tiles.ts for
   * why tiles are drawn with a shifted viewport rather than a cropped projection.
   *
   * Colours are sRGB-encoded and premultiplied by alpha in linear light (as a render target stores
   * them). With an opaque background alpha is 255 everywhere; for a transparent one, convert with
   * `toStraightAlpha` (tiles.ts) before writing a PNG.
   */
  renderRegion(fullWidth: number, fullHeight: number, rect: Rect, framing: Framing = 'stage'): Pixels {
    const plan = planRegion(fullWidth, fullHeight, rect, this.maxViewport);
    const camera = this.cameraFor(fullWidth / fullHeight, framing);
    if (!plan.whole) {
      const w = plan.window;
      camera.setViewOffset(fullWidth, fullHeight, w.x, w.y, w.width, w.height);
      camera.updateProjectionMatrix();
    }
    const place = (offsetX: number, offsetY: number): Placement => {
      const v = plan.viewport;
      const viewport = { x: v.x + offsetX, y: v.y + offsetY, width: v.width, height: v.height };
      const w = plan.window;
      return { viewport, origin: new Vector2(w.x - viewport.x, fullHeight - w.y - w.height - viewport.y) };
    };
    const bloomed = this.lookId === 'fluorescence';
    // Graphics cards take screen-space derivatives (used by the glossy material's lighting) over 2 × 2
    // pixel groups counted from the target's corner, so the target starts on an even whole-image pixel:
    // one extra column or row when the tile starts on an odd one.
    const even = place(0, 0).origin;
    const padLeft = bloomed ? 0 : even.x & 1;
    const padBottom = bloomed ? 0 : even.y & 1;
    const target = new WebGLRenderTarget(rect.width + padLeft, rect.height + padBottom, { samples: bloomed ? 0 : SAMPLES, depthBuffer: !bloomed });
    target.texture.colorSpace = SRGBColorSpace;
    const data = new Uint8Array(rect.width * rect.height * 4);
    try {
      if (bloomed) {
        this.drawBloomed(camera, fullWidth, fullHeight, rect, place(0, 0), target, plan.window);
      } else {
        const p = place(padLeft, padBottom);
        target.viewport.set(p.viewport.x, p.viewport.y, p.viewport.width, p.viewport.height);
        this.prepare(camera, fullWidth, fullHeight, plan.window, p.origin);
        this.renderer.setRenderTarget(target);
        this.renderScene(camera);
      }
      this.renderer.readRenderTargetPixels(target, padLeft, padBottom, rect.width, rect.height, data);
    } finally {
      this.renderer.setRenderTarget(null);
      target.dispose();
    }
    return flipRows({ width: rect.width, height: rect.height, data });
  }

  /** Draws a virtual image as (at least) cols × rows tiles and stitches them. */
  renderImage(width: number, height: number, cols = 1, rows = 1, framing: Framing = 'stage'): Pixels {
    const rects = imageTiles(width, height, cols, rows, this.maxViewport);
    try {
      return stitch(width, height, rects, (rect) => this.renderRegion(width, height, rect, framing));
    } finally {
      this.finishRegions();
    }
  }

  /** Frees what drawing regions keeps between tiles (the bloom's targets); call after an export. */
  finishRegions(): void {
    this.bloom.release();
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

  /**
   * Extra pixels drawn on each side of a tile of a width × height image in the current look (the
   * fluorescence bloom's margin), so an exporter can keep tile plus margin within maxTileSize.
   */
  tileMargin(width: number, height: number): number {
    if (this.lookId !== 'fluorescence') return 0;
    const k = bloomKernel(this.looks.bloomSettings.sigma * Math.min(width, height));
    return k.reach + k.factor;
  }

  dispose(): void {
    this.resizeObserver.disconnect();
    this.controls.dispose();
    this.drawn?.mesh.geometry.dispose();
    if (this.drawn) disposeExactMesh(this.drawn.exact);
    this.looks.dispose();
    this.bloom.dispose();
    this.scene.environment?.dispose();
    this.key.shadow.map?.dispose();
    this.renderer.dispose();
    this.canvas.remove();
  }

  /** Sets the uniforms shared by every snapped material for drawing into one target of a whole image. */
  private prepare(camera: Camera, fullWidth: number, fullHeight: number, window: Rect, origin: Vector2): void {
    snapViewport.value.set(window.width / 2, window.height / 2);
    wholeImage.size.value.set(fullWidth, fullHeight);
    wholeImage.origin.value.copy(origin);
    wholeImage.window.value.set(window.x, fullHeight - window.y - window.height);
    const b = this.bounds();
    if (b) {
      camera.updateMatrixWorld();
      const depth = -b.sphere.center.clone().applyMatrix4(camera.matrixWorldInverse).z;
      this.looks.setFade(depth - b.sphere.radius, depth + b.sphere.radius);
    }
  }

  /**
   * The fluorescence look: the organism drawn into a padded target, bloomed, and the tile (`rect`, in
   * whole-image pixels from the top-left) written to `output` (or to the canvas when null).
   * `place` positions a target the size of `rect`; the padded target is offset from it.
   */
  private drawBloomed(camera: Camera, fullWidth: number, fullHeight: number, rect: Rect, place: Placement, output: WebGLRenderTarget | null, window: Rect = { x: 0, y: 0, width: fullWidth, height: fullHeight }): void {
    const settings = this.looks.bloomSettings;
    const kernel = bloomKernel(settings.sigma * Math.min(fullWidth, fullHeight));
    const pad = paddedRect(rect, fullHeight, kernel);
    const left = rect.x - pad.x;
    const bottom = pad.y + pad.height - (rect.y + rect.height);
    const v = place.viewport;
    const viewport = { x: v.x + left, y: v.y + bottom, width: v.width, height: v.height };
    const origin = new Vector2(place.origin.x - left, place.origin.y - bottom);
    this.bloom.render({
      width: pad.width,
      height: pad.height,
      kernel,
      strength: settings.strength,
      transparent: this.transparentBg,
      offset: new Vector2(left, bottom),
      output,
      drawScene: (target) => {
        target.viewport.set(viewport.x, viewport.y, viewport.width, viewport.height);
        this.prepare(camera, fullWidth, fullHeight, window, origin);
        this.renderer.setRenderTarget(target);
        this.renderScene(camera);
      },
    });
  }

  /**
   * Draws the scene into the current target. Three.js uploads changed vertex attributes once per
   * frame number, but it marks geometry as updated during the shadow pass after advancing that number,
   * so the next frame would skip a changed attribute (a pigment edit or look change right after a
   * glossy frame would draw stale colours). Advancing the number first makes every draw upload them.
   */
  private renderScene(camera: Camera): void {
    this.renderer.info.render.frame++;
    this.renderer.render(this.scene, camera);
  }

  /** Material, background, outline and shadows for the current look and background option. */
  private applyLook(): void {
    const look = this.lookId;
    this.scene.background = this.transparentBg ? null : new Color(BACKGROUNDS[look]);
    this.looks.setTransparent(this.transparentBg);
    this.key.castShadow = look === 'glossy';
    if (this.drawn) {
      this.drawn.mesh.visible = look === 'glossy';
      this.drawn.exactMesh.material = this.looks.exactSurface(look);
      this.drawn.exactMesh.visible = look !== 'glossy';
      this.drawn.outline.visible = look === 'plate';
    }
    this.recolour();
  }

  /** Rewrites the vertex colours from the pigments for the current look. */
  private recolour(): void {
    const d = this.drawn;
    if (!d) return;
    vertexColours(nodeColours(d.drivers, this.pigments, this.lookId), d.source, d.colour.array as Float32Array);
    d.colour.needsUpdate = true;
    if (this.lookId !== 'glossy') setExactColours(d.exact, d.colour.array);
  }

  /** Points the key light's shadow camera at the organism's bounding sphere. */
  private fitShadow(): void {
    const b = this.bounds();
    if (!b) return;
    const { center, radius } = b.sphere;
    const shadow = this.key.shadow;
    const cam = shadow.camera;
    this.key.position.copy(center).addScaledVector(KEY_DIRECTION, radius * 2);
    this.key.target.position.copy(center);
    this.key.target.updateMatrixWorld();
    cam.left = -radius;
    cam.right = radius;
    cam.top = radius;
    cam.bottom = -radius;
    cam.near = radius * 0.5;
    cam.far = radius * 3.5;
    cam.updateProjectionMatrix();
    // Bias in world units, about one and a half shadow-map texels.
    shadow.normalBias = (radius * 2 / shadow.mapSize.x) * 1.5;
    shadow.bias = -0.0005;
    shadow.needsUpdate = true;
  }

  private activeCamera(): PerspectiveCamera | OrthographicCamera {
    return this.mode === '3d' ? this.perspective : this.orthographic;
  }

  /** A copy of the current camera for an image of the given aspect (refitted for 'fit'). */
  private cameraFor(aspect: number, framing: Framing = 'stage'): PerspectiveCamera | OrthographicCamera {
    if (this.mode === '3d') {
      const camera = this.perspective.clone();
      camera.aspect = aspect;
      const b = this.bounds();
      if (framing === 'fit' && b) {
        // Same viewing direction as the stage, distance set so the organism fits the page.
        const direction = camera.position.clone().sub(this.controls.target).normalize();
        frame3DAlong(camera, b.sphere, direction);
      }
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
