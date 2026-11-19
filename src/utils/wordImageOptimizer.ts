import type { Question } from '../types';

const INLINE_DATA_IMAGE_REGEX = /!\[([^\]]*)\]\((data:image\/[^)]+)\)/gi;
const IMAGE_OPTIMIZE_THRESHOLD_CHARS = 110_000;
const MAX_RASTER_WIDTH = 1280;
const MAX_RASTER_HEIGHT = 1280;

export const MAX_QUESTION_CONTENT_CHARS = 350_000;
export const MAX_QUESTION_IMAGE_URL_CHARS = 250_000;
export const MAX_QUESTION_EXPLANATION_CHARS = 100_000;

/**
 * Deterministic fast 64-bit-like hex hash (FNV-1a dual-lane) for image data URLs
 * so duplicate detection can distinguish questions with identical text but different images/diagrams.
 */
export function hashStringDeterministic(input: string): string {
  let h1 = 0x811c9dc5;
  let h2 = 0x9e3779b9;
  for (let i = 0; i < input.length; i++) {
    const ch = input.charCodeAt(i);
    h1 ^= ch;
    h1 = Math.imul(h1, 0x01000193);
    h2 ^= ch + ((i & 0xff) << 1);
    h2 = Math.imul(h2, 0x85ebca6b);
  }
  return `${(h1 >>> 0).toString(16).padStart(8, '0')}${(h2 >>> 0).toString(16).padStart(8, '0')}`;
}

/**
 * Extracts all embedded Markdown image URLs and standalone imageUrl from a question.
 */
export function extractQuestionImageUrls(question: Question): string[] {
  const urls: string[] = [];
  const collectFromText = (text?: string) => {
    if (!text) return;
    const regex = /!\[[^\]]*\]\(([^)]+)\)/gi;
    let m: RegExpExecArray | null;
    while ((m = regex.exec(text)) !== null) {
      const candidate = (m[1] || '').trim();
      if (candidate) urls.push(candidate);
    }
  };

  if (question.imageUrl && question.imageUrl.trim()) {
    urls.push(question.imageUrl.trim());
  }
  collectFromText(question.content);
  question.options?.forEach((o) => collectFromText(o.text));
  question.statements?.forEach((s) => collectFromText(s.statement));
  collectFromText(question.explanation);
  return urls;
}

/**
 * Optimizes an oversized raster data URL (PNG/JPEG/WebP/BMP) via HTMLCanvasElement in browser
 * so diagrams/graphs stay readable while keeping Firestore documents safely under the 1MB limit.
 * Small images and SVGs are preserved verbatim without re-encoding.
 */
export async function optimizeDataImageUrlIfNeeded(
  dataUrl: string,
  maxChars = IMAGE_OPTIMIZE_THRESHOLD_CHARS
): Promise<string> {
  if (!dataUrl || dataUrl.length <= maxChars) return dataUrl;
  if (!/^data:image\/(?:png|jpeg|jpg|webp|gif|bmp);base64,/i.test(dataUrl)) {
    return dataUrl;
  }
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return dataUrl;
  }

  return new Promise<string>((resolve) => {
    const img = new Image();
    img.onload = () => {
      try {
        const origW = img.naturalWidth || img.width || 800;
        const origH = img.naturalHeight || img.height || 600;
        const scale = Math.min(1, MAX_RASTER_WIDTH / origW, MAX_RASTER_HEIGHT / origH);
        const targetW = Math.max(1, Math.round(origW * scale));
        const targetH = Math.max(1, Math.round(origH * scale));

        const canvas = document.createElement('canvas');
        canvas.width = targetW;
        canvas.height = targetH;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(dataUrl);
          return;
        }
        // White background preserves transparent PNG chemical diagrams when encoded as JPEG/WebP
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, targetW, targetH);
        ctx.drawImage(img, 0, 0, targetW, targetH);

        const qualities = [0.85, 0.72, 0.58, 0.45];
        for (const q of qualities) {
          const webp = canvas.toDataURL('image/webp', q);
          if (webp.startsWith('data:image/webp') && webp.length <= maxChars) {
            resolve(webp);
            return;
          }
          const jpeg = canvas.toDataURL('image/jpeg', q);
          if (jpeg.length <= maxChars) {
            resolve(jpeg);
            return;
          }
        }
        const fallback = canvas.toDataURL('image/jpeg', 0.4);
        resolve(fallback.length < dataUrl.length ? fallback : dataUrl);
      } catch {
        resolve(dataUrl);
      }
    };
    img.onerror = () => resolve(dataUrl);
    img.src = dataUrl;
  });
}

async function optimizeRichTextImages(text?: string): Promise<string | undefined> {
  if (!text || !text.includes('data:image/')) return text;

  const matches: { full: string; alt: string; url: string }[] = [];
  const regex = new RegExp(INLINE_DATA_IMAGE_REGEX.source, 'gi');
  let m: RegExpExecArray | null;
  while ((m = regex.exec(text)) !== null) {
    matches.push({ full: m[0], alt: m[1] || 'Hinh_anh_minh_hoa', url: m[2] });
  }
  if (matches.length === 0) return text;

  let result = text;
  for (const item of matches) {
    if (item.url.length > IMAGE_OPTIMIZE_THRESHOLD_CHARS) {
      const optimized = await optimizeDataImageUrlIfNeeded(item.url);
      if (optimized !== item.url) {
        result = result.replace(item.full, `![${item.alt}](${optimized})`);
      }
    }
  }
  return result;
}

/**
 * Optimizes any oversized embedded Word images inside a Question while preserving
 * all formulas, subscripts/superscripts, reaction equations, tables, and diagrams.
 */
export async function optimizeQuestionEmbeddedImages(question: Question): Promise<Question> {
  const nextContent = (await optimizeRichTextImages(question.content)) ?? question.content;
  const nextExplanation = await optimizeRichTextImages(question.explanation);
  const nextImageUrl = question.imageUrl
    ? await optimizeDataImageUrlIfNeeded(question.imageUrl, MAX_QUESTION_IMAGE_URL_CHARS - 1024)
    : undefined;

  const nextOptions = question.options
    ? await Promise.all(
        question.options.map(async (opt) => ({
          ...opt,
          text: (await optimizeRichTextImages(opt.text)) ?? opt.text,
        }))
      )
    : undefined;

  const nextStatements = question.statements
    ? await Promise.all(
        question.statements.map(async (st) => ({
          ...st,
          statement: (await optimizeRichTextImages(st.statement)) ?? st.statement,
          explanation: await optimizeRichTextImages(st.explanation),
        }))
      )
    : undefined;

  return {
    ...question,
    content: nextContent,
    ...(nextExplanation !== undefined ? { explanation: nextExplanation } : {}),
    ...(nextImageUrl !== undefined ? { imageUrl: nextImageUrl } : {}),
    ...(nextOptions !== undefined ? { options: nextOptions } : {}),
    ...(nextStatements !== undefined ? { statements: nextStatements } : {}),
  };
}

/**
 * Safely bounds text length for Firestore without corrupting inline `data:image/...` payloads.
 */
export function safeTruncatePreservingImages(text: string, maxChars: number): string {
  if (!text || text.length <= maxChars) return text;
  // If text has no inline data image, plain slice is safe
  if (!text.includes('data:image/')) {
    return text.slice(0, maxChars);
  }
  // Never slice mid-base64; return as-is so validation catches oversized payloads cleanly
  return text;
}
