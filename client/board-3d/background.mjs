// Decode away from WebGL, then upload a bounded texture rather than a full-size
// camera image. Failed CORS/network requests can recover without leaving 3D.
export async function loadBoardImage(url, { signal, maxSize = 4096 } = {}) {
  const resolved = new URL(url, document.baseURI);
  let blob;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const response = await fetch(resolved, { signal, mode: 'cors', credentials: 'omit', cache: attempt ? 'reload' : 'default' });
      if (!response.ok) throw new Error(`Image HTTP ${response.status}`);
      blob = await response.blob(); break;
    } catch (error) {
      if (signal?.aborted || attempt === 2) throw error;
      await new Promise((resolve, reject) => {
        const abort = () => { clearTimeout(timer); reject(signal.reason); };
        const timer = setTimeout(() => { signal?.removeEventListener('abort', abort); resolve(); }, 350 * (attempt + 1));
        signal?.addEventListener('abort', abort, { once: true });
      });
    }
  }
  let image, objectUrl;
  try {
    try { image = await createImageBitmap(blob); }
    catch {
      objectUrl = URL.createObjectURL(blob); image = new Image(); image.src = objectUrl;
      await image.decode();
    }
    if (signal?.aborted) throw signal.reason;
    const sourceWidth = image.width, sourceHeight = image.height;
    const scale = Math.min(1, maxSize / sourceWidth, maxSize / sourceHeight, Math.sqrt(8 * 1024 * 1024 / (sourceWidth * sourceHeight)));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(sourceWidth * scale)); canvas.height = Math.max(1, Math.round(sourceHeight * scale));
    const context = canvas.getContext('2d', { alpha: false });
    context.imageSmoothingEnabled = true; context.imageSmoothingQuality = 'high';
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    return { canvas, sourceWidth, sourceHeight, width: canvas.width, height: canvas.height };
  } finally {
    image?.close?.(); if (objectUrl) URL.revokeObjectURL(objectUrl);
  }
}
