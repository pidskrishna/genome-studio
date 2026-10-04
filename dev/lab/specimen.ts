import { pigmentsOf, type Pigments } from '../../src/genome';
import { Stage, type LookId } from '../../src/render/stage';
import { toStraightAlpha } from '../../src/render/tiles';
import { SimClient } from '../../src/ui/sim-client';

// Grows a real organism with the real worker and stage, and renders it once per look as a
// transparent image, so the lab's glass has the true organism behind it. Dev only.

export type LookImages = Record<LookId, string>;

const SIZE = 900;

export class Specimen {
  private readonly host = document.createElement('div');
  private readonly stage: Stage;
  private readonly sim = new SimClient();
  images: Partial<LookImages> = {};

  constructor() {
    Object.assign(this.host.style, { position: 'fixed', left: '-10000px', top: '0', width: `${SIZE}px`, height: `${SIZE}px` });
    document.body.append(this.host);
    this.stage = new Stage(this.host);
    this.stage.setTransparent(true);
  }

  async grow(code: string): Promise<void> {
    const outcome = await this.sim.run('speciesA', { code });
    if (outcome.status !== 'done') throw new Error(`Specimen did not grow: ${outcome.status}`);
    this.stage.setOrganism({ species: 'A', geometry: outcome.output as never });
    this.stage.setPigments(pigmentsOf(code));
  }

  /** Renders the organism in one look and returns it as a PNG data URL. */
  render(look: LookId, pigments?: Pigments): string {
    if (pigments) this.stage.setPigments(pigments);
    this.stage.setLook(look);
    // Fluorescence is light on black: on a transparent ground its glow loses most of its strength.
    this.stage.setTransparent(look !== 'fluorescence');
    const px = toStraightAlpha(this.stage.renderImage(SIZE, SIZE));
    const canvas = document.createElement('canvas');
    canvas.width = px.width;
    canvas.height = px.height;
    const ctx = canvas.getContext('2d') as CanvasRenderingContext2D;
    const img = ctx.createImageData(px.width, px.height);
    img.data.set(px.data);
    ctx.putImageData(img, 0, 0);
    const url = canvas.toDataURL('image/png');
    this.images[look] = url;
    return url;
  }
}
