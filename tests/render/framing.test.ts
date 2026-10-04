import { describe, expect, it } from 'vitest';
import { OrthographicCamera, PerspectiveCamera, Vector3, type BufferGeometry, type Camera } from 'three';
import { buildBranchMesh } from '../../src/render/branch-mesh';
import { FIELD_OF_VIEW, FRAME_MARGIN, frame3D, frameFlat, START_VIEW } from '../../src/render/framing';
import { buildSheetMesh } from '../../src/render/sheet-mesh';
import { BODY_PLANS } from '../../src/sim/speciesB/params';
import { wildA, wildB } from './fixtures';

// "The organism centred and fully in frame": every drawn vertex projects inside the frame, the
// organism's extent is centred, and it fills a fair share of the frame, at any stage shape.

const ASPECTS = [0.6, 1, 16 / 9, 2.5];

/** Extent of all vertices in normalised device coordinates (−1 to 1 is the frame). */
function ndcExtent(geometry: BufferGeometry, camera: Camera) {
  camera.updateMatrixWorld();
  const pos = geometry.getAttribute('position');
  const p = new Vector3();
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (let i = 0; i < pos.count; i++) {
    p.fromBufferAttribute(pos, i).project(camera);
    minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x);
    minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y);
    minZ = Math.min(minZ, p.z); maxZ = Math.max(maxZ, p.z);
  }
  return { minX, maxX, minY, maxY, minZ, maxZ };
}

const organisms: [string, () => BufferGeometry, 'A' | 'B'][] = [
  ['species A wild type', () => buildBranchMesh(wildA()), 'A'],
  ...BODY_PLANS.map((plan): [string, () => BufferGeometry, 'A' | 'B'] => [`species B wild type, ${plan}`, () => buildSheetMesh(wildB(plan)), 'B']),
];

describe.each(organisms)('%s', (_label, build, species) => {
  const geometry = build();

  it.each(ASPECTS)('3D view at aspect %d: inside the frame, centred, filling it', (aspect) => {
    const camera = new PerspectiveCamera(FIELD_OF_VIEW, aspect, 0.1, 1000);
    frame3D(camera, geometry.boundingSphere!, START_VIEW[species]);
    const e = ndcExtent(geometry, camera);
    // Inside the frame, with room to spare, and between the near and far planes.
    for (const v of [e.minX, e.minY]) expect(v).toBeGreaterThan(-1 + FRAME_MARGIN / 2);
    for (const v of [e.maxX, e.maxY]) expect(v).toBeLessThan(1 - FRAME_MARGIN / 2);
    expect(e.minZ).toBeGreaterThan(-1);
    expect(e.maxZ).toBeLessThan(1);
    // Centred: the bounding sphere's centre is on the axis, so the extent is close to symmetric.
    expect(Math.abs(e.minX + e.maxX) / 2).toBeLessThan(0.15);
    expect(Math.abs(e.minY + e.maxY) / 2).toBeLessThan(0.15);
    // Not lost in the frame: it spans at least half of it in one direction.
    expect(Math.max(e.maxX - e.minX, e.maxY - e.minY) / 2).toBeGreaterThan(0.5);
  });

  it.each(ASPECTS)('flat view at aspect %d: straight down, inside the frame, centred, filling it', (aspect) => {
    const camera = new OrthographicCamera(-1, 1, 1, -1, 0.1, 1000);
    frameFlat(camera, geometry.boundingBox!, aspect);
    const dir = camera.getWorldDirection(new Vector3());
    expect(dir.y).toBeCloseTo(-1, 12);
    const e = ndcExtent(geometry, camera);
    for (const v of [e.minX, e.minY]) expect(v).toBeGreaterThanOrEqual(-(1 - FRAME_MARGIN) - 1e-6);
    for (const v of [e.maxX, e.maxY]) expect(v).toBeLessThanOrEqual(1 - FRAME_MARGIN + 1e-6);
    expect(e.minZ).toBeGreaterThan(-1);
    expect(e.maxZ).toBeLessThan(1);
    expect(Math.abs(e.minX + e.maxX) / 2).toBeLessThan(1e-6);
    expect(Math.abs(e.minY + e.maxY) / 2).toBeLessThan(1e-6);
    // The limiting direction touches the margin exactly.
    expect(Math.max(e.maxX - e.minX, e.maxY - e.minY) / 2).toBeCloseTo(1 - FRAME_MARGIN, 6);
  });
});
