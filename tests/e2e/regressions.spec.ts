import { test, expect, type Page } from '@playwright/test';

async function create(page: Page) {
  await page.goto('/');
  await page.getByRole('button', { name: /Uma nova história/ }).click();
  await page.getByRole('button', { name: 'Criar projeto', exact: true }).click();
  await expect(page.getByTestId('editor-canvas')).toBeVisible();
}
async function state(page: Page) {
  return page.evaluate(async () => {
    const path = '/src/core/store.ts';
    const { useEditor } = await import(
      performance.getEntriesByType('resource').find((e) => new URL(e.name).pathname === path)?.name || path
    );
    const s = useEditor.getState();
    return { p: s.project, selection: s.selection, view: s.view, past: s.past.length };
  });
}
async function frame(page: Page) {
  await page.getByRole('button', { name: 'Horizontal 16:9', exact: true }).click();
  await page.getByRole('button', { name: '½', exact: true }).click();
}

test('alça redimensiona a arte antes de soltar e registra um único desfazer', async ({ page }) => {
  await create(page);
  await frame(page);
  await page.getByRole('button', { name: 'Quadro à direita', exact: true }).click();
  const s = await state(page),
    n = s.p.nodes[0];
  const box = (await page.getByTestId('editor-canvas').boundingBox())!;
  const x = box.x + s.view.x + (n.x + n.width) * s.view.zoom;
  const y = box.y + s.view.y + (n.y + n.height) * s.view.zoom;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x - 65, y - 45, { steps: 12 });
  await expect(page.getByTestId('resize-preview')).toBeVisible();
  const rendered = await page.evaluate((id) => {
    const node = (window as any).Konva.stages[0].findOne('#' + id);
    return { width: node.width(), height: node.height() };
  }, n.id);
  expect(rendered.width).toBeLessThan(n.width - 50);
  expect(rendered.height).toBeLessThan(n.height - 40);
  expect((await state(page)).past).toBe(s.past);
  expect((await state(page)).p.nodes[0].width).toBe(n.width);
  await page.mouse.up();
  await expect(page.getByTestId('resize-preview')).toBeHidden();
  const after = await state(page);
  expect(after.p.nodes[0].width).toBeCloseTo(rendered.width);
  expect(after.past).toBe(s.past + 1);
  await page.getByRole('button', { name: 'Desfazer (Ctrl+Z)' }).click();
  expect((await state(page)).p.nodes[0]).toEqual(n);
});

test('quadro arrasta livre, alinha ao centro e permite sangria pela borda', async ({ page }) => {
  await create(page);
  await frame(page);
  let s = await state(page),
    n = s.p.nodes[0];
  const box = (await page.getByTestId('editor-canvas').boundingBox())!;
  const screen = (x: number, y: number) => ({
    x: box.x + s.view.x + x * s.view.zoom,
    y: box.y + s.view.y + y * s.view.zoom,
  });
  let from = screen(n.x + n.width / 2, n.y + n.height / 2),
    to = screen(402, 350);
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps: 15 });
  await page.mouse.up();
  s = await state(page);
  n = s.p.nodes[0];
  expect(n.mode).toBe('free');
  expect(n.x + n.width / 2).toBeCloseTo(400);
  expect(n.y).toBeGreaterThan(100);
  from = screen(n.x + n.width / 2, n.y + n.height / 2);
  to = screen(60, 350);
  await page.keyboard.down('Alt');
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps: 15 });
  await page.mouse.up();
  await page.keyboard.up('Alt');
  expect((await state(page)).p.nodes[0].x).toBeLessThan(0);
});

test('clicar novamente na imagem seleciona seu quadro atrás dela', async ({ page }) => {
  await create(page);
  await frame(page);
  const file = await page.evaluate(() => {
    const c = document.createElement('canvas');
    c.width = c.height = 200;
    const ctx = c.getContext('2d')!;
    ctx.fillStyle = '#888888';
    ctx.fillRect(0, 0, 200, 200);
    return c.toDataURL().split(',')[1];
  });
  await page
    .getByLabel('Selecionar imagens', { exact: true })
    .setInputFiles({ name: 'teste.png', mimeType: 'image/png', buffer: Buffer.from(file, 'base64') });
  await expect.poll(async () => (await state(page)).p.nodes.length).toBe(2);
  const s = await state(page),
    panel = s.p.nodes[0],
    image = s.p.nodes[1];
  const box = (await page.getByTestId('editor-canvas').boundingBox())!;
  const x = box.x + s.view.x + (panel.x + image.x + image.width / 2) * s.view.zoom;
  const y = box.y + s.view.y + (panel.y + image.y + image.height / 2) * s.view.zoom;
  await page.mouse.click(x, y);
  expect((await state(page)).selection).toEqual([panel.id]);
  await page.mouse.click(x, y);
  expect((await state(page)).selection).toEqual([image.id]);
  await page.mouse.click(x, y);
  expect((await state(page)).selection).toEqual([panel.id]);
});

test('balões são camadas da página; arraste de camadas muda tela e exportação', async ({ page }) => {
  await create(page);
  await frame(page);
  await page.getByRole('button', { name: 'Balões', exact: true }).click();
  await page.getByRole('button', { name: 'Narração', exact: true }).click();
  await page.evaluate(async () => {
    const path = '/src/core/store.ts';
    const { useEditor } = await import(
      performance.getEntriesByType('resource').find((e) => new URL(e.name).pathname === path)?.name || path
    );
    useEditor.getState().run('Preparar cores', (p: any) => {
      Object.assign(p.nodes[0], { fill: '#222222' });
      Object.assign(p.nodes[1], { x: 70, y: 70, fill: '#ffffff', text: '', width: 160, height: 100 });
    });
  });
  const s = await state(page),
    [panel, balloon] = s.p.nodes;
  expect(balloon).toMatchObject({ panelId: null, pageId: s.p.pages[0].id });
  await expect(page.getByRole('combobox', { name: 'Pertence ao quadro' })).toHaveCount(0);
  const exportedPixel = () =>
    page.evaluate(async () => {
      const load = (path: string) =>
        import(
          performance.getEntriesByType('resource').find((e) => new URL(e.name).pathname === path)?.name ||
            path
        );
      const { useEditor } = await load('/src/core/store.ts'),
        { renderPage } = await load('/src/core/render.ts');
      const p = useEditor.getState().project,
        blob = await renderPage(p, p.pages[0], { height: 250 });
      const image = await createImageBitmap(blob),
        canvas = document.createElement('canvas');
      canvas.width = 800;
      canvas.height = 250;
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(image, 0, 0);
      image.close();
      return [...ctx.getImageData(100, 100, 1, 1).data];
    });
  expect(await exportedPixel()).toEqual([255, 255, 255, 255]);
  await page.getByRole('button', { name: 'Páginas e camadas', exact: true }).click();
  const source = page.locator(`[data-layer-id="${balloon.id}"]`),
    target = page.locator(`[data-layer-id="${panel.id}"]`);
  const tb = (await target.boundingBox())!;
  await source.dragTo(target, { targetPosition: { x: tb.width / 2, y: tb.height - 2 } });
  expect((await state(page)).p.nodes.map((n: any) => n.id)).toEqual([balloon.id, panel.id]);
  expect(await exportedPixel()).toEqual([34, 34, 34, 255]);
  const canvasPixel = await page.evaluate(
    ({ x, y }) => {
      const stage = (window as any).Konva.stages[0];
      return [...stage.getLayers()[0].getCanvas().getContext()._context.getImageData(x, y, 1, 1).data];
    },
    { x: Math.round(s.view.x + 100 * s.view.zoom), y: Math.round(s.view.y + 100 * s.view.zoom) },
  );
  expect(canvasPixel).toEqual([34, 34, 34, 255]);
  await page.getByRole('button', { name: 'Desfazer (Ctrl+Z)' }).click();
  expect(await exportedPixel()).toEqual([255, 255, 255, 255]);
});
