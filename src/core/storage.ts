import Dexie, { type EntityTable } from 'dexie';
import { unzip, zip, strToU8, strFromU8 } from 'fflate';
import { type Asset, type Project, uid, validateProject, LIMITS } from './model';
import { inspectImage } from './image-format';

export type ProjectRecord = { id: string; document: Project; thumbnail?: Blob; bytes?: number };
export type AssetRecord = { key: string; projectId: string; assetId: string; original: Blob; preview: Blob };
export const db = new Dexie('cartoon-loop-v1') as Dexie & {
  projects: EntityTable<ProjectRecord, 'id'>;
  assets: EntityTable<AssetRecord, 'key'>;
};
db.version(1).stores({ projects: 'id,document.updatedAt', assets: 'key,projectId,assetId' });
const pending = new Map<string, { original: Blob; preview: Blob }>();
const leaseOwners = new Map<string, () => boolean>();
export const stageAsset = (id: string, original: Blob, preview: Blob) =>
  pending.set(id, { original, preview });
export const clearPending = () => pending.clear();

export async function imageBlob(projectId: string, assetId: string, original = false) {
  const row = pending.get(assetId) || (await db.assets.get(`${projectId}:${assetId}`));
  if (!row) throw new Error('Imagem não encontrada. Reimporte o arquivo de projeto.');
  return original ? row.original : row.preview;
}
export async function saveProject(document: Project, thumbnail?: Blob) {
  if (leaseOwners.has(document.id) && !leaseOwners.get(document.id)!())
    throw new Error('Esta aba perdeu o bloqueio de edição. Baixe seu projeto antes de recarregar.');
  validateProject(document);
  await db.transaction('rw', db.projects, db.assets, async () => {
    let bytes = new TextEncoder().encode(JSON.stringify(document)).byteLength;
    for (const asset of document.assets) {
      const blobs = pending.get(asset.id),
        key = `${document.id}:${asset.id}`;
      if (blobs) await db.assets.put({ key, projectId: document.id, assetId: asset.id, ...blobs });
      else if (!(await db.assets.get(key)))
        throw new Error('Uma imagem ainda não foi gravada. Baixe um backup do projeto.');
      const stored = blobs || (await db.assets.get(key));
      if (stored) bytes += stored.original.size + stored.preview.size;
    }
    const old = await db.projects.get(document.id);
    await db.projects.put({
      id: document.id,
      document,
      thumbnail: thumbnail || old?.thumbnail,
      bytes: bytes + ((thumbnail || old?.thumbnail)?.size || 0),
    });
  });
  for (const asset of document.assets) pending.delete(asset.id);
}
export async function deleteProject(id: string) {
  await db.transaction('rw', db.projects, db.assets, async () => {
    await db.assets.where('projectId').equals(id).delete();
    await db.projects.delete(id);
  });
}
export async function duplicateProject(record: ProjectRecord) {
  const p = structuredClone(record.document),
    oldId = p.id;
  p.id = uid();
  p.name = `${p.name} — cópia`;
  p.createdAt = p.updatedAt = Date.now();
  await db.transaction('rw', db.projects, db.assets, async () => {
    const rows = await db.assets.where('projectId').equals(oldId).toArray();
    await db.assets.bulkPut(rows.map((r) => ({ ...r, key: `${p.id}:${r.assetId}`, projectId: p.id })));
    await db.projects.put({ id: p.id, document: p, thumbnail: record.thumbnail, bytes: record.bytes });
  });
  return p;
}

async function makePreview(file: Blob): Promise<{ width: number; height: number; preview: Blob }> {
  if (typeof Worker !== 'undefined' && typeof OffscreenCanvas !== 'undefined') {
    try {
      return await new Promise((resolve, reject) => {
        const worker = new Worker(new URL('./image.worker.ts', import.meta.url), { type: 'module' });
        const timer = setTimeout(() => {
          worker.terminate();
          reject(new Error('Tempo de processamento excedido.'));
        }, 30000);
        worker.onmessage = (e) => {
          clearTimeout(timer);
          worker.terminate();
          e.data.error ? reject(new Error(e.data.error)) : resolve(e.data);
        };
        worker.onerror = () => {
          clearTimeout(timer);
          worker.terminate();
          reject(new Error('Worker indisponível'));
        };
        worker.postMessage(file);
      });
    } catch {
      /* Use the browser decoder when workers or OffscreenCanvas are unavailable. */
    }
  }
  const img = await decodeImage(file);
  const width = img.naturalWidth,
    height = img.naturalHeight,
    ratio = Math.min(1, 1400 / Math.max(width, height));
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(width * ratio));
  c.height = Math.max(1, Math.round(height * ratio));
  c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height);
  const preview = await canvasBlob(c, 'image/webp', 0.82);
  c.width = c.height = 1;
  return { width, height, preview };
}
export async function prepareAsset(file: File, project: Project) {
  const header = await inspectImage(file);
  const hash = await hashBlob(file),
    existing = project.assets.find((a) => a.hash === hash);
  if (existing) return existing;
  if (project.assets.reduce((n, a) => n + a.bytes, 0) + file.size > LIMITS.assetBytes)
    throw new Error('O projeto excederia 250 MiB de imagens.');
  const { width, height, preview } = await makePreview(file);
  const asset: Asset = {
    id: uid(),
    name: file.name,
    mime: header.mime,
    width,
    height,
    bytes: file.size,
    hash,
  };
  stageAsset(asset.id, file, preview);
  return asset;
}
export async function hashBlob(blob: Blob) {
  return [...new Uint8Array(await crypto.subtle.digest('SHA-256', await blob.arrayBuffer()))]
    .map((v) => v.toString(16).padStart(2, '0'))
    .join('');
}
export async function decodeImage(blob: Blob): Promise<HTMLImageElement> {
  const url = URL.createObjectURL(blob),
    image = new Image();
  try {
    image.src = url;
    await image.decode();
    return image;
  } finally {
    URL.revokeObjectURL(url);
  }
}
export function canvasBlob(canvas: HTMLCanvasElement, type = 'image/png', quality = 0.9): Promise<Blob> {
  return new Promise((resolve, reject) =>
    canvas.toBlob(
      (blob) =>
        blob
          ? resolve(blob)
          : reject(new Error('O navegador não conseguiu gerar esta imagem. Exporte em fatias menores.')),
      type,
      quality,
    ),
  );
}
export function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob),
    anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = name;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}
export function zipFiles(files: Record<string, Uint8Array>, signal?: AbortSignal): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(new DOMException('Cancelado', 'AbortError'));
    const cancel = () => {
      terminate();
      reject(new DOMException('Cancelado', 'AbortError'));
    };
    const terminate = zip(files, { level: 0 }, (err, data) => {
      signal?.removeEventListener('abort', cancel);
      err ? reject(err) : resolve(data);
    });
    signal?.addEventListener('abort', cancel, { once: true });
  });
}
export async function projectArchive(p: Project): Promise<Blob> {
  const files: Record<string, Uint8Array> = { 'manifest.json': strToU8(JSON.stringify(p)) };
  for (const asset of p.assets)
    files[`assets/${asset.id}`] = new Uint8Array(await (await imageBlob(p.id, asset.id, true)).arrayBuffer());
  return new Blob([new Uint8Array(await zipFiles(files))], { type: 'application/zip' });
}
export async function importProject(file: File) {
  if (file.size > LIMITS.assetBytes + 8 * 1024 ** 2) throw new Error('O arquivo de projeto é grande demais.');
  const bytes = new Uint8Array(await file.arrayBuffer());
  let expanded = 0,
    invalid = false,
    count = 0;
  const files = await new Promise<Record<string, Uint8Array>>((resolve, reject) =>
    unzip(
      bytes,
      {
        filter(info) {
          expanded += info.originalSize;
          count++;
          if (
            expanded > LIMITS.assetBytes + 8 * 1024 ** 2 ||
            count > LIMITS.nodes + 1 ||
            (info.name === 'manifest.json' && info.originalSize > 8 * 1024 ** 2) ||
            (!/^assets\/[\w-]+$/.test(info.name) && info.name !== 'manifest.json')
          ) {
            invalid = true;
            return false;
          }
          return true;
        },
      },
      (e, data) => (e ? reject(new Error('Arquivo de projeto inválido ou incompleto.')) : resolve(data)),
    ),
  );
  if (invalid || !files['manifest.json']) throw new Error('Estrutura ou tamanho de arquivo inválido.');
  const p = validateProject(JSON.parse(strFromU8(files['manifest.json'])));
  p.id = uid();
  p.createdAt = p.updatedAt = Date.now();
  const rows: AssetRecord[] = [];
  for (const asset of p.assets) {
    const bytes = files[`assets/${asset.id}`];
    if (!bytes || bytes.byteLength !== asset.bytes) throw new Error('Uma imagem está ausente ou incompleta.');
    const original = new Blob([new Uint8Array(bytes)], { type: asset.mime });
    const header = await inspectImage(original);
    if (header.mime !== asset.mime || (await hashBlob(original)) !== asset.hash)
      throw new Error('A integridade de uma imagem não pôde ser confirmada.');
    const preview = await makePreview(original);
    if (preview.width !== asset.width || preview.height !== asset.height)
      throw new Error('Dimensões de imagem inválidas no projeto.');
    rows.push({
      key: `${p.id}:${asset.id}`,
      projectId: p.id,
      assetId: asset.id,
      original,
      preview: preview.preview,
    });
  }
  await db.transaction('rw', db.projects, db.assets, async () => {
    await db.assets.bulkPut(rows);
    await db.projects.put({ id: p.id, document: p });
  });
  return p;
}

/** Exclusive writer held for the whole editor session, released on teardown. */
export async function acquireProjectLock(id: string): Promise<{ writable: boolean; release: () => void }> {
  if (navigator.locks)
    return new Promise((resolve) => {
      void navigator.locks.request(`cartoon-loop:${id}`, { ifAvailable: true }, async (lock) => {
        if (!lock) {
          resolve({ writable: false, release: () => {} });
          return;
        }
        await new Promise<void>((done) => {
          const release = () => {
            window.removeEventListener('pagehide', release);
            done();
          };
          window.addEventListener('pagehide', release, { once: true });
          resolve({ writable: true, release });
        });
      });
    });
  // Lease fallback for browsers without Web Locks; verify ownership before each save.
  const key = `cartoon-loop-lock:${id}`,
    token = uid();
  const read = () => {
    try {
      return JSON.parse(localStorage.getItem(key) || 'null');
    } catch {
      return null;
    }
  };
  const current = read();
  if (current && Date.now() - current.time < 8000) return { writable: false, release: () => {} };
  localStorage.setItem(key, JSON.stringify({ token, time: Date.now() }));
  await new Promise((r) => setTimeout(r, 80));
  if (read()?.token !== token) return { writable: false, release: () => {} };
  const timer = setInterval(() => {
    if (read()?.token === token) localStorage.setItem(key, JSON.stringify({ token, time: Date.now() }));
  }, 2000);
  leaseOwners.set(id, () => read()?.token === token);
  return {
    writable: true,
    release: () => {
      clearInterval(timer);
      leaseOwners.delete(id);
      if (read()?.token === token) localStorage.removeItem(key);
    },
  };
}
