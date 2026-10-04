import { describe, expect, it } from 'vitest';
import { MeshBasicMaterial, MeshPhysicalMaterial, ShaderLib, type WebGLProgramParametersWithUniforms, type WebGLRenderer } from 'three';
import { SNAP_STEPS, snapVertices, snapViewport } from '../../src/render/snap';
import { mulberry32 } from '../../src/genome/test-helpers';

function compile(material: MeshPhysicalMaterial | MeshBasicMaterial, vertexShader: string) {
  const shader = { uniforms: {}, vertexShader, fragmentShader: '' } as unknown as WebGLProgramParametersWithUniforms;
  material.onBeforeCompile(shader, {} as WebGLRenderer);
  return shader;
}

describe('vertex snapping', () => {
  it('adds the snap after the last vertex step of the physical material and shares one viewport uniform', () => {
    const shader = compile(snapVertices(new MeshPhysicalMaterial()), ShaderLib.physical.vertexShader);
    expect(shader.uniforms.uSnapHalfViewport).toBe(snapViewport);
    const body = shader.vertexShader;
    expect(body.startsWith('uniform vec2 uSnapHalfViewport;')).toBe(true);
    expect(body.indexOf('snapNdc')).toBeGreaterThan(body.indexOf('#include <fog_vertex>'));
    expect(body.indexOf('snapNdc')).toBeGreaterThan(body.indexOf('#include <project_vertex>'));
  });

  it('refuses a shader it cannot patch rather than drawing unsnapped', () => {
    const material = snapVertices(new MeshBasicMaterial());
    expect(() => compile(material, 'void main() { gl_Position = vec4(0.0); }')).toThrow();
  });

  it('keeps snapped points on the grid under any whole-pixel shift, in single-precision arithmetic', () => {
    // Emulates the graphics card: the shader divides the snapped pixel position by the half viewport,
    // the hardware multiplies back and adds the viewport offset (whole image: 0; tile: a whole number
    // of pixels), each step rounded to single precision, then rounds to a 1/256-pixel grid.
    const f = Math.fround;
    const rand = mulberry32(11);
    const half = f(400);
    let moved = 0;
    for (let i = 0; i < 200_000; i++) {
      const px = Math.floor((rand() * 2 - 1) * 400 * SNAP_STEPS + 0.5) / SNAP_STEPS;
      const ndc = f(f(px) / half);
      const scaled = f(ndc * half);
      const shift = -Math.floor(rand() * 8) * 100;
      const whole = Math.round(f(scaled + half) * 256) / 256;
      const tile = Math.round(f(f(scaled + half) + shift) * 256) / 256;
      const tileDirect = Math.round(f(scaled + f(half + shift)) * 256) / 256;
      if (tile - shift !== whole || tileDirect - shift !== whole) moved++;
    }
    expect(moved).toBe(0);
  });
});
