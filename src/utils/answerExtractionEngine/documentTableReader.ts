/**
 * ANSWER EXTRACTION ENGINE - Document Structure Reader
 * Phân tích cấu trúc bảng (Table), dòng (Row), ô (Cell) từ DOCX HTML, Markdown và Text Grid
 */

import mammoth from 'mammoth';
import { RawDocumentTable } from './types';
import { parseDocxWithEquations } from '../docxEquationParser';

/**
 * Extracts structured HTML & Markdown from DOCX preserving exact table grids, OMML formulas, and sub/sup tags
 */
export async function readDocxStructure(arrayBuffer: ArrayBuffer): Promise<{
  fullMarkdownText: string;
  tables: RawDocumentTable[];
}> {
  // 1. Try OMML & XML-based Docx Equation Parser first (preserves Word equations, formulas, sub/sup, tables, images)
  try {
    const eqResult = await parseDocxWithEquations(arrayBuffer);
    if (eqResult.fullMarkdownText && eqResult.fullMarkdownText.trim().length > 20) {
      return {
        fullMarkdownText: eqResult.fullMarkdownText,
        tables: eqResult.tables,
      };
    }
  } catch (err) {
    console.warn('OMML equation parser fallback to Mammoth:', err);
  }

  try {
    // 2. Fallback to Mammoth HTML conversion with base64 image extraction
    const htmlResult = await mammoth.convertToHtml(
      { arrayBuffer },
      {
        convertImage: mammoth.images.imgElement(async (image) => {
          const base64 = await image.read('base64');
          const rawMime = (image.contentType || 'image/png').toLowerCase();
          const contentType = /^image\/(png|jpeg|jpg|gif|webp|bmp|svg\+xml)$/.test(rawMime)
            ? rawMime
            : 'image/png';
          const altText = (image as { altText?: string }).altText || 'Hình ảnh minh họa';
          return {
            src: `data:${contentType};base64,${base64}`,
            alt: altText,
            class: 'hq-question-img',
          };
        }),
      }
    );
    const rawHtml = htmlResult.value || '';

    const tables = extractTablesFromHtml(rawHtml);
    const fullMarkdownText = htmlToMarkdownWithTables(rawHtml);

    return {
      fullMarkdownText,
      tables,
    };
  } catch (err) {
    console.warn('Docx structure reading fallback to raw text:', err);
    // 3. Last fallback: Mammoth raw text
    const rawRes = await mammoth.extractRawText({ arrayBuffer });
    return {
      fullMarkdownText: rawRes.value || '',
      tables: extractTablesFromText(rawRes.value || ''),
    };
  }
}

/**
 * Parses all <table> elements from HTML into structured 2D string arrays
 */
export function extractTablesFromHtml(html: string): RawDocumentTable[] {
  const tables: RawDocumentTable[] = [];
  const tableMatches = [...html.matchAll(/<table[^>]*>([\s\S]*?)<\/table>/gi)];

  let lastTableEnd = 0;
  let lastPartHeader: string | undefined;
  let lastMetaHeader: string | undefined;

  tableMatches.forEach((tMatch, tIdx) => {
    const tableHtml = tMatch[1];
    const rows: string[][] = [];
    const trMatches = [...tableHtml.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)];

    // Track active vertical rowspans per column slot so merged "Câu" cells keep columns aligned
    const activeRowSpans = new Map<number, number>();

    trMatches.forEach(trMatch => {
      const rowContent = trMatch[1];
      const cells: string[] = [];
      const tdMatches = [...rowContent.matchAll(/<t[dh]([^>]*)>([\s\S]*?)<\/t[dh]>/gi)];

      let colIdx = 0;
      const fillPendingSpans = () => {
        while ((activeRowSpans.get(colIdx) || 0) > 0) {
          cells.push('');
          const rem = (activeRowSpans.get(colIdx) || 1) - 1;
          if (rem > 0) activeRowSpans.set(colIdx, rem);
          else activeRowSpans.delete(colIdx);
          colIdx++;
        }
      };

      tdMatches.forEach(tdMatch => {
        fillPendingSpans();

        const attrs = tdMatch[1] || '';
        const rowSpanMatch = attrs.match(/\browspan\s*=\s*["']?(\d+)/i);
        const colSpanMatch = attrs.match(/\bcolspan\s*=\s*["']?(\d+)/i);
        const rowSpan = rowSpanMatch ? Math.max(1, Math.min(50, parseInt(rowSpanMatch[1], 10))) : 1;
        const colSpan = colSpanMatch ? Math.max(1, Math.min(20, parseInt(colSpanMatch[1], 10))) : 1;

        // Clean cell content, handling internal <p>, <br>, and html entities
        const cellText = tdMatch[2]
          .replace(/<br\s*\/?>/gi, ' ')
          .replace(/<\/p>\s*<p[^>]*>/gi, ' ')
          .replace(/<[^>]+>/g, ' ')
          .replace(/&nbsp;/gi, ' ')
          .replace(/&amp;/gi, '&')
          .replace(/&lt;/gi, '<')
          .replace(/&gt;/gi, '>')
          .replace(/\s+/g, ' ')
          .trim();

        for (let k = 0; k < colSpan; k++) {
          cells.push(k === 0 ? cellText : '');
          if (rowSpan > 1) {
            activeRowSpans.set(colIdx + k, rowSpan - 1);
          }
        }
        colIdx += colSpan;
      });

      fillPendingSpans();

      if (cells.length > 0 && cells.some(c => c.length > 0)) {
        rows.push(cells);
      }
    });

    const matchStart = tMatch.index || 0;
    const betweenHtml = html.substring(lastTableEnd, matchStart);
    const betweenText = betweenHtml
      .replace(/<\/(?:p|div|h[1-6]|li)>/gi, '\n')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/gi, ' ')
      .replace(/[ \t]+/g, ' ')
      .trim();

    const partMatches = [
      ...betweenText.matchAll(
        /(?:(?:PHẦN|PHAN|MỤC|MUC)\s+(?:III|II|I|Ⅲ|Ⅱ|Ⅰ|3|2|1)\b[^\n]*|(?:TRẮC\s*NGHIỆM\s+(?:4|BỐN|NHIỀU)\s+(?:LỰA\s+CHỌN|PHƯƠNG\s+ÁN)|ĐÚNG\s*[-–\/]?\s*SAI|TRẢ\s*LỜI\s*NGẮN)[^\n]*)/gi
      ),
    ];
    const metaMatches = [
      ...betweenText.matchAll(
        /(?:MÃ\s*ĐỀ(?:\s*THI)?\s*[:\-–]?\s*[A-Z0-9]+|BẢNG\s+ĐÁP\s*ÁN[^\n]*|HƯỚNG\s*DẪN\s*CHẤM[^\n]*)/gi
      ),
    ];

    if (partMatches.length > 0) {
      lastPartHeader = partMatches[partMatches.length - 1][0].trim().slice(0, 160);
    } else if (/HẾT/i.test(betweenText) || betweenText.length > 220) {
      // Significant prose or HẾT marker without a new PHẦN header resets stale scope
      lastPartHeader = undefined;
    }

    if (metaMatches.length > 0) {
      lastMetaHeader = metaMatches[metaMatches.length - 1][0].trim().slice(0, 120);
    } else if (betweenText.length > 220) {
      lastMetaHeader = undefined;
    }

    lastTableEnd = matchStart + tMatch[0].length;
    const combinedHeader = [lastPartHeader, lastMetaHeader].filter(Boolean).join(' | ').slice(0, 200) || undefined;

    if (rows.length > 0) {
      tables.push({
        id: `tbl_${tIdx + 1}`,
        sourceType: 'docx_html',
        rows,
        surroundingHeader: combinedHeader,
      });
    }
  });

  return tables;
}

/**
 * Converts Mammoth HTML into readable Markdown text while preserving markdown table syntax:
 * | Col 1 | Col 2 |
 * |---|---|
 * | Val 1 | Val 2 |
 */
export function htmlToMarkdownWithTables(html: string): string {
  // Replace tables with Markdown table representations
  const markdownText = html.replace(/<table[^>]*>([\s\S]*?)<\/table>/gi, (_match, tableBody) => {
    const rows: string[][] = [];
    const trMatches = [...tableBody.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)];

    trMatches.forEach((trMatch: RegExpMatchArray) => {
      const rowContent = trMatch[1];
      const cells: string[] = [];
      const tdMatches = [...rowContent.matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi)];

      tdMatches.forEach((tdMatch: RegExpMatchArray) => {
        let text = tdMatch[1]
          .replace(/<br\s*\/?>/gi, ' ')
          .replace(/<sub[^>]*>([\s\S]*?)<\/sub>/gi, '<sub>$1</sub>')
          .replace(/<sup[^>]*>([\s\S]*?)<\/sup>/gi, '<sup>$1</sup>');
        
        // Remove other HTML tags except sub and sup
        text = text.replace(/<(?!\/?(sub|sup)\b)[^>]+>/gi, ' ')
          .replace(/&nbsp;/gi, ' ')
          .replace(/&amp;/gi, '&')
          .replace(/&lt;/gi, '<')
          .replace(/&gt;/gi, '>')
          .replace(/\|/g, '/') // replace pipe inside cells to prevent table column break
          .replace(/\s+/g, ' ')
          .trim();
        cells.push(text);
      });

      if (cells.length > 0 && cells.some((c: string) => c.length > 0)) {
        rows.push(cells);
      }
    });

    if (rows.length === 0) return '';

    // Normalize column count across all rows
    const maxCols = Math.max(...rows.map(r => r.length));
    const normalizedRows = rows.map(r => {
      while (r.length < maxCols) r.push('');
      return r;
    });

    let mdTable = '\n\n';
    // Header row
    mdTable += '| ' + normalizedRows[0].join(' | ') + ' |\n';
    // Separator row
    mdTable += '|' + Array(maxCols).fill('---').join('|') + '|\n';
    // Data rows
    for (let i = 1; i < normalizedRows.length; i++) {
      mdTable += '| ' + normalizedRows[i].join(' | ') + ' |\n';
    }
    mdTable += '\n';
    return mdTable;
  });

  // Convert paragraphs and line breaks while preserving sub and sup
  return markdownText
    .replace(/<h[1-6][^>]*>([\s\S]*?)<\/h[1-6]>/gi, '\n\n### $1\n\n')
    .replace(/<p[^>]*>([\s\S]*?)<\/p>/gi, '\n$1\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<strong[^>]*>([\s\S]*?)<\/strong>/gi, '**$1**')
    .replace(/<em[^>]*>([\s\S]*?)<\/em>/gi, '*$1*')
    .replace(/<(?!\/?(sub|sup)\b)[^>]+>/gi, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * Detects a section/variant header in nearby preceding lines (e.g. "PHẦN II", "Mã đề 101")
 */
function findNearbyTableHeader(lines: string[], startIndex: number): string | undefined {
  const parts: string[] = [];
  for (let k = Math.max(0, startIndex - 3); k < startIndex; k++) {
    const l = lines[k].trim();
    if (!l) continue;
    if (/(?:PHẦN\s+(?:III|II|I|3|2|1)\b|MÃ\s*ĐỀ\s*[:\-–]?\s*[A-Z0-9]+|BẢNG\s+ĐÁP\s*ÁN|ĐÁP\s*ÁN|TRẢ\s*LỜI\s*NGẮN|ĐÚNG\s*[-–\/]?\s*SAI)/i.test(l)) {
      parts.push(l);
    }
  }
  return parts.length > 0 ? parts.join(' | ') : undefined;
}

/**
 * Extracts Markdown tables (`| ... | ... |`) or text grids from text,
 * preserving distinct boundaries between consecutive tables (blank lines or repeated separator rows).
 */
export function extractTablesFromText(text: string): RawDocumentTable[] {
  const tables: RawDocumentTable[] = [];
  const rawLines = text.split(/\r?\n/).map(l => l.trim());
  const lines = rawLines.filter(Boolean);

  let currentMarkdownRows: string[][] = [];
  let hasSeenSeparatorInCurrentTable = false;
  let lastMarkdownPartHeader: string | undefined;
  let lastMarkdownMetaHeader: string | undefined;

  const isPartHeaderLine = (l: string): boolean =>
    /(?:(?:PHẦN|PHAN|MỤC|MUC)\s+(?:III|II|I|Ⅲ|Ⅱ|Ⅰ|3|2|1)\b|^(?:III|II|I)\.\s*(?:TRẮC\s*NGHIỆM|ĐÚNG\s*[-–\/]?\s*SAI|TRẢ\s*LỜI\s*NGẮN)|TRẮC\s*NGHIỆM\s+(?:4|BỐN|NHIỀU)\s+(?:LỰA\s+CHỌN|PHƯƠNG\s+ÁN)|TRẢ\s*LỜI\s*NGẮN|ĐÚNG\s*[-–\/]?\s*SAI)/i.test(
      l
    );

  const isMetaHeaderLine = (l: string): boolean =>
    /(?:MÃ\s*ĐỀ(?:\s*THI)?\s*[:\-–]?\s*[A-Z0-9]+|BẢNG\s+ĐÁP\s*ÁN|^(?:[\-–—*_\s]*)ĐÁP\s*ÁN\b|HƯỚNG\s*DẪN\s*CHẤM)/i.test(
      l
    );

  const getCombinedMarkdownHeader = (): string | undefined => {
    const parts = [lastMarkdownPartHeader, lastMarkdownMetaHeader].filter(Boolean);
    return parts.length > 0 ? parts.join(' | ').slice(0, 200) : undefined;
  };

  const flushMarkdownTable = () => {
    if (currentMarkdownRows.length > 0) {
      tables.push({
        id: `tbl_md_${tables.length + 1}`,
        sourceType: 'markdown',
        rows: currentMarkdownRows,
        surroundingHeader: getCombinedMarkdownHeader(),
      });
    }
    currentMarkdownRows = [];
    hasSeenSeparatorInCurrentTable = false;
  };

  for (let i = 0; i < rawLines.length; i++) {
    const line = rawLines[i];

    // Blank line ends the current Markdown table without resetting lastMarkdownPartHeader
    if (!line) {
      flushMarkdownTable();
      continue;
    }

    // Markdown table line
    if (line.startsWith('|') && line.endsWith('|')) {
      // Separator line |---|---|
      if (/^\|[\s\-:]+(\|[\s\-:]+)*\|$/.test(line)) {
        // If we already saw a separator AND already collected >=2 rows, a second separator means
        // the immediately preceding row is actually the header of a NEW consecutive Markdown table!
        if (hasSeenSeparatorInCurrentTable && currentMarkdownRows.length >= 2) {
          const newHeaderRow = currentMarkdownRows.pop()!;
          flushMarkdownTable();
          currentMarkdownRows = [newHeaderRow];
        }
        hasSeenSeparatorInCurrentTable = true;
        continue;
      }

      const cells = line
        .slice(1, -1)
        .split('|')
        .map(c => c.trim());

      currentMarkdownRows.push(cells);
    } else {
      flushMarkdownTable();
      const strippedLine = line.replace(/\*\*|\*|<u>|<\/u>|<s>|<\/s>/gi, '').trim();
      if (/^[\-–—*_\s|]*HẾT[\-–—*_\s|]*$/i.test(strippedLine)) {
        lastMarkdownPartHeader = undefined;
        lastMarkdownMetaHeader = undefined;
      } else if (isPartHeaderLine(strippedLine)) {
        lastMarkdownPartHeader = strippedLine.slice(0, 160);
      } else if (isMetaHeaderLine(strippedLine)) {
        lastMarkdownMetaHeader = strippedLine.slice(0, 120);
      } else if (
        (strippedLine.length > 100 && !/^[\-–—*_\s]+$/.test(strippedLine)) ||
        (/^(?:Câu|CÂU|Bài|BÀI)\s+\d+\s*[.:)–—\-]\s*\S/.test(strippedLine) && strippedLine.length > 20)
      ) {
        // Long non-header paragraph or exam question stem resets stale section context
        lastMarkdownPartHeader = undefined;
        lastMarkdownMetaHeader = undefined;
      }
    }
  }

  flushMarkdownTable();

  // Also parse multi-column PDF / tab-delimited or space-aligned text grids (e.g. "1  A  7  B  13  C")
  let currentGridRows: string[][] = [];
  let gridStartIdx = -1;
  const flushGrid = () => {
    if (currentGridRows.length >= 2) {
      tables.push({
        id: `tbl_cols_${tables.length + 1}`,
        sourceType: 'pdf_coords',
        rows: currentGridRows,
        surroundingHeader: findNearbyTableHeader(lines, gridStartIdx >= 0 ? gridStartIdx : 0),
      });
    }
    currentGridRows = [];
    gridStartIdx = -1;
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.startsWith('|')) {
      flushGrid();
      continue;
    }
    // Split on tab or >=2 spaces (preserved by pdfExtractor coordinate column gaps)
    if (/\t|  +/.test(line)) {
      const cols = line.split(/\t|  +/).map(c => c.trim()).filter(Boolean);
      const isAnswerLikeGridRow =
        cols.length >= 4 &&
        cols.every(c => c.length <= 18) &&
        cols.some(c => /^(?:Câu|\d+|[A-D]|Đ|S|Đúng|Sai|[-+]?\d+(?:[,.]\d+)?)$/i.test(c));
      if (isAnswerLikeGridRow) {
        if (currentGridRows.length === 0) gridStartIdx = i;
        currentGridRows.push(cols);
        continue;
      }
    }
    flushGrid();
  }
  flushGrid();

  // Also parse text-grid tables (e.g. lines starting with "Câu 1 2 3..." followed by "Đáp án B A C...")
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    // Check if line looks like "Câu 1 2 3 4 5..."
    const headerMatch = line.match(/^Câu(?:\s*:)?\s+([\d\s]+)$/i);
    if (headerMatch && i + 1 < lines.length) {
      const qNums = headerMatch[1].trim().split(/\s+/).filter(Boolean);
      const nextLine = lines[i + 1];
      const headerCtx = findNearbyTableHeader(lines, i);
      
      // Part I horizontal grid
      if (nextLine.match(/^(?:Đáp\s*án(?:\s*:)?\s+)?([A-D\s]+)$/i)) {
        const answers = nextLine.replace(/^Đáp\s*án(?:\s*:)?\s*/i, '').trim().split(/\s+/).filter(Boolean);
        if (answers.length === qNums.length) {
          tables.push({
            id: `tbl_textgrid_p1_${tables.length + 1}`,
            sourceType: 'text_grid',
            rows: [
              ['Câu', ...qNums],
              ['Đáp án', ...answers],
            ],
            surroundingHeader: headerCtx,
          });
        }
      }
      
      // Part II transposed matrix grid (peek next 4 lines for a, b, c, d — supports Đ/S, T/F, Đúng/Sai, True/False)
      if (i + 4 < lines.length) {
        const next4 = lines.slice(i + 1, i + 5);
        if (next4.every(l => /^[a-d][\).:\s]+(?:(?:Đúng|Sai|True|False|[ĐSTF])\s*)+$/i.test(l))) {
          const matrixRows: string[][] = [['Câu', ...qNums]];
          next4.forEach(rowLine => {
            const rowLabel = rowLine[0].toLowerCase();
            const rest = rowLine.replace(/^[a-d][\).:\s]+/i, '').trim();
            const tokens = rest.split(/\s+/).filter(t => /^(?:Đúng|Sai|True|False|[ĐSTF])$/i.test(t));
            matrixRows.push([`${rowLabel})`, ...tokens]);
          });
          tables.push({
            id: `tbl_textgrid_p2_${tables.length + 1}`,
            sourceType: 'text_grid',
            rows: matrixRows,
            surroundingHeader: headerCtx || 'PHẦN II',
          });
        }
      }

      // Part III horizontal grid
      if (nextLine.match(/^(?:Đáp\s*án(?:\s*:)?\s+)?[\d,.\-+\s]+$/i)) {
        const ansTokens = nextLine.replace(/^Đáp\s*án(?:\s*:)?\s*/i, '').trim().split(/\s+/).filter(Boolean);
        if (ansTokens.length === qNums.length) {
          tables.push({
            id: `tbl_textgrid_p3_${tables.length + 1}`,
            sourceType: 'text_grid',
            rows: [
              ['Câu', ...qNums],
              ['Đáp án', ...ansTokens],
            ],
            surroundingHeader: headerCtx || 'PHẦN III',
          });
        }
      }
    }

    // Part II Row-wise text grid: Header "Câu a) b) c) d)" or "Câu a b c d"
    const rowWiseHeaderMatch = line.match(/^Câu(?:\s*:)?\s+([a-d\)\s]+)$/i);
    if (rowWiseHeaderMatch) {
      const rowWiseRows: string[][] = [['Câu', 'a', 'b', 'c', 'd']];
      let j = i + 1;
      while (j < lines.length) {
        const rowLine = lines[j];
        const rMatch = rowLine.match(/^(\d+)[\s.:\-–—]+((?:(?:Đúng|Sai|True|False|[ĐSTF])\s*){4,})$/i);
        if (rMatch) {
          const qNum = rMatch[1];
          const tokens = rMatch[2].trim().split(/\s+/).filter(t => /^(?:Đúng|Sai|True|False|[ĐSTF])$/i.test(t));
          if (tokens.length >= 4) {
            rowWiseRows.push([qNum, ...tokens.slice(0, 4)]);
            j++;
            continue;
          }
        }
        break;
      }
      if (rowWiseRows.length > 1) {
        tables.push({
          id: `tbl_textgrid_p2_rowwise_${tables.length + 1}`,
          sourceType: 'text_grid',
          rows: rowWiseRows,
          surroundingHeader: 'PHẦN II',
        });
      }
    }
  }

  return tables;
}

/**
 * Isolates the Answer Key block (after "Hết" or "ĐÁP ÁN")
 */
export function isolateAnswerBlock(text: string): {
  answerSectionText: string;
  solutionsText: string;
  isExplicitAnswerBlock: boolean;
} {
  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);

  let endOfExamIndex = -1;
  let answerHeaderIndex = -1;
  let solutionsHeaderIndex = -1;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Marker 1: "---------------------Hết----------------" or "Hết"
    if (/^[\-–—*_\s]*HẾT[\-–—*_\s]*$/i.test(line) && i >= 1) {
      endOfExamIndex = i;
    }

    // Marker 2: "ĐÁP ÁN", "BẢNG ĐÁP ÁN", "HƯỚNG DẪN CHẤM"
    if (/^(?:BẢNG\s+)?ĐÁP\s*ÁN(?:\s*[:\-–—])?$/i.test(line) || /^BẢNG\s+ĐÁP\s*ÁN\b/i.test(line)) {
      if (answerHeaderIndex === -1 && i >= 1) {
        answerHeaderIndex = i;
      }
    }

    // Marker 3: "HƯỚNG DẪN GIẢI CHI TIẾT"
    if (/HƯỚNG\s*DẪN\s*GIẢI\s*CHI\s*TIẾT/i.test(line) && i >= 1) {
      solutionsHeaderIndex = i;
    }
  }

  const startIdx = endOfExamIndex !== -1 
    ? endOfExamIndex 
    : (answerHeaderIndex !== -1 ? answerHeaderIndex : -1);

  if (startIdx !== -1) {
    const endIdx = solutionsHeaderIndex !== -1 ? solutionsHeaderIndex : lines.length;
    const answerSectionText = lines.slice(startIdx, endIdx).join('\n');
    const solutionsText = solutionsHeaderIndex !== -1 ? lines.slice(solutionsHeaderIndex).join('\n') : '';

    return {
      answerSectionText,
      solutionsText,
      isExplicitAnswerBlock: true,
    };
  }

  return {
    answerSectionText: text,
    solutionsText: '',
    isExplicitAnswerBlock: false,
  };
}
