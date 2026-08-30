export type Rotation = 0 | 90 | 180 | 270;

export type CropRect = { x: number; y: number; width: number; height: number };

export const FULL_CROP: CropRect = { x: 0, y: 0, width: 1, height: 1 };

export async function loadBitmap(source: Blob): Promise<ImageBitmap> {
  if ('createImageBitmap' in globalThis) {
    return createImageBitmap(source);
  }
  const url = URL.createObjectURL(source);
  try {
    const image = new Image();
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error("Image illisible"));
      image.src = url;
    });
    const canvas = document.createElement('canvas');
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    canvas.getContext('2d')?.drawImage(image, 0, 0);
    return await createImageBitmap(canvas);
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function canvasToBlob(
  canvas: HTMLCanvasElement,
  type = 'image/jpeg',
  quality = 0.8,
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('Export image impossible'))),
      type,
      quality,
    );
  });
}

export function makeCanvas(width: number, height: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(width));
  canvas.height = Math.max(1, Math.round(height));
  return canvas;
}

export function context2d(canvas: HTMLCanvasElement): CanvasRenderingContext2D {
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('Contexte 2D indisponible');
  return ctx;
}

export async function rotateImage(source: Blob, rotation: Rotation): Promise<Blob> {
  if (rotation === 0) return source;
  const bitmap = await loadBitmap(source);
  try {
    const swapped = rotation === 90 || rotation === 270;
    const canvas = makeCanvas(swapped ? bitmap.height : bitmap.width, swapped ? bitmap.width : bitmap.height);
    const ctx = context2d(canvas);
    ctx.translate(canvas.width / 2, canvas.height / 2);
    ctx.rotate((rotation * Math.PI) / 180);
    ctx.drawImage(bitmap, -bitmap.width / 2, -bitmap.height / 2);
    return await canvasToBlob(canvas, 'image/jpeg', 0.92);
  } finally {
    bitmap.close?.();
  }
}

export async function normalizeCapture(
  source: Blob,
  { crop = FULL_CROP, maxWidth = 2000, quality = 0.8 } = {},
): Promise<{ blob: Blob; width: number; height: number }> {
  const bitmap = await loadBitmap(source);
  try {
    const sx = Math.round(crop.x * bitmap.width);
    const sy = Math.round(crop.y * bitmap.height);
    const sw = Math.max(1, Math.round(crop.width * bitmap.width));
    const sh = Math.max(1, Math.round(crop.height * bitmap.height));
    const scale = Math.min(1, maxWidth / sw);

    const canvas = makeCanvas(sw * scale, sh * scale);
    const ctx = context2d(canvas);
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(bitmap, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);

    const blob = await canvasToBlob(canvas, 'image/jpeg', quality);
    return { blob, width: canvas.width, height: canvas.height };
  } finally {
    bitmap.close?.();
  }
}

export async function downscaleForUpload(
  source: Blob,
  { maxPixels = 1_600_000, maxWidth = 1400, quality = 0.8 } = {},
): Promise<Blob> {
  try {
    const bitmap = await loadBitmap(source);
    try {
      const pixels = bitmap.width * bitmap.height;
      const scale = Math.min(1, maxWidth / bitmap.width, Math.sqrt(maxPixels / pixels));
      if (scale >= 1) return source;

      const canvas = makeCanvas(bitmap.width * scale, bitmap.height * scale);
      const ctx = context2d(canvas);
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      const reduced = await canvasToBlob(canvas, 'image/jpeg', quality);
      return reduced.size < source.size ? reduced : source;
    } finally {
      bitmap.close?.();
    }
  } catch {
    return source;
  }
}
