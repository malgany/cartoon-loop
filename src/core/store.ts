import { create } from 'zustand';
import {
  isNodeLocked,
  placeBalloon,
  LIMITS,
  baseNode,
  newPanel,
  newText,
  newPage,
  pagePositions,
  uid,
  validateProject,
  worldOrigin,
  type Asset,
  type Balloon,
  type Item,
  type Panel,
  type Point,
  type Project,
  type SceneNode,
} from './model';
import { reflow } from './layout';

type Entry = { project: Project; label: string };
export type View = { x: number; y: number; zoom: number; width: number; height: number };
export type Notice = { id: string; message: string; error?: boolean };
type State = {
  project: Project | null;
  selection: string[];
  activePage: string;
  readonly: boolean;
  view: View;
  past: Entry[];
  future: Entry[];
  revision: number;
  savedRevision: number;
  saveState: 'saved' | 'saving' | 'error';
  notices: Notice[];
  clipboard: SceneNode[];
  clipboardOrigin: Point;
  load: (project: Project, readonly?: boolean) => void;
  run: (label: string, fn: (draft: Project) => void) => boolean;
  patch: (ids: string[], values: Record<string, unknown>) => void;
  select: (ids: string[]) => void;
  setView: (view: Partial<View>) => void;
  notify: (message: string, error?: boolean) => void;
  addPanel: (preset?: string, role?: Panel['role'], height?: number, point?: Point) => void;
  addText: (kind?: Balloon['kind']) => void;
  addImage: (asset: Asset, point?: Point) => void;
  addPage: () => void;
  remove: () => void;
  undo: () => void;
  redo: () => void;
  copy: () => void;
  paste: () => void;
  duplicate: () => void;
  detach: (id: string) => void;
};

export function visibleWorld(view: View) {
  return {
    x: -view.x / view.zoom,
    y: -view.y / view.zoom,
    width: view.width / view.zoom,
    height: view.height / view.zoom,
  };
}
export function insertionTarget(
  state: Pick<State, 'project' | 'selection' | 'view'>,
  explicit?: Point,
): { panel: Panel | null; point: Point } {
  const p = state.project!;
  const view = visibleWorld(state.view);
  const point = explicit || { x: view.x + view.width / 2, y: view.y + view.height / 2 };
  const hit = (panel: Panel, q: Point) => {
    const o = worldOrigin(p, panel);
    return q.x >= o.x && q.y >= o.y && q.x <= o.x + panel.width && q.y <= o.y + panel.height;
  };
  if (explicit) {
    const panel = [...p.nodes]
      .reverse()
      .find(
        (n): n is Panel =>
          n.type === 'panel' && n.role !== 'spacer' && !n.hidden && !n.locked && hit(n, point),
      );
    return { panel: panel || null, point };
  }
  const selected = p.nodes.find((n) => n.id === state.selection[0]);
  const panel =
    selected?.type === 'panel'
      ? selected
      : p.nodes.find((n): n is Panel => n.type === 'panel' && !!selected && n.id === selected.panelId);
  if (panel && panel.role !== 'spacer' && !panel.hidden && !panel.locked) {
    const o = worldOrigin(p, panel);
    if (
      o.x + panel.width > view.x &&
      o.x < view.x + view.width &&
      o.y + panel.height > view.y &&
      o.y < view.y + view.height
    )
      return { panel, point: { x: Math.max(o.x, point.x), y: Math.max(o.y, point.y) } };
  }
  return { panel: null, point };
}
const expandSelection = (p: Project, ids: string[]) =>
  p.nodes.filter(
    (n) => ids.includes(n.id) || (n.type !== 'panel' && n.panelId !== null && ids.includes(n.panelId)),
  );

export const useEditor = create<State>((set, get) => ({
  project: null,
  selection: [],
  activePage: '',
  readonly: false,
  view: { x: 48, y: 64, zoom: 0.65, width: 1000, height: 800 },
  past: [],
  future: [],
  revision: 0,
  savedRevision: 0,
  saveState: 'saved',
  notices: [],
  clipboard: [],
  clipboardOrigin: { x: 0, y: 0 },
  load(project, readonly = false) {
    project = validateProject(project);
    set({
      project,
      selection: [],
      activePage: project.pages[0].id,
      readonly,
      past: [],
      future: [],
      revision: 0,
      savedRevision: 0,
      saveState: 'saved',
      view: { ...get().view, x: 48, y: 64, zoom: 0.65 },
    });
  },
  run(label, fn) {
    const s = get();
    if (!s.project || s.readonly) return false;
    try {
      let draft = structuredClone(s.project);
      fn(draft);
      if (draft.nodes.length > LIMITS.nodes) throw new Error('Limite de 2.000 objetos por projeto.');
      draft = validateProject(draft);
      reflow(draft);
      draft.updatedAt = Date.now();
      set({
        project: draft,
        past: [...s.past.slice(-99), { project: s.project, label }],
        future: [],
        revision: s.revision + 1,
        saveState: 'saving',
      });
      return true;
    } catch (e) {
      get().notify(e instanceof Error ? e.message : 'Não foi possível aplicar a alteração.', true);
      return false;
    }
  },
  patch(ids, values) {
    get().run('Alterar propriedades', (p) => {
      for (const n of p.nodes)
        if (
          ids.includes(n.id) &&
          (!isNodeLocked(p, n) || Object.keys(values).every((k) => k === 'locked' || k === 'hidden'))
        )
          Object.assign(n, values);
    });
  },
  select(selection) {
    set({ selection });
    const p = get().project;
    const first = p?.nodes.find((n) => n.id === selection[0]);
    const panel =
      first?.type === 'panel'
        ? first
        : p?.nodes.find((n): n is Panel => n.type === 'panel' && n.id === first?.panelId);
    if (panel) set({ activePage: panel.pageId });
    else if (first?.type === 'balloon' && first.pageId) set({ activePage: first.pageId });
  },
  setView(view) {
    set({ view: { ...get().view, ...view } });
  },
  notify(message, error = false) {
    const id = uid();
    set((s) => ({ notices: [...s.notices.slice(-3), { id, message, error }] }));
    setTimeout(() => set((s) => ({ notices: s.notices.filter((n) => n.id !== id) })), error ? 12000 : 5000);
  },
  addPanel(preset = 'horizontal', role = 'frame', height, point) {
    const s = get();
    if (!s.project) return;
    const page = s.project.pages.find((pg) => pg.id === s.activePage) || s.project.pages[0];
    const panel = newPanel(page, preset, role);
    if (height) panel.height = role === 'spacer' ? Math.round((height * page.width) / 800) : height;
    if (role !== 'frame') {
      panel.name = role === 'spacer' ? 'Pausa' : 'Transição';
      panel.strokeWidth = 0;
      panel.fill = role === 'spacer' ? 'transparent' : '#202020';
      panel.gradient = role === 'transition' ? '#ffffff' : null;
    }
    const sequencePages = s.project.pages
      .filter((pg) => pg.sequenceId === page.sequenceId)
      .map((pg) => pg.id);
    const panels = s.project.nodes
      .filter((n): n is Panel => n.type === 'panel' && n.mode === 'flow' && sequencePages.includes(n.pageId))
      .sort((a, b) => a.order - b.order);
    const selected = point ? undefined : panels.find((n) => s.selection.includes(n.id));
    const localView = visibleWorld(s.view);
    const visibleY = point?.y ?? Math.max(0, localView.y + Math.min(200, localView.height / 3));
    const before = selected
      ? panels.indexOf(selected)
      : panels.findLastIndex((n) => n.pageId === page.id && n.y <= visibleY);
    panel.order =
      before >= 0
        ? (panels[before].order + (panels[before + 1]?.order ?? panels[before].order + 2)) / 2
        : (panels[0]?.order ?? 1) - 1;
    if (s.run('Adicionar quadro', (p) => p.nodes.push(panel))) get().select([panel.id]);
  },
  addText(kind) {
    const s = get();
    if (!s.project) return;
    const { panel, point } = insertionTarget(s);
    const node = newText(kind);
    node.panelId = panel?.id || null;
    const o = panel ? worldOrigin(s.project, panel) : { x: 0, y: 0 };
    node.x = panel
      ? Math.max(0, Math.min(point.x - o.x - node.width / 2, panel.width - node.width))
      : point.x - node.width / 2;
    node.y = panel
      ? Math.max(0, Math.min(point.y - o.y - node.height / 2, panel.height - node.height))
      : point.y - node.height / 2;
    if (node.type === 'balloon') {
      placeBalloon(s.project, node, { x: node.x + o.x, y: node.y + o.y });
    }
    if (s.run('Adicionar texto', (p) => p.nodes.push(node))) get().select([node.id]);
  },
  addImage(asset, explicit) {
    const s = get();
    if (!s.project) return;
    const { panel, point } = insertionTarget(s, explicit);
    const scale = Math.min(
      1,
      (panel ? panel.width : 400) / asset.width,
      (panel ? panel.height : 500) / asset.height,
    );
    const node: Item = {
      ...baseNode(asset.name),
      type: 'image',
      panelId: panel?.id || null,
      assetId: asset.id,
      overflow: false,
      width: asset.width * scale,
      height: asset.height * scale,
    };
    if (panel) {
      node.x = (panel.width - node.width) / 2;
      node.y = (panel.height - node.height) / 2;
    } else {
      node.x = point.x - node.width / 2;
      node.y = point.y - node.height / 2;
    }
    if (
      s.run('Adicionar imagem', (p) => {
        if (!p.assets.some((a) => a.id === asset.id)) p.assets.push(asset);
        p.nodes.push(node);
      })
    )
      get().select([node.id]);
  },
  addPage() {
    const s = get();
    if (!s.project) return;
    const current = s.project.pages.find((pg) => pg.id === s.activePage) || s.project.pages[0];
    const pg = newPage(current.width, current.height);
    if (s.run('Adicionar página', (p) => p.pages.push(pg))) {
      set({ activePage: pg.id, selection: [] });
      const pos = pagePositions(get().project!).get(pg.id)!;
      get().setView({ x: 48 - pos.x * get().view.zoom, y: 64 });
    }
  },
  remove() {
    const s = get();
    if (!s.project) return;
    const allowed = s.selection.filter(
      (id) =>
        !isNodeLocked(
          s.project!,
          s.project!.nodes.find((n) => n.id === id)!,
        ),
    );
    const ids = expandSelection(s.project, allowed).map((n) => n.id);
    if (
      s.run('Excluir objetos', (p) => {
        p.nodes = p.nodes.filter((n) => !ids.includes(n.id));
      })
    )
      set({ selection: [] });
  },
  undo() {
    const s = get();
    const entry = s.past.at(-1);
    if (!entry || !s.project || s.readonly) return;
    set({
      project: structuredClone(entry.project),
      past: s.past.slice(0, -1),
      future: [...s.future, { project: s.project, label: entry.label }],
      revision: s.revision + 1,
      saveState: 'saving',
      selection: [],
    });
  },
  redo() {
    const s = get();
    const entry = s.future.at(-1);
    if (!entry || !s.project || s.readonly) return;
    set({
      project: structuredClone(entry.project),
      past: [...s.past, { project: s.project, label: entry.label }],
      future: s.future.slice(0, -1),
      revision: s.revision + 1,
      saveState: 'saving',
      selection: [],
    });
  },
  copy() {
    const s = get();
    if (!s.project || !s.selection.length) return;
    const nodes = structuredClone(expandSelection(s.project, s.selection));
    const main = nodes.filter((n) => n.type === 'panel' || !nodes.some((q) => q.id === n.panelId));
    for (const n of main)
      if (n.type !== 'panel') {
        const w = worldOrigin(s.project, n);
        n.panelId = null;
        if (n.type === 'balloon') n.pageId = null;
        n.x = w.x;
        n.y = w.y;
      }
    const pos = main.map((n) => (n.type === 'panel' ? worldOrigin(s.project!, n) : n));
    set({
      clipboard: nodes,
      clipboardOrigin: { x: Math.min(...pos.map((n) => n.x)), y: Math.min(...pos.map((n) => n.y)) },
    });
  },
  paste() {
    const s = get();
    if (!s.project || !s.clipboard.length) return;
    const nodes = structuredClone(s.clipboard);
    const map = new Map(nodes.map((n) => [n.id, uid()]));
    const target = insertionTarget(s);
    const view = visibleWorld(s.view);
    const anchor = target.panel
      ? worldOrigin(s.project, target.panel)
      : { x: view.x + view.width / 2, y: view.y + view.height / 2 };
    const selected: string[] = [];
    const page = s.project.pages.find((pg) => pg.id === s.activePage) || s.project.pages[0];
    const maxOrder = Math.max(
      0,
      ...s.project.nodes.filter((n): n is Panel => n.type === 'panel').map((n) => n.order),
    );
    nodes.forEach((n, i) => {
      const oldId = n.id;
      n.id = map.get(oldId)!;
      n.locked = false;
      if (n.type === 'panel') {
        n.pageId = page.id;
        n.order = maxOrder + i + 1;
        n.x = Math.max(0, n.x + 24);
        n.y = Math.max(0, n.y + 24);
        selected.push(n.id);
      } else if (n.panelId && map.has(n.panelId)) n.panelId = map.get(n.panelId)!;
      else {
        if (n.type === 'balloon') {
          placeBalloon(s.project!, n, {
            x: anchor.x + 24 + n.x - s.clipboardOrigin.x - (target.panel ? 0 : n.width / 2),
            y: anchor.y + 24 + n.y - s.clipboardOrigin.y - (target.panel ? 0 : n.height / 2),
          });
          selected.push(n.id);
          return;
        }
        n.panelId = target.panel?.id || null;
        n.x = target.panel ? 24 + n.x - s.clipboardOrigin.x : anchor.x + n.x - s.clipboardOrigin.x;
        n.y = target.panel ? 24 + n.y - s.clipboardOrigin.y : anchor.y + n.y - s.clipboardOrigin.y;
        selected.push(n.id);
      }
    });
    if (s.run('Colar objetos', (p) => p.nodes.push(...nodes))) get().select(selected);
  },
  duplicate() {
    get().copy();
    get().paste();
  },
  detach(id) {
    const s = get();
    if (!s.project) return;
    const n = s.project.nodes.find((n) => n.id === id);
    if (!n || n.type === 'panel') return;
    const pos = worldOrigin(s.project, n);
    get().patch([id], { panelId: null, ...(n.type === 'balloon' ? { pageId: null } : {}), ...pos });
  },
}));
