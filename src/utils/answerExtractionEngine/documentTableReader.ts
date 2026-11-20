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
    // 2. Fallback to Mammoth HTML conversion
    const htmlResult = await mammoth.convertToHtml({ arrayBuffer });
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
  let lastSectionHeader: string | undefined;

  tableMatches.forEach((tMatch, tIdx) => {
    const tableHtml = tMatch[1];
    const rows: string[][] = [];
    const trMatches = [...tableHtml.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)];

    trMatches.forEach(trMatch => {
      const rowContent = trMatch[1];
      const cells: string[] = [];
      const tdMatches = [...rowContent.matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi)];

      tdMatches.forEach(tdMatch => {
        // Clean cell content, handling internal <p>, <br>, and html entities
        const cellText = tdMatch[1]
          .replace(/<br\s*\/?>/gi, ' ')
          .replace(/<\/p>\s*<p[^>]*>/gi, ' ')
          .replace(/<[^>]+>/g, ' ')
          .replace(/&nbsp;/gi, ' ')
          .replace(/&amp;/gi, '&')
          .replace(/&lt;/gi, '<')
          .replace(/&gt;/gi, '>')
          .replace(/\s+/g, ' ')
          .trim();
        cells.push(cellText);
      });

      if (cells.length > 0 && cells.some(c => c.length > 0)) {
        rows.push(cells);
      }
    });

    const matchStart = tMatch.index || 0;
    const betweenHtml = html.substring(lastTableEnd, matchStart);
    const betweenText = betweenHtml.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/gi, ' ').replace(/\s+/g, ' ').trim();
    const headerMatches = [
      ...betweenText.matchAll(
        /(?:PHẦN\s+(?:III|II|I|3|2|1)\b[^.\n]*|MÃ\s*ĐỀ\s*[:\-–]?\s*[A-Z0-9]+|BẢNG\s+ĐÁP\s*ÁN[^.\n]*|ĐÁP\s*ÁN[^.\n]*|HƯỚNG\s*DẪN\s*CHẤM[^.\n]*)/gi
      ),
    ];
    if (headerMatches.length > 0) {
      lastSectionHeader = headerMatches[headerMatches.length - 1][0].trim().slice(0, 160);
    } else if (betweenText.length > 120) {
      // Significant prose appeared between tables without a section header; don't blindly inherit stale headers
      lastSectionHeader = undefined;
    }
    lastTableEnd = matchStart + tMatch[0].length;

    if (rows.length > 0) {
      tables.push({
        id: `tbl_${tIdx + 1}`,
        sourceType: 'docx_html',
        rows,
        surroundingHeader: lastSectionHeader,
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
  let lastMarkdownSectionHeader: string | undefined;

  const isSectionHeaderLine = (l: string): boolean =>
    /(?:PHẦN\s+(?:III|II|I|3|2|1)\b|MÃ\s*ĐỀ\s*[:\-–]?\s*[A-Z0-9]+|BẢNG\s+ĐÁP\s*ÁN|ĐÁP\s*ÁN|HƯỚNG\s*DẪN\s*CHẤM|TRẢ\s*LỜI\s*NGẮN|ĐÚNG\s*[-–\/]?\s*SAI)/i.test(
      l
    );

  const flushMarkdownTable = () => {
    if (currentMarkdownRows.length > 0) {
      tables.push({
        id: `tbl_md_${tables.length + 1}`,
        sourceType: 'markdown',
        rows: currentMarkdownRows,
        surroundingHeader: lastMarkdownSectionHeader,
      });
    }
    currentMarkdownRows = [];
    hasSeenSeparatorInCurrentTable = false;
  };

  for (let i = 0; i < rawLines.length; i++) {
    const line = rawLines[i];

    // Blank line ends the current Markdown table without resetting lastMarkdownSectionHeader
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
      if (isSectionHeaderLine(line)) {
        lastMarkdownSectionHeader = line.replace(/\*\*|\*|<u>|<\/u>/gi, '').trim().slice(0, 160);
      } else {
        const strippedLine = line.replace(/\*\*|\*|<u>|<\/u>|<s>|<\/s>/gi, '').trim();
        if (
          (strippedLine.length > 100 && !/^[\-–—*_\s]+$/.test(strippedLine)) ||
          (/^(?:Câu|Bài)\s+\d+\s*[.:–—\-]\s*\S/i.test(strippedLine) && strippedLine.length > 25)
        ) {
          // Long non-header paragraph or exam question stem resets stale section context
          lastMarkdownSectionHeader = undefined;
        }
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
      
      // Part II transposed matrix grid (peek next 4 lines for a, b, c, d)
      if (i + 4 < lines.length) {
        const next4 = lines.slice(i + 1, i + 5);
        if (next4.every(l => /^[a-d]\)?\s+[ĐS\s]+/i.test(l))) {
          const matrixRows: string[][] = [['Câu', ...qNums]];
          next4.forEach(rowLine => {
            const rowLabel = rowLine[0].toLowerCase();
            const tokens = rowLine.slice(rowLine.indexOf(')') + 1 || 2).trim().split(/\s+/).filter(t => /^[ĐS]$/i.test(t));
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
        const rMatch = rowLine.match(/^(\d+)[\s.:\-–—]+([ĐS\s]{4,})$/i);
        if (rMatch) {
          const qNum = rMatch[1];
          const tokens = rMatch[2].trim().split(/\s+/).filter(t => /^[ĐS]$/i.test(t));
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
