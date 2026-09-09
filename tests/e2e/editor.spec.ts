import { expect, test, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { unzipSync, strFromU8, zipSync, strToU8 } from 'fflate';

// Vite app imports can carry an HMR timestamp; reuse the same module URL, not a second store instance.
const resolveModule = (path: string) =>
  performance.getEntriesByType('resource').find((entry) => new URL(entry.name).pathname === path)?.name ||
  path;

async function create(page: Page, name = 'Teste de webtoon') {
  await page.goto('/');
  await page.getByRole('button', { name: /Uma nova história/ }).click();
  await page.getByRole('textbox', { name: 'Nome do projeto' }).fill(name);
  await page.getByRole('button', { name: 'Criar projeto', exact: true }).click();
  await expect(page.getByTestId('editor-canvas')).toBeVisible();
}
async function state(page: Page) {
  return page.evaluate(async () => {
    const path = '/src/core/store.ts';
    const { useEditor } = await import(
      performance.getEntriesByType('resource').find((entry) => new URL(entry.name).pathname === path)?.name ||
        path
    );
    const s = useEditor.getState();
    return {
      project: s.project,
      selection: s.selection,
      view: s.view,
      revision: s.revision,
      past: s.past.length,
    };
  });
}
async function save(page: Page) {
  await page.getByRole('button', { name: 'Salvar (Ctrl+S)', exact: true }).click();
  await expect(page.locator('.save-status')).toHaveText('Salvo neste navegador');
}
async function fixtureImage(page: Page) {
  const b64 = await page.evaluate(() => {
    const c = document.createElement('canvas');
    c.width = 160;
    c.height = 120;
    const x = c.getContext('2d')!;
    x.fillStyle = '#222222';
    x.fillRect(0, 0, 80, 120);
    x.fillStyle = '#aaaaaa';
    x.fillRect(80, 0, 80, 120);
    x.fillStyle = '#ffffff';
    x.fillRect(18, 20, 25, 30);
    return c.toDataURL('image/png').split(',')[1];
  });
  return { name: 'teste-transparente.png', mimeType: 'image/png', buffer: Buffer.from(b64, 'base64') };
}
async function setField(page: Page, label: string, value: string) {
  const field = page.getByRole('spinbutton', { name: label, exact: true });
  await field.fill(value);
  await field.press('Enter');
}

test('fluxo de interface: quadros, lettering, histórico, tema, backup e reabertura', async ({
  page,
}, info) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await create(page, 'Capítulo de teste');
  await page.getByRole('button', { name: 'Horizontal 16:9', exact: true }).click();
  await page.getByRole('button', { name: '½', exact: true }).click();
  await page.getByRole('button', { name: 'Horizontal 16:9', exact: true }).click();
  await page.getByRole('button', { name: '½', exact: true }).click();
  let s = await state(page);
  expect(s.project.nodes[0].y).toBe(s.project.nodes[1].y);
  expect(s.project.nodes[1].x).toBe(408);
  await page.getByRole('button', { name: 'Balões', exact: true }).click();
  await page.getByRole('button', { name: 'Pensamento', exact: true }).click();
  const text = page.getByRole('textbox', { name: 'Conteúdo do texto' });
  await text.fill('É só o começo…\nPróxima estação: imaginação.');
  await text.press('Tab');
  await setField(page, 'Rotação', '405');
  await page.getByRole('button', { name: 'Inverter horizontalmente', exact: true }).click();
  await save(page);
  await page.screenshot({ path: info.outputPath('editor-claro.png') });
  await page.getByRole('button', { name: 'Ativar tema escuro' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.screenshot({ path: info.outputPath('editor-escuro.png') });
  const before = (await state(page)).project;
  await page.reload();
  await expect(page.locator('.save-status')).toHaveText('Salvo neste navegador');
  expect((await state(page)).project).toEqual(before);
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Baixar projeto', exact: true }).click();
  const file = await download;
  const zip = unzipSync(await readFile((await file.path())!));
  expect(JSON.parse(strFromU8(zip['manifest.json']))).toEqual(before);
  await page.getByRole('button', { name: 'Recolher biblioteca' }).click();
  await page.getByRole('button', { name: 'Recolher propriedades' }).click();
  await expect(page.locator('.library')).toHaveClass(/collapsed/);
  await expect(page.locator('.inspector')).toHaveClass(/collapsed/);
  expect(errors).toEqual([]);
});

test('imagem entra em quadro sem borda, transfere por arraste e preserva inversões', async ({ page }) => {
  await create(page);
  await page.getByRole('button', { name: /Quadro sem borda A moldura/ }).click();
  expect((await state(page)).project.nodes[0]).toMatchObject({ strokeWidth: 0, fill: 'transparent' });
  await page.getByRole('button', { name: '½', exact: true }).click();
  await setField(page, 'Altura do objeto', '320');
  await page.getByRole('button', { name: 'Horizontal 16:9' }).click();
  await page.getByRole('button', { name: '½', exact: true }).click();
  await setField(page, 'Altura do objeto', '320');
  await page.evaluate(async () => {
    const path = '/src/core/store.ts';
    const { useEditor } = await import(
      performance.getEntriesByType('resource').find((entry) => new URL(entry.name).pathname === path)?.name ||
        path
    );
    useEditor.getState().select([useEditor.getState().project.nodes[0].id]);
  });
  await page.getByLabel('Selecionar imagens', { exact: true }).setInputFiles(await fixtureImage(page));
  await expect
    .poll(async () => (await state(page)).project.nodes.filter((n: any) => n.type === 'image').length)
    .toBe(1);
  await page.getByRole('button', { name: 'Inverter horizontalmente' }).click();
  await setField(page, 'Rotação', '360');
  let s = await state(page),
    first = s.project.nodes[0],
    second = s.project.nodes[1],
    img = s.project.nodes.find((n: any) => n.type === 'image');
  expect(img.panelId).toBe(first.id);
  const bounds = (await page.getByTestId('editor-canvas').boundingBox())!;
  const from = {
    x: bounds.x + s.view.x + (first.x + img.x + img.width / 2) * s.view.zoom,
    y: bounds.y + s.view.y + (first.y + img.y + img.height / 2) * s.view.zoom,
  };
  const to = {
    x: bounds.x + s.view.x + (second.x + second.width / 2) * s.view.zoom,
    y: bounds.y + s.view.y + (second.y + second.height / 2) * s.view.zoom,
  };
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps: 20 });
  await page.mouse.up();
  s = await state(page);
  img = s.project.nodes.find((n: any) => n.type === 'image');
  expect(img.panelId).toBe(second.id);
  expect(img.flipX).toBe(true);
  expect(img.rotation).toBe(360);
  expect(img.width).toBe(160);
  await page.getByRole('button', { name: 'Desfazer (Ctrl+Z)', exact: true }).click();
  expect((await state(page)).project.nodes.find((n: any) => n.type === 'image').panelId).toBe(first.id);
  await page.getByRole('button', { name: 'Imagens', exact: true }).click();
  await expect(page.locator('.asset-thumb img')).toBeVisible();
  expect(
    await page.locator('.asset-thumb img').evaluate((img: HTMLImageElement) => img.naturalWidth),
  ).toBeGreaterThan(0);
  await save(page);
  const before = (await state(page)).project;
  await page.reload();
  await expect(page.getByTestId('editor-canvas')).toBeVisible();
  expect((await state(page)).project).toEqual(before);
});

test('inserção no meio da página e zoom não mudam a composição', async ({ page }) => {
  await create(page);
  await page.getByRole('button', { name: 'Horizontal 16:9' }).click();
  await page.evaluate(async () => {
    const path = '/src/core/store.ts';
    const { useEditor } = await import(
      performance.getEntriesByType('resource').find((entry) => new URL(entry.name).pathname === path)?.name ||
        path
    );
    useEditor.getState().setView({ zoom: 0.5, x: 48, y: -2700 });
  });
  await page.getByLabel('Selecionar imagens', { exact: true }).setInputFiles(await fixtureImage(page));
  await expect.poll(async () => (await state(page)).project.nodes.length).toBe(2);
  let s = await state(page);
  expect(s.project.nodes[1].panelId).toBeNull();
  expect(s.project.nodes[1].y).toBeGreaterThan(5400);
  const before = s.project;
  const b = (await page.getByTestId('editor-canvas').boundingBox())!;
  await page.mouse.move(b.x + 200, b.y + 200);
  await page.keyboard.down('Control');
  await page.mouse.wheel(0, -80);
  await page.keyboard.up('Control');
  s = await state(page);
  expect(s.view.zoom).toBeGreaterThan(0.5);
  expect(s.project).toEqual(before);
});

test('arquivo portátil com imagens importa em armazenamento vazio; inválido é atômico', async ({
  page,
  browser,
}) => {
  await create(page, 'Portátil');
  await page.getByRole('button', { name: 'Horizontal 16:9' }).click();
  await page.getByLabel('Selecionar imagens', { exact: true }).setInputFiles(await fixtureImage(page));
  await expect.poll(async () => (await state(page)).project.assets.length).toBe(1);
  await save(page);
  const before = (await state(page)).project;
  const pending = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Baixar projeto', exact: true }).click();
  const data = await readFile((await (await pending).path())!);
  const ctx = await browser.newContext();
  const other = await ctx.newPage();
  await other.goto('/');
  await other
    .getByLabel('Importar arquivo de projeto', { exact: true })
    .setInputFiles({ name: 'teste.cartoonloop', mimeType: 'application/zip', buffer: data });
  await expect(other.getByTestId('editor-canvas')).toBeVisible();
  const after = (await state(other)).project;
  expect(after.id).not.toBe(before.id);
  expect(after.nodes).toEqual(before.nodes);
  expect(after.assets).toEqual(before.assets);
  await other.getByRole('button', { name: 'Voltar aos projetos' }).click();
  await other.getByLabel('Importar arquivo de projeto', { exact: true }).setInputFiles({
    name: 'corrompido.cartoonloop',
    mimeType: 'application/zip',
    buffer: Buffer.from('arquivo incompleto'),
  });
  await expect(other.locator('.toast.error')).toBeVisible();
  await expect(other.locator('.project-card')).toHaveCount(1);
  await ctx.close();
});

test('segunda aba abre em leitura e não habilita edição', async ({ page, context }) => {
  await create(page);
  const url = page.url(),
    second = await context.newPage();
  await second.goto(url);
  await expect(second.locator('.readonly-banner')).toContainText('outra aba');
  await expect(second.getByRole('button', { name: 'Horizontal 16:9' })).toBeDisabled();
  await second.close();
});

test('renderização respeita máscaras, transparência, vínculo e pixels das fatias', async ({ page }) => {
  await create(page);
  const result = await page.evaluate(async () => {
    const modelPath = '/src/core/model.ts',
      renderPath = '/src/core/render.ts';
    const { newProject, newPanel, newText } = await import(
        performance.getEntriesByType('resource').find((entry) => new URL(entry.name).pathname === modelPath)
          ?.name || modelPath
      ),
      { renderPage } = await import(
        performance.getEntriesByType('resource').find((entry) => new URL(entry.name).pathname === renderPath)
          ?.name || renderPath
      );
    const p = newProject('Pixels', 800, 10000),
      pg = p.pages[0];
    pg.fill = 'transparent';
    const frame = newPanel(pg);
    Object.assign(frame, {
      mode: 'free',
      x: 100,
      y: 100,
      width: 200,
      height: 200,
      fill: '#222222',
      strokeWidth: 0,
      shape: 'oval',
    });
    const loose = newText('caption');
    Object.assign(loose, { x: 600, y: 50, width: 100, height: 100, fill: '#ff0000', text: '' });
    const child = newText('caption');
    Object.assign(child, {
      panelId: frame.id,
      x: 0,
      y: 0,
      width: 200,
      height: 200,
      fill: '#ffffff',
      strokeWidth: 0,
      text: '',
      overflow: false,
    });
    p.nodes = [frame, child, loose];
    async function decode(blob: Blob) {
      const bitmap = await createImageBitmap(blob),
        c = document.createElement('canvas');
      c.width = bitmap.width;
      c.height = bitmap.height;
      const ctx = c.getContext('2d')!;
      ctx.drawImage(bitmap, 0, 0);
      bitmap.close();
      return { ctx, width: c.width, height: c.height };
    }
    const whole = await decode(await renderPage(p, pg)),
      pixel = (x: number, y: number) => Array.from(whole.ctx.getImageData(x, y, 1, 1).data);
    const pixels = {
      corner: pixel(102, 102),
      center: pixel(200, 200),
      loose: pixel(650, 100),
      outside: pixel(0, 0),
    };
    const gradient = newPanel(pg);
    Object.assign(gradient, {
      mode: 'free',
      x: 0,
      y: 900,
      width: 800,
      height: 700,
      fill: '#ffffff',
      gradient: '#000000',
      strokeWidth: 0,
    });
    p.nodes = [gradient];
    const full = await decode(await renderPage(p, pg));
    const a = await decode(await renderPage(p, pg, { offset: 0, height: 1280 })),
      b = await decode(await renderPage(p, pg, { offset: 1280, height: 1280 }));
    const row = (ctx: CanvasRenderingContext2D, y: number) => Array.from(ctx.getImageData(0, y, 800, 1).data);
    return {
      width: whole.width,
      height: whole.height,
      pixels,
      endMatches: JSON.stringify(row(full.ctx, 1279)) === JSON.stringify(row(a.ctx, 1279)),
      startMatches: JSON.stringify(row(full.ctx, 1280)) === JSON.stringify(row(b.ctx, 0)),
    };
  });
  expect(result.width).toBe(800);
  expect(result.height).toBe(10000);
  expect(result.pixels.corner[3]).toBe(0);
  expect(result.pixels.center).toEqual([255, 255, 255, 255]);
  expect(result.pixels.loose[3]).toBe(0);
  expect(result.pixels.outside[3]).toBe(0);
  expect(result.endMatches).toBe(true);
  expect(result.startMatches).toBe(true);
});

test('exporta duas páginas nas dimensões exatas, formatos reais e cancelamento', async ({ page }) => {
  await create(page);
  const result = await page.evaluate(async () => {
    const m = '/src/core/model.ts',
      r = '/src/core/render.ts',
      f = '/node_modules/.vite/deps/fflate.js';
    const { newProject, newPage } = await import(
        performance.getEntriesByType('resource').find((entry) => new URL(entry.name).pathname === m)?.name ||
          m
      ),
      { exportProject, renderPage } = await import(
        performance.getEntriesByType('resource').find((entry) => new URL(entry.name).pathname === r)?.name ||
          r
      ),
      { unzipSync } = await import(
        performance.getEntriesByType('resource').find((entry) => new URL(entry.name).pathname === f)?.name ||
          f
      );
    const p = newProject('Duas páginas');
    p.pages.push(newPage());
    const output = await exportProject(
      p,
      {
        mime: 'image/png',
        quality: 0.9,
        pages: p.pages.map((p: any) => p.id),
        preset: 'whole',
        sliceHeight: 1280,
        width: 800,
      },
      new AbortController().signal,
      () => {},
    );
    const files = unzipSync(new Uint8Array(await output.blob.arrayBuffer()));
    const dims = [];
    for (const [name, bytes] of Object.entries(files)) {
      const bitmap = await createImageBitmap(new Blob([bytes as BlobPart]));
      dims.push({ name, width: bitmap.width, height: bitmap.height });
      bitmap.close();
    }
    const formats = [];
    for (const mime of ['image/png', 'image/jpeg', 'image/webp']) {
      const blob = await renderPage(p, p.pages[0], { height: 1000, mime });
      formats.push(blob.type);
    }
    const controller = new AbortController();
    let cancelled = false;
    try {
      await exportProject(
        p,
        {
          mime: 'image/png',
          quality: 0.9,
          pages: p.pages.map((p: any) => p.id),
          preset: 'webtoon',
          sliceHeight: 1280,
          width: 800,
        },
        controller.signal,
        (done: number) => {
          if (done === 1) controller.abort();
        },
      );
    } catch (e) {
      cancelled = (e as Error).name === 'AbortError';
    }
    return { dims, formats, cancelled };
  });
  expect(result.dims).toEqual([
    { name: 'pagina-01.png', width: 800, height: 10000 },
    { name: 'pagina-02.png', width: 800, height: 10000 },
  ]);
  expect(result.formats).toEqual(['image/png', 'image/jpeg', 'image/webp']);
  expect(result.cancelled).toBe(true);
});

test('falha de quota mantém projeto aberto e oferece backup', async ({ page }) => {
  await create(page);
  await page.evaluate(async () => {
    const path = '/src/core/storage.ts';
    const { db } = await import(
      performance.getEntriesByType('resource').find((entry) => new URL(entry.name).pathname === path)?.name ||
        path
    );
    db.projects.hook('updating', () => {
      throw new DOMException('Quota de teste', 'QuotaExceededError');
    });
  });
  await page.getByRole('button', { name: 'Horizontal 16:9' }).click();
  await expect(page.locator('.save-status')).toContainText('Falha ao salvar');
  await expect(page.locator('.readonly-banner')).toContainText('baixe seu projeto');
  expect((await state(page)).project.nodes).toHaveLength(1);
  const promise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Baixar projeto', exact: true }).click();
  expect((await promise).suggestedFilename()).toMatch(/cartoonloop$/);
});

test('modal prende foco e tela pequena oferece leitura sem editor', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: /Uma nova história/ }).click();
  for (let i = 0; i < 18; i++) {
    await page.keyboard.press('Tab');
    expect(await page.evaluate(() => !!document.activeElement?.closest('[role="dialog"]'))).toBe(true);
  }
  await page.getByRole('button', { name: 'Cancelar', exact: true }).click();
  await expect(page.getByRole('button', { name: /Uma nova história/ })).toBeFocused();
  await create(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator('.editor-body')).toBeHidden();
  await page.getByRole('button', { name: 'Abrir prévia de leitura' }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(page.locator('.reader-tile img').first()).toBeVisible();
});

test('navegação com dez páginas e 600 objetos usa somente canvas de viewport', async ({ page }) => {
  await create(page);
  const metrics = await page.evaluate(async () => {
    const m = '/src/core/model.ts',
      s = '/src/core/store.ts';
    const { newPage, newPanel, newText } = await import(
        performance.getEntriesByType('resource').find((entry) => new URL(entry.name).pathname === m)?.name ||
          m
      ),
      { useEditor } = await import(
        performance.getEntriesByType('resource').find((entry) => new URL(entry.name).pathname === s)?.name ||
          s
      );
    useEditor.getState().run('Carga', (p: any) => {
      p.pages = Array.from({ length: 10 }, () => newPage());
      for (const pg of p.pages)
        for (let i = 0; i < 30; i++) {
          const a = newPanel(pg);
          Object.assign(a, { height: 120, span: 6, order: i });
          const b = newText('speech');
          Object.assign(b, { panelId: a.id, width: 160, height: 80, tailY: 90, fontSize: 12 });
          p.nodes.push(a, b);
        }
    });
    let max = 0;
    const start = performance.now();
    for (let i = 0; i < 20; i++) {
      useEditor.getState().setView({ x: 48 - (i % 10) * 940 * 0.65, y: 64 - Math.floor(i / 10) * 800 });
      await new Promise((r) => requestAnimationFrame(r));
      max = Math.max(max, document.querySelectorAll('canvas').length);
    }
    const path = '/src/core/render.ts';
    const { imageCacheBytes } = await import(
      performance.getEntriesByType('resource').find((entry) => new URL(entry.name).pathname === path)?.name ||
        path
    );
    return {
      time: performance.now() - start,
      max,
      cache: imageCacheBytes(),
      heights: [...document.querySelectorAll('.konvajs-content canvas')].map(
        (c) => (c as HTMLCanvasElement).height,
      ),
    };
  });
  expect(metrics.max).toBeLessThan(8);
  expect(metrics.heights.every((h) => h <= 2000)).toBe(true);
  expect(metrics.time).toBeLessThan(10000);
  expect(metrics.cache).toBeLessThanOrEqual(96 * 1024 ** 2);
});

test('duplo clique edita texto, ponteiro arrasta e transformação não duplica escala', async ({ page }) => {
  await create(page);
  await page.getByRole('button', { name: 'Horizontal 16:9' }).click();
  await page.getByRole('button', { name: 'Balões', exact: true }).click();
  await page.getByRole('button', { name: 'Fala', exact: true }).click();
  let s = await state(page),
    panel = s.project.nodes[0],
    balloon = s.project.nodes[1];
  const box = (await page.getByTestId('editor-canvas').boundingBox())!;
  const screen = (x: number, y: number) => ({
    x: box.x + s.view.x + x * s.view.zoom,
    y: box.y + s.view.y + y * s.view.zoom,
  });
  let center = screen(balloon.x + balloon.width / 2, balloon.y + balloon.height / 2);
  await page.mouse.dblclick(center.x, center.y);
  await expect(page.getByRole('textbox', { name: 'Editar texto no canvas' })).toBeVisible();
  await page.getByRole('textbox', { name: 'Editar texto no canvas' }).fill('Olá, ação!\nEstá funcionando.');
  await page.keyboard.press('Control+Enter');
  expect((await state(page)).project.nodes[1].text).toBe('Olá, ação!\nEstá funcionando.');
  s = await state(page);
  panel = s.project.nodes[0];
  balloon = s.project.nodes[1];
  const tail = screen(balloon.x + balloon.tailX, balloon.y + balloon.tailY);
  await page.mouse.move(tail.x, tail.y);
  await page.mouse.down();
  await page.mouse.move(tail.x + 35, tail.y + 30, { steps: 10 });
  await page.mouse.up();
  s = await state(page);
  expect(s.project.nodes[1].tailX).toBeGreaterThan(balloon.tailX + 20);
  expect(s.project.nodes[1].tailY).toBeGreaterThan(balloon.tailY + 20);
  const before = s.project.nodes[1],
    parent = s.project.nodes[0];
  const handle = screen(before.x + before.width, before.y + before.height);
  await page.mouse.move(handle.x, handle.y);
  await page.mouse.down();
  await page.mouse.move(handle.x + 40, handle.y + 20, { steps: 10 });
  await page.mouse.up();
  s = await state(page);
  const after = s.project.nodes[1];
  expect(after.width).toBeGreaterThan(before.width + 20);
  expect(after.height).toBeGreaterThan(before.height + 10);
  // The inspector and the actual painted rectangle must agree after transformer scale is baked in.
  const rendered = await page.evaluate(async (id) => {
    const Konva = (window as any).Konva;
    const node = Konva.stages.flatMap((s: any) => s.find('#' + id))[0];
    return node
      ? { width: node.width(), height: node.height(), scaleX: node.scaleX(), scaleY: node.scaleY() }
      : null;
  }, after.id);
  expect(rendered).toMatchObject({ width: after.width, height: after.height, scaleX: 1, scaleY: 1 });
  await page.getByRole('button', { name: 'Desfazer (Ctrl+Z)' }).click();
  expect((await state(page)).project.nodes[1].width).toBe(before.width);
});

test('seleção múltipla move como uma operação e espaço navega sem mover a arte', async ({ page }) => {
  await create(page);
  await page.getByRole('button', { name: 'Horizontal 16:9' }).click();
  await page.evaluate(async () => {
    const path = '/src/core/store.ts';
    const { useEditor } = await import(
      performance.getEntriesByType('resource').find((e) => new URL(e.name).pathname === path)?.name || path
    );
    const s = useEditor.getState();
    s.addText();
    s.addText();
    s.run('Preparar seleção', (p: any) => {
      Object.assign(p.nodes[1], { x: 50, y: 50, width: 160, height: 80 });
      Object.assign(p.nodes[2], { x: 350, y: 50, width: 160, height: 80 });
    });
    s.select([]);
  });
  let s = await state(page);
  const box = (await page.getByTestId('editor-canvas').boundingBox())!;
  const p = s.project.nodes[0];
  const pt = (n: any) => ({
    x: box.x + s.view.x + (p.x + n.x + n.width / 2) * s.view.zoom,
    y: box.y + s.view.y + (p.y + n.y + n.height / 2) * s.view.zoom,
  });
  const a = pt(s.project.nodes[1]),
    b = pt(s.project.nodes[2]);
  await page.mouse.click(a.x, a.y);
  await page.keyboard.down('Shift');
  await page.mouse.click(b.x, b.y);
  await page.keyboard.up('Shift');
  expect((await state(page)).selection).toHaveLength(2);
  const old = s.project.nodes[1],
    old2 = s.project.nodes[2],
    history = (await state(page)).past;
  await page.keyboard.down('Alt');
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move(a.x + 25, a.y + 30, { steps: 10 });
  await page.mouse.up();
  await page.keyboard.up('Alt');
  s = await state(page);
  expect(s.project.nodes[1].x - old.x).toBeCloseTo(s.project.nodes[2].x - old2.x);
  expect(s.project.nodes[1].x).toBeGreaterThan(old.x);
  expect(s.past).toBe(history + 1);
  const before = s.project,
    view = s.view;
  const point = pt(s.project.nodes[1]);
  await page.keyboard.down('Space');
  await page.mouse.move(point.x, point.y);
  await page.mouse.down();
  await page.mouse.move(point.x + 80, point.y + 60, { steps: 10 });
  await page.mouse.up();
  await page.keyboard.up('Space');
  s = await state(page);
  expect(s.project).toEqual(before);
  expect(s.view.x).toBeGreaterThan(view.x + 50);
});
