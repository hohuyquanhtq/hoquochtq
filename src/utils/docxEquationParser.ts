/**
 * DOCX EQUATION PARSER (OMML -> LaTeX & Rich Chemistry)
 * Module chuyên biệt đọc và chuyển đổi Office Math Markup Language (OMML),
 * bảo toàn chỉ số trên/dưới, phân số, căn thức, phương trình, bảng và hình ảnh từ MS Word (.docx).
 */

import JSZip from 'jszip';
import { RawDocumentTable } from './answerExtractionEngine/types';

export interface DocxParseResult {
  fullMarkdownText: string;
  tables: RawDocumentTable[];
  images: Map<string, string>; // rId -> base64 Data URL
  equationCount: number;
}

/**
 * Main function: Unzips DOCX, extracts relationships & media, and parses document.xml
 */
export async function parseDocxWithEquations(arrayBuffer: ArrayBuffer): Promise<DocxParseResult> {
  const zip = await JSZip.loadAsync(arrayBuffer);
  
  // 1. Load document.xml
  const docFile = zip.file('word/document.xml');
  if (!docFile) {
    throw new Error('File không hợp lệ: Không tìm thấy word/document.xml trong file DOCX.');
  }
  const documentXml = await docFile.async('string');

  // 2. Load relationships (for embedded images)
  const relsFile = zip.file('word/_rels/document.xml.rels');
  const imageMap = new Map<string, string>(); // rId -> base64 Data URL
  
  if (relsFile) {
    try {
      const relsXml = await relsFile.async('string');
      const relMatches = [...relsXml.matchAll(/<Relationship\s+([^>]+)\/>/gi)];
      
      for (const rm of relMatches) {
        const attrs = rm[1];
        const idMatch = attrs.match(/Id="([^"]+)"/i);
        const typeMatch = attrs.match(/Type="([^"]+)"/i);
        const targetMatch = attrs.match(/Target="([^"]+)"/i);

        if (idMatch && targetMatch && typeMatch && typeMatch[1].includes('/image')) {
          const rId = idMatch[1];
          let targetPath = targetMatch[1].replace(/^\//, '');
          if (!targetPath.startsWith('word/')) {
            targetPath = 'word/' + targetPath;
          }

          const imgZipFile = zip.file(targetPath);
          if (imgZipFile) {
            const ext = targetPath.split('.').pop()?.toLowerCase() || 'png';
            const mimeType = ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg' 
              : ext === 'png' ? 'image/png' 
              : ext === 'gif' ? 'image/gif' 
              : ext === 'svg' ? 'image/svg+xml' 
              : 'image/png';
            const base64Data = await imgZipFile.async('base64');
            imageMap.set(rId, `data:${mimeType};base64,${base64Data}`);
          }
        }
      }
    } catch (e) {
      console.warn('Error reading document relationships:', e);
    }
  }

  // 3. Parse Document XML into structured text, equations, and tables
  return parseDocumentXml(documentXml, imageMap);
}

/**
 * Parses document.xml content into rich markdown with KaTeX equations ($...$), HTML sub/sup, tables, and images
 */
export function parseDocumentXml(xml: string, imageMap: Map<string, string>): DocxParseResult {
  const tables: RawDocumentTable[] = [];
  let equationCount = 0;

  // Extract body content
  const bodyMatch = xml.match(/<w:body[^>]*>([\s\S]*?)<\/w:body>/i);
  const bodyContent = bodyMatch ? bodyMatch[1] : xml;

  // Clean XML namespaces prefix helper
  // We process top-level paragraphs (<w:p>) and tables (<w:tbl>)
  const elementRegex = /<(w:p|w:tbl)\b[^>]*>([\s\S]*?)<\/\1>/gi;
  const elements = [...bodyContent.matchAll(elementRegex)];

  const markdownBlocks: string[] = [];

  for (const elMatch of elements) {
    const tagName = elMatch[1];
    const tagContent = elMatch[2];

    if (tagName === 'w:p') {
      const pText = parseParagraphContent(tagContent, imageMap, () => { equationCount++; });
      if (pText.trim().length > 0) {
        markdownBlocks.push(pText.trim());
      }
    } else if (tagName === 'w:tbl') {
      const { mdTable, structuredRows, plainParagraphs } = parseTableContent(tagContent, imageMap, () => { equationCount++; });
      if (structuredRows.length > 0) {
        // If this is a 1-column Word table (commonly used as header boxes or layout frames),
        // emit its paragraphs cleanly so section headers & questions are preserved on separate lines.
        const maxCols = Math.max(...structuredRows.map(r => r.length));
        if (maxCols === 1 && plainParagraphs.length > 0) {
          markdownBlocks.push(plainParagraphs.join('\n\n'));
        } else {
          markdownBlocks.push(mdTable);
        }
        tables.push({
          id: `tbl_docx_${tables.length + 1}`,
          sourceType: 'docx_html',
          rows: structuredRows,
        });
      }
    }
  }

  const fullMarkdownText = markdownBlocks.join('\n\n');

  return {
    fullMarkdownText,
    tables,
    images: imageMap,
    equationCount,
  };
}

/**
 * Parses a paragraph's internal elements (<w:r>, <m:oMath>, <m:oMathPara>, <w:drawing>)
 */
export function parseParagraphContent(
  pContent: string,
  imageMap: Map<string, string>,
  onEquationFound?: () => void
): string {
  let result = '';

  // Match children: <w:r>, <m:oMathPara>, <m:oMath>, <w:hyperlink>, <w:drawing>, etc.
  const childRegex = /<((?:w|m):[a-zA-Z0-9]+)\b([^>]*)>([\s\S]*?)<\/\1>|<((?:w|m):[a-zA-Z0-9]+)\b([^>]*)\/>/gi;
  const children = [...pContent.matchAll(childRegex)];

  for (const child of children) {
    const tagName = (child[1] || child[4] || '').toLowerCase();
    const innerContent = child[3] || '';

    // 1. Office Math Paragraph (<m:oMathPara>) or Inline Math (<m:oMath>)
    if (tagName === 'm:omathpara' || tagName === 'm:omath') {
      onEquationFound?.();
      const latex = convertOmmlToLatex(innerContent || child[0]);
      if (latex.trim()) {
        result += ` $${latex.trim()}$ `;
      }
      continue;
    }

    // 2. Regular Text Run (<w:r>)
    if (tagName === 'w:r') {
      result += parseRunContent(child[0], imageMap);
      continue;
    }

    // 3. Hyperlink (<w:hyperlink>)
    if (tagName === 'w:hyperlink') {
      result += parseParagraphContent(innerContent, imageMap, onEquationFound);
      continue;
    }

    // 4. Drawing / Image directly in paragraph
    if (tagName === 'w:drawing' || innerContent.includes('<w:drawing')) {
      const imgMd = extractImageFromNode(child[0], imageMap);
      if (imgMd) result += imgMd;
      continue;
    }
  }

  // Fallback: If no children matched (e.g. nested structure), scan directly for equations and text
  if (!result.trim() && pContent.length > 0) {
    const fallbackText = fallbackExtractTextAndMath(pContent, imageMap);
    if (fallbackText) return fallbackText;
  }

  return result
    .replace(/\*{6}/g, '')
    .replace(/\*{4}/g, '')
    .replace(/[ \t]{2,}/g, ' ');
}

/**
 * Parses a single Word run (<w:r>):
 * Checks <w:rPr> for subscript (<w:vertAlign w:val="subscript"/>),
 * superscript (<w:vertAlign w:val="superscript"/>), bold, italic, and extracts <w:t>.
 */
function parseRunContent(rXml: string, imageMap: Map<string, string>): string {
  // Check for image inside run
  if (rXml.includes('<w:drawing') || rXml.includes('<v:imagedata')) {
    const imgMd = extractImageFromNode(rXml, imageMap);
    if (imgMd) return imgMd;
  }

  // Check for line break: <w:br/>
  if (/<w:br\b[^>]*\/>/i.test(rXml)) {
    return '\n';
  }

  // Extract run properties (<w:rPr>)
  const rPrMatch = rXml.match(/<w:rPr\b[^>]*>([\s\S]*?)<\/w:rPr>/i);
  const rPr = rPrMatch ? rPrMatch[1] : '';

  const isSubscript = /<w:vertAlign\b[^>]*w:val="subscript"[^>]*\/>/i.test(rPr);
  const isSuperscript = /<w:vertAlign\b[^>]*w:val="superscript"[^>]*\/>/i.test(rPr);
  const isBold = /<w:b\b[^>]*\/>|<w:bCs\b[^>]*\/>/i.test(rPr);
  const isItalic = /<w:i\b[^>]*\/>|<w:iCs\b[^>]*\/>/i.test(rPr);

  // Extract all <w:t> text nodes in this run
  const tMatches = [...rXml.matchAll(/<w:t\b[^>]*>([\s\S]*?)<\/w:t>/gi)];
  let runText = tMatches.map(m => decodeXmlEntities(m[1])).join('');

  if (!runText) {
    // Check for symbol node: <w:sym w:font="..." w:char="..."/>
    const symMatch = rXml.match(/<w:sym\b[^>]*w:char="([^"]+)"/i);
    if (symMatch) {
      const code = parseInt(symMatch[1], 16);
      if (!isNaN(code)) {
        runText = String.fromCharCode(code);
      }
    }
  }

  if (!runText) return '';

  // Apply formatting
  if (isSubscript) {
    return `<sub>${runText}</sub>`;
  }
  if (isSuperscript) {
    return `<sup>${runText}</sup>`;
  }
  if (isBold && isItalic) {
    return `***${runText}***`;
  }
  if (isBold) {
    return `**${runText}**`;
  }
  if (isItalic) {
    return `*${runText}*`;
  }

  return runText;
}

/**
 * Extracts image relationship ID and emits markdown ![image](dataUrl)
 */
function extractImageFromNode(nodeXml: string, imageMap: Map<string, string>): string {
  const blipMatch = nodeXml.match(/(?:r:embed|r:id)="([^"]+)"/i);
  if (blipMatch) {
    const rId = blipMatch[1];
    const dataUrl = imageMap.get(rId);
    if (dataUrl) {
      return `\n\n![Hinh_anh_minh_hoa](${dataUrl})\n\n`;
    }
  }
  return '';
}

/**
 * Parses a table (<w:tbl>), preserving paragraphs, equations and formulas in each cell
 */
function parseTableContent(
  tblXml: string,
  imageMap: Map<string, string>,
  onEquationFound?: () => void
): { mdTable: string; structuredRows: string[][]; plainParagraphs: string[] } {
  const structuredRows: string[][] = [];
  const plainParagraphs: string[] = [];

  const trMatches = [...tblXml.matchAll(/<w:tr\b[^>]*>([\s\S]*?)<\/w:tr>/gi)];

  for (const tr of trMatches) {
    const rowXml = tr[1];
    const cellMatches = [...rowXml.matchAll(/<w:tc\b[^>]*>([\s\S]*?)<\/w:tc>/gi)];
    const rowCells: string[] = [];

    for (const tc of cellMatches) {
      const tcXml = tc[1];
      // A cell contains one or more paragraphs <w:p>
      const pMatches = [...tcXml.matchAll(/<w:p\b[^>]*>([\s\S]*?)<\/w:p>/gi)];
      let cellText = '';

      if (pMatches.length > 0) {
        const cellLines = pMatches
          .map(p => parseParagraphContent(p[1], imageMap, onEquationFound).trim())
          .filter(Boolean);
        plainParagraphs.push(...cellLines);
        cellText = cellLines.join(' ').trim();
      } else {
        cellText = parseParagraphContent(tcXml, imageMap, onEquationFound).trim();
        if (cellText) plainParagraphs.push(cellText);
      }

      // Escape pipes in cell text to not break markdown tables
      cellText = cellText.replace(/\|/g, '/').replace(/\s+/g, ' ');
      rowCells.push(cellText);
    }

    if (rowCells.length > 0 && rowCells.some(c => c.length > 0)) {
      structuredRows.push(rowCells);
    }
  }

  if (structuredRows.length === 0) {
    return { mdTable: '', structuredRows: [], plainParagraphs: [] };
  }

  // Normalize column count across all rows
  const maxCols = Math.max(...structuredRows.map(r => r.length));
  const normalizedRows = structuredRows.map(r => {
    const copy = [...r];
    while (copy.length < maxCols) copy.push('');
    return copy;
  });

  let mdTable = '\n\n';
  mdTable += '| ' + normalizedRows[0].join(' | ') + ' |\n';
  mdTable += '|' + Array(maxCols).fill('---').join('|') + '|\n';
  for (let i = 1; i < normalizedRows.length; i++) {
    mdTable += '| ' + normalizedRows[i].join(' | ') + ' |\n';
  }
  mdTable += '\n';

  return { mdTable, structuredRows: normalizedRows, plainParagraphs };
}

/**
 * Fallback extractor when XML structure is slightly irregular
 */
function fallbackExtractTextAndMath(xml: string, _imageMap: Map<string, string>): string {
  // Replace <m:oMath> with converted LaTeX
  let text = xml.replace(/<m:oMath\b[^>]*>([\s\S]*?)<\/m:oMath>/gi, (_m, inner) => {
    const latex = convertOmmlToLatex(inner);
    return ` $${latex}$ `;
  });

  // Convert subscripts and superscripts
  text = text.replace(/<w:r\b[^>]*>[\s\S]*?<w:vertAlign\b[^>]*w:val="subscript"[^>]*\/>[\s\S]*?<w:t\b[^>]*>([\s\S]*?)<\/w:t>[\s\S]*?<\/w:r>/gi, '<sub>$1</sub>');
  text = text.replace(/<w:r\b[^>]*>[\s\S]*?<w:vertAlign\b[^>]*w:val="superscript"[^>]*\/>[\s\S]*?<w:t\b[^>]*>([\s\S]*?)<\/w:t>[\s\S]*?<\/w:r>/gi, '<sup>$1</sup>');

  // Extract remaining <w:t>
  const tokens = [...text.matchAll(/<w:t\b[^>]*>([\s\S]*?)<\/w:t>|(<sub>[\s\S]*?<\/sub>|<sup>[\s\S]*?<\/sup>|\$[^\$]+\$)/gi)];
  return tokens.map(t => decodeXmlEntities(t[1] || t[2] || '')).join('').trim();
}

/**
 * ============================================================================
 * OMML TO LATEX CONVERSION ENGINE
 * ============================================================================
 * Converts Microsoft Word Office Math XML nodes into precise LaTeX strings.
 * Supports:
 * - Fractions (<m:f>)
 * - Subscripts (<m:sSub>)
 * - Superscripts (<m:sSup>)
 * - Subscripts and Superscripts (<m:sSubSup>)
 * - Radicals / Square Roots (<m:rad>)
 * - Delimiters / Parentheses / Brackets (<m:d>)
 * - N-ary operators (<m:nary>: \sum, \int, \prod)
 * - Functions (<m:func>: lim, log, sin, cos)
 * - Upper/Lower limits on arrows (<m:limUpp>, <m:limLow> for \xrightarrow{t^\circ})
 * - Accents & Overlines (<m:acc>, <m:bar>)
 * - Matrices & Equation Arrays (<m:m>, <m:eqArr>)
 * - Chemical arrows, equilibrium, Greek letters, and math symbols
 */
export function convertOmmlToLatex(ommlXml: string): string {
  if (!ommlXml) return '';

  // Clean wrapper if whole oMath tag was passed
  const cleanXml = ommlXml.replace(/^<m:oMath\b[^>]*>|<\/m:oMath>$/gi, '');

  return parseOmmlNode(cleanXml).trim();
}

/**
 * Recursively parses OMML nodes and constructs the LaTeX string
 */
function parseOmmlNode(xml: string): string {
  if (!xml) return '';

  let latex = '';

  // Match all top-level OMML tags inside this fragment
  const nodeRegex = /<m:([a-zA-Z0-9]+)\b([^>]*)>([\s\S]*?)<\/m:\1>|<m:([a-zA-Z0-9]+)\b([^>]*)\/>/gi;
  let lastIndex = 0;
  const matches = [...xml.matchAll(nodeRegex)];

  if (matches.length === 0) {
    // Pure text or characters
    return cleanMathText(xml.replace(/<[^>]+>/g, ''));
  }

  for (const match of matches) {
    const tagName = (match[1] || match[4] || '').toLowerCase();
    const tagAttrs = match[2] || match[5] || '';
    const inner = match[3] || '';

    switch (tagName) {
      // 1. Math Run (<m:r>)
      case 'r': {
        const tMatch = inner.match(/<m:t\b[^>]*>([\s\S]*?)<\/m:t>/i);
        if (tMatch) {
          const rawText = decodeXmlEntities(tMatch[1]);
          latex += cleanMathText(rawText);
        }
        break;
      }

      // 2. Fractions (<m:f>) -> \frac{num}{den}
      case 'f': {
        const numXml = getOmmlChild(inner, 'num');
        const denXml = getOmmlChild(inner, 'den');
        const numLatex = parseOmmlNode(numXml);
        const denLatex = parseOmmlNode(denXml);
        latex += `\\frac{${numLatex || '1'}}{${denLatex || '1'}}`;
        break;
      }

      // 3. Subscripts (<m:sSub>) -> {base}_{sub}
      case 'ssub': {
        const baseXml = getOmmlChild(inner, 'e');
        const subXml = getOmmlChild(inner, 'sub');
        const baseLatex = parseOmmlNode(baseXml);
        const subLatex = parseOmmlNode(subXml);
        latex += `{${baseLatex}}_{${subLatex}}`;
        break;
      }

      // 4. Superscripts (<m:sSup>) -> {base}^{sup}
      case 'ssup': {
        const baseXml = getOmmlChild(inner, 'e');
        const supXml = getOmmlChild(inner, 'sup');
        const baseLatex = parseOmmlNode(baseXml);
        const supLatex = parseOmmlNode(supXml);
        latex += `{${baseLatex}}^{${supLatex}}`;
        break;
      }

      // 5. Subscript-Superscript (<m:sSubSup>) -> {base}_{sub}^{sup}
      case 'ssubsup': {
        const baseXml = getOmmlChild(inner, 'e');
        const subXml = getOmmlChild(inner, 'sub');
        const supXml = getOmmlChild(inner, 'sup');
        const baseLatex = parseOmmlNode(baseXml);
        const subLatex = parseOmmlNode(subXml);
        const supLatex = parseOmmlNode(supXml);
        latex += `{${baseLatex}}_{${subLatex}}^{${supLatex}}`;
        break;
      }

      // 6. Radicals / Roots (<m:rad>) -> \sqrt[deg]{base}
      case 'rad': {
        const degXml = getOmmlChild(inner, 'deg');
        const baseXml = getOmmlChild(inner, 'e');
        const degLatex = parseOmmlNode(degXml).trim();
        const baseLatex = parseOmmlNode(baseXml);
        if (degLatex) {
          latex += `\\sqrt[${degLatex}]{${baseLatex}}`;
        } else {
          latex += `\\sqrt{${baseLatex}}`;
        }
        break;
      }

      // 7. Delimiters / Parentheses / Brackets (<m:d>)
      case 'd': {
        const dPrMatch = inner.match(/<m:dPr\b[^>]*>([\s\S]*?)<\/m:dPr>/i);
        const dPr = dPrMatch ? dPrMatch[1] : '';
        const begMatch = dPr.match(/<m:begChr\b[^>]*m:val="([^"]*)"/i);
        const endMatch = dPr.match(/<m:endChr\b[^>]*m:val="([^"]*)"/i);
        
        const begChr = begMatch ? begMatch[1] : '(';
        const endChr = endMatch ? endMatch[1] : ')';

        const baseXml = getOmmlChild(inner, 'e');
        const baseLatex = parseOmmlNode(baseXml);

        const leftBracket = begChr === '[' ? '\\left[' : begChr === '{' ? '\\left\\{' : begChr === '|' ? '\\left|' : begChr ? `\\left${begChr}` : '\\left(';
        const rightBracket = endChr === ']' ? '\\right]' : endChr === '}' ? '\\right\\}' : endChr === '|' ? '\\right|' : endChr ? `\\right${endChr}` : '\\right)';
        
        latex += `${leftBracket}${baseLatex}${rightBracket}`;
        break;
      }

      // 8. N-ary Operators (<m:nary>: \sum, \int, \prod)
      case 'nary': {
        const naryPrMatch = inner.match(/<m:naryPr\b[^>]*>([\s\S]*?)<\/m:naryPr>/i);
        const chrMatch = naryPrMatch ? naryPrMatch[1].match(/<m:chr\b[^>]*m:val="([^"]*)"/i) : null;
        const opChar = chrMatch ? chrMatch[1] : '∑';

        const subXml = getOmmlChild(inner, 'sub');
        const supXml = getOmmlChild(inner, 'sup');
        const baseXml = getOmmlChild(inner, 'e');

        const opLatex = opChar === '∫' ? '\\int' : opChar === '∏' ? '\\prod' : '\\sum';
        const subLatex = parseOmmlNode(subXml);
        const supLatex = parseOmmlNode(supXml);
        const baseLatex = parseOmmlNode(baseXml);

        latex += `${opLatex}_{${subLatex}}^{${supLatex}}{${baseLatex}}`;
        break;
      }

      // 9. Functions (<m:func>: lim, log, ln, sin, cos)
      case 'func': {
        const fNameXml = getOmmlChild(inner, 'fName');
        const baseXml = getOmmlChild(inner, 'e');
        const fName = parseOmmlNode(fNameXml).trim();
        const baseLatex = parseOmmlNode(baseXml);
        latex += `\\${fName}{${baseLatex}}`;
        break;
      }

      // 10. Upper Limits on Reactions (<m:limUpp>) e.g. \xrightarrow{t^\circ}
      case 'limupp': {
        const baseXml = getOmmlChild(inner, 'e');
        const limXml = getOmmlChild(inner, 'lim');
        const baseLatex = parseOmmlNode(baseXml).trim();
        const limLatex = parseOmmlNode(limXml).trim();

        // If base is an arrow, convert to \xrightarrow{condition}
        if (baseLatex.includes('\\rightarrow') || baseLatex.includes('→') || baseLatex === '->') {
          latex += `\\xrightarrow{${limLatex}}`;
        } else if (baseLatex.includes('\\rightleftharpoons') || baseLatex.includes('⇌')) {
          latex += `\\overset{${limLatex}}{\\rightleftharpoons}`;
        } else {
          latex += `\\overset{${limLatex}}{${baseLatex}}`;
        }
        break;
      }

      // 11. Lower Limits (<m:limLow>)
      case 'limlow': {
        const baseXml = getOmmlChild(inner, 'e');
        const limXml = getOmmlChild(inner, 'lim');
        const baseLatex = parseOmmlNode(baseXml).trim();
        const limLatex = parseOmmlNode(limXml).trim();

        if (baseLatex.includes('\\rightarrow') || baseLatex.includes('→')) {
          latex += `\\xrightarrow[${limLatex}]{}`;
        } else {
          latex += `\\underset{${limLatex}}{${baseLatex}}`;
        }
        break;
      }

      // 12. Accents & Bars (<m:acc>, <m:bar>)
      case 'acc':
      case 'bar': {
        const baseXml = getOmmlChild(inner, 'e');
        const baseLatex = parseOmmlNode(baseXml);
        const chrMatch = inner.match(/<m:chr\b[^>]*m:val="([^"]*)"/i);
        const chr = chrMatch ? chrMatch[1] : '';

        if (chr === '→' || chr === '⃗') {
          latex += `\\vec{${baseLatex}}`;
        } else if (chr === '^' || chr === '̂') {
          latex += `\\hat{${baseLatex}}`;
        } else {
          latex += `\\overline{${baseLatex}}`;
        }
        break;
      }

      // 13. Group Characters (Overset / Underset)
      case 'groupchr': {
        const baseXml = getOmmlChild(inner, 'e');
        const baseLatex = parseOmmlNode(baseXml);
        const chrMatch = inner.match(/<m:chr\b[^>]*m:val="([^"]*)"/i);
        const posMatch = inner.match(/<m:pos\b[^>]*m:val="([^"]*)"/i);
        const chr = chrMatch ? chrMatch[1] : '';
        const isTop = posMatch ? posMatch[1] === 'top' : true;

        if (isTop) {
          latex += `\\overset{${cleanMathText(chr)}}{${baseLatex}}`;
        } else {
          latex += `\\underset{${cleanMathText(chr)}}{${baseLatex}}`;
        }
        break;
      }

      // 14. Matrix (<m:m>)
      case 'm': {
        const rows = [...inner.matchAll(/<m:mr\b[^>]*>([\s\S]*?)<\/m:mr>/gi)];
        const rowLatexList: string[] = [];
        for (const row of rows) {
          const cells = [...row[1].matchAll(/<m:e\b[^>]*>([\s\S]*?)<\/m:e>/gi)];
          const cellLatexList = cells.map(c => parseOmmlNode(c[1]));
          rowLatexList.push(cellLatexList.join(' & '));
        }
        latex += `\\begin{matrix} ${rowLatexList.join(' \\\\ ')} \\end{matrix}`;
        break;
      }

      // 15. Base Element container (<m:e>)
      case 'e': {
        latex += parseOmmlNode(inner);
        break;
      }

      default: {
        // Traverse unknown container nodes
        if (inner.trim()) {
          latex += parseOmmlNode(inner);
        }
        break;
      }
    }
  }

  return latex;
}

/**
 * Extracts inner XML of a child tag within an OMML element (e.g. <m:num>...</m:num>)
 */
function getOmmlChild(xml: string, childName: string): string {
  const regex = new RegExp(`<m:${childName}\\b[^>]*>([\\s\\S]*?)<\\/m:${childName}>`, 'i');
  const match = xml.match(regex);
  return match ? match[1] : '';
}

/**
 * Converts Unicode math symbols and chemical notation into LaTeX tokens
 */
function cleanMathText(text: string): string {
  if (!text) return '';

  return text
    // Chemical reaction arrows & conditions
    .replace(/⇄|⇆/g, ' \\rightleftarrows ')
    .replace(/⇌/g, ' \\rightleftharpoons ')
    .replace(/→/g, ' \\rightarrow ')
    .replace(/←/g, ' \\leftarrow ')
    .replace(/↔/g, ' \\leftrightarrow ')
    .replace(/⇒/g, ' \\Rightarrow ')
    .replace(/⇔/g, ' \\Leftrightarrow ')
    .replace(/↑/g, ' \\uparrow ')
    .replace(/↓/g, ' \\downarrow ')
    
    // Greek letters
    .replace(/Δ/g, ' \\Delta ')
    .replace(/δ/g, ' \\delta ')
    .replace(/α/g, ' \\alpha ')
    .replace(/β/g, ' \\beta ')
    .replace(/γ/g, ' \\gamma ')
    .replace(/π/g, ' \\pi ')
    .replace(/λ/g, ' \\lambda ')
    .replace(/μ/g, ' \\mu ')
    .replace(/σ/g, ' \\sigma ')
    .replace(/ω/g, ' \\omega ')

    // Math symbols
    .replace(/±/g, ' \\pm ')
    .replace(/∓/g, ' \\mp ')
    .replace(/×/g, ' \\times ')
    .replace(/·|•/g, ' \\cdot ')
    .replace(/÷/g, ' \\div ')
    .replace(/≤/g, ' \\le ')
    .replace(/≥/g, ' \\ge ')
    .replace(/≠/g, ' \\ne ')
    .replace(/≈/g, ' \\approx ')
    .replace(/≡/g, ' \\equiv ')
    .replace(/∞/g, ' \\infty ')
    
    // Units and special symbols
    .replace(/°C/g, ' ^\\circ\\text{C} ')
    .replace(/°/g, ' ^\\circ ')
    .replace(/%/g, '\\%') // Critical: escape % so KaTeX doesn't treat it as comment!
    .replace(/‰/g, ' \\text{‰} ');
}

/**
 * XML entity decoder
 */
function decodeXmlEntities(str: string): string {
  return str
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_m, dec) => String.fromCharCode(parseInt(dec, 10)))
    .replace(/&#x([0-9a-f]+);/gi, (_m, hex) => String.fromCharCode(parseInt(hex, 16)));
}
