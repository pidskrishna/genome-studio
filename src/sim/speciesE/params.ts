import { decodeGenome, valueById } from '../../genome';

/** The septa choices of locus 14. */
const SEPTA = [0, 6, 12, 24] as const;

/** Decoded species E parameters, in model units. Lengths are in lattice units. */
export interface SpeciesEParams {
  /** 0 knob, 1 ridge, 2 ring, 3 encrusting disc. */
  startingForm: number;
  /** s² / (D Δt). */
  growthToTransport: number;
  polypSpacing: number;
  /** s. */
  layerThickness: number;
  curvatureRule: number;
  polypHeight: number;
  /** tr. */
  growthThreshold: number;
  /** γ. */
  uptakeResponse: number;
  startingSize: number;
  smoothing: number;
  irregularity: number;
  /** Fraction of the polyp spacing. */
  coralliteSize: number;
  /** Fractions of the cup's diameter. */
  coralliteDepth: number;
  septa: number;
  coralliteRim: number;
  seed: number;
}

export function speciesEParams(code: string): SpeciesEParams {
  const decoded = decodeGenome(code);
  if (decoded.species !== 'E') throw new Error('Not a species E code');
  const v = (id: string) => valueById(decoded, id);
  return {
    startingForm: v('startingForm'),
    growthToTransport: v('growthToTransport'),
    polypSpacing: v('polypSpacing'),
    layerThickness: v('layerThickness'),
    curvatureRule: v('curvatureRule'),
    polypHeight: v('polypHeight'),
    growthThreshold: v('growthThreshold'),
    uptakeResponse: v('uptakeResponse'),
    startingSize: v('startingSize'),
    smoothing: v('surfaceSmoothing'),
    irregularity: v('growthIrregularity'),
    coralliteSize: v('coralliteSize'),
    coralliteDepth: v('coralliteDepth'),
    septa: SEPTA[v('septa')] ?? 0,
    coralliteRim: v('coralliteRim'),
    seed: v('seed'),
  };
}
