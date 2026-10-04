import { BufferAttribute, BufferGeometry, DataTexture, FloatType, NearestFilter, RGBAFormat } from 'three';
import { SNAP_STEPS } from './snap';

// A mesh whose shading does not depend on where the tile sits, for the fluorescence look.
//
// Graphics cards interpolate values across a triangle from absolute window positions, so a tile
// (drawn at a whole-pixel offset) gets interpolated normals and colours that differ from the whole
// frame's in the last bits. In an opaque look that flips a handful of pixels by one level. The
// fluorescence look sums every layer and then spreads each pixel over the bloom radius, which turns
// those last bits into dozens of differing pixels. So here nothing is interpolated by the card: each
// triangle is drawn on its own (non-indexed, three vertices per triangle), every vertex reads all
// three corners of its triangle from data textures, and the fragment shader receives them unchanged
// ("flat") and interpolates them itself, from barycentric coordinates computed in whole-image pixels.
// The same numbers go in for a tile and for the whole frame, so the same numbers come out.

/** Texels per row of the data textures. */
export const DATA_WIDTH = 2048;

export interface ExactMesh {
  /** Non-indexed geometry with one dummy attribute: three vertices per triangle. */
  geometry: BufferGeometry;
  /** Two texels per vertex: position, then normal. */
  vertices: DataTexture;
  /** One texel per vertex: linear colour. */
  colours: DataTexture;
  /** One texel per triangle: its three vertex indices. */
  triangles: DataTexture;
}

function dataTexture(texels: number): DataTexture {
  const height = Math.max(1, Math.ceil(texels / DATA_WIDTH));
  const t = new DataTexture(new Float32Array(DATA_WIDTH * height * 4), DATA_WIDTH, height, RGBAFormat, FloatType);
  t.minFilter = NearestFilter;
  t.magFilter = NearestFilter;
  t.generateMipmaps = false;
  t.needsUpdate = true;
  return t;
}

/** Builds the data textures for an indexed mesh with positions and normals. */
export function buildExactMesh(source: BufferGeometry): ExactMesh {
  const pos = source.getAttribute('position');
  const nor = source.getAttribute('normal');
  const index = source.getIndex();
  if (!index) throw new Error('Exact mesh needs an indexed geometry');
  const n = pos.count;
  const vertices = dataTexture(2 * n);
  const v = vertices.image.data as Float32Array;
  for (let i = 0; i < n; i++) {
    v[i * 8] = pos.getX(i);
    v[i * 8 + 1] = pos.getY(i);
    v[i * 8 + 2] = pos.getZ(i);
    v[i * 8 + 4] = nor.getX(i);
    v[i * 8 + 5] = nor.getY(i);
    v[i * 8 + 6] = nor.getZ(i);
  }
  const triangleCount = index.count / 3;
  const triangles = dataTexture(triangleCount);
  const t = triangles.image.data as Float32Array;
  for (let i = 0; i < triangleCount; i++) {
    // Indices below 2^24 are exact as single-precision numbers.
    t[i * 4] = index.getX(i * 3);
    t[i * 4 + 1] = index.getX(i * 3 + 1);
    t[i * 4 + 2] = index.getX(i * 3 + 2);
  }
  const geometry = new BufferGeometry();
  // Only its count matters (three vertices per triangle); the shader uses gl_VertexID.
  geometry.setAttribute('position', new BufferAttribute(new Uint8Array(triangleCount * 3), 1));
  if (source.boundingBox) geometry.boundingBox = source.boundingBox.clone();
  if (source.boundingSphere) geometry.boundingSphere = source.boundingSphere.clone();
  return { geometry, vertices, colours: dataTexture(n), triangles };
}

/** Copies linear RGB colours (three values per vertex) into the colour texture. */
export function setExactColours(mesh: ExactMesh, rgb: ArrayLike<number>): void {
  const c = mesh.colours.image.data as Float32Array;
  const n = rgb.length / 3;
  for (let i = 0; i < n; i++) {
    c[i * 4] = rgb[i * 3]!;
    c[i * 4 + 1] = rgb[i * 3 + 1]!;
    c[i * 4 + 2] = rgb[i * 3 + 2]!;
  }
  mesh.colours.needsUpdate = true;
}

export function disposeExactMesh(mesh: ExactMesh): void {
  mesh.geometry.dispose();
  mesh.vertices.dispose();
  mesh.colours.dispose();
  mesh.triangles.dispose();
}

/**
 * Vertex shader: fetches the three corners of this vertex's triangle, passes them on flat, and
 * places this vertex. Corner window positions use the same snapping as snap.ts, in whole-image pixels.
 */
export const EXACT_VERTEX = /* glsl */ `
uniform highp sampler2D uVertices;
uniform highp sampler2D uColours;
uniform highp sampler2D uTriangles;
uniform vec2 uExactHalfViewport;
uniform vec2 uExactWindowOrigin;
flat varying vec2 vW0;
flat varying vec2 vW1;
flat varying vec2 vW2;
flat varying vec3 vP0;
flat varying vec3 vP1;
flat varying vec3 vP2;
flat varying vec3 vN0;
flat varying vec3 vN1;
flat varying vec3 vN2;
flat varying vec3 vC0;
flat varying vec3 vC1;
flat varying vec3 vC2;
ivec2 texel(int i) {
  return ivec2(i % ${DATA_WIDTH}, i / ${DATA_WIDTH});
}
// One corner: view position, view normal, colour, clip position and snapped whole-image position.
void corner(int v, out vec3 p, out vec3 n, out vec3 c, out vec4 clip, out vec2 w) {
  vec3 position = texelFetch(uVertices, texel(2 * v), 0).xyz;
  vec3 normal = texelFetch(uVertices, texel(2 * v + 1), 0).xyz;
  c = texelFetch(uColours, texel(v), 0).rgb;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  p = mv.xyz;
  n = normalize(normalMatrix * normal);
  clip = projectionMatrix * mv;
  vec2 ndc = clip.xy / clip.w;
  vec2 snapped = floor(ndc * uExactHalfViewport * ${SNAP_STEPS.toFixed(1)} + 0.5) / ${SNAP_STEPS.toFixed(1)};
  w = snapped + uExactHalfViewport + uExactWindowOrigin;
}
void main() {
  int tri = gl_VertexID / 3;
  int k = gl_VertexID - 3 * tri;
  ivec3 idx = ivec3(texelFetch(uTriangles, texel(tri), 0).xyz);
  vec4 clip0;
  vec4 clip1;
  vec4 clip2;
  corner(idx.x, vP0, vN0, vC0, clip0, vW0);
  corner(idx.y, vP1, vN1, vC1, clip1, vW1);
  corner(idx.z, vP2, vN2, vC2, clip2, vW2);
  gl_Position = k == 0 ? clip0 : k == 1 ? clip1 : clip2;
  #include <fog_vertex>
}
`;

/** Fragment shader prelude: the corner values interpolated at this pixel, as vNormalV, vViewPos, vCol. */
export const EXACT_FRAGMENT_PRELUDE = /* glsl */ `
flat varying vec2 vW0;
flat varying vec2 vW1;
flat varying vec2 vW2;
flat varying vec3 vP0;
flat varying vec3 vP1;
flat varying vec3 vP2;
flat varying vec3 vN0;
flat varying vec3 vN1;
flat varying vec3 vN2;
flat varying vec3 vC0;
flat varying vec3 vC1;
flat varying vec3 vC2;
vec3 vNormalV;
vec3 vViewPos;
vec3 vCol;
// Barycentric coordinates of the pixel centre, clamped to the triangle (a pixel on an edge can have
// its centre just outside), from whole-image positions only.
void interpolateCorners() {
  vec2 e0 = vW1 - vW0;
  vec2 e1 = vW2 - vW0;
  vec2 d = WHOLE_FRAG_COORD - vW0;
  float den = e0.x * e1.y - e1.x * e0.y;
  vec3 b = vec3(0.0, (d.x * e1.y - e1.x * d.y) / den, (e0.x * d.y - d.x * e0.y) / den);
  b.x = 1.0 - b.y - b.z;
  b = clamp(b, 0.0, 1.0);
  b /= b.x + b.y + b.z;
  vNormalV = b.x * vN0 + b.y * vN1 + b.z * vN2;
  vViewPos = b.x * vP0 + b.y * vP1 + b.z * vP2;
  vCol = b.x * vC0 + b.y * vC1 + b.z * vC2;
}
`;
