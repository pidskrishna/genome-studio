import { ShaderChunk, Vector2, type Material } from 'three';

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
//
// Screen-space patterns (milestone 9) must not depend on the tile either. `gl_FragCoord` is relative
// to the tile's render target, so every snapped material also gets WHOLE_FRAG_COORD, the fragment's
// position in pixels of the whole image (x from the left, y from the bottom), and the whole image's
// size. Three.js's own soft shadows rotate their samples by a noise keyed to `gl_FragCoord`; that is
// rewritten to the whole-image position too.

/** Sub-pixel grid, in steps per pixel. Coarser than any rasteriser's grid, so snapped points lie on it. */
export const SNAP_STEPS = 16;

/** Half the viewport of the whole image, in pixels. Shared by every snapped material. */
export const snapViewport = { value: new Vector2(1, 1) };

/**
 * The whole image: `origin` is the whole-image position (from the bottom-left, in pixels) of the
 * render target's bottom-left pixel corner, `size` the whole image's width and height, and `window`
 * the whole-image position of the bottom-left corner of the viewport window being drawn (zero unless
 * the image is larger than the viewport limit; see tiles.ts). Shared by every snapped material.
 */
export const wholeImage = {
  origin: { value: new Vector2(0, 0) },
  size: { value: new Vector2(1, 1) },
  window: { value: new Vector2(0, 0) },
};

const SNAP_GLSL = /* glsl */ `
  if (gl_Position.w > 0.0) {
    vec3 snapNdc = gl_Position.xyz / gl_Position.w;
    vec2 snapPx = floor(snapNdc.xy * uSnapHalfViewport * ${SNAP_STEPS.toFixed(1)} + 0.5) / ${SNAP_STEPS.toFixed(1)};
    gl_Position = vec4(snapPx / uSnapHalfViewport, snapNdc.z, 1.0);
  }
`;

const WHOLE_IMAGE_GLSL = /* glsl */ `uniform vec2 uWholeOrigin;
uniform vec2 uWholeSize;
#define WHOLE_FRAG_COORD (gl_FragCoord.xy + uWholeOrigin)
`;

/** Three.js's shadow sampling with its per-pixel noise keyed to the whole image, not the tile. */
export const WHOLE_IMAGE_SHADOW_CHUNK = ShaderChunk.shadowmap_pars_fragment.replaceAll('gl_FragCoord.xy', 'WHOLE_FRAG_COORD');

/**
 * Adds vertex snapping to a material (built in, or a shader material that includes `fog_vertex`),
 * and gives its fragment shader WHOLE_FRAG_COORD and `uWholeSize`.
 */
export function snapVertices<M extends Material>(material: M): M {
  const previous = material.onBeforeCompile.bind(material);
  material.onBeforeCompile = (shader, renderer) => {
    previous(shader, renderer);
    shader.uniforms.uSnapHalfViewport = snapViewport;
    shader.uniforms.uWholeOrigin = wholeImage.origin;
    shader.uniforms.uWholeSize = wholeImage.size;
    const anchor = '#include <fog_vertex>';
    if (!shader.vertexShader.includes(anchor)) throw new Error('Cannot add vertex snapping to this material');
    shader.vertexShader = `uniform vec2 uSnapHalfViewport;\n${shader.vertexShader.replace(anchor, `${anchor}\n${SNAP_GLSL}`)}`;
    shader.fragmentShader = WHOLE_IMAGE_GLSL + shader.fragmentShader.replace('#include <shadowmap_pars_fragment>', WHOLE_IMAGE_SHADOW_CHUNK);
  };
  const key = material.customProgramCacheKey.bind(material);
  material.customProgramCacheKey = () => `${key()}|snap${SNAP_STEPS}|whole`;
  material.needsUpdate = true;
  return material;
}
