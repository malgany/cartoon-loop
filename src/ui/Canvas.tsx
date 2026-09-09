import { useEffect, useMemo, useRef, useState, useLayoutEffect } from 'react';
import Konva from 'konva';
import { Stage, Layer, Group, Rect, Shape, Text, Transformer, Line, Circle } from 'react-konva';
import type { KonvaEventObject } from 'konva/lib/Node';
import { useEditor, visibleWorld, insertionTarget } from '../core/store';
import {
  clamp,
  isNodeLocked,
  contains,
  intersects,
  pagePositions,
  worldOrigin,
  placeBalloon,
  visualBounds,
  type SceneNode,
  type Item,
  type Panel,
  type Point,
  type Balloon,
  type Project,
} from '../core/model';
import { drawItem, drawPanel, panelPath } from '../core/drawing';
import { decodedAsset, loadFonts } from '../core/render';
import { panelWidth, reflow } from '../core/layout';
import { alignmentTargets, snapRect } from '../core/snapping';

export function useDecoded(projectId: string, assetId?: string) {
  const [image, setImage] = useState<HTMLImageElement>();
  useEffect(() => {
    let canceled = false;
    setImage(undefined);
    if (assetId)
      void decodedAsset(projectId, assetId)
        .then((img) => {
          if (!canceled) setImage(img);
        })
        .catch(() => {});
    return () => {
      canceled = true;
    };
  }, [projectId, assetId]);
  return image;
}
function ItemShape({
  node,
  project,
  onSelect,
  onDrag,
  onDragStart,
  onDragMove,
  onEdit,
  editing,
  panning = false,
  parentLocked = false,
}: {
  node: Item;
  project: Project;
  onSelect: (e: KonvaEventObject<MouseEvent>, id: string) => void;
  onDrag: (e: KonvaEventObject<DragEvent>, node: SceneNode) => void;
  onDragStart: (id: string) => void;
  onDragMove: (e: KonvaEventObject<DragEvent>, node: SceneNode) => void;
  onEdit: (id: string) => void;
  editing: boolean;
  panning?: boolean;
  parentLocked?: boolean;
}) {
  const image = useDecoded(project.id, node.type === 'image' ? node.assetId : undefined);
  const readonly = useEditor((s) => s.readonly);
  return (
    <Shape
      id={node.id}
      name="art-item"
      x={node.x + node.width / 2}
      y={node.y + node.height / 2}
      offsetX={node.width / 2}
      offsetY={node.height / 2}
      width={node.width}
      height={node.height}
      rotation={node.rotation}
      scaleX={node.flipX ? -1 : 1}
      scaleY={node.flipY ? -1 : 1}
      visible={!editing}
      draggable={!node.locked && !readonly && !panning && !parentLocked}
      sceneFunc={(ctx) => {
        const c = ctx._context;
        if (node.type === 'image' && !image) {
          c.fillStyle = '#dddddd';
          c.fillRect(0, 0, node.width, node.height);
          c.fillStyle = '#777777';
          c.font = '14px sans-serif';
          c.fillText('Carregando imagem…', 12, 24);
        } else drawItem(c, node, image);
      }}
      hitFunc={(ctx, shape) => {
        ctx.beginPath();
        ctx.rect(0, 0, node.width, node.height);
        ctx.closePath();
        ctx.fillStrokeShape(shape);
      }}
      onClick={(e) => onSelect(e, node.id)}
      onDblClick={(e) => {
        e.cancelBubble = true;
        if (node.type !== 'image' && !readonly && !node.locked && !parentLocked) onEdit(node.id);
      }}
      onDragStart={(e) => {
        e.cancelBubble = true;
        onDragStart(node.id);
      }}
      onDragMove={(e) => {
        e.cancelBubble = true;
        onDragMove(e, node);
      }}
      onDragEnd={(e) => {
        e.cancelBubble = true;
        onDrag(e, node);
      }}
    />
  );
}

export default function EditorCanvas({
  onImport,
  dropPreset,
}: {
  onImport: (files: File[], point?: Point) => void;
  dropPreset: (data: string, point: Point) => void;
}) {
  const savedProject = useEditor((s) => s.project)!,
    view = useEditor((s) => s.view),
    selection = useEditor((s) => s.selection),
    readonly = useEditor((s) => s.readonly);
  const [resizePreview, setResizePreview] = useState<Project | null>(null);
  const resizeDraft = useRef<Project | null>(null);
  const project = resizePreview || savedProject;
  const root = useRef<HTMLDivElement>(null),
    stage = useRef<Konva.Stage>(null),
    transformer = useRef<Konva.Transformer>(null);
  const [size, setSize] = useState({ width: 1000, height: 700 }),
    [hover, setHover] = useState<string | null>(null),
    [dragging, setDragging] = useState<string | null>(null),
    [dropTarget, setDropTarget] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null),
    [draft, setDraft] = useState(''),
    [marquee, setMarquee] = useState<{ start: Point; end: Point } | null>(null),
    [guides, setGuides] = useState<{ x?: number; y?: number }>({});
  const space = useRef(false),
    pan = useRef<{ start: Point; view: Point } | null>(null),
    dragOrigin = useRef<Point | null>(null),
    [isPanning, setPanning] = useState(false);
  const groupDrag = useRef<{ id: string; x: number; y: number; world: Point }[]>([]);
  useEffect(() => {
    void loadFonts().then(() => stage.current?.batchDraw());
    const release = () => {
      pan.current = null;
      setPanning(space.current);
    };
    window.addEventListener('mouseup', release);
    return () => window.removeEventListener('mouseup', release);
  }, []);
  const positions = useMemo(() => pagePositions(project), [project.pages]);
  const rect = visibleWorld({ ...view, ...size });
  const overscan = { x: rect.x - 250, y: rect.y - 250, width: rect.width + 500, height: rect.height + 500 };
  const panels = useMemo(() => project.nodes.filter((n): n is Panel => n.type === 'panel'), [project.nodes]);
  const childIndex = useMemo(() => {
    const groups = new Map<string | null, Item[]>();
    for (const n of project.nodes)
      if (n.type !== 'panel') {
        const list = groups.get(n.panelId) || [];
        list.push(n);
        groups.set(n.panelId, list);
      }
    return groups;
  }, [project.nodes]);
  const selected = project.nodes.find((n) => n.id === selection[0]);
  const editNode = project.nodes.find(
    (n): n is Exclude<Item, { type: 'image' }> =>
      n.id === editing && n.type !== 'image' && n.type !== 'panel',
  );
  useEffect(() => {
    const ro = new ResizeObserver(([entry]) => {
      const next = { width: entry.contentRect.width, height: entry.contentRect.height };
      setSize(next);
      useEditor.getState().setView(next);
    });
    if (root.current) ro.observe(root.current);
    return () => ro.disconnect();
  }, []);
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).matches('input,textarea,[contenteditable="true"]')) return;
      if (e.code === 'Space') {
        e.preventDefault();
        space.current = true;
        setPanning(true);
      }
    };
    const up = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        space.current = false;
        setPanning(false);
      }
    };
    const blur = () => {
      space.current = false;
      pan.current = null;
      setPanning(false);
    };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    window.addEventListener('blur', blur);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
      window.removeEventListener('blur', blur);
    };
  }, []);
  useLayoutEffect(() => {
    const tr = transformer.current;
    if (!tr || !stage.current) return;
    if (dragging) {
      tr.nodes([]);
      return;
    }
    tr.nodes(
      selection
        .map((id) => project.nodes.find((n) => n.id === id))
        .filter((n): n is Item => !!n && n.type !== 'panel' && !isNodeLocked(project, n) && n.id !== editing)
        .map((n) => stage.current!.findOne(`#${n.id}`))
        .filter((n): n is Konva.Node => !!n),
    );
    tr.getLayer()?.batchDraw();
  }, [selection, project, editing, dragging]);
  const world = (client: Point): Point => ({
    x: (client.x - view.x) / view.zoom,
    y: (client.y - view.y) / view.zoom,
  });
  const pointer = () => world(stage.current?.getPointerPosition() || { x: 0, y: 0 });
  const select = (e: KonvaEventObject<MouseEvent>, id: string) => {
    e.cancelBubble = true;
    if (space.current) return;
    const s = useEditor.getState();
    const hit = project.nodes.find((n) => n.id === id);
    if (
      !e.evt.shiftKey &&
      hit?.type === 'image' &&
      hit.panelId &&
      s.selection.length === 1 &&
      s.selection[0] === id
    ) {
      s.select([hit.panelId]);
      return;
    }
    s.select(
      e.evt.shiftKey
        ? s.selection.includes(id)
          ? s.selection.filter((i) => i !== id)
          : [...s.selection, id]
        : [id],
    );
  };
  const beginDrag = (id: string) => {
    transformer.current?.nodes([]);
    setDragging(id);
    const s = useEditor.getState();
    if (!s.selection.includes(id)) s.select([id]);
    const n = project.nodes.find((n) => n.id === id)!;
    dragOrigin.current = worldOrigin(project, n);
    groupDrag.current = useEditor
      .getState()
      .selection.filter((v) => v !== id)
      .flatMap((v) => {
        const q = project.nodes.find((q) => q.id === v),
          shape = stage.current?.findOne(`#${v}`);
        if (
          !q ||
          !shape ||
          q.locked ||
          (q.type === 'panel' && q.mode === 'flow') ||
          (q.type !== 'panel' && q.panelId && s.selection.includes(q.panelId))
        )
          return [];
        return [{ id: v, x: shape.x(), y: shape.y(), world: worldOrigin(project, q) }];
      });
  };
  const dragMove = (e: KonvaEventObject<DragEvent>, node: SceneNode) => {
    const target = insertionTarget(useEditor.getState(), pointer()).panel;
    setDropTarget(node.type === 'balloon' || node.type === 'panel' ? null : target?.id || null);
    const parent =
      node.type === 'panel'
        ? positions.get(node.pageId)!
        : node.panelId
          ? worldOrigin(
              project,
              panels.find((p) => p.id === node.panelId)!,
            )
          : node.type === 'balloon' && node.pageId
            ? positions.get(node.pageId)!
            : { x: 0, y: 0 };
    const x = parent.x + e.target.x() - (node.type === 'panel' ? 0 : node.width / 2),
      y = parent.y + e.target.y() - (node.type === 'panel' ? 0 : node.height / 2);
    if (e.evt.altKey) {
      setGuides({});
      movePeers(e.target, node, parent);
      return;
    }
    const {
      dx,
      dy,
      guides: gd,
    } = snapRect(
      { x, y, width: node.width, height: node.height },
      alignmentTargets(project, [...selection, node.id]),
      view.zoom,
    );
    e.target.position({ x: e.target.x() + dx, y: e.target.y() + dy });
    movePeers(e.target, node, parent);
    setGuides(gd);
  };
  const movePeers = (shape: Konva.Node, node: SceneNode, parent: Point) => {
    if (!dragOrigin.current) return;
    const dx = parent.x + shape.x() - (node.type === 'panel' ? 0 : node.width / 2) - dragOrigin.current.x,
      dy = parent.y + shape.y() - (node.type === 'panel' ? 0 : node.height / 2) - dragOrigin.current.y;
    for (const peer of groupDrag.current)
      stage.current?.findOne(`#${peer.id}`)?.position({ x: peer.x + dx, y: peer.y + dy });
  };
  const commitPeers = (p: Project) => {
    for (const peer of groupDrag.current) {
      const n = p.nodes.find((q) => q.id === peer.id),
        shape = stage.current?.findOne(`#${peer.id}`);
      if (n && shape) {
        n.x += shape.x() - peer.x;
        n.y += shape.y() - peer.y;
      }
    }
  };
  const endDrag = (e: KonvaEventObject<DragEvent>, n: SceneNode) => {
    const target = insertionTarget(useEditor.getState(), pointer()).panel;
    const s = useEditor.getState();
    let ok = false;
    if (n.type === 'panel') {
      const page =
        project.pages.find((pg) =>
          contains({ ...positions.get(pg.id)!, width: pg.width, height: pg.height }, pointer()),
        ) || project.pages.find((p) => p.id === n.pageId)!;
      const w = { x: positions.get(n.pageId)!.x + e.target.x(), y: e.target.y() };
      ok = s.run('Mover quadro', (p) => {
        commitPeers(p);
        const panel = p.nodes.find((q) => q.id === n.id) as Panel;
        {
          panel.mode = 'free';
          panel.pageId = page.id;
          panel.x = w.x - positions.get(page.id)!.x;
          panel.y = w.y;
        }
      });
      e.target.position({ x: n.x, y: n.y });
    } else {
      const origin = n.panelId
        ? worldOrigin(
            project,
            panels.find((p) => p.id === n.panelId)!,
          )
        : n.type === 'balloon' && n.pageId
          ? positions.get(n.pageId)!
          : { x: 0, y: 0 };
      const w = { x: origin.x + e.target.x() - n.width / 2, y: origin.y + e.target.y() - n.height / 2 };
      let parent = target;
      if (!parent && n.panelId && n.overflow) {
        const old = panels.find((p) => p.id === n.panelId)!;
        const page = project.pages.find((p) => p.id === old.pageId)!;
        if (contains({ ...positions.get(page.id)!, width: page.width, height: page.height }, pointer()))
          parent = old;
      }
      const o = parent ? worldOrigin(project, parent) : { x: 0, y: 0 };
      ok = s.run('Mover objeto', (p) => {
        commitPeers(p);
        if (n.type === 'balloon') {
          placeBalloon(p, p.nodes.find((q) => q.id === n.id) as Balloon, w, pointer());
          return;
        }
        Object.assign(
          p.nodes.find((q) => q.id === n.id)!,
          { panelId: parent?.id || null, x: w.x - o.x, y: w.y - o.y },
        );
      });
      e.target.position({ x: n.x + n.width / 2, y: n.y + n.height / 2 });
    }
    for (const peer of groupDrag.current)
      stage.current?.findOne(`#${peer.id}`)?.position({ x: peer.x, y: peer.y });
    groupDrag.current = [];
    if (!ok) stage.current?.batchDraw();
    setDragging(null);
    setDropTarget(null);
    setGuides({});
  };
  const resizePanel = (e: KonvaEventObject<DragEvent>, id: string, commit = false) => {
    e.cancelBubble = true;
    const original = savedProject.nodes.find((n) => n.id === id) as Panel;
    const page = savedProject.pages.find((pg) => pg.id === original.pageId)!;
    const o = worldOrigin(savedProject, original);
    const pt = pointer();
    let width = Math.max(30, pt.x - o.x),
      height = Math.max(20, pt.y - o.y);
    const snapped = snapRect({ ...o, width, height }, alignmentTargets(savedProject, [id]), view.zoom, true);
    if (!e.evt.altKey) {
      width += snapped.dx;
      height += snapped.dy;
    }
    width = clamp(width, 30, page.width);
    height = clamp(height, 20, page.height - (original.mode === 'flow' ? page.margin * 2 : 0));
    const next = structuredClone(savedProject);
    const panel = next.nodes.find((n) => n.id === id) as Panel;
    panel.height = height;
    if (panel.mode === 'flow') {
      panel.edgeToEdge = false;
      panel.span = clamp(Math.round((width + page.gapX) / (panelWidth(page, 1) + page.gapX)), 1, 12);
    } else panel.width = width;
    try {
      reflow(next);
      resizeDraft.current = next;
      setResizePreview(next);
      setGuides(e.evt.altKey ? {} : snapped.guides);
    } catch {
      // Hold the last valid geometry until the pointer returns within the limits.
    }
    if (commit) {
      const final = resizeDraft.current?.nodes.find((n) => n.id === id) as Panel | undefined;
      if (final)
        useEditor.getState().patch([id], {
          width: final.width,
          height: final.height,
          span: final.span,
          edgeToEdge: final.edgeToEdge,
        });
      resizeDraft.current = null;
      setResizePreview(null);
      setGuides({});
      setDragging(null);
    }
  };
  const finishTransform = () => {
    const s = useEditor.getState();
    const changes = selection.flatMap((id) => {
      const node = project.nodes.find((n) => n.id === id),
        shape = stage.current?.findOne(`#${id}`);
      if (!node || node.type === 'panel' || !shape) return [];
      const width = Math.max(8, node.width * Math.abs(shape.scaleX())),
        height = Math.max(8, node.height * Math.abs(shape.scaleY()));
      return [
        {
          id,
          width,
          height,
          x: shape.x() - width / 2,
          y: shape.y() - height / 2,
          rotation: shape.rotation(),
          flipX: shape.scaleX() < 0,
          flipY: shape.scaleY() < 0,
        },
      ];
    });
    for (const change of changes) {
      const shape = stage.current?.findOne(`#${change.id}`),
        node = project.nodes.find((n) => n.id === change.id)!;
      shape?.scale({ x: node.flipX ? -1 : 1, y: node.flipY ? -1 : 1 });
      shape?.position({ x: node.x + node.width / 2, y: node.y + node.height / 2 });
      shape?.rotation(node.rotation);
    }
    s.run('Redimensionar objetos', (p) => {
      changes.forEach((change) => {
        const n = p.nodes.find((n) => n.id === change.id)!;
        Object.assign(n, change);
      });
    });
  };
  const commitText = () => {
    if (editing) useEditor.getState().patch([editing], { text: draft });
    setEditing(null);
  };
  const openText = (id: string) => {
    const n = project.nodes.find((n) => n.id === id);
    if (n && n.type !== 'panel' && n.type !== 'image') {
      setDraft(n.text);
      setEditing(id);
    }
  };
  const visibleItem = (n: Item, origin: Point) => {
    const b = visualBounds(n);
    return !n.hidden && intersects({ ...b, x: b.x + origin.x, y: b.y + origin.y }, overscan);
  };
  return (
    <div
      ref={root}
      className={`canvas-area ${isPanning ? 'panning' : ''}`}
      data-testid="editor-canvas"
      onDragOver={(e) => {
        if (readonly) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = 'copy';
        if (e.dataTransfer.types.includes('application/cartoonloop-balloon')) {
          setDropTarget(null);
          return;
        }
        const r = root.current!.getBoundingClientRect();
        setDropTarget(
          insertionTarget(useEditor.getState(), world({ x: e.clientX - r.left, y: e.clientY - r.top })).panel
            ?.id || null,
        );
      }}
      onDragLeave={() => setDropTarget(null)}
      onDrop={(e) => {
        if (readonly) return;
        e.preventDefault();
        const r = root.current!.getBoundingClientRect();
        const pt = world({ x: e.clientX - r.left, y: e.clientY - r.top });
        setDropTarget(null);
        if (e.dataTransfer.files.length) onImport([...e.dataTransfer.files], pt);
        else {
          const data = e.dataTransfer.getData('application/cartoonloop');
          if (data) dropPreset(data, pt);
        }
      }}
    >
      <Stage
        ref={stage}
        width={size.width}
        height={size.height}
        x={view.x}
        y={view.y}
        scaleX={view.zoom}
        scaleY={view.zoom}
        onContextMenu={(e) => e.evt.preventDefault()}
        onWheel={(e) => {
          e.evt.preventDefault();
          const s = useEditor.getState();
          if (e.evt.ctrlKey || e.evt.metaKey) {
            const pt = pointer(),
              mouse = stage.current!.getPointerPosition()!,
              z = clamp(s.view.zoom * Math.exp(-e.evt.deltaY * 0.008), 0.05, 4);
            s.setView({ zoom: z, x: mouse.x - pt.x * z, y: mouse.y - pt.y * z });
          } else {
            s.setView({
              x: s.view.x - (e.evt.shiftKey ? e.evt.deltaY : e.evt.deltaX),
              y: s.view.y - (e.evt.shiftKey ? 0 : e.evt.deltaY),
            });
          }
        }}
        onMouseDown={(e) => {
          if (e.evt.button === 1 || space.current) {
            e.evt.preventDefault();
            pan.current = { start: { x: e.evt.clientX, y: e.evt.clientY }, view: { x: view.x, y: view.y } };
            setPanning(true);
            return;
          }
          if (e.target === stage.current || e.target.name() === 'page-bg') {
            const pt = pointer();
            const page = project.pages.find((pg) =>
              contains({ ...positions.get(pg.id)!, width: pg.width, height: pg.height }, pt),
            );
            if (page) useEditor.setState({ activePage: page.id });
            if (!e.evt.shiftKey) useEditor.getState().select([]);
            setMarquee({ start: pt, end: pt });
          }
        }}
        onMouseMove={(e) => {
          if (pan.current) {
            useEditor.getState().setView({
              x: pan.current.view.x + e.evt.clientX - pan.current.start.x,
              y: pan.current.view.y + e.evt.clientY - pan.current.start.y,
            });
            return;
          }
          if (marquee) setMarquee({ ...marquee, end: pointer() });
        }}
        onMouseUp={() => {
          if (pan.current) {
            pan.current = null;
            setPanning(space.current);
          }
          if (marquee) {
            const r = {
              x: Math.min(marquee.start.x, marquee.end.x),
              y: Math.min(marquee.start.y, marquee.end.y),
              width: Math.abs(marquee.end.x - marquee.start.x),
              height: Math.abs(marquee.end.y - marquee.start.y),
            };
            if (r.width > 4 && r.height > 4) {
              const ids = project.nodes
                .filter((n) => {
                  if (n.hidden || n.locked) return false;
                  const o = worldOrigin(project, n),
                    b = visualBounds(n);
                  return intersects(
                    { x: o.x + b.x - n.x, y: o.y + b.y - n.y, width: b.width, height: b.height },
                    r,
                  );
                })
                .map((n) => n.id);
              useEditor.getState().select(
                ids.filter((id) => {
                  const n = project.nodes.find((n) => n.id === id)!;
                  return n.type === 'panel' || !n.panelId || !ids.includes(n.panelId);
                }),
              );
            }
            setMarquee(null);
          }
        }}
      >
        <Layer>
          {project.pages.map((page, index) => {
            const origin = positions.get(page.id)!;
            if (!intersects({ ...origin, width: page.width, height: page.height }, overscan)) return null;
            return (
              <Group key={page.id} x={origin.x} y={origin.y}>
                <Text
                  text={`${String(index + 1).padStart(2, '0')}  /  ${page.name}${page.automatic ? ' · continuação' : ''}`}
                  y={-30 / view.zoom}
                  fontFamily="Inter"
                  fontSize={12 / view.zoom}
                  fill="#888888"
                />
                <Rect
                  name="page-bg"
                  width={page.width}
                  height={page.height}
                  fill={page.fill === 'transparent' ? '#ffffff' : page.fill}
                  shadowColor="#000000"
                  shadowOpacity={0.08}
                  shadowBlur={20 / view.zoom}
                />
              </Group>
            );
          })}
          {project.nodes
            .filter((p) => !p.hidden && (p.type === 'panel' || !p.panelId))
            .map((panel) => {
              if (panel.type !== 'panel') {
                const pg =
                  panel.type === 'balloon' && panel.pageId
                    ? project.pages.find((pg) => pg.id === panel.pageId)
                    : undefined;
                const offset = pg ? positions.get(pg.id)! : { x: 0, y: 0 };
                if (!visibleItem(panel, offset)) return null;
                return (
                  <Group
                    key={panel.id}
                    x={offset.x}
                    y={offset.y}
                    clipX={pg && dragging !== panel.id ? 0 : undefined}
                    clipY={0}
                    clipWidth={pg && dragging !== panel.id ? pg.width : undefined}
                    clipHeight={pg?.height}
                  >
                    <ItemShape
                      node={panel}
                      project={project}
                      onSelect={select}
                      onDrag={endDrag}
                      onDragStart={beginDrag}
                      onDragMove={dragMove}
                      onEdit={openText}
                      editing={editing === panel.id}
                      panning={isPanning}
                    />
                  </Group>
                );
              }
              const origin = worldOrigin(project, panel),
                children = (childIndex.get(panel.id) || []).filter((n) => visibleItem(n, origin));
              if (
                !intersects({ ...origin, width: panel.width, height: panel.height }, overscan) &&
                !children.length
              )
                return null;
              const page = positions.get(panel.pageId)!;
              const bounds = project.pages.find((pg) => pg.id === panel.pageId)!;
              const childDragging = children.some((n) => n.id === dragging);
              return (
                <Group
                  key={panel.id}
                  x={page.x}
                  y={page.y}
                  clipX={0}
                  clipY={0}
                  clipWidth={childDragging ? undefined : bounds.width}
                  clipHeight={childDragging ? undefined : bounds.height}
                >
                  <Group
                    id={panel.id}
                    x={panel.x}
                    y={panel.y}
                    width={panel.width}
                    height={panel.height}
                    draggable={!panel.locked && !readonly && !isPanning}
                    onDragStart={(e) => {
                      if (e.target.id() === panel.id) beginDrag(panel.id);
                    }}
                    onDragMove={(e) => {
                      if (e.target.id() === panel.id) dragMove(e, panel);
                    }}
                    onDragEnd={(e) => {
                      if (e.target.id() === panel.id) endDrag(e, panel);
                    }}
                  >
                    <Shape
                      width={panel.width}
                      height={panel.height}
                      sceneFunc={(ctx) => drawPanel(ctx._context, panel)}
                      hitFunc={(ctx, shape) => {
                        ctx.beginPath();
                        ctx.rect(0, 0, panel.width, panel.height);
                        ctx.closePath();
                        ctx.fillStrokeShape(shape);
                      }}
                      onClick={(e) => select(e, panel.id)}
                      onMouseEnter={() => setHover(panel.id)}
                      onMouseLeave={() => setHover(null)}
                    />
                    {children.map((item) => (
                      <Group
                        key={item.id}
                        clipFunc={
                          panel.clip && !item.overflow && dragging !== item.id
                            ? (ctx) => panelPath(ctx._context, panel)
                            : undefined
                        }
                      >
                        <ItemShape
                          node={item}
                          project={project}
                          onSelect={select}
                          onDrag={endDrag}
                          onDragStart={beginDrag}
                          onDragMove={dragMove}
                          onEdit={openText}
                          editing={editing === item.id}
                          panning={isPanning}
                          parentLocked={panel.locked}
                        />
                      </Group>
                    ))}
                  </Group>
                </Group>
              );
            })}
        </Layer>
        <Layer>
          {panels
            .filter(
              (n) =>
                !n.hidden &&
                (dragging !== n.id || !!resizePreview) &&
                (selection.includes(n.id) || hover === n.id || dropTarget === n.id),
            )
            .map((n) => {
              const pos = worldOrigin(project, n);
              return (
                <Group key={n.id} x={pos.x} y={pos.y}>
                  <Rect
                    listening={false}
                    width={n.width}
                    height={n.height}
                    stroke="#ffffff"
                    strokeWidth={4 / view.zoom}
                  />
                  <Rect
                    listening={false}
                    width={n.width}
                    height={n.height}
                    stroke="#242424"
                    dash={selection.includes(n.id) ? undefined : [5 / view.zoom, 4 / view.zoom]}
                    strokeWidth={1.5 / view.zoom}
                  />
                  {selection.includes(n.id) && !readonly && !n.locked && (
                    <Rect
                      name="panel-resize"
                      x={n.width - 4 / view.zoom}
                      y={n.height - 4 / view.zoom}
                      width={8 / view.zoom}
                      height={8 / view.zoom}
                      fill="#ffffff"
                      stroke="#222222"
                      strokeWidth={1 / view.zoom}
                      draggable
                      onMouseEnter={() => {
                        if (root.current) root.current.style.cursor = 'nwse-resize';
                      }}
                      onMouseLeave={() => {
                        if (root.current) root.current.style.cursor = '';
                      }}
                      onDragStart={(e) => {
                        e.cancelBubble = true;
                        resizeDraft.current = savedProject;
                        setResizePreview(savedProject);
                        setDragging(n.id);
                      }}
                      onDragMove={(e) => resizePanel(e, n.id)}
                      onDragEnd={(e) => resizePanel(e, n.id, true)}
                    />
                  )}
                </Group>
              );
            })}
          {selected?.type === 'balloon' &&
            !readonly &&
            !isNodeLocked(project, selected) &&
            selected.kind !== 'caption' &&
            (() => {
              const o = worldOrigin(project, selected);
              return (
                <Group
                  x={o.x + selected.width / 2}
                  y={o.y + selected.height / 2}
                  offsetX={selected.width / 2}
                  offsetY={selected.height / 2}
                  rotation={selected.rotation}
                  scaleX={selected.flipX ? -1 : 1}
                  scaleY={selected.flipY ? -1 : 1}
                >
                  <Line
                    points={[selected.width / 2, selected.height / 2, selected.tailX, selected.tailY]}
                    stroke="#777777"
                    dash={[3 / view.zoom, 4 / view.zoom]}
                    strokeWidth={1 / view.zoom}
                    listening={false}
                  />
                  <Circle
                    x={selected.tailX}
                    y={selected.tailY}
                    radius={5 / view.zoom}
                    fill="#ffffff"
                    stroke="#222222"
                    strokeWidth={1.5 / view.zoom}
                    draggable
                    onDragEnd={(e) => {
                      e.cancelBubble = true;
                      useEditor.getState().patch([selected.id], { tailX: e.target.x(), tailY: e.target.y() });
                    }}
                  />
                </Group>
              );
            })()}
          {!readonly && (
            <Transformer
              ref={transformer}
              rotateEnabled
              keepRatio={selected?.type === 'image' && selected.aspectLocked !== false}
              flipEnabled={false}
              borderStroke="#333333"
              anchorStroke="#333333"
              anchorFill="#ffffff"
              anchorSize={8}
              rotateAnchorOffset={24}
              onTransformEnd={finishTransform}
              boundBoxFunc={(old, next) =>
                Math.abs(next.width) < 8 || Math.abs(next.height) < 8 ? old : next
              }
            />
          )}
          {guides.x !== undefined && (
            <Line
              points={[guides.x, rect.y, guides.x, rect.y + rect.height]}
              stroke="#777777"
              dash={[5 / view.zoom, 4 / view.zoom]}
              strokeWidth={1 / view.zoom}
              listening={false}
            />
          )}
          {guides.y !== undefined && (
            <Line
              points={[rect.x, guides.y, rect.x + rect.width, guides.y]}
              stroke="#777777"
              dash={[5 / view.zoom, 4 / view.zoom]}
              strokeWidth={1 / view.zoom}
              listening={false}
            />
          )}
          {marquee && (
            <Rect
              x={Math.min(marquee.start.x, marquee.end.x)}
              y={Math.min(marquee.start.y, marquee.end.y)}
              width={Math.abs(marquee.start.x - marquee.end.x)}
              height={Math.abs(marquee.start.y - marquee.end.y)}
              fill="rgba(100,100,100,.12)"
              stroke="#555555"
              strokeWidth={1 / view.zoom}
              listening={false}
            />
          )}
        </Layer>
      </Stage>
      {!project.nodes.length && (
        <div className="canvas-hint">
          <span>Uma página. Todas as possibilidades.</span>
          <p>Escolha um quadro à esquerda para começar.</p>
          <small>Arraste imagens para dentro dos quadros.</small>
        </div>
      )}
      {dropTarget && <div className="drop-hint">Solte para adicionar ao quadro</div>}
      {resizePreview && (
        <div className="drop-hint" data-testid="resize-preview">
          {Math.round(selected?.width || 0)} × {Math.round(selected?.height || 0)} px · Alt para soltar o
          encaixe
        </div>
      )}
      {editing &&
        editNode &&
        (() => {
          const o = worldOrigin(project, editNode);
          return (
            <textarea
              autoFocus
              className="canvas-text-editor"
              aria-label="Editar texto no canvas"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onBlur={commitText}
              onKeyDown={(e) => {
                e.stopPropagation();
                if (e.key === 'Escape') setEditing(null);
                if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) commitText();
              }}
              style={{
                left: view.x + o.x * view.zoom,
                top: view.y + o.y * view.zoom,
                width: editNode.width * view.zoom,
                minHeight: editNode.height * view.zoom,
                padding: editNode.padding * view.zoom,
                fontSize: editNode.fontSize * view.zoom,
                lineHeight: editNode.lineHeight,
                fontWeight: editNode.bold ? 700 : 400,
                fontStyle: editNode.italic ? 'italic' : 'normal',
                textAlign: editNode.align,
                color: editNode.textColor,
                transform: `rotate(${editNode.rotation}deg) scale(${editNode.flipX ? -1 : 1},${editNode.flipY ? -1 : 1})`,
              }}
            />
          );
        })()}
    </div>
  );
}
