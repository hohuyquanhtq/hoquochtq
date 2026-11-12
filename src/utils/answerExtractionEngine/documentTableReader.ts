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

    if (rows.length > 0) {
      // Find previous 200 characters of text to detect table section header (e.g. "PHẦN I", "PHẦN II")
      const beforeIndex = Math.max(0, tMatch.index ? tMatch.index - 300 : 0);
      const preSnippet = html.substring(beforeIndex, tMatch.index || 0).replace(/<[^>]+>/g, ' ').trim();
      const headerMatch = preSnippet.match(/(?:PHẦN\s+[I|1|II|2|III|3][^.\n]*|ĐÁP\s*ÁN[^.\n]*)/i);

      tables.push({
        id: `tbl_${tIdx + 1}`,
        sourceType: 'docx_html',
        rows,
        surroundingHeader: headerMatch ? headerMatch[0].trim() : undefined,
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
 * Extracts Markdown tables (`| ... | ... |`) or text grids from text
 */
export function extractTablesFromText(text: string): RawDocumentTable[] {
  const tables: RawDocumentTable[] = [];
  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);

  let currentMarkdownRows: string[][] = [];
  let inMarkdownTable = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Markdown table line
    if (line.startsWith('|') && line.endsWith('|')) {
      // Skip separator |---|---|
      if (/^\|[\s\-:]+(\|[\s\-:]+)*\|$/.test(line)) {
        continue;
      }
      const cells = line
        .slice(1, -1)
        .split('|')
        .map(c => c.trim());
      
      currentMarkdownRows.push(cells);
      inMarkdownTable = true;
    } else {
      if (inMarkdownTable && currentMarkdownRows.length > 0) {
        tables.push({
          id: `tbl_md_${tables.length + 1}`,
          sourceType: 'markdown',
          rows: currentMarkdownRows,
        });
        currentMarkdownRows = [];
        inMarkdownTable = false;
      }
    }
  }

  if (currentMarkdownRows.length > 0) {
    tables.push({
      id: `tbl_md_${tables.length + 1}`,
      sourceType: 'markdown',
      rows: currentMarkdownRows,
    });
  }

  // Also parse text-grid tables (e.g. lines starting with "Câu 1 2 3..." followed by "Đáp án B A C...")
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    // Check if line looks like "Câu 1 2 3 4 5..."
    const headerMatch = line.match(/^Câu(?:\s*:)?\s+([\d\s]+)$/i);
    if (headerMatch && i + 1 < lines.length) {
      const qNums = headerMatch[1].trim().split(/\s+/).filter(Boolean);
      const nextLine = lines[i + 1];
      
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
    if (/^[\-–—*_\s]*HẾT[\-–—*_\s]*$/i.test(line) && i > 3) {
      endOfExamIndex = i;
    }

    // Marker 2: "ĐÁP ÁN", "BẢNG ĐÁP ÁN", "HƯỚNG DẪN CHẤM"
    if (/^(?:BẢNG\s+)?ĐÁP\s*ÁN(?:\s*[:\-–—])?$/i.test(line) || /^BẢNG\s+ĐÁP\s*ÁN\b/i.test(line)) {
      if (answerHeaderIndex === -1 && i > 3) {
        answerHeaderIndex = i;
      }
    }

    // Marker 3: "HƯỚNG DẪN GIẢI CHI TIẾT"
    if (/HƯỚNG\s*DẪN\s*GIẢI\s*CHI\s*TIẾT/i.test(line) && i > 3) {
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
