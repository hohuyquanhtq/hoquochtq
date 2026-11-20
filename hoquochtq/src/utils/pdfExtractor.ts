/**
 * PDF Exam Text & Table Layout Extractor
 * Sử dụng pdfjs-dist để tái tạo dòng chính xác theo tọa độ (y, x),
 * giữ nguyên cấu trúc bảng ngang/dọc/nhiều cột và nhận diện PDF scan dạng ảnh.
 */

import type { PdfExtractionMeta } from '../types';

export interface PdfExtractionResult extends PdfExtractionMeta {
  text: string;
}

interface PositionedTextItem {
  str: string;
  x: number;
  y: number;
  width: number;
}

/**
 * Reconstructs cleanly ordered text lines for a single PDF page from PDF.js text items.
 * Groups spans by Y-coordinate tolerance and sorts each line strictly left-to-right by X.
 */
function reconstructPageLines(items: any[]): string {
  const positioned: PositionedTextItem[] = [];

  for (const raw of items) {
    if (!raw || typeof raw.str !== 'string') continue;
    const str = raw.str;
    if (!str) continue;
    const transform = Array.isArray(raw.transform) ? raw.transform : [1, 0, 0, 1, 0, 0];
    const x = Number(transform[4]) || 0;
    const y = Number(transform[5]) || 0;
    const width = Number(raw.width) || 0;

    if (str.trim().length === 0) {
      // Keep non-empty whitespace span only if useful; skip pure zero-width spacing noise
      continue;
    }

    positioned.push({ str, x, y, width });
  }

  if (positioned.length === 0) return '';

  // Sort top-to-bottom (higher Y first in PDF coordinate space), then left-to-right (lower X first)
  positioned.sort((a, b) => {
    if (Math.abs(a.y - b.y) > 4.2) {
      return b.y - a.y;
    }
    return a.x - b.x;
  });

  // Group into horizontal line buckets within Y tolerance
  const lines: PositionedTextItem[][] = [];
  for (const item of positioned) {
    const currentLine = lines[lines.length - 1];
    if (!currentLine) {
      lines.push([item]);
      continue;
    }
    const avgY = currentLine.reduce((sum, it) => sum + it.y, 0) / currentLine.length;
    if (Math.abs(item.y - avgY) <= 4.5) {
      currentLine.push(item);
    } else {
      lines.push([item]);
    }
  }

  // Sort spans inside each line left-to-right and join with column-aware spacing
  const lineStrings = lines.map((lineItems) => {
    lineItems.sort((a, b) => a.x - b.x);
    let out = '';
    let prevEnd = lineItems[0].x;

    for (let i = 0; i < lineItems.length; i++) {
      const it = lineItems[i];
      if (i > 0) {
        const gap = it.x - prevEnd;
        if (gap > 22) {
          // Wide horizontal gap (e.g. table column separation) -> tab/double-space for table reader
          out += '  ';
        } else if (gap > 2.2 && !out.endsWith(' ') && !it.str.startsWith(' ')) {
          out += ' ';
        }
      }
      out += it.str;
      prevEnd = it.x + Math.max(it.width, it.str.length * 3.5);
    }

    return out.replace(/[ \t]+$/g, '').trim();
  });

  return lineStrings.filter(Boolean).join('\n');
}

/**
 * Extracts text and scan-detection metadata from a PDF ArrayBuffer.
 */
export async function extractTextFromPdfDetailed(arrayBuffer: ArrayBuffer): Promise<PdfExtractionResult> {
  if (typeof (Promise as unknown as { try?: unknown }).try !== 'function') {
    (Promise as unknown as { try: <T>(fn: (...args: unknown[]) => T, ...args: unknown[]) => Promise<T> }).try =
      function <T>(fn: (...args: unknown[]) => T, ...args: unknown[]): Promise<T> {
        return new Promise<T>((resolve, reject) => {
          try {
            resolve(fn(...args));
          } catch (err) {
            reject(err);
          }
        });
      };
  }

  if (typeof (Uint8Array.prototype as unknown as { toHex?: unknown }).toHex !== 'function') {
    Object.defineProperty(Uint8Array.prototype, 'toHex', {
      configurable: true,
      writable: true,
      value: function (this: Uint8Array): string {
        let hex = '';
        for (let i = 0; i < this.length; i++) {
          hex += this[i].toString(16).padStart(2, '0');
        }
        return hex;
      },
    });
  }

  const pdfjsLib = await import('pdfjs-dist');

  if (typeof window !== 'undefined' && pdfjsLib.GlobalWorkerOptions) {
    try {
      const workerUrl = new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).href;
      if (workerUrl) {
        pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl;
      }
    } catch {
      pdfjsLib.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.js';
    }
  }

  const loadingTask = pdfjsLib.getDocument({
    data: new Uint8Array(arrayBuffer),
    verbosity: 0,
    ...(typeof window === 'undefined' ? { disableWorker: true } : {}),
  } as any);

  const pdf = await loadingTask.promise;
  const pageCount = pdf.numPages || 0;
  let pagesWithText = 0;
  let imageOperatorsCount = 0;
  const pageTexts: string[] = [];

  const OPS = (pdfjsLib as any).OPS || {};
  const imageOpCodes = new Set(
    [
      OPS.paintImageXObject,
      OPS.paintInlineImageXObject,
      OPS.paintImageMaskXObject,
      OPS.paintImageXObjectRepeat,
    ].filter((v) => typeof v === 'number')
  );

  for (let i = 1; i <= pageCount; i++) {
    const page = await pdf.getPage(i);
    const textContent = await page.getTextContent();
    const pageText = reconstructPageLines(textContent.items as any[]);

    if (pageText.replace(/\s+/g, '').length >= 8) {
      pagesWithText++;
    }
    if (pageText) {
      pageTexts.push(pageText);
    }

    // Inspect page operators to detect scanned image pages when text is sparse
    if (pageText.replace(/\s+/g, '').length < 60 && typeof page.getOperatorList === 'function') {
      try {
        const opList = await page.getOperatorList();
        if (opList && Array.isArray(opList.fnArray)) {
          for (const fn of opList.fnArray) {
            if (imageOpCodes.has(fn)) {
              imageOperatorsCount++;
            }
          }
        }
      } catch {
        // Ignore operator list inspection failures
      }
    }
  }

  const text = pageTexts.join('\n\n').trim();
  const charCount = text.replace(/\s+/g, '').length;
  const avgCharsPerPage = pageCount > 0 ? charCount / pageCount : charCount;

  const isLikelyScanned =
    pageCount > 0 &&
    (pagesWithText === 0 ||
      charCount < 40 ||
      (avgCharsPerPage < 45 && imageOperatorsCount >= 1));

  const warning = isLikelyScanned
    ? 'File PDF này có ít hoặc không có lớp văn bản (khả năng cao là file ảnh scan). Hệ thống cần OCR trước khi bóc tách tự động.'
    : undefined;

  return {
    text,
    pageCount,
    pagesWithText,
    charCount,
    isLikelyScanned,
    warning,
  };
}
