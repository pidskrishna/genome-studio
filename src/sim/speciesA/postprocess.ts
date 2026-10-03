import { pow } from '../dmath';
import { childLists, renumber, segmentLength, type Tree } from './tree';

// Post-processing, in this order: twig shedding (designed extension), node relocation and curve
// subdivision (paper), then pipe-model radii (paper eq. 1) and the gradient-driver attributes.

/**
 * Removes terminal branches shorter than `threshold`. A terminal branch runs from a tip back to the
 * nearest node with two or more children. A branch that runs all the way to a starting node is the
 * whole stem and is never removed. Branches are found in one pass on the tree as grown and removed
 * shortest first (lowest tip index on a tie); a branch whose removal would leave the organism with
 * no branching point at all is kept, so shedding never strips it to bare stems.
 */
export function shedTwigs(tree: Tree, threshold: number): Tree {
  if (threshold <= 0) return tree;
  const n = tree.parent.length;
  const { start } = childLists(tree.parent);
  const childCount = new Int32Array(n);
  for (let v = 0; v < n; v++) childCount[v] = (start[v + 1] as number) - (start[v] as number);
  let branchingPoints = 0;
  for (let v = 0; v < n; v++) if ((childCount[v] as number) >= 2) branchingPoints++;

  const twigs: { tip: number; length: number; nodes: number[]; base: number }[] = [];
  for (let tip = 0; tip < n; tip++) {
    if (childCount[tip] !== 0) continue;
    const nodes: number[] = [];
    let length = 0;
    let v = tip;
    for (;;) {
      const p = tree.parent[v] as number;
      if (p < 0) break;
      length += segmentLength(tree, v);
      nodes.push(v);
      if ((childCount[p] as number) >= 2) {
        if (length < threshold) twigs.push({ tip, length, nodes, base: p });
        break;
      }
      v = p;
    }
  }
  twigs.sort((a, b) => a.length - b.length || a.tip - b.tip);

  const removed = new Uint8Array(n);
  for (const twig of twigs) {
    const remaining = (childCount[twig.base] as number) - 1;
    const lost = remaining === 1 ? 1 : 0;
    if (branchingPoints - lost === 0) continue;
    childCount[twig.base] = remaining;
    branchingPoints -= lost;
    for (const u of twig.nodes) removed[u] = 1;
  }
  return renumber(tree, (v) => removed[v] === 0);
}

/** Moves every node (except starting nodes) toward its basal neighbour: halfway at strength 1. */
export function relocate(tree: Tree, strength: number): Tree {
  if (strength <= 0) return tree;
  const t = 0.5 * strength;
  const move = (a: number[]) =>
    a.map((value, v) => {
      const p = tree.parent[v] as number;
      return p < 0 ? value : value + t * ((a[p] as number) - value);
    });
  return { x: move(tree.x), y: move(tree.y), z: move(tree.z), parent: tree.parent };
}

/**
 * One pass of cubic B-spline curve subdivision along the branches. Every segment gains a midpoint;
 * every node in the middle of a branch (one parent, one child) moves to (p + 6v + c) / 8. Starting
 * nodes, branching points and tips stay where they are.
 */
export function subdivide(tree: Tree): Tree {
  const n = tree.parent.length;
  const { start, items } = childLists(tree.parent);
  const x = tree.x.slice();
  const y = tree.y.slice();
  const z = tree.z.slice();
  const parent = tree.parent.slice();
  for (let v = 0; v < n; v++) {
    const p = tree.parent[v] as number;
    if (p < 0 || (start[v + 1] as number) - (start[v] as number) !== 1) continue;
    const c = items[start[v] as number] as number;
    x[v] = ((tree.x[p] as number) + 6 * (tree.x[v] as number) + (tree.x[c] as number)) / 8;
    y[v] = ((tree.y[p] as number) + 6 * (tree.y[v] as number) + (tree.y[c] as number)) / 8;
    z[v] = ((tree.z[p] as number) + 6 * (tree.z[v] as number) + (tree.z[c] as number)) / 8;
  }
  for (let v = 0; v < n; v++) {
    const p = tree.parent[v] as number;
    if (p < 0) continue;
    const m = x.length;
    x.push(((tree.x[p] as number) + (tree.x[v] as number)) / 2);
    y.push(((tree.y[p] as number) + (tree.y[v] as number)) / 2);
    z.push(((tree.z[p] as number) + (tree.z[v] as number)) / 2);
    parent.push(p);
    parent[v] = m;
  }
  return renumber({ x, y, z, parent });
}

/**
 * Pipe-model radii from the tips toward the base: every tip has the tip radius, and at every node
 * r^n is the sum of r^n over its children (paper eq. 1). A node with one child takes its radius.
 */
export function pipeRadii(tree: Tree, tipRadius: number, exponent: number): Float64Array {
  const n = tree.parent.length;
  const radius = new Float64Array(n);
  const sumPow = new Float64Array(n);
  const children = new Int32Array(n);
  const onlyChild = new Int32Array(n).fill(-1);
  for (let v = 0; v < n; v++) {
    const p = tree.parent[v] as number;
    if (p >= 0) {
      children[p] = (children[p] as number) + 1;
      onlyChild[p] = v;
    }
  }
  for (let v = n - 1; v >= 0; v--) {
    const count = children[v] as number;
    let r: number;
    if (count === 0) r = tipRadius;
    else if (count === 1) r = radius[onlyChild[v] as number] as number;
    else r = pow(sumPow[v] as number, 1 / exponent);
    radius[v] = r;
    const p = tree.parent[v] as number;
    if (p >= 0) sumPow[p] = (sumPow[p] as number) + pow(r, exponent);
  }
  return radius;
}

/** Number of gradient-driver attributes per node, in the order of the gene's choices. */
export const DRIVER_COUNT = 4;

/**
 * The four gradient-driver attributes per node, interleaved: distance from base (path length from
 * the starting node), branch radius, branch order, and height. Branch order is 0 on each stem; at
 * a branching point the thickest child (lowest index on a tie) keeps its parent's order and every
 * other child adds one.
 */
export function gradientDrivers(tree: Tree, radius: Float64Array): Float64Array {
  const n = tree.parent.length;
  const out = new Float64Array(n * DRIVER_COUNT);
  const distance = new Float64Array(n);
  const order = new Float64Array(n);
  const { start, items } = childLists(tree.parent);
  for (let v = 0; v < n; v++) {
    const p = tree.parent[v] as number;
    if (p >= 0) distance[v] = (distance[p] as number) + segmentLength(tree, v);
    const first = start[v] as number;
    const end = start[v + 1] as number;
    let main = -1;
    for (let k = first; k < end; k++) {
      const c = items[k] as number;
      if (main < 0 || (radius[c] as number) > (radius[main] as number)) main = c;
    }
    for (let k = first; k < end; k++) {
      const c = items[k] as number;
      order[c] = (order[v] as number) + (c === main ? 0 : 1);
    }
    out[v * DRIVER_COUNT] = distance[v] as number;
    out[v * DRIVER_COUNT + 1] = radius[v] as number;
    out[v * DRIVER_COUNT + 2] = order[v] as number;
    out[v * DRIVER_COUNT + 3] = tree.y[v] as number;
  }
  return out;
}
