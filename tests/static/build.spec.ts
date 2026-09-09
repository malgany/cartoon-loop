import { test, expect } from '@playwright/test';
test('build estático em subdiretório, hash direto, imagens, fonte e worker', async ({ page }) => {
  const failures: string[] = [];
  page.on('pageerror', (e) => failures.push(e.message));
  page.on('response', (r) => {
    if (r.status() >= 400) failures.push(`${r.status()} ${r.url()}`);
  });
  await page.goto('./');
  await page.getByRole('button', { name: /Uma nova história/ }).click();
  await page.getByRole('textbox', { name: 'Nome do projeto' }).fill('Build publicado');
  await page.getByRole('button', { name: 'Criar projeto', exact: true }).click();
  await page.getByRole('button', { name: 'Horizontal 16:9' }).click();
  const img = await page.evaluate(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 200;
    canvas.height = 100;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#444';
    ctx.fillRect(0, 0, 200, 100);
    return canvas.toDataURL().split(',')[1];
  });
  await page
    .getByLabel('Selecionar imagens', { exact: true })
    .setInputFiles({ name: 'estatico.png', mimeType: 'image/png', buffer: Buffer.from(img, 'base64') });
  await expect(page.getByRole('textbox', { name: 'Nome do objeto' })).toHaveValue('estatico.png');
  await page.getByRole('button', { name: 'Salvar (Ctrl+S)' }).click();
  await expect(page.locator('.save-status')).toHaveText('Salvo neste navegador');
  const url = page.url();
  expect(url).toContain('/cartoon-loop/#/project/');
  await page.reload();
  await expect(page.getByTestId('editor-canvas')).toBeVisible();
  await expect(page.locator('.save-status')).toHaveText('Salvo neste navegador');
  await page.getByRole('button', { name: 'Imagens', exact: true }).click();
  await expect(page.locator('.asset-thumb img')).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
  expect(await page.evaluate(() => document.fonts.check('400 28px "Comic Neue"'))).toBe(true);
  expect(failures).toEqual([]);
});
