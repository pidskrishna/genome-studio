// A branching structure held as flat arrays. Parents always come before their children.

export interface Tree {
  x: number[];
  y: number[];
  z: number[];
  parent: number[];
}

/** Children of every node, in index order, as a compact list: children of v are items[start[v]..start[v+1]). */
export function childLists(parent: readonly number[]): { start: Int32Array; items: Int32Array } {
  const n = parent.length;
  const start = new Int32Array(n + 1);
  for (let v = 0; v < n; v++) {
    const p = parent[v] as number;
    if (p >= 0) start[p + 1] = (start[p + 1] as number) + 1;
  }
  for (let v = 0; v < n; v++) start[v + 1] = (start[v + 1] as number) + (start[v] as number);
  const fill = start.slice(0, n);
  const items = new Int32Array(Math.max(0, start[n] as number));
  for (let v = 0; v < n; v++) {
    const p = parent[v] as number;
    if (p >= 0) {
      items[fill[p] as number] = v;
      fill[p] = (fill[p] as number) + 1;
    }
  }
  return { start, items };
}

/**
 * Keeps the nodes for which `keep` is true and renumbers them breadth first from the roots, so that
 * parents come before children. A kept node's parent must also be kept.
 */
export function renumber(tree: Tree, keep?: (v: number) => boolean): Tree {
  const n = tree.parent.length;
  const { start, items } = childLists(tree.parent);
  const order: number[] = [];
  for (let v = 0; v < n; v++) if ((tree.parent[v] as number) < 0 && (!keep || keep(v))) order.push(v);
  for (let head = 0; head < order.length; head++) {
    const v = order[head] as number;
    for (let k = start[v] as number; k < (start[v + 1] as number); k++) {
      const c = items[k] as number;
      if (!keep || keep(c)) order.push(c);
    }
  }
  const index = new Int32Array(n).fill(-1);
  order.forEach((v, i) => (index[v] = i));
  return {
    x: order.map((v) => tree.x[v] as number),
    y: order.map((v) => tree.y[v] as number),
    z: order.map((v) => tree.z[v] as number),
    parent: order.map((v) => {
      const p = tree.parent[v] as number;
      return p < 0 ? -1 : (index[p] as number);
    }),
  };
}

export function segmentLength(tree: Tree, v: number): number {
  const p = tree.parent[v] as number;
  if (p < 0) return 0;
  const dx = (tree.x[v] as number) - (tree.x[p] as number);
  const dy = (tree.y[v] as number) - (tree.y[p] as number);
  const dz = (tree.z[v] as number) - (tree.z[p] as number);
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}
