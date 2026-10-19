import { decodeGenome, geneSpan, geneTable, readGene, rawMax, specimenName, ENCODING_VERSION_1 } from '../genome';
import { formatValue, GROUP_NAMES, SPECIES_NAMES } from '../ui/gene-info';

// The methods file saved beside an exported image (spec section 9): the code, species, encoding
// version and every decoded parameter value, so the organism can be grown again exactly and its
// parameters read without the tool.

export interface MethodsExtras {
  /** Geometry hash of the organism exported, so it can be compared on any machine. */
  hash?: string;
  /** Look and view the image was rendered in (outside the genome). */
  look?: string;
  view?: string;
  size?: { width: number; height: number };
}

export function methodsText(code: string, extras: MethodsExtras = {}): string {
  const decoded = decodeGenome(code);
  const species = decoded.species;
  const lines: string[] = [];
  lines.push(`Specimen: ${specimenName(code).full}`);
  lines.push(`Code: ${code}`);
  lines.push(`Species: ${SPECIES_NAMES[species]} (header ${code.slice(0, 3)})`);
  lines.push(`Encoding version: 1 (header ${ENCODING_VERSION_1})`);
  if (extras.hash) lines.push(`Geometry hash: ${extras.hash}`);
  if (extras.look) lines.push(`Look: ${extras.look}`);
  if (extras.view) lines.push(`View: ${extras.view}`);
  if (extras.size) lines.push(`Image: ${extras.size.width} × ${extras.size.height} pixels`);
  lines.push('');
  lines.push('Genes (locus, name, group, value in use, exact value, gene value, bases):');
  for (const def of geneTable(species)) {
    const value = decoded.values[def.locus - 1] ?? NaN;
    const { start, length } = geneSpan(def.locus);
    const raw = readGene(code, def.locus);
    const group = def.group === 'form' ? 'form' : def.group === 'pigment' ? 'pigment' : GROUP_NAMES.seed.toLowerCase();
    lines.push(
      [
        String(def.locus).padStart(2, ' '),
        def.name,
        group,
        formatValue(def, value),
        String(value),
        `${raw} of ${rawMax(def)}`,
        code.slice(start, start + length),
      ].join('\t'),
    );
  }
  lines.push('');
  lines.push('The same code always grows the same organism, on any machine. Pigment and surface genes are read by the renderer only.');
  return `${lines.join('\n')}\n`;
}
