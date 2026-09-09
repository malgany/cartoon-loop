import { LIMITS, type Panel, type Page, type Project, visualBounds, uid, clamp } from './model';

export function panelWidth(page: Page, span: number) {
  const column = (page.width - 2 * page.margin - 11 * page.gapX) / 12;
  return column * span + page.gapX * (span - 1);
}
export function panelExtents(p: Project, panel: Panel) {
  let top = 0,
    bottom = panel.height;
  for (const item of p.nodes)
    if (
      item.type !== 'panel' &&
      item.panelId === panel.id &&
      !item.hidden &&
      (!panel.clip || item.overflow)
    ) {
      const b = visualBounds(item);
      top = Math.min(top, b.y);
      bottom = Math.max(bottom, b.y + b.height);
    }
  return { top, bottom, height: bottom - top };
}

/** Deterministic reflow; callers work on a draft so rejected layouts are atomic. */
export function reflow(p: Project): Project {
  const oldPages = [...p.pages],
    result: Page[] = [];
  const roots = oldPages.filter((pg) => !pg.automatic);
  for (const root of roots) {
    if (root.width - root.margin * 2 - root.gapX * 11 <= 0)
      throw new Error('Reduza as margens ou o intervalo horizontal.');
    const existing = oldPages.filter((pg) => pg.sequenceId === root.id);
    const oldIds = new Set(existing.map((pg) => pg.id));
    const flow = p.nodes
      .filter((n): n is Panel => n.type === 'panel' && n.mode === 'flow' && oldIds.has(n.pageId))
      .sort((a, b) => a.order - b.order);
    let pageIndex = 0,
      y = root.margin;
    const used: Page[] = [root];
    const nextPage = () => {
      pageIndex++;
      const page = existing[pageIndex] || { ...root, id: uid(), sequenceId: root.id, automatic: true };
      Object.assign(page, {
        width: root.width,
        height: root.height,
        margin: root.margin,
        gapX: root.gapX,
        gapY: root.gapY,
        fill: root.fill,
      });
      used.push(page);
      y = root.margin;
      if (result.length + used.length + roots.length - roots.indexOf(root) - 1 > LIMITS.pages)
        throw new Error('Limite de 20 páginas. Reduza o conteúdo ou aumente a altura das páginas.');
    };
    const rows: Panel[][] = [];
    let row: Panel[] = [],
      columns = 0;
    for (const frame of flow) {
      const span = frame.edgeToEdge || frame.role !== 'frame' ? 12 : frame.span;
      if (columns + span > 12 || (span === 12 && row.length)) {
        rows.push(row);
        row = [];
        columns = 0;
      }
      row.push(frame);
      columns += span;
      if (columns === 12) {
        rows.push(row);
        row = [];
        columns = 0;
      }
    }
    if (row.length) rows.push(row);
    for (const group of rows) {
      for (const frame of group)
        frame.width = frame.edgeToEdge
          ? root.width
          : panelWidth(root, frame.role !== 'frame' ? 12 : frame.span);
      const extents = group.map((frame) => panelExtents(p, frame));
      const height = Math.max(...extents.map((b) => b.height));
      if (height > root.height - 2 * root.margin)
        throw new Error(
          'Um quadro e seu transbordamento são maiores que a página. Reduza a altura/escala ou aumente a página.',
        );
      if (y + height > root.height - root.margin) nextPage();
      let x = root.margin;
      group.forEach((frame, i) => {
        frame.pageId = used[pageIndex].id;
        frame.x = frame.edgeToEdge ? 0 : x;
        frame.y = y - extents[i].top;
        frame.rotation = 0;
        x += frame.width + root.gapX;
      });
      y += height + (group.every((n) => n.role === 'spacer') ? 0 : root.gapY);
    }
    // Never remove a continuation page carrying manually positioned work.
    const lastFree = existing.reduce(
      (max, page, i) =>
        p.nodes.some(
          (n) => ((n.type === 'panel' && n.mode === 'free') || n.type === 'balloon') && n.pageId === page.id,
        )
          ? Math.max(max, i)
          : max,
      0,
    );
    while (used.length <= lastFree) nextPage();
    result.push(...used);
  }
  if (result.length > LIMITS.pages) throw new Error('O projeto atingiu o limite de 20 páginas.');
  p.pages = result;
  p.pages.forEach((pg, i) => (pg.name = `Página ${String(i + 1).padStart(2, '0')}`));
  for (const panel of p.nodes)
    if (panel.type === 'panel' && panel.mode === 'free') {
      const page = p.pages.find((pg) => pg.id === panel.pageId)!;
      if (panel.width > page.width || panel.height > page.height)
        throw new Error('O quadro livre precisa caber na página.');
      // Keep a small reachable portion on the page; the artwork is clipped at its edge.
      panel.x = clamp(panel.x, 8 - panel.width, page.width - 8);
      panel.y = clamp(panel.y, 8 - panel.height, page.height - 8);
    }
  return p;
}
