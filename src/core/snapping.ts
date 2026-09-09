import { pagePositions, worldOrigin, type Project, type Rect } from './model';

export type Guides = { x?: number; y?: number };
export function alignmentTargets(p: Project, excluded: string[]): Rect[] {
  const positions = pagePositions(p);
  return [
    ...p.nodes
      .filter((n) => n.type === 'panel' && !n.hidden && !excluded.includes(n.id))
      .map((n) => ({ ...worldOrigin(p, n), width: n.width, height: n.height })),
    ...p.pages.flatMap((pg) => {
      const o = positions.get(pg.id)!;
      return [
        { ...o, width: pg.width, height: pg.height },
        {
          x: o.x + pg.margin,
          y: o.y + pg.margin,
          width: pg.width - pg.margin * 2,
          height: pg.height - pg.margin * 2,
        },
      ];
    }),
  ];
}

/** Screen-space tolerance keeps the magnet equally usable at every zoom level. */
export function snapRect(rect: Rect, targets: Rect[], zoom: number, resizing = false) {
  const guides: Guides = {};
  let dx = 0,
    dy = 0,
    bestX = 7 / zoom,
    bestY = 7 / zoom;
  for (const b of targets) {
    const xs = resizing ? [rect.x + rect.width] : [rect.x, rect.x + rect.width / 2, rect.x + rect.width];
    const ys = resizing ? [rect.y + rect.height] : [rect.y, rect.y + rect.height / 2, rect.y + rect.height];
    // Equal dimensions are useful even when the neighbouring frames are staggered.
    const txs = [b.x, b.x + b.width / 2, b.x + b.width, ...(resizing ? [rect.x + b.width] : [])];
    const tys = [b.y, b.y + b.height / 2, b.y + b.height, ...(resizing ? [rect.y + b.height] : [])];
    for (const tx of txs)
      for (const cx of xs)
        if (Math.abs(tx - cx) < bestX) {
          bestX = Math.abs(tx - cx);
          dx = tx - cx;
          guides.x = tx;
        }
    for (const ty of tys)
      for (const cy of ys)
        if (Math.abs(ty - cy) < bestY) {
          bestY = Math.abs(ty - cy);
          dy = ty - cy;
          guides.y = ty;
        }
  }
  return { dx, dy, guides };
}
