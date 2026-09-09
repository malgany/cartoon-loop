import { z } from 'zod';

export const LIMITS = {
  pages: 20,
  nodes: 2000,
  imageBytes: 20 * 1024 ** 2,
  imagePixels: 32_000_000,
  assetBytes: 250 * 1024 ** 2,
  width: 1600,
  height: 16000,
};
export const uid = () => crypto.randomUUID();
const number = z.number().finite();
const identifier = z.string().regex(/^[\w-]{1,80}$/);
const color = z.string().regex(/^(#[0-9a-fA-F]{6}|transparent)$/);
const common = {
  id: identifier,
  name: z.string().max(300),
  x: number,
  y: number,
  width: number.min(1).max(100000),
  height: number.min(1).max(100000),
  rotation: number,
  flipX: z.boolean(),
  flipY: z.boolean(),
  opacity: number.min(0).max(1),
  locked: z.boolean(),
  hidden: z.boolean(),
};
const textStyle = {
  text: z.string().max(10000),
  fontSize: number.min(6).max(500),
  bold: z.boolean(),
  italic: z.boolean(),
  align: z.enum(['left', 'center', 'right']),
  lineHeight: number.min(0.8).max(3),
  padding: number.min(0).max(200),
  textColor: color,
};
export const BALLOON_KINDS = [
  'speech',
  'rounded',
  'thought',
  'shout',
  'whisper',
  'electronic',
  'wavy',
  'caption',
] as const;
const balloonKind = z.enum(BALLOON_KINDS);
const panelAppearanceSchema = z
  .object({
    shape: z.enum(['rect', 'rounded', 'oval', 'diagonal']),
    fill: color,
    stroke: color,
    strokeWidth: number.min(0).max(40),
    clip: z.boolean(),
  })
  .partial();
const balloonAppearanceSchema = z
  .object({
    fontSize: textStyle.fontSize,
    bold: textStyle.bold,
    italic: textStyle.italic,
    align: textStyle.align,
    lineHeight: textStyle.lineHeight,
    padding: textStyle.padding,
    textColor: textStyle.textColor,
    fill: color,
    stroke: color,
    strokeWidth: number.min(0).max(30),
    shape: z.enum(['rect', 'rounded']),
  })
  .partial();
const styleDefaultsSchema = z.object({
  panel: panelAppearanceSchema,
  balloons: z.partialRecord(balloonKind, balloonAppearanceSchema),
});
const panelSchema = z.object({
  ...common,
  type: z.literal('panel'),
  pageId: z.string(),
  mode: z.enum(['flow', 'free']),
  order: number,
  span: number.int().min(1).max(12),
  shape: z.enum(['rect', 'rounded', 'oval', 'diagonal']),
  fill: color,
  stroke: color,
  strokeWidth: number.min(0).max(40),
  clip: z.boolean(),
  role: z.enum(['frame', 'spacer', 'transition']),
  gradient: color.nullable(),
  edgeToEdge: z.boolean(),
});
const imageSchema = z.object({
  ...common,
  type: z.literal('image'),
  panelId: z.string().nullable(),
  assetId: identifier,
  overflow: z.boolean(),
  aspectLocked: z.boolean().optional(),
});
const balloonSchema = z.object({
  ...common,
  ...textStyle,
  type: z.literal('balloon'),
  panelId: z.string().nullable(),
  pageId: z.string().nullable().optional(),
  overflow: z.boolean(),
  kind: balloonKind,
  shape: z.enum(['rect', 'rounded']).default('rounded'),
  fill: color,
  stroke: color,
  strokeWidth: number.min(0).max(30),
  tailX: number,
  tailY: number,
});
const textSchema = z.object({
  ...common,
  ...textStyle,
  type: z.literal('text'),
  panelId: z.string().nullable(),
  overflow: z.boolean(),
});
export const nodeSchema = z.discriminatedUnion('type', [panelSchema, imageSchema, balloonSchema, textSchema]);
export type Panel = z.infer<typeof panelSchema>;
export type Artwork = z.infer<typeof imageSchema>;
export type Balloon = z.infer<typeof balloonSchema>;
export type TextNode = z.infer<typeof textSchema>;
export type Item = Artwork | Balloon | TextNode;
export type SceneNode = Panel | Item;
export const pageSchema = z.object({
  id: identifier,
  sequenceId: identifier,
  name: z.string().max(300),
  width: number.int().min(320).max(LIMITS.width),
  height: number.int().min(1000).max(LIMITS.height),
  fill: color,
  margin: number.min(0).max(150),
  gapX: number.min(0).max(100),
  gapY: number.min(0).max(2000),
  automatic: z.boolean(),
});
export type Page = z.infer<typeof pageSchema>;
export const assetSchema = z.object({
  id: identifier,
  name: z.string().max(500),
  mime: z.enum(['image/png', 'image/jpeg', 'image/webp']),
  width: number.int().positive(),
  height: number.int().positive(),
  bytes: number.int().positive(),
  hash: z.string(),
});
export type Asset = z.infer<typeof assetSchema>;
export const projectSchema = z.object({
  version: z.literal(1),
  id: identifier,
  name: z.string().min(1).max(150),
  createdAt: number,
  updatedAt: number,
  pages: z.array(pageSchema).min(1).max(LIMITS.pages),
  nodes: z.array(nodeSchema).max(LIMITS.nodes),
  assets: z.array(assetSchema).max(LIMITS.nodes),
  styleDefaults: styleDefaultsSchema.default({ panel: {}, balloons: {} }),
});
export type Project = z.infer<typeof projectSchema>;
export type Point = { x: number; y: number };
export type Rect = Point & { width: number; height: number };

export function validateProject(input: unknown): Project {
  const p = projectSchema.parse(input);
  const ids = [...p.pages, ...p.nodes, ...p.assets].map((n) => n.id);
  if (new Set(ids).size !== ids.length) throw new Error('O projeto contém identificadores repetidos.');
  const pages = new Map(p.pages.map((n) => [n.id, n]));
  const panels = new Map(p.nodes.filter((n) => n.type === 'panel').map((n) => [n.id, n]));
  const assets = new Map(p.assets.map((n) => [n.id, n]));
  for (const page of p.pages) {
    const root = pages.get(page.sequenceId);
    if (
      !root ||
      root.automatic ||
      root.id !== root.sequenceId ||
      page.automatic === (page.id === page.sequenceId)
    )
      throw new Error('Sequência de páginas inválida.');
    if (page.width - page.margin * 2 - page.gapX * 11 <= 0)
      throw new Error('Margens e intervalos não cabem na página.');
  }
  for (const n of p.nodes) {
    if (n.type === 'panel' ? !pages.has(n.pageId) : n.panelId !== null && !panels.has(n.panelId))
      throw new Error('Objeto sem quadro ou página de origem.');
    if (n.type === 'image' && !assets.has(n.assetId)) throw new Error('Imagem ausente no projeto.');
    if (n.type === 'balloon') {
      // Backwards-compatible migration: preserve the appearance of panel-owned balloons.
      const parent = n.panelId ? panels.get(n.panelId) : undefined;
      if (parent) {
        n.x += parent.x;
        n.y += parent.y;
        n.pageId = parent.pageId;
        n.panelId = null;
      } else if (n.pageId === undefined) {
        const positions = pagePositions(p);
        const page = p.pages.find((pg) =>
          contains(
            { ...positions.get(pg.id)!, width: pg.width, height: pg.height },
            { x: n.x + n.width / 2, y: n.y + n.height / 2 },
          ),
        );
        n.pageId = page?.id || null;
        if (page) n.x -= positions.get(page.id)!.x;
      }
      if (n.pageId && !pages.has(n.pageId)) throw new Error('Balão sem página de origem.');
    }
  }
  if (p.assets.reduce((s, a) => s + a.bytes, 0) > LIMITS.assetBytes)
    throw new Error('O projeto excede 250 MiB de imagens.');
  if (p.assets.some((a) => a.bytes > LIMITS.imageBytes || a.width * a.height > LIMITS.imagePixels))
    throw new Error('Uma imagem excede os limites do editor.');
  if (new TextEncoder().encode(JSON.stringify(p)).byteLength > 8 * 1024 ** 2)
    throw new Error('Limite de 8 MiB de texto e metadados atingido. Divida a história em outro projeto.');
  return p;
}

export function newPage(width = 800, height = 10000): Page {
  const id = uid();
  return {
    id,
    sequenceId: id,
    name: 'Página 01',
    width,
    height,
    fill: '#ffffff',
    margin: Math.round((24 * width) / 800),
    gapX: Math.round((16 * width) / 800),
    gapY: Math.round((80 * width) / 800),
    automatic: false,
  };
}
export function newProject(name: string, width = 800, height = 10000): Project {
  return {
    version: 1,
    id: uid(),
    name: name.trim() || 'Sem título',
    createdAt: Date.now(),
    updatedAt: Date.now(),
    pages: [newPage(width, height)],
    nodes: [],
    assets: [],
    styleDefaults: { panel: {}, balloons: {} },
  };
}
export const baseNode = (name: string) => ({
  id: uid(),
  name,
  x: 0,
  y: 0,
  width: 200,
  height: 150,
  rotation: 0,
  flipX: false,
  flipY: false,
  opacity: 1,
  locked: false,
  hidden: false,
});
export const PANEL_PRESETS = [
  { id: 'horizontal', name: 'Horizontal', ratio: 16 / 9, description: 'Diálogos e cenários' },
  { id: 'square', name: 'Quadrado', ratio: 1, description: 'Um instante, uma reação' },
  { id: 'vertical', name: 'Vertical', ratio: 2 / 3, description: 'Personagens e movimento' },
  { id: 'strip', name: 'Faixa', ratio: 4, description: 'Um olhar mais de perto' },
  { id: 'long', name: 'Vertical longo', ratio: 1 / 3, description: 'Altura, queda e revelação' },
  { id: 'bleed', name: 'Largura total', ratio: 16 / 9, description: 'De uma borda à outra' },
];
export const BALLOONS: { id: Balloon['kind']; name: string }[] = [
  { id: 'speech', name: 'Fala' },
  { id: 'rounded', name: 'Arredondado' },
  { id: 'thought', name: 'Pensamento' },
  { id: 'shout', name: 'Grito' },
  { id: 'whisper', name: 'Sussurro' },
  { id: 'electronic', name: 'Voz eletrônica' },
  { id: 'wavy', name: 'Trêmulo' },
  { id: 'caption', name: 'Narração' },
];
export function newPanel(page: Page, preset = 'horizontal', role: Panel['role'] = 'frame'): Panel {
  const proportion = preset === 'borderless' ? 'square' : preset === 'overflow' ? 'vertical' : preset;
  const pr = PANEL_PRESETS.find((p) => p.id === proportion) || PANEL_PRESETS[0];
  const w = preset === 'bleed' ? page.width : page.width - 2 * page.margin;
  return {
    ...baseNode(
      preset === 'borderless' ? 'Sem borda' : preset === 'overflow' ? 'Com transbordamento' : pr.name,
    ),
    type: 'panel',
    pageId: page.id,
    mode: 'flow',
    order: 0,
    span: 12,
    shape: 'rect',
    width: w,
    height: Math.min(Math.round(w / pr.ratio), page.height - page.margin * 2),
    fill: preset === 'borderless' ? 'transparent' : '#ffffff',
    stroke: '#202020',
    strokeWidth: preset === 'borderless' ? 0 : 2,
    clip: preset !== 'overflow',
    role,
    gradient: null,
    edgeToEdge: preset === 'bleed',
  };
}
export function newText(): TextNode;
export function newText(kind: Balloon['kind']): Balloon;
export function newText(kind?: Balloon['kind']): TextNode | Balloon;
export function newText(kind?: Balloon['kind']): TextNode | Balloon {
  const style = {
    ...baseNode(kind ? BALLOONS.find((b) => b.id === kind)!.name : 'Texto'),
    panelId: null,
    overflow: true,
    text: kind === 'caption' ? 'Enquanto isso…' : kind ? 'Sua fala começa aqui.' : 'Seu texto aqui',
    fontSize: 28,
    bold: false,
    italic: false,
    align: 'center' as const,
    lineHeight: 1.15,
    padding: 24,
    textColor: '#202020',
    width: 260,
    height: kind ? 150 : 70,
  };
  return kind
    ? {
        ...style,
        type: 'balloon',
        pageId: null,
        kind,
        shape: 'rounded',
        fill: '#ffffff',
        stroke: '#202020',
        strokeWidth: 2,
        tailX: 185,
        tailY: 195,
      }
    : { ...style, type: 'text', padding: 8 };
}

export const clamp = (v: number, min: number, max: number) => Math.min(Math.max(v, min), Math.max(min, max));
export const intersects = (a: Rect, b: Rect) =>
  a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
export const contains = (r: Rect, p: Point) =>
  p.x >= r.x && p.y >= r.y && p.x <= r.x + r.width && p.y <= r.y + r.height;
export const isNodeLocked = (p: Project, n: SceneNode) =>
  n.locked || (n.type !== 'panel' && !!n.panelId && p.nodes.some((q) => q.id === n.panelId && q.locked));
export function pagePositions(p: Project): Map<string, Point> {
  let x = 0;
  return new Map(
    p.pages.map((page) => {
      const pair: [string, Point] = [page.id, { x, y: 0 }];
      x += page.width + 140;
      return pair;
    }),
  );
}
export function worldOrigin(p: Project, n: SceneNode): Point {
  if (n.type === 'panel' || (n.type === 'balloon' && n.pageId && !n.panelId)) {
    const pos = pagePositions(p).get(n.pageId!)!;
    return { x: pos.x + n.x, y: pos.y + n.y };
  }
  const parent = p.nodes.find((q) => q.id === n.panelId);
  if (!parent) return { x: n.x, y: n.y };
  const pos = worldOrigin(p, parent);
  return { x: pos.x + n.x, y: pos.y + n.y };
}

/** Place a balloon on a page, never inside a frame. Coordinates supplied are world-space. */
export function placeBalloon(
  p: Project,
  n: Balloon,
  origin: Point,
  hit: Point = { x: origin.x + n.width / 2, y: origin.y + n.height / 2 },
) {
  const positions = pagePositions(p);
  const page = p.pages.find((pg) =>
    contains({ ...positions.get(pg.id)!, width: pg.width, height: pg.height }, hit),
  );
  const offset = page ? positions.get(page.id)! : { x: 0, y: 0 };
  Object.assign(n, {
    panelId: null,
    pageId: page?.id || null,
    x: origin.x - offset.x,
    y: origin.y - offset.y,
  });
}
export function visualBounds(n: SceneNode): Rect {
  const tail = n.type === 'balloon' && n.kind !== 'caption';
  const l = tail ? Math.min(0, n.tailX - 10) : 0,
    t = tail ? Math.min(0, n.tailY - 10) : 0;
  const r = tail ? Math.max(n.width, n.tailX + 10) : n.width,
    b = tail ? Math.max(n.height, n.tailY + 10) : n.height;
  const angle = (n.rotation * Math.PI) / 180,
    cx = n.width / 2,
    cy = n.height / 2;
  const pts = [
    [l, t],
    [r, t],
    [r, b],
    [l, b],
  ].map(([x, y]) => {
    const dx = (x - cx) * (n.flipX ? -1 : 1),
      dy = (y - cy) * (n.flipY ? -1 : 1);
    return {
      x: n.x + cx + dx * Math.cos(angle) - dy * Math.sin(angle),
      y: n.y + cy + dx * Math.sin(angle) + dy * Math.cos(angle),
    };
  });
  const xs = pts.map((p) => p.x),
    ys = pts.map((p) => p.y);
  return {
    x: Math.min(...xs),
    y: Math.min(...ys),
    width: Math.max(...xs) - Math.min(...xs),
    height: Math.max(...ys) - Math.min(...ys),
  };
}
