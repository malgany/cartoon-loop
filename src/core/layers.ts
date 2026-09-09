import { isNodeLocked, type Project, type SceneNode } from './model';

export function layerContainer(n: SceneNode): string {
  return n.type === 'panel'
    ? `page:${n.pageId}`
    : n.type === 'balloon' && n.pageId
      ? `page:${n.pageId}`
      : n.panelId
        ? `panel:${n.panelId}`
        : 'workspace';
}

/** Reorder within a stacking context without changing ownership or layout order. */
export function moveLayer(p: Project, sourceId: string, targetId: string, above: boolean) {
  const source = p.nodes.find((n) => n.id === sourceId),
    target = p.nodes.find((n) => n.id === targetId);
  if (!source || !target || source === target || isNodeLocked(p, source)) return;
  if (layerContainer(source) !== layerContainer(target))
    throw new Error('Reordene entre camadas da mesma página ou do mesmo quadro.');
  p.nodes = p.nodes.filter((n) => n.id !== sourceId);
  const index = p.nodes.indexOf(target);
  p.nodes.splice(index + (above ? 1 : 0), 0, source);
}
