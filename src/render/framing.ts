import { Box3, OrthographicCamera, PerspectiveCamera, Sphere, Vector3 } from 'three';

// Framing: where the cameras go so the organism is centred and fully in frame.
//  - 3D: a perspective camera on a fixed starting direction, far enough that the organism's
//    bounding sphere fits the narrower of the two fields of view, with a margin.
//  - Flat: straight down, no perspective, with the organism's top-down extent fitted to the frame.
// Screen right is +x in both views; in the flat view screen up is −z.

/** Share of the frame left empty around the organism. */
export const FRAME_MARGIN = 0.1;

/** Vertical field of view of the 3D camera, in degrees. */
export const FIELD_OF_VIEW = 30;

export interface ViewDirection {
  /** Angle around the vertical axis, in degrees; 0 looks along −z. */
  azimuth: number;
  /** Angle above the horizon, in degrees. */
  elevation: number;
}

/** Starting 3D direction per species: trees from just above the horizon, sheets from higher up. */
export const START_VIEW: Readonly<Record<'A' | 'B', ViewDirection>> = {
  A: { azimuth: 30, elevation: 12 },
  B: { azimuth: 30, elevation: 35 },
};

/** Unit vector from the target toward the camera. */
export function directionOf(view: ViewDirection): Vector3 {
  const az = (view.azimuth * Math.PI) / 180;
  const el = (view.elevation * Math.PI) / 180;
  return new Vector3(Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el));
}

/** Places a perspective camera so the sphere fits the frame at the camera's aspect. */
export function frame3D(camera: PerspectiveCamera, sphere: Sphere, view: ViewDirection): void {
  frame3DAlong(camera, sphere, directionOf(view));
}

/**
 * Places a perspective camera on a given direction (unit vector from the sphere's centre toward the
 * camera) so the sphere fits the frame at the camera's aspect, with the margin. Export's "fit to the
 * page" uses it with the stage camera's own direction.
 */
export function frame3DAlong(camera: PerspectiveCamera, sphere: Sphere, direction: Vector3): void {
  const r = Math.max(sphere.radius, 1e-6);
  const vHalf = (camera.fov * Math.PI) / 360;
  const hHalf = Math.atan(Math.tan(vHalf) * camera.aspect);
  const half = Math.min(vHalf, hHalf);
  // The sphere's tangent cone must fit inside the narrower half-angle, shrunk by the margin.
  const distance = r / Math.sin(Math.atan(Math.tan(half) * (1 - FRAME_MARGIN)));
  camera.position.copy(sphere.center).addScaledVector(direction, distance);
  camera.up.set(0, 1, 0);
  camera.lookAt(sphere.center);
  camera.near = Math.max(distance - r * 1.5, distance * 0.01);
  camera.far = distance + r * 1.5;
  camera.updateProjectionMatrix();
}

/** Places an orthographic camera straight down so the box's top-down extent fits the frame. */
export function frameFlat(camera: OrthographicCamera, box: Box3, aspect: number): void {
  const centre = box.getCenter(new Vector3());
  const size = box.getSize(new Vector3());
  const halfH = (Math.max(size.z, size.x / aspect, 1e-6) / 2) / (1 - FRAME_MARGIN);
  const halfW = halfH * aspect;
  camera.left = -halfW;
  camera.right = halfW;
  camera.top = halfH;
  camera.bottom = -halfH;
  const lift = Math.max(size.y, size.x, size.z, 1e-6);
  camera.position.set(centre.x, box.max.y + lift, centre.z);
  camera.up.set(0, 0, -1);
  camera.lookAt(centre.x, centre.y, centre.z);
  camera.near = lift * 0.5;
  camera.far = lift * 1.5 + size.y;
  camera.updateProjectionMatrix();
}
