import { intersects, visualBounds, type Project, type Page, type Item, type Panel } from './model';
import { imageBlob, decodeImage, canvasBlob, zipFiles } from './storage';
import { drawItem, drawPanel, itemTransform, panelPath } from './drawing';

type Cache = { image: HTMLImageElement; bytes: number; used: number };
const cache = new Map<string, Cache>(),
  loading = new Map<string, Promise<HTMLImageElement>>();
export const clearImageCache = () => {
  cache.clear();
  loading.clear();
};
export const imageCacheBytes = () => [...cache.values()].reduce((s, i) => s + i.bytes, 0);
export async function decodedAsset(projectId: string, assetId: string, original = false) {
  const key = `${projectId}:${assetId}:${original}`;
  const hit = cache.get(key);
  if (hit) {
    hit.used = Date.now();
    return hit.image;
  }
  if (loading.has(key)) return loading.get(key)!;
  const promise = (async () => {
    const image = await decodeImage(await imageBlob(projectId, assetId, original));
    cache.set(key, { image, bytes: image.naturalWidth * image.naturalHeight * 4, used: Date.now() });
    while (imageCacheBytes() > 96 * 1024 ** 2 && cache.size > 1) {
      const oldest = [...cache.entries()]
        .filter(([id]) => id !== key)
        .sort((a, b) => a[1].used - b[1].used)[0];
      if (oldest) cache.delete(oldest[0]);
      else break;
    }
    return image;
  })();
  loading.set(key, promise);
  try {
    return await promise;
  } finally {
    loading.delete(key);
  }
}
export async function loadFonts() {
  if (!document.fonts) return;
  await Promise.all(
    ['400', '700', 'italic 400', 'italic 700'].map((style) =>
      document.fonts.load(`${style} 28px "Comic Neue"`),
    ),
  );
  await document.fonts.ready;
}
export type RenderOptions = {
  width?: number;
  offset?: number;
  height?: number;
  original?: boolean;
  mime?: string;
  quality?: number;
  signal?: AbortSignal;
};
export async function renderPage(p: Project, page: Page, options: RenderOptions = {}): Promise<Blob> {
  const width = options.width || page.width,
    scale = width / page.width,
    offset = options.offset || 0;
  const height = options.height ?? Math.round(page.height * scale) - offset;
  if (options.signal?.aborted) throw new DOMException('Cancelado', 'AbortError');
  await loadFonts();
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const c = canvas.getContext('2d');
  if (!c) throw new Error('Não foi possível criar a imagem. Exporte em fatias menores.');
  try {
    if (page.fill !== 'transparent') {
      c.fillStyle = page.fill;
      c.fillRect(0, 0, width, height);
    } else if (options.mime === 'image/jpeg') {
      c.fillStyle = '#ffffff';
      c.fillRect(0, 0, width, height);
    }
    c.translate(0, -offset);
    c.scale(scale, scale);
    const slice = { x: 0, y: offset / scale, width: page.width, height: height / scale };
    const frames = p.nodes.filter(
      (n) => (n.type === 'panel' || n.type === 'balloon') && n.pageId === page.id && !n.hidden,
    );
    for (const panel of frames) {
      if (options.signal?.aborted) throw new DOMException('Cancelado', 'AbortError');
      if (panel.type === 'balloon') {
        if (intersects(visualBounds(panel), slice)) {
          c.save();
          itemTransform(c, panel);
          drawItem(c, panel);
          c.restore();
        }
        continue;
      }
      if (panel.type !== 'panel' || panel.role === 'spacer') continue;
      c.save();
      c.translate(panel.x, panel.y);
      if (intersects(panel, slice)) drawPanel(c, panel);
      const items = p.nodes.filter(
        (n): n is Item => n.type !== 'panel' && n.panelId === panel.id && !n.hidden,
      );
      for (const item of items) {
        const b = visualBounds(item);
        if (!intersects({ ...b, x: b.x + panel.x, y: b.y + panel.y }, slice)) continue;
        c.save();
        if (panel.clip && !item.overflow) {
          panelPath(c, panel);
          c.clip();
        }
        itemTransform(c, item);
        const image =
          item.type === 'image'
            ? await decodedAsset(p.id, item.assetId, options.original !== false)
            : undefined;
        drawItem(c, item, image);
        c.restore();
      }
      c.restore();
    }
    if (options.signal?.aborted) throw new DOMException('Cancelado', 'AbortError');
    const blob = await canvasBlob(canvas, options.mime, options.quality);
    if (options.mime && blob.type !== options.mime)
      throw new Error('Este navegador não exporta o formato escolhido. Selecione PNG.');
    return blob;
  } finally {
    canvas.width = canvas.height = 1;
  }
}
export async function thumbnail(p: Project) {
  return renderPage(p, p.pages[0], { width: 400, height: 280, original: false });
}
export type ExportOptions = {
  mime: 'image/png' | 'image/jpeg' | 'image/webp';
  quality: number;
  pages: string[];
  preset: 'whole' | 'webtoon' | 'tapas' | 'custom';
  sliceHeight: number;
  width: number;
};
export function exportSlices(page: Page, options: ExportOptions) {
  const width =
    options.preset === 'whole'
      ? page.width
      : options.preset === 'webtoon'
        ? 800
        : options.preset === 'tapas'
          ? 940
          : options.width;
  const totalHeight = Math.round((page.height * width) / page.width);
  const slice =
    options.preset === 'whole' ? totalHeight : options.preset === 'webtoon' ? 1280 : options.sliceHeight;
  const slices: { width: number; height: number; offset: number }[] = [];
  for (let offset = 0; offset < totalHeight; offset += slice)
    slices.push({ width, height: Math.min(slice, totalHeight - offset), offset });
  return slices;
}
export async function exportProject(
  p: Project,
  options: ExportOptions,
  signal: AbortSignal,
  progress: (done: number, total: number) => void,
) {
  const jobs = p.pages
    .filter((pg) => options.pages.includes(pg.id))
    .flatMap((pg) => exportSlices(pg, options).map((slice, i) => ({ pg, slice, i })));
  if (!jobs.length) throw new Error('Selecione pelo menos uma página.');
  const ext = options.mime === 'image/jpeg' ? 'jpg' : options.mime === 'image/webp' ? 'webp' : 'png';
  const files: Record<string, Uint8Array> = {};
  let single: Blob | undefined;
  progress(0, jobs.length);
  for (let index = 0; index < jobs.length; index++) {
    const { pg, slice, i } = jobs[index];
    const blob = await renderPage(p, pg, {
      ...slice,
      original: true,
      mime: options.mime,
      quality: options.quality,
      signal,
    });
    if (signal.aborted) throw new DOMException('Cancelado', 'AbortError');
    const name = `pagina-${String(p.pages.indexOf(pg) + 1).padStart(2, '0')}${options.preset === 'whole' ? '' : `-${String(i + 1).padStart(3, '0')}`}.${ext}`;
    if (jobs.length === 1) single = blob;
    else files[name] = new Uint8Array(await blob.arrayBuffer());
    progress(index + 1, jobs.length);
    await new Promise((r) => setTimeout(r, 0));
  }
  return {
    blob: single || new Blob([new Uint8Array(await zipFiles(files, signal))], { type: 'application/zip' }),
    extension: single ? ext : 'zip',
  };
}
