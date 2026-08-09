/** `parent` sentinel for roots (mirrors layout-record.ts `NO_PARENT`). */
export const NO_PARENT = 0xffff_ffff;

/** Bit 0 of `flags`: ghost node. */
export const GHOST_FLAG = 0b1;

/** Capture dimensions established by R2-A and retained by R2-B. */
export const ANALYSIS_TEXTURE_WIDTH = 200;
export const ANALYSIS_TEXTURE_HEIGHT = 100;

export interface LayoutNodeFixture {
  bounds: [number, number, number, number];
  depth: number;
  parent: number;
  flags: number;
  nameHash: number;
}

/**
 * Shared boundary fixture established by R2-A and retained unchanged by R2-B.
 *
 * Its values and order match `src/analysis/stats.rs::tests::fixture` and the
 * website package's `self-test.ts`, so all three layers assert the same
 * hand-computed values. This is fixture data, not a production-sized tree.
 */
export const FIXTURE_NODES: LayoutNodeFixture[] = [
  // 1. Root: 100 × 80 = 8,000 texels².
  {
    bounds: [0, 0, 100, 80],
    depth: 1,
    parent: NO_PARENT,
    flags: 0,
    nameHash: 0xa1,
  },
  // 2. Child of node 0: 40 × 30 = 1,200 texels².
  {
    bounds: [10, 10, 40, 30],
    depth: 2,
    parent: 0,
    flags: 0,
    nameHash: 0xa2,
  },
  // 3. Ghost child of node 0: 30 × 20 = 600 texels².
  {
    bounds: [50, 40, 30, 20],
    depth: 2,
    parent: 0,
    flags: GHOST_FLAG,
    nameHash: 0xa3,
  },
  // 4. Grandchild and deepest node: 20 × 10 = 200 texels².
  {
    bounds: [12, 12, 20, 10],
    depth: 3,
    parent: 1,
    flags: 0,
    nameHash: 0xa4,
  },
  // 5. Second root: 50 × 10 = 500 texels².
  {
    bounds: [0, 90, 50, 10],
    depth: 1,
    parent: NO_PARENT,
    flags: 0,
    nameHash: 0xa5,
  },
  // 6. Ghost child of node 4: 10 × 5 = 50 texels².
  {
    bounds: [5, 92, 10, 5],
    depth: 2,
    parent: 4,
    flags: GHOST_FLAG,
    nameHash: 0xa6,
  },
];

export const EXPECTED_TREE_AGGREGATES = {
  nodeCount: 6,
  maxDepth: 3,
  ghostCount: 2,
  totalArea: 10_550, // 8,000 + 1,200 + 600 + 200 + 500 + 50.
  coverage: 0.425, // (8,000 + 500) / (200 × 100).
};
