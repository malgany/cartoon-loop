import { afterEach, describe, expect, it } from 'vitest';
import { newProject, newPanel, newText, uid, type Asset } from '../src/core/model';
import {
  db,
  saveProject,
  duplicateProject,
  deleteProject,
  stageAsset,
  imageBlob,
  hashBlob,
  acquireProjectLock,
} from '../src/core/storage';
import { inspectImage } from '../src/core/image-format';

afterEach(async () => {
  await db.projects.clear();
  await db.assets.clear();
});
describe('Persistência transacional', () => {
  it('reabre documento com blobs, transformações e objetos soltos intactos', async () => {
    const p = newProject('Acentuação — ação');
    const a = newPanel(p.pages[0]),
      b = newText('thought');
    b.text = 'Olá!\nEstá tudo bem?';
    b.rotation = 405;
    b.flipX = true;
    p.nodes = [a, b];
    const blob = new Blob(['teste'], { type: 'image/png' });
    const asset: Asset = {
      id: uid(),
      name: 'teste.png',
      mime: 'image/png',
      width: 1,
      height: 1,
      bytes: blob.size,
      hash: await hashBlob(blob),
    };
    stageAsset(asset.id, blob, blob);
    p.assets = [asset];
    await saveProject(p);
    const row = await db.projects.get(p.id);
    expect(row?.document).toEqual(p);
    expect(await (await imageBlob(p.id, asset.id, true)).text()).toBe('teste');
  });
  it('cópia é independente e excluir não remove imagens de outro projeto', async () => {
    const p = newProject('Original');
    await saveProject(p);
    const copy = await duplicateProject((await db.projects.get(p.id))!);
    expect(copy.id).not.toBe(p.id);
    await deleteProject(copy.id);
    expect(await db.projects.count()).toBe(1);
    expect(await db.projects.get(p.id)).toBeDefined();
  });
  it('falha na gravação não sobrescreve o documento anterior', async () => {
    const p = newProject('Antes');
    await saveProject(p);
    const draft = structuredClone(p);
    draft.name = 'Depois';
    draft.assets = [
      { id: uid(), name: 'ausente', mime: 'image/png', width: 1, height: 1, bytes: 10, hash: 'hash' },
    ];
    await expect(saveProject(draft)).rejects.toThrow(/imagem/);
    expect((await db.projects.get(p.id))?.document.name).toBe('Antes');
  });
  it('segunda aba recebe somente leitura', async () => {
    const id = uid(),
      first = await acquireProjectLock(id),
      second = await acquireProjectLock(id);
    expect(first.writable).toBe(true);
    expect(second.writable).toBe(false);
    first.release();
    const third = await acquireProjectLock(id);
    expect(third.writable).toBe(true);
    third.release();
  });
});
describe('Cabeçalhos de imagem e limites antes da decodificação', () => {
  const png = (w: number, h: number) => {
    const bytes = new Uint8Array(33);
    bytes.set([137, 80, 78, 71, 13, 10, 26, 10]);
    const d = new DataView(bytes.buffer);
    d.setUint32(8, 13);
    bytes.set([73, 72, 68, 82], 12);
    d.setUint32(16, w);
    d.setUint32(20, h);
    return bytes;
  };
  it('aceita dimensões PNG válidas', async () => {
    expect(await inspectImage(new Blob([png(800, 1280)]))).toMatchObject({
      width: 800,
      height: 1280,
      mime: 'image/png',
    });
  });
  it('rejeita arquivos desconhecidos e acima de 32 MP', async () => {
    await expect(inspectImage(new Blob(['não é uma imagem']))).rejects.toThrow();
    await expect(inspectImage(new Blob([png(8000, 8000)]))).rejects.toThrow(/32/);
  });
  it('rejeita 20 MiB antes de ler os bytes', async () => {
    const file = {
      size: 21 * 1024 ** 2,
      arrayBuffer: () => {
        throw new Error('Não deve ler');
      },
    } as unknown as Blob;
    await expect(inspectImage(file)).rejects.toThrow(/20/);
  });
});
