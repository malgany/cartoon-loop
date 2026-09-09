self.onmessage = async (event: MessageEvent<Blob>) => {
  let bitmap: ImageBitmap | undefined;
  try {
    bitmap = await createImageBitmap(event.data, { imageOrientation: 'from-image' });
    const width = bitmap.width,
      height = bitmap.height,
      ratio = Math.min(1, 1400 / Math.max(width, height));
    const canvas = new OffscreenCanvas(
      Math.max(1, Math.round(width * ratio)),
      Math.max(1, Math.round(height * ratio)),
    );
    const context = canvas.getContext('2d')!;
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const preview = await canvas.convertToBlob({ type: 'image/webp', quality: 0.82 });
    self.postMessage({ width, height, preview });
  } catch (e) {
    self.postMessage({ error: e instanceof Error ? e.message : 'Falha ao processar imagem' });
  } finally {
    bitmap?.close();
  }
};
