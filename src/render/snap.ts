import { Vector2, type Material } from 'three';

// Vertex snapping, so tiled drawing matches whole drawing pixel for pixel.
//
// Tiles are drawn with the whole image's projection and a viewport shifted by whole pixels (see
// tiles.ts). In exact arithmetic that rasterises identically, but graphics hardware adds the viewport
// offset in floating point, and the rounding moves a few vertices across the rasteriser's sub-pixel
// grid, flipping antialiasing samples along edges (measured: about 0.01% of pixels). So every vertex
// is snapped in the vertex shader to a 1/16-pixel grid of the whole image, after the perspective
// divide. A vertex on that grid stays on it under a whole-pixel shift, whatever the rounding, so the
// rasteriser sees the same positions in a tile as in the whole frame.
//
// The shift is at most 1/32 pixel. The cost is that values across a triangle are interpolated
// linearly on screen rather than with perspective correction, which is invisible at these triangle
// sizes. Vertices behind the camera are left alone; the stage keeps the camera outside the organism's
// bounding sphere, so there are none.

/** Sub-pixel grid, in steps per pixel. Coarser than any rasteriser's grid, so snapped points lie on it. */
export const SNAP_STEPS = 16;

/** Half the viewport of the whole image, in pixels. Shared by every snapped material. */
export const snapViewport = { value: new Vector2(1, 1) };

const SNAP_GLSL = /* glsl */ `
  if (gl_Position.w > 0.0) {
    vec3 snapNdc = gl_Position.xyz / gl_Position.w;
    vec2 snapPx = floor(snapNdc.xy * uSnapHalfViewport * ${SNAP_STEPS.toFixed(1)} + 0.5) / ${SNAP_STEPS.toFixed(1)};
    gl_Position = vec4(snapPx / uSnapHalfViewport, snapNdc.z, 1.0);
  }
`;

/** Adds vertex snapping to a built-in three.js material. */
export function snapVertices<M extends Material>(material: M): M {
  const previous = material.onBeforeCompile.bind(material);
  material.onBeforeCompile = (shader, renderer) => {
    previous(shader, renderer);
    shader.uniforms.uSnapHalfViewport = snapViewport;
    const anchor = '#include <fog_vertex>';
    if (!shader.vertexShader.includes(anchor)) throw new Error('Cannot add vertex snapping to this material');
    shader.vertexShader = `uniform vec2 uSnapHalfViewport;\n${shader.vertexShader.replace(anchor, `${anchor}\n${SNAP_GLSL}`)}`;
  };
  const key = material.customProgramCacheKey.bind(material);
  material.customProgramCacheKey = () => `${key()}|snap${SNAP_STEPS}`;
  material.needsUpdate = true;
  return material;
}
