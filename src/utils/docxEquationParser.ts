/**
 * DOCX EQUATION PARSER (Real XML DOM + OMML AST -> LaTeX & Rich Chemistry)
 * Module chuyên biệt đọc và chuyển đổi Office Math Markup Language (OMML) bằng XML DOM thực thụ,
 * bảo toàn đầy đủ chỉ số trên/dưới, phân số, căn thức, ngoặc lồng nhau, mũi tên phản ứng kèm điều kiện,
 * ma trận, hệ phương trình, ký hiệu Word, bảng và hình ảnh từ MS Word (.docx).
 */

import JSZip from 'jszip';
import { DOMParser as XmldomParser, XMLSerializer as XmldomSerializer } from '@xmldom/xmldom';
import { RawDocumentTable } from './answerExtractionEngine/types';

export interface DocxEquationWarning {
  tagName: string;
  message: string;
  rawXml: string;
  blockSnippet?: string;
}

export interface DocxParseResult {
  fullMarkdownText: string;
  tables: RawDocumentTable[];
  images: Map<string, string>; // rId -> base64 Data URL
  equationCount: number;
  warnings: DocxEquationWarning[];
  headersAndFooters?: string[];
}

interface OmmlContext {
  warnings: DocxEquationWarning[];
  blockContext?: string;
}

const ELEMENT_NODE = 1;

const ARROW_TO_KATEX: Record<string, string> = {
  '→': '\\xrightarrow',
  '⟶': '\\xrightarrow',
  '➔': '\\xrightarrow',
  '➜': '\\xrightarrow',
  '➝': '\\xrightarrow',
  '➞': '\\xrightarrow',
  '➡': '\\xrightarrow',
  '->': '\\xrightarrow',
  '\\rightarrow': '\\xrightarrow',
  '\\longrightarrow': '\\xrightarrow',
  '←': '\\xleftarrow',
  '⟵': '\\xleftarrow',
  '<-': '\\xleftarrow',
  '\\leftarrow': '\\xleftarrow',
  '\\longleftarrow': '\\xleftarrow',
  '↔': '\\xleftrightarrow',
  '⟷': '\\xleftrightarrow',
  '<->': '\\xleftrightarrow',
  '\\leftrightarrow': '\\xleftrightarrow',
  '⇌': '\\xrightleftharpoons',
  '<=>': '\\xrightleftharpoons',
  '\\rightleftharpoons': '\\xrightleftharpoons',
  '⇄': '\\xrightleftarrows',
  '⇆': '\\xrightleftarrows',
  '\\rightleftarrows': '\\xrightleftarrows',
  '⇒': '\\xRightarrow',
  '=>': '\\xRightarrow',
  '\\Rightarrow': '\\xRightarrow',
  '⇐': '\\xLeftarrow',
  '\\Leftarrow': '\\xLeftarrow',
  '⇔': '\\xLeftrightarrow',
  '\\Leftrightarrow': '\\xLeftrightarrow',
  '=': '\\xlongequal',
};

const KNOWN_MATH_FUNCTIONS = new Set([
  'lim',
  'sin',
  'cos',
  'tan',
  'cot',
  'sec',
  'csc',
  'arcsin',
  'arccos',
  'arctan',
  'sinh',
  'cosh',
  'tanh',
  'coth',
  'log',
  'ln',
  'lg',
  'exp',
  'max',
  'min',
  'sup',
  'inf',
  'det',
  'dim',
  'gcd',
  'arg',
  'deg',
  'Pr',
]);

// Map common Symbol/Wingdings font PUA codes used by legacy MS Word files
const SYMBOL_FONT_MAP: Record<number, string> = {
  0xf0ae: '→',
  0xf0ac: '←',
  0xf0ab: '↔',
  0xf0de: '⇒',
  0xf0dc: '⇐',
  0xf0db: '⇔',
  0xf0ad: '↑',
  0xf0af: '↓',
  0xf0b1: '±',
  0xf0b0: '°',
  0xf0b4: '×',
  0xf0b8: '÷',
  0xf0b9: '≠',
  0xf0ba: '≡',
  0xf0bb: '≈',
  0xf0a3: '≤',
  0xf0b3: '≥',
  0xf0a5: '∞',
  0xf0d7: '·',
  0xf044: 'Δ',
  0xf061: 'α',
  0xf062: 'β',
  0xf067: 'γ',
  0xf064: 'δ',
  0xf065: 'ε',
  0xf06c: 'λ',
  0xf06d: 'μ',
  0xf070: 'π',
  0xf072: 'ρ',
  0xf073: 'σ',
  0xf077: 'ω',
};

function parseXmlDom(xml: string): Document {
  if (typeof DOMParser !== 'undefined') {
    try {
      const parser = new DOMParser();
      const doc = parser.parseFromString(xml, 'application/xml');
      const parseErrors = doc.getElementsByTagName('parsererror');
      if (parseErrors.length === 0 && doc.documentElement) {
        return doc;
      }
    } catch {
      // Fallback to @xmldom/xmldom below
    }
  }
  const xmlParser = new XmldomParser({
    onError: () => {
      // Tolerate minor Word OOXML namespace quirks
    },
  });
  return xmlParser.parseFromString(xml, 'application/xml') as unknown as Document;
}

function serializeXmlNode(node: Node): string {
  try {
    if (typeof XMLSerializer !== 'undefined') {
      return new XMLSerializer().serializeToString(node);
    }
    return new XmldomSerializer().serializeToString(node as any);
  } catch {
    return '';
  }
}

function getLocalName(node: Node | null | undefined): string {
  if (!node || node.nodeType !== ELEMENT_NODE) return '';
  const el = node as Element;
  const raw = el.localName || el.nodeName || '';
  const colonIdx = raw.indexOf(':');
  return (colonIdx >= 0 ? raw.slice(colonIdx + 1) : raw).toLowerCase();
}

function getNodePrefix(node: Node | null | undefined): string {
  if (!node || node.nodeType !== ELEMENT_NODE) return '';
  const raw = (node as Element).nodeName || '';
  const colonIdx = raw.indexOf(':');
  return colonIdx >= 0 ? raw.slice(0, colonIdx).toLowerCase() : '';
}

function getDirectElements(parent: Node | null | undefined): Element[] {
  if (!parent || !parent.childNodes) return [];
  const out: Element[] = [];
  for (let i = 0; i < parent.childNodes.length; i++) {
    const ch = parent.childNodes[i];
    if (ch.nodeType === ELEMENT_NODE) {
      out.push(ch as Element);
    }
  }
  return out;
}

function getDirectChildrenByLocal(parent: Node | null | undefined, localName: string): Element[] {
  const target = localName.toLowerCase();
  return getDirectElements(parent).filter(el => getLocalName(el) === target);
}

function getDirectChildByLocal(parent: Node | null | undefined, localName: string): Element | null {
  const target = localName.toLowerCase();
  for (const el of getDirectElements(parent)) {
    if (getLocalName(el) === target) return el;
  }
  return null;
}

function getAttr(el: Element | null | undefined, attrLocalName: string): string | null {
  if (!el || !el.attributes) return null;
  const target = attrLocalName.toLowerCase();
  for (let i = 0; i < el.attributes.length; i++) {
    const attr = el.attributes[i];
    const name = (attr.localName || attr.name.split(':').pop() || '').toLowerCase();
    if (name === target) {
      return attr.value;
    }
  }
  return null;
}

function findDescendantByLocal(root: Element, localName: string): Element | null {
  const target = localName.toLowerCase();
  const stack: Element[] = [root];
  while (stack.length > 0) {
    const curr = stack.shift()!;
    for (const child of getDirectElements(curr)) {
      if (getLocalName(child) === target) return child;
      stack.push(child);
    }
  }
  return null;
}

function isTogglePropOn(rPr: Element | null, propLocalName: string): boolean {
  if (!rPr) return false;
  const prop = getDirectChildByLocal(rPr, propLocalName);
  if (!prop) return false;
  const val = getAttr(prop, 'val');
  if (val === null) return true;
  const norm = val.trim().toLowerCase();
  return norm !== '0' && norm !== 'false' && norm !== 'off' && norm !== 'none';
}

/**
 * Main function: Unzips DOCX, extracts relationships & media, parses document.xml + footnotes/headers/footers
 */
export async function parseDocxWithEquations(arrayBuffer: ArrayBuffer): Promise<DocxParseResult> {
  const zip = await JSZip.loadAsync(arrayBuffer);

  // 1. Load document.xml
  const docFile = zip.file('word/document.xml');
  if (!docFile) {
    throw new Error('File không hợp lệ: Không tìm thấy word/document.xml trong file DOCX.');
  }
  const documentXml = await docFile.async('string');

  // 2. Load relationships (document + header/footer/footnotes rels if present)
  const imageMap = new Map<string, string>(); // rId -> base64 Data URL
  const relFiles = [
    'word/_rels/document.xml.rels',
    ...Object.keys(zip.files).filter(name => /^word\/_rels\/(header|footer|footnotes|endnotes).*\.rels$/i.test(name)),
  ];

  for (const relPath of relFiles) {
    const relsFile = zip.file(relPath);
    if (!relsFile) continue;
    try {
      const relsXml = await relsFile.async('string');
      const relDoc = parseXmlDom(relsXml);
      const root = relDoc.documentElement;
      if (!root) continue;

      for (const relEl of getDirectElements(root)) {
        if (getLocalName(relEl) !== 'relationship') continue;
        const rId = getAttr(relEl, 'id');
        const type = getAttr(relEl, 'type') || '';
        const target = getAttr(relEl, 'target') || '';

        if (rId && target && type.includes('/image') && !imageMap.has(rId)) {
          let targetPath = target.replace(/^\/+/, '');
          if (targetPath.startsWith('../')) {
            targetPath = targetPath.replace(/^(\.\.\/)+/, '');
          }
          if (!targetPath.startsWith('word/')) {
            targetPath = 'word/' + targetPath;
          }

          const imgZipFile = zip.file(targetPath);
          if (imgZipFile) {
            const ext = targetPath.split('.').pop()?.toLowerCase() || 'png';
            const mimeType =
              ext === 'jpg' || ext === 'jpeg'
                ? 'image/jpeg'
                : ext === 'png'
                ? 'image/png'
                : ext === 'gif'
                ? 'image/gif'
                : ext === 'svg'
                ? 'image/svg+xml'
                : ext === 'webp'
                ? 'image/webp'
                : 'image/png';
            const base64Data = await imgZipFile.async('base64');
            imageMap.set(rId, `data:${mimeType};base64,${base64Data}`);
          }
        }
      }
    } catch (e) {
      console.warn(`Error reading relationships (${relPath}):`, e);
    }
  }

  // 3. Parse main Document XML
  const result = parseDocumentXml(documentXml, imageMap);

  // 4. Parse footnotes/endnotes if present and append meaningful notes/equations
  const notePaths = ['word/footnotes.xml', 'word/endnotes.xml'];
  for (const notePath of notePaths) {
    const noteFile = zip.file(notePath);
    if (!noteFile) continue;
    try {
      const noteXml = await noteFile.async('string');
      const noteParsed = parsePartXmlBlocks(noteXml, imageMap);
      if (noteParsed.blocks.length > 0) {
        result.fullMarkdownText = [result.fullMarkdownText, ...noteParsed.blocks].filter(Boolean).join('\n\n');
        result.equationCount += noteParsed.equationCount;
        result.warnings.push(...noteParsed.warnings);
      }
    } catch (e) {
      console.warn(`Warning reading ${notePath}:`, e);
    }
  }

  // 5. Parse headers/footers cleanly without injecting page numbers into question body
  const headerFooterPaths = Object.keys(zip.files)
    .filter(name => /^word\/(header|footer)\d*\.xml$/i.test(name))
    .sort();
  const headersAndFooters: string[] = [];
  for (const hfPath of headerFooterPaths) {
    const hfFile = zip.file(hfPath);
    if (!hfFile) continue;
    try {
      const hfXml = await hfFile.async('string');
      const hfParsed = parsePartXmlBlocks(hfXml, imageMap);
      const meaningful = hfParsed.blocks
        .map(b => b.trim())
        .filter(b => b && !/^(?:trang\s*)?\d+(?:\s*\/\s*\d+)?$/i.test(b));
      if (meaningful.length > 0) {
        headersAndFooters.push(...meaningful);
        result.equationCount += hfParsed.equationCount;
        result.warnings.push(...hfParsed.warnings);
      }
    } catch {
      // ignore non-critical header/footer parse errors
    }
  }
  if (headersAndFooters.length > 0) {
    result.headersAndFooters = headersAndFooters;
  }

  return result;
}

function parsePartXmlBlocks(
  xml: string,
  imageMap: Map<string, string>
): { blocks: string[]; equationCount: number; warnings: DocxEquationWarning[] } {
  const doc = parseXmlDom(xml);
  const root = doc.documentElement;
  if (!root) return { blocks: [], equationCount: 0, warnings: [] };

  const blocks: string[] = [];
  const warnings: DocxEquationWarning[] = [];
  let equationCount = 0;

  const visitNoteContainer = (node: Element) => {
    for (const child of getDirectElements(node)) {
      const loc = getLocalName(child);
      if (loc === 'footnote' || loc === 'endnote') {
        const type = getAttr(child, 'type');
        if (type === 'separator' || type === 'continuationSeparator') continue;
        visitNoteContainer(child);
      } else if (loc === 'p') {
        const t = parseParagraphElement(child, imageMap, {
          onEquationFound: () => {
            equationCount++;
          },
          warnings,
        });
        if (t.trim()) blocks.push(t.trim());
      } else if (loc === 'tbl') {
        const { mdTable, structuredRows, plainParagraphs } = parseTableElement(child, imageMap, {
          onEquationFound: () => {
            equationCount++;
          },
          warnings,
        });
        if (structuredRows.length > 0) {
          const maxCols = Math.max(...structuredRows.map(r => r.length));
          if (maxCols === 1 && plainParagraphs.length > 0) {
            blocks.push(plainParagraphs.join('\n\n'));
          } else {
            blocks.push(mdTable);
          }
        }
      }
    }
  };

  visitNoteContainer(root);
  return { blocks, equationCount, warnings };
}

/**
 * Parses document.xml content into rich markdown with KaTeX equations ($...$, $$...$$),
 * HTML sub/sup/u/s, tables, images, and OMML diagnostics.
 */
export function parseDocumentXml(xml: string, imageMap: Map<string, string>): DocxParseResult {
  const tables: RawDocumentTable[] = [];
  const warnings: DocxEquationWarning[] = [];
  let equationCount = 0;

  const doc = parseXmlDom(xml);
  const root = doc.documentElement;
  const body = root ? getDirectChildByLocal(root, 'body') || root : null;

  const markdownBlocks: string[] = [];

  const processBlockContainer = (container: Element) => {
    for (const el of getDirectElements(container)) {
      const loc = getLocalName(el);

      if (loc === 'del' || loc === 'movefrom' || loc === 'sectpr' || loc === 'bookmarkstart' || loc === 'bookmarkend') {
        continue;
      }

      if (loc === 'sdt') {
        const sdtContent = getDirectChildByLocal(el, 'sdtcontent');
        if (sdtContent) processBlockContainer(sdtContent);
        continue;
      }

      if (loc === 'ins' || loc === 'smarttag' || loc === 'customxml' || loc === 'moveto') {
        processBlockContainer(el);
        continue;
      }

      if (loc === 'p') {
        const pText = parseParagraphElement(el, imageMap, {
          onEquationFound: () => {
            equationCount++;
          },
          warnings,
        });
        if (pText.trim().length > 0) {
          markdownBlocks.push(pText.trim());
        }
      } else if (loc === 'tbl') {
        const { mdTable, structuredRows, plainParagraphs } = parseTableElement(el, imageMap, {
          onEquationFound: () => {
            equationCount++;
          },
          warnings,
        });
        if (structuredRows.length > 0) {
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
  };

  if (body) {
    processBlockContainer(body);
  }

  const fullMarkdownText = markdownBlocks.join('\n\n');

  return {
    fullMarkdownText,
    tables,
    images: imageMap,
    equationCount,
    warnings,
  };
}

interface ParagraphToken {
  kind: 'text' | 'sub' | 'sup' | 'math' | 'raw' | 'break';
  text: string;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  strike?: boolean;
}

interface ParagraphParseOptions {
  onEquationFound?: () => void;
  warnings: DocxEquationWarning[];
}

/**
 * Parses a <w:p> DOM Element cleanly handling nested runs, OMML equations, fields, tracked changes, and images.
 */
function parseParagraphElement(
  pEl: Element,
  imageMap: Map<string, string>,
  opts: ParagraphParseOptions
): string {
  const tokens: ParagraphToken[] = [];
  let fieldDepth = 0;
  let inFieldResult = false;
  let capturedFieldInstr = '';

  const visitInlineContainer = (container: Element) => {
    for (const child of getDirectElements(container)) {
      const loc = getLocalName(child);
      const prefix = getNodePrefix(child);

      if (
        loc === 'ppr' ||
        loc === 'del' ||
        loc === 'movefrom' ||
        loc === 'bookmarkstart' ||
        loc === 'bookmarkend' ||
        loc === 'prooferr' ||
        loc === 'permstart' ||
        loc === 'permend'
      ) {
        continue;
      }

      // Office Math Paragraph or Inline Math
      if ((prefix === 'm' || !prefix) && (loc === 'omathpara' || loc === 'omath')) {
        opts.onEquationFound?.();
        const ommlCtx: OmmlContext = {
          warnings: opts.warnings,
          blockContext: tokens
            .map(t => t.text)
            .join('')
            .replace(/^(?:Câu|Bài)\s+\d+[.:–—\-]*\s*/i, '')
            .trim()
            .slice(-45),
        };
        const latex = loc === 'omathpara' ? convertOmmlParaElement(child, ommlCtx) : convertOmmlElement(child, ommlCtx);
        if (latex.trim()) {
          tokens.push({ kind: 'math', text: latex.trim() });
        }
        continue;
      }

      // Hyperlink, SDT, Insertion, SmartTag containers inside paragraph
      if (loc === 'hyperlink' || loc === 'ins' || loc === 'smarttag' || loc === 'customxml' || loc === 'moveto') {
        visitInlineContainer(child);
        continue;
      }

      if (loc === 'sdt') {
        const sdtContent = getDirectChildByLocal(child, 'sdtcontent');
        if (sdtContent) visitInlineContainer(sdtContent);
        continue;
      }

      if (loc === 'fldsimple') {
        const instr = getAttr(child, 'instr') || '';
        const eqLatex = tryParseWordEqField(instr);
        if (eqLatex) {
          opts.onEquationFound?.();
          tokens.push({ kind: 'math', text: eqLatex });
        } else {
          visitInlineContainer(child);
        }
        continue;
      }

      // Drawing directly inside paragraph
      if (loc === 'drawing' || loc === 'pict') {
        const imgMd = extractImageFromElement(child, imageMap);
        if (imgMd) tokens.push({ kind: 'raw', text: imgMd });
        continue;
      }

      // Word Run (<w:r>)
      if (loc === 'r') {
        const fldChar = getDirectChildByLocal(child, 'fldchar');
        if (fldChar) {
          const fType = (getAttr(fldChar, 'fldchartype') || '').toLowerCase();
          if (fType === 'begin') {
            fieldDepth++;
            inFieldResult = false;
            capturedFieldInstr = '';
            continue;
          }
          if (fType === 'separate') {
            inFieldResult = true;
            const eqLatex = tryParseWordEqField(capturedFieldInstr);
            if (eqLatex) {
              opts.onEquationFound?.();
              tokens.push({ kind: 'math', text: eqLatex });
              // Mark fieldDepth > 0 and skip duplicate display text if EQ parsed
              capturedFieldInstr = '__EQ_HANDLED__';
            }
            continue;
          }
          if (fType === 'end') {
            if (capturedFieldInstr && capturedFieldInstr !== '__EQ_HANDLED__') {
              const eqLatex = tryParseWordEqField(capturedFieldInstr);
              if (eqLatex) {
                opts.onEquationFound?.();
                tokens.push({ kind: 'math', text: eqLatex });
              }
            }
            fieldDepth = Math.max(0, fieldDepth - 1);
            inFieldResult = false;
            capturedFieldInstr = '';
            continue;
          }
        }

        const instrEl = getDirectChildByLocal(child, 'instrtext');
        if (instrEl) {
          capturedFieldInstr += instrEl.textContent || '';
          continue;
        }

        if (fieldDepth > 0 && !inFieldResult) {
          continue;
        }
        if (fieldDepth > 0 && capturedFieldInstr === '__EQ_HANDLED__') {
          continue;
        }

        parseRunElementIntoTokens(child, imageMap, tokens, opts);
      }
    }
  };

  visitInlineContainer(pEl);

  if (tokens.length === 0) return '';

  // Check if paragraph is a pure single display equation (only 1 math token + optional whitespace)
  const nonEmptyTokens = tokens.filter(t => t.text.trim().length > 0 || t.kind === 'break');
  const isStandaloneMathPara =
    nonEmptyTokens.length === 1 &&
    nonEmptyTokens[0].kind === 'math' &&
    getDirectChildByLocal(pEl, 'omathpara') !== null;

  if (isStandaloneMathPara) {
    return `$$${nonEmptyTokens[0].text}$$`;
  }

  return serializeParagraphTokens(tokens);
}

function parseRunElementIntoTokens(
  rEl: Element,
  imageMap: Map<string, string>,
  tokens: ParagraphToken[],
  opts: ParagraphParseOptions
): void {
  const rPr = getDirectChildByLocal(rEl, 'rpr');
  const vertAlignEl = rPr ? getDirectChildByLocal(rPr, 'vertalign') : null;
  const vertVal = (getAttr(vertAlignEl, 'val') || '').toLowerCase();

  const isSubscript = vertVal === 'subscript';
  const isSuperscript = vertVal === 'superscript';
  const isBold = isTogglePropOn(rPr, 'b') || isTogglePropOn(rPr, 'bcs');
  const isItalic = isTogglePropOn(rPr, 'i') || isTogglePropOn(rPr, 'ics');
  const isUnderline = isTogglePropOn(rPr, 'u');
  const isStrike = isTogglePropOn(rPr, 'strike') || isTogglePropOn(rPr, 'dstrike');

  for (const child of getDirectElements(rEl)) {
    const loc = getLocalName(child);
    if (loc === 'rpr' || loc === 'deltext' || loc === 'instrtext') continue;

    if (loc === 'br' || loc === 'cr') {
      const brType = (getAttr(child, 'type') || '').toLowerCase();
      if (brType !== 'page') {
        tokens.push({ kind: 'break', text: '\n' });
      }
      continue;
    }

    if (loc === 'tab') {
      tokens.push({ kind: 'text', text: ' ' });
      continue;
    }

    if (loc === 'nobreakhyphen') {
      tokens.push({
        kind: isSubscript ? 'sub' : isSuperscript ? 'sup' : 'text',
        text: '-',
        bold: isBold,
        italic: isItalic,
        underline: isUnderline,
        strike: isStrike,
      });
      continue;
    }

    if (loc === 'drawing' || loc === 'pict') {
      const imgMd = extractImageFromElement(child, imageMap);
      if (imgMd) tokens.push({ kind: 'raw', text: imgMd });
      continue;
    }

    // Embedded legacy OLE Equation object (<w:object>)
    if (loc === 'object') {
      const imgMd = extractImageFromElement(child, imageMap);
      if (imgMd) {
        tokens.push({ kind: 'raw', text: imgMd });
      }
      opts.warnings.push({
        tagName: 'w:object',
        message: 'Phát hiện đối tượng Equation cũ (OLE/MathType). Hệ thống đã giữ ảnh xem trước nếu có; khuyến nghị chuyển sang Word Equation (OMML) để hiển thị công thức sắc nét.',
        rawXml: serializeXmlNode(child).slice(0, 400),
        blockSnippet: tokens
          .map(t => t.text)
          .join('')
          .replace(/^(?:Câu|Bài)\s+\d+[.:–—\-]*\s*/i, '')
          .trim()
          .slice(-45),
      });
      continue;
    }

    if (loc === 'sym') {
      const hexAttr = getAttr(child, 'char');
      if (hexAttr) {
        const code = parseInt(hexAttr, 16);
        if (!isNaN(code)) {
          const symChar = SYMBOL_FONT_MAP[code] || String.fromCharCode(code);
          tokens.push({
            kind: isSubscript ? 'sub' : isSuperscript ? 'sup' : 'text',
            text: symChar,
            bold: isBold,
            italic: isItalic,
            underline: isUnderline,
            strike: isStrike,
          });
        }
      }
      continue;
    }

    if (loc === 't') {
      const txt = child.textContent || '';
      if (!txt) continue;
      tokens.push({
        kind: isSubscript ? 'sub' : isSuperscript ? 'sup' : 'text',
        text: txt,
        bold: isBold,
        italic: isItalic,
        underline: isUnderline,
        strike: isStrike,
      });
    }
  }
}

/**
 * Coalesces adjacent identically-formatted runs and serializes to clean HQTest markup
 */
function serializeParagraphTokens(tokens: ParagraphToken[]): string {
  // 1. Merge adjacent sub/sup/formatted text runs
  const merged: ParagraphToken[] = [];
  for (const tok of tokens) {
    const prev = merged[merged.length - 1];
    if (
      prev &&
      prev.kind === tok.kind &&
      (tok.kind === 'sub' ||
        tok.kind === 'sup' ||
        (tok.kind === 'text' &&
          !!prev.bold === !!tok.bold &&
          !!prev.italic === !!tok.italic &&
          !!prev.underline === !!tok.underline &&
          !!prev.strike === !!tok.strike))
    ) {
      prev.text += tok.text;
    } else {
      merged.push({ ...tok });
    }
  }

  let out = '';
  for (let i = 0; i < merged.length; i++) {
    const tok = merged[i];
    if (tok.kind === 'break') {
      out += '\n';
    } else if (tok.kind === 'raw') {
      out += tok.text;
    } else if (tok.kind === 'math') {
      const needSpaceBefore = out.length > 0 && !/[\s(\[{]$/.test(out);
      const next = merged[i + 1];
      const needSpaceAfter = !!next && !/^[\s.,;:!?)\]}]|^$/.test(next.text);
      out += `${needSpaceBefore ? ' ' : ''}$${tok.text}$${needSpaceAfter ? ' ' : ''}`;
    } else if (tok.kind === 'sub') {
      out += `<sub>${tok.text}</sub>`;
    } else if (tok.kind === 'sup') {
      out += `<sup>${tok.text}</sup>`;
    } else {
      let chunk = tok.text;
      // Preserve whitespace outside inline wrappers so ** bold ** doesn't break markdown parsers
      const leadSpace = chunk.match(/^\s*/)?.[0] || '';
      const trailSpace = chunk.match(/\s*$/)?.[0] || '';
      const core = chunk.slice(leadSpace.length, chunk.length - trailSpace.length);

      if (!core) {
        out += chunk;
        continue;
      }

      let formattedCore = core;
      if (tok.strike) formattedCore = `<s>${formattedCore}</s>`;
      if (tok.underline) formattedCore = `<u>${formattedCore}</u>`;
      if (tok.bold && tok.italic) formattedCore = `***${formattedCore}***`;
      else if (tok.bold) formattedCore = `**${formattedCore}**`;
      else if (tok.italic) formattedCore = `*${formattedCore}*`;

      out += leadSpace + formattedCore + trailSpace;
    }
  }

  return out
    .replace(/\*{4,}/g, '')
    .replace(/[ \t]{2,}/g, ' ');
}

function extractImageFromElement(el: Element, imageMap: Map<string, string>): string {
  const blip = findDescendantByLocal(el, 'blip');
  if (blip) {
    const rId = getAttr(blip, 'embed') || getAttr(blip, 'link');
    if (rId && imageMap.has(rId)) {
      return `\n\n![Hinh_anh_minh_hoa](${imageMap.get(rId)})\n\n`;
    }
  }
  const imageData = findDescendantByLocal(el, 'imagedata');
  if (imageData) {
    const rId = getAttr(imageData, 'id') || getAttr(imageData, 'relid');
    if (rId && imageMap.has(rId)) {
      return `\n\n![Hinh_anh_minh_hoa](${imageMap.get(rId)})\n\n`;
    }
  }
  return '';
}

/**
 * Parses a Word table (<w:tbl>), preserving nested tables, multi-paragraph cells, and OMML equations
 */
function parseTableElement(
  tblEl: Element,
  imageMap: Map<string, string>,
  opts: ParagraphParseOptions
): { mdTable: string; structuredRows: string[][]; plainParagraphs: string[] } {
  const structuredRows: string[][] = [];
  const plainParagraphs: string[] = [];

  for (const trEl of getDirectChildrenByLocal(tblEl, 'tr')) {
    const rowCells: string[] = [];

    for (const tcEl of getDirectChildrenByLocal(trEl, 'tc')) {
      const cellLines: string[] = [];

      const collectCellContent = (container: Element) => {
        for (const ch of getDirectElements(container)) {
          const loc = getLocalName(ch);
          if (loc === 'p') {
            const line = parseParagraphElement(ch, imageMap, opts).trim();
            if (line) cellLines.push(line);
          } else if (loc === 'tbl') {
            // Nested table inside cell: flatten cleanly preserving formulas
            const nested = parseTableElement(ch, imageMap, opts);
            if (nested.plainParagraphs.length > 0) {
              cellLines.push(nested.plainParagraphs.join('; '));
            }
          } else if (loc === 'sdt') {
            const sdtContent = getDirectChildByLocal(ch, 'sdtcontent');
            if (sdtContent) collectCellContent(sdtContent);
          } else if (loc === 'ins' || loc === 'smarttag') {
            collectCellContent(ch);
          }
        }
      };

      collectCellContent(tcEl);
      plainParagraphs.push(...cellLines);

      let cellText = cellLines.join(' ').trim();
      // Protect LaTeX/pipe symbols safely inside Markdown tables
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
 * Legacy Word EQ field parser fallback (e.g., EQ \f(1,2) or EQ \r(3,8))
 */
function tryParseWordEqField(instr: string): string | null {
  const trimmed = instr.trim();
  if (!/^EQ\b/i.test(trimmed)) return null;

  let body = trimmed.replace(/^EQ\s+/i, '').trim();
  // Fraction: \f(num,den)
  body = body.replace(/\\f\s*\(([^,]+),([^)]+)\)/gi, (_m, n, d) => `\\frac{${n.trim()}}{${d.trim()}}`);
  // Radical: \r(deg,rad) or \r(,rad)
  body = body.replace(/\\r\s*\(([^,]*),([^)]+)\)/gi, (_m, deg, rad) =>
    deg.trim() ? `\\sqrt[${deg.trim()}]{${rad.trim()}}` : `\\sqrt{${rad.trim()}}`
  );
  // Superscript/Subscript offsets \s\upN(x) / \s\doN(x)
  body = body.replace(/\\s\\up\d*\(([^)]+)\)/gi, '^{$1}');
  body = body.replace(/\\s\\do\d*\(([^)]+)\)/gi, '_{$1}');

  if (!body || body === trimmed.replace(/^EQ\s+/i, '').trim()) {
    return null;
  }
  return cleanMathText(body);
}

/**
 * ============================================================================
 * OMML TO LATEX CONVERSION ENGINE (XML DOM TREE)
 * ============================================================================
 */

export function convertOmmlToLatex(ommlXml: string): string {
  if (!ommlXml || !ommlXml.trim()) return '';

  const trimmed = ommlXml.trim();
  let xmlToParse = trimmed;

  // Ensure XML namespace declarations exist when fragments are passed standalone
  const hasOmmlWrapper = /^<(?:m:)?(?:oMath|oMathPara)\b/i.test(trimmed);
  if (!hasOmmlWrapper) {
    xmlToParse = `<m:oMath xmlns:m="http://schemas.openxmlformats.org/officeDocument/2006/math" xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">${trimmed}</m:oMath>`;
  } else if (!/xmlns:m=/i.test(trimmed)) {
    xmlToParse = trimmed.replace(
      /^<((?:m:)?(?:oMath|oMathPara))\b([^>]*)>/i,
      '<$1 xmlns:m="http://schemas.openxmlformats.org/officeDocument/2006/math" xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"$2>'
    );
  }

  const doc = parseXmlDom(xmlToParse);
  const root = doc.documentElement;
  if (!root) return '';

  const ctx: OmmlContext = { warnings: [] };
  const loc = getLocalName(root);
  if (loc === 'omathpara') {
    return convertOmmlParaElement(root, ctx).trim();
  }
  return convertOmmlElement(root, ctx).trim();
}

function convertOmmlParaElement(el: Element, ctx: OmmlContext): string {
  const mathChildren = getDirectChildrenByLocal(el, 'omath');
  if (mathChildren.length === 0) {
    return convertOmmlSequence(el, ctx);
  }
  const lines = mathChildren.map(ch => convertOmmlElement(ch, ctx).trim()).filter(Boolean);
  if (lines.length === 0) return '';
  if (lines.length === 1) return lines[0];
  return `\\begin{aligned} ${lines.join(' \\\\ ')} \\end{aligned}`;
}

function convertOmmlElement(el: Element, ctx: OmmlContext): string {
  const loc = getLocalName(el);
  if (loc === 'omath') {
    // Check if <m:brk/> splits this single <m:oMath> into multiple lines
    const children = getDirectElements(el);
    const hasBrk = children.some(ch => getLocalName(ch) === 'brk');
    if (hasBrk) {
      const lines: string[] = [];
      let currentLine = '';
      for (const ch of children) {
        if (getLocalName(ch) === 'brk') {
          if (currentLine.trim()) lines.push(currentLine.trim());
          currentLine = '';
        } else {
          currentLine += convertOmmlNode(ch, ctx);
        }
      }
      if (currentLine.trim()) lines.push(currentLine.trim());
      if (lines.length > 1) {
        return `\\begin{aligned} ${lines.join(' \\\\ ')} \\end{aligned}`;
      }
      return lines[0] || '';
    }
    return convertOmmlSequence(el, ctx);
  }
  return convertOmmlNode(el, ctx);
}

function convertOmmlSequence(container: Element, ctx: OmmlContext): string {
  let out = '';
  for (const child of getDirectElements(container)) {
    const loc = getLocalName(child);
    if (loc === 'ctrlpr' || loc === 'argpr' || loc === 'omathparapr' || loc === 'rpr') {
      continue;
    }
    const piece = convertOmmlNode(child, ctx);
    out = concatMathPieces(out, piece);
  }
  return out;
}

function concatMathPieces(left: string, right: string): string {
  if (!left) return right;
  if (!right) return left;
  // Avoid merging LaTeX command name into following letter, e.g., "\rightarrow" + "Fe" -> "\rightarrow Fe"
  if (/\\[a-zA-Z]+$/.test(left) && /^[a-zA-Z]/.test(right)) {
    return `${left} ${right}`;
  }
  // Keep superscripts/subscripts attached directly to preceding token without stray space
  if (/^[_{^]/.test(right) && left.endsWith(' ')) {
    return left.trimEnd() + right;
  }
  return left + right;
}

function convertOmmlNode(el: Element, ctx: OmmlContext): string {
  const loc = getLocalName(el);

  switch (loc) {
    case 'ctrlpr':
    case 'argpr':
    case 'rpr':
    case 'fpr':
    case 'radpr':
    case 'dpr':
    case 'narypr':
    case 'accpr':
    case 'barpr':
    case 'groupchrpr':
    case 'phantpr':
    case 'borderboxpr':
    case 'boxpr':
    case 'mpr':
    case 'eqarrpr':
    case 'limupppr':
    case 'limlowpr':
    case 'ssubpr':
    case 'ssuppr':
    case 'ssubsuppr':
    case 'sprepr':
    case 'funcpr':
    case 'omathparapr':
      return '';

    // 1. Math Run (<m:r>)
    case 'r':
      return convertMathRun(el);

    // 2. Container nodes (<m:e>, <m:num>, <m:den>, <m:sub>, <m:sup>, <m:deg>, <m:lim>, <m:fname>, <m:box>)
    case 'e':
    case 'num':
    case 'den':
    case 'sub':
    case 'sup':
    case 'deg':
    case 'lim':
    case 'fname':
      return convertOmmlSequence(el, ctx);

    case 'box': {
      const eEl = getDirectChildByLocal(el, 'e');
      return eEl ? convertOmmlSequence(eEl, ctx) : convertOmmlSequence(el, ctx);
    }

    // 3. Fractions (<m:f>)
    case 'f': {
      const fPr = getDirectChildByLocal(el, 'fpr');
      const fTypeEl = fPr ? getDirectChildByLocal(fPr, 'type') : null;
      const fType = (getAttr(fTypeEl, 'val') || 'bar').toLowerCase();

      const numEl = getDirectChildByLocal(el, 'num');
      const denEl = getDirectChildByLocal(el, 'den');
      const numRaw = numEl ? convertOmmlSequence(numEl, ctx).trim() : '';
      const denRaw = denEl ? convertOmmlSequence(denEl, ctx).trim() : '';

      // Word teachers sometimes stack reaction condition over arrow using a noBar fraction
      if (fType === 'nobar') {
        const denArrow = resolveArrowCommand(denRaw);
        if (denArrow && numRaw) {
          return `${denArrow}{${numRaw}}`;
        }
        const numArrow = resolveArrowCommand(numRaw);
        if (numArrow && denRaw) {
          return `${numArrow}[${denRaw}]{}`;
        }
        return `\\genfrac{}{}{0pt}{}{${numRaw || '\\,'}}{${denRaw || '\\,'}}`;
      }

      if (fType === 'skw' || fType === 'lin') {
        return `{}^{${numRaw || '\\,'}}/{}_{${denRaw || '\\,'}}`;
      }

      return `\\frac{${numRaw || '\\,'}}{${denRaw || '\\,'}}`;
    }

    // 4. Subscripts (<m:sSub>)
    case 'ssub': {
      const baseEl = getDirectChildByLocal(el, 'e');
      const subEl = getDirectChildByLocal(el, 'sub');
      const base = baseEl ? convertOmmlSequence(baseEl, ctx) : '';
      const sub = subEl ? convertOmmlSequence(subEl, ctx).trim() : '';
      if (!sub) return base;
      const wrappedBase = base.trim() ? `{${base.trimEnd()}}` : '{}';
      return `${wrappedBase}_{${sub}}`;
    }

    // 5. Superscripts (<m:sSup>)
    case 'ssup': {
      const baseEl = getDirectChildByLocal(el, 'e');
      const supEl = getDirectChildByLocal(el, 'sup');
      const base = baseEl ? convertOmmlSequence(baseEl, ctx) : '';
      const sup = supEl ? convertOmmlSequence(supEl, ctx).trim() : '';
      if (!sup) return base;
      const wrappedBase = base.trim() ? `{${base.trimEnd()}}` : '{}';
      return `${wrappedBase}^{${sup}}`;
    }

    // 6. Subscript-Superscript (<m:sSubSup>)
    case 'ssubsup': {
      const baseEl = getDirectChildByLocal(el, 'e');
      const subEl = getDirectChildByLocal(el, 'sub');
      const supEl = getDirectChildByLocal(el, 'sup');
      const base = baseEl ? convertOmmlSequence(baseEl, ctx) : '';
      const sub = subEl ? convertOmmlSequence(subEl, ctx).trim() : '';
      const sup = supEl ? convertOmmlSequence(supEl, ctx).trim() : '';
      const wrappedBase = base.trim() ? `{${base.trimEnd()}}` : '{}';

      if (sub && sup) return `${wrappedBase}_{${sub}}^{${sup}}`;
      if (sub) return `${wrappedBase}_{${sub}}`;
      if (sup) return `${wrappedBase}^{${sup}}`;
      return base;
    }

    // 7. Pre-Subscript-Superscript (<m:sPre>) e.g. isotopes ^{14}_{6}C
    case 'spre': {
      const baseEl = getDirectChildByLocal(el, 'e');
      const subEl = getDirectChildByLocal(el, 'sub');
      const supEl = getDirectChildByLocal(el, 'sup');
      const base = baseEl ? convertOmmlSequence(baseEl, ctx).trim() : '';
      const sub = subEl ? convertOmmlSequence(subEl, ctx).trim() : '';
      const sup = supEl ? convertOmmlSequence(supEl, ctx).trim() : '';
      const preSub = sub ? `_{${sub}}` : '';
      const preSup = sup ? `^{${sup}}` : '';
      return `{}${preSub}${preSup}${base ? `{${base}}` : ''}`;
    }

    // 8. Radicals (<m:rad>)
    case 'rad': {
      const radPr = getDirectChildByLocal(el, 'radpr');
      const degHideEl = radPr ? getDirectChildByLocal(radPr, 'deghide') : null;
      const degHide = getAttr(degHideEl, 'val') === '1';

      const degEl = getDirectChildByLocal(el, 'deg');
      const baseEl = getDirectChildByLocal(el, 'e');
      const deg = !degHide && degEl ? convertOmmlSequence(degEl, ctx).trim() : '';
      const base = baseEl ? convertOmmlSequence(baseEl, ctx).trim() : '';

      return deg ? `\\sqrt[${deg}]{${base}}` : `\\sqrt{${base}}`;
    }

    // 9. Delimiters / Brackets (<m:d>)
    case 'd': {
      const dPr = getDirectChildByLocal(el, 'dpr');
      const begEl = dPr ? getDirectChildByLocal(dPr, 'begchr') : null;
      const endEl = dPr ? getDirectChildByLocal(dPr, 'endchr') : null;
      const sepEl = dPr ? getDirectChildByLocal(dPr, 'sepchr') : null;

      // Distinguish omitted <m:begChr> (defaults to "(") vs explicit <m:begChr m:val=""/> (left invisible ".")
      const begChr = begEl ? getAttr(begEl, 'val') ?? '(' : '(';
      const endChr = endEl ? getAttr(endEl, 'val') ?? ')' : ')';
      const sepChr = sepEl ? getAttr(sepEl, 'val') ?? '|' : '|';

      const eChildren = getDirectChildrenByLocal(el, 'e');
      const parts = eChildren.map(eCh => convertOmmlSequence(eCh, ctx).trim());
      const sepLatex = sepChr === '|' ? ' \\middle| ' : sepChr ? `${sepChr} ` : ', ';
      const inner = parts.join(sepLatex);

      const leftDelim = mapLeftDelimiter(begChr);
      const rightDelim = mapRightDelimiter(endChr);
      return `${leftDelim}${inner}${rightDelim}`;
    }

    // 10. N-ary operators (<m:nary>)
    case 'nary': {
      const naryPr = getDirectChildByLocal(el, 'narypr');
      const chrEl = naryPr ? getDirectChildByLocal(naryPr, 'chr') : null;
      const subHideEl = naryPr ? getDirectChildByLocal(naryPr, 'subhide') : null;
      const supHideEl = naryPr ? getDirectChildByLocal(naryPr, 'suphide') : null;

      const opChar = chrEl ? getAttr(chrEl, 'val') || '∑' : '∑';
      const subHide = getAttr(subHideEl, 'val') === '1';
      const supHide = getAttr(supHideEl, 'val') === '1';

      const opMap: Record<string, string> = {
        '∑': '\\sum',
        '∏': '\\prod',
        '∐': '\\coprod',
        '∫': '\\int',
        '∬': '\\iint',
        '∭': '\\iiint',
        '∮': '\\oint',
        '⋃': '\\bigcup',
        '⋂': '\\bigcap',
        '⋁': '\\bigvee',
        '⋀': '\\bigwedge',
      };
      const opLatex = opMap[opChar] || '\\sum';

      const subEl = getDirectChildByLocal(el, 'sub');
      const supEl = getDirectChildByLocal(el, 'sup');
      const baseEl = getDirectChildByLocal(el, 'e');

      const sub = !subHide && subEl ? convertOmmlSequence(subEl, ctx).trim() : '';
      const sup = !supHide && supEl ? convertOmmlSequence(supEl, ctx).trim() : '';
      const base = baseEl ? convertOmmlSequence(baseEl, ctx).trim() : '';

      return `${opLatex}${sub ? `_{${sub}}` : ''}${sup ? `^{${sup}}` : ''}${base ? `{${base}}` : ''}`;
    }

    // 11. Functions (<m:func>)
    case 'func': {
      const fNameEl = getDirectChildByLocal(el, 'fname');
      const baseEl = getDirectChildByLocal(el, 'e');
      const rawName = fNameEl ? extractPlainMathName(fNameEl) : '';
      const fLatex = KNOWN_MATH_FUNCTIONS.has(rawName)
        ? `\\${rawName}`
        : rawName
        ? `\\operatorname{${rawName}}`
        : '';
      const base = baseEl ? convertOmmlSequence(baseEl, ctx).trim() : '';
      return `${fLatex} ${base ? `{${base}}` : ''}`.trim();
    }

    // 12. Upper & Lower Limits (<m:limUpp>, <m:limLow>) — handles stacked arrow conditions!
    case 'limupp':
    case 'limlow':
      return convertStackedLimitElement(el, ctx);

    // 13. Accents (<m:acc>) & Bars (<m:bar>)
    case 'acc': {
      const accPr = getDirectChildByLocal(el, 'accpr');
      const chrEl = accPr ? getDirectChildByLocal(accPr, 'chr') : null;
      const chr = chrEl ? getAttr(chrEl, 'val') ?? '\u0302' : '\u0302';
      const baseEl = getDirectChildByLocal(el, 'e');
      const base = baseEl ? convertOmmlSequence(baseEl, ctx).trim() : '';

      if (chr === '→' || chr === '\u20D7') return `\\vec{${base}}`;
      if (chr === '←' || chr === '\u20D6') return `\\overleftarrow{${base}}`;
      if (chr === '↔' || chr === '\u20E1') return `\\overleftrightarrow{${base}}`;
      if (chr === '^' || chr === '\u0302') return `\\hat{${base}}`;
      if (chr === '~' || chr === '\u0303') return `\\tilde{${base}}`;
      if (chr === '˙' || chr === '\u0307') return `\\dot{${base}}`;
      if (chr === '¨' || chr === '\u0308') return `\\ddot{${base}}`;
      return `\\overline{${base}}`;
    }

    case 'bar': {
      const barPr = getDirectChildByLocal(el, 'barpr');
      const posEl = barPr ? getDirectChildByLocal(barPr, 'pos') : null;
      const pos = (getAttr(posEl, 'val') || 'top').toLowerCase();
      const baseEl = getDirectChildByLocal(el, 'e');
      const base = baseEl ? convertOmmlSequence(baseEl, ctx).trim() : '';
      return pos === 'bot' ? `\\underline{${base}}` : `\\overline{${base}}`;
    }

    // 14. Group Characters (<m:groupChr>)
    case 'groupchr': {
      const gPr = getDirectChildByLocal(el, 'groupchrpr');
      const chrEl = gPr ? getDirectChildByLocal(gPr, 'chr') : null;
      const posEl = gPr ? getDirectChildByLocal(gPr, 'pos') : null;
      const chr = chrEl ? getAttr(chrEl, 'val') ?? '⏟' : '⏟';
      const pos = (getAttr(posEl, 'val') || 'bot').toLowerCase();
      const baseEl = getDirectChildByLocal(el, 'e');
      const base = baseEl ? convertOmmlSequence(baseEl, ctx).trim() : '';

      if (chr === '⏞' || chr === '{') {
        return pos === 'top' ? `\\overbrace{${base}}` : `\\underbrace{${base}}`;
      }
      if (chr === '⏟' || chr === '}') {
        return pos === 'top' ? `\\overbrace{${base}}` : `\\underbrace{${base}}`;
      }
      const arrowCmd = resolveArrowCommand(chr);
      if (arrowCmd) {
        return pos === 'bot' ? `${arrowCmd}{${base}}` : `${arrowCmd}[${base}]{}`;
      }
      const chrLatex = cleanMathText(chr).trim();
      return pos === 'top' ? `\\overset{${chrLatex}}{${base}}` : `\\underset{${chrLatex}}{${base}}`;
    }

    // 15. Phantom (<m:phant>)
    case 'phant': {
      const pPr = getDirectChildByLocal(el, 'phantpr');
      const showEl = pPr ? getDirectChildByLocal(pPr, 'show') : null;
      const show = getAttr(showEl, 'val');
      const baseEl = getDirectChildByLocal(el, 'e');
      const base = baseEl ? convertOmmlSequence(baseEl, ctx).trim() : '';
      if (!base) return '';
      if (show === '0' || show === 'false') {
        return `\\phantom{${base}}`;
      }
      return base;
    }

    // 16. BorderBox (<m:borderBox>)
    case 'borderbox': {
      const baseEl = getDirectChildByLocal(el, 'e');
      const base = baseEl ? convertOmmlSequence(baseEl, ctx).trim() : '';
      return `\\boxed{${base}}`;
    }

    // 17. Matrix (<m:m>)
    case 'm': {
      const rows = getDirectChildrenByLocal(el, 'mr');
      const rowLatexList = rows.map(row => {
        const cells = getDirectChildrenByLocal(row, 'e');
        return cells.map(c => convertOmmlSequence(c, ctx).trim()).join(' & ');
      });
      return `\\begin{matrix} ${rowLatexList.join(' \\\\ ')} \\end{matrix}`;
    }

    // 18. Equation Array (<m:eqArr>)
    case 'eqarr': {
      const rows = getDirectChildrenByLocal(el, 'e');
      const rowLatexList = rows.map(r => convertOmmlSequence(r, ctx).trim()).filter(Boolean);
      if (rowLatexList.length === 0) return '';
      if (rowLatexList.length === 1) return rowLatexList[0];
      return `\\begin{aligned} ${rowLatexList.join(' \\\\ ')} \\end{aligned}`;
    }

    // 19. Nested oMath / oMathPara
    case 'omath':
      return convertOmmlElement(el, ctx);
    case 'omathpara':
      return convertOmmlParaElement(el, ctx);

    // 20. Embedded Word runs inside OMML (<w:r>)
    case 'r':
    case 't': {
      if (getNodePrefix(el) === 'w') {
        return convertWordRunInsideMath(el);
      }
      return convertOmmlSequence(el, ctx);
    }

    default: {
      // Unsupported OMML construct: preserve raw XML warning AND extract readable inner content
      const prefix = getNodePrefix(el);
      if (prefix === 'm') {
        ctx.warnings.push({
          tagName: el.nodeName,
          message: `Cấu trúc Word Equation <${el.nodeName}> chưa được hỗ trợ đầy đủ — đã trích xuất nội dung chữ/biểu thức bên trong.`,
          rawXml: serializeXmlNode(el).slice(0, 600),
          blockSnippet: ctx.blockContext,
        });
      }
      return convertOmmlSequence(el, ctx);
    }
  }
}

/**
 * Unwraps nested <m:limUpp> / <m:limLow> stacks so arrows with BOTH upper and lower conditions
 * emit clean extensible KaTeX arrows: \xrightarrow[below]{above}, \xrightleftharpoons[below]{above}, etc.
 */
function convertStackedLimitElement(el: Element, ctx: OmmlContext): string {
  const uppers: string[] = [];
  const lowers: string[] = [];
  let current: Element | null = el;

  while (current) {
    const loc = getLocalName(current);
    if (loc === 'limupp' || loc === 'limlow') {
      const limEl = getDirectChildByLocal(current, 'lim');
      const limLatex = limEl ? convertOmmlSequence(limEl, ctx).trim() : '';
      if (limLatex) {
        if (loc === 'limupp') uppers.push(limLatex);
        else lowers.push(limLatex);
      }
      const baseContainer = getDirectChildByLocal(current, 'e');
      if (!baseContainer) {
        current = null;
        break;
      }
      const innerEls = getDirectElements(baseContainer).filter(
        ch => !['ctrlpr', 'argpr'].includes(getLocalName(ch))
      );
      if (innerEls.length === 1 && ['limupp', 'limlow', 'box'].includes(getLocalName(innerEls[0]))) {
        current = innerEls[0];
        if (getLocalName(current) === 'box') {
          const boxE = getDirectChildByLocal(current, 'e');
          const boxChildren = boxE ? getDirectElements(boxE) : [];
          if (boxChildren.length === 1 && ['limupp', 'limlow'].includes(getLocalName(boxChildren[0]))) {
            current = boxChildren[0];
          } else {
            current = boxE;
            break;
          }
        }
      } else {
        current = baseContainer;
        break;
      }
    } else {
      break;
    }
  }

  const baseLatex = current ? convertOmmlSequence(current, ctx).trim() : '';
  const upperStr = uppers.join(', ');
  const lowerStr = lowers.join(', ');

  // Check if base is a reaction arrow!
  const arrowCmd = resolveArrowCommand(baseLatex);
  if (arrowCmd) {
    if (upperStr && lowerStr) {
      return `${arrowCmd}[${lowerStr}]{${upperStr}}`;
    }
    if (upperStr) {
      return `${arrowCmd}{${upperStr}}`;
    }
    if (lowerStr) {
      return `${arrowCmd}[${lowerStr}]{}`;
    }
  }

  // Standard limit operator like lim, max, min
  if (/^(?:\\)?(?:lim|max|min|sup|inf|limsup|liminf)$/i.test(baseLatex) && lowerStr && !upperStr) {
    const fn = baseLatex.startsWith('\\') ? baseLatex : `\\${baseLatex}`;
    return `${fn}_{${lowerStr}}`;
  }

  // Generic stacked overset / underset
  let result = baseLatex;
  if (upperStr) {
    result = `\\overset{${upperStr}}{${result}}`;
  }
  if (lowerStr) {
    result = `\\underset{${lowerStr}}{${result}}`;
  }
  return result;
}

function resolveArrowCommand(latexOrChar: string): string | null {
  const cleaned = latexOrChar.replace(/\s+/g, '').trim();
  if (!cleaned) return null;
  if (ARROW_TO_KATEX[cleaned]) return ARROW_TO_KATEX[cleaned];
  // Check exact match after trimming braces
  const unwrapped = cleaned.replace(/^\{|\}$/g, '');
  return ARROW_TO_KATEX[unwrapped] || null;
}

function convertMathRun(rEl: Element): string {
  const rPr = getDirectChildByLocal(rEl, 'rpr');
  const isNormalText = !!(rPr && (getDirectChildByLocal(rPr, 'nor') || getAttr(getDirectChildByLocal(rPr, 'sty'), 'val') === 'p'));
  const isBoldMath = !!(rPr && (getAttr(getDirectChildByLocal(rPr, 'sty'), 'val') === 'b' || getAttr(getDirectChildByLocal(rPr, 'sty'), 'val') === 'bi'));

  let rawText = '';
  for (const ch of getDirectElements(rEl)) {
    const loc = getLocalName(ch);
    if (loc === 't') {
      rawText += ch.textContent || '';
    } else if (loc === 'sym') {
      const hexAttr = getAttr(ch, 'char');
      if (hexAttr) {
        const code = parseInt(hexAttr, 16);
        if (!isNaN(code)) {
          rawText += SYMBOL_FONT_MAP[code] || String.fromCharCode(code);
        }
      }
    }
  }

  if (!rawText) return '';

  // Special case: normal text run inside OMML (e.g. " (đặc) ", "đun nóng", "kJ/mol")
  if (isNormalText) {
    return formatNormalRunInsideMath(rawText);
  }

  const converted = cleanMathText(rawText);
  if (isBoldMath && /^[A-Za-z0-9]+$/.test(rawText.trim())) {
    return `\\mathbf{${converted}}`;
  }
  return converted;
}

function convertWordRunInsideMath(el: Element): string {
  const loc = getLocalName(el);
  if (loc === 't') return cleanMathText(el.textContent || '');
  let txt = '';
  for (const tEl of getDirectChildrenByLocal(el, 't')) {
    txt += tEl.textContent || '';
  }
  return cleanMathText(txt);
}

function extractPlainMathName(el: Element): string {
  let out = '';
  for (const ch of getDirectElements(el)) {
    const loc = getLocalName(ch);
    if (loc === 'r') {
      for (const tEl of getDirectChildrenByLocal(ch, 't')) {
        out += tEl.textContent || '';
      }
    } else if (loc === 't') {
      out += ch.textContent || '';
    }
  }
  return out.trim();
}

/**
 * Formats an explicit <m:nor/> / <m:sty m:val="p"/> run inside OMML while preserving symbols like °, →, %
 */
function formatNormalRunInsideMath(text: string): string {
  // If purely symbols or numbers/operators without letters, use cleanMathText
  if (!/[A-Za-zÀ-ỹ]/u.test(text)) {
    return cleanMathText(text);
  }

  // Split around special math symbols/degree signs so ° renders cleanly as ^\circ outside \text{}
  const parts = text.split(/(°C|℃|°|→|⟶|←|⇌|⇄|⇆|↔|↑|↓|±|×|÷|≤|≥|≠|≈|≡|∞|Δ|α|β|γ|δ|π|λ|μ|σ|ω)/g);
  return parts
    .map(part => {
      if (!part) return '';
      if (/^(?:°C|℃|°|→|⟶|←|⇌|⇄|⇆|↔|↑|↓|±|×|÷|≤|≥|≠|≈|≡|∞|Δ|α|β|γ|δ|π|λ|μ|σ|ω)$/.test(part)) {
        return cleanMathText(part);
      }
      const escaped = escapeLatexTextContent(part);
      if (!escaped.trim()) return part.includes(' ') ? ' ' : '';
      return `\\text{${escaped}}`;
    })
    .join('');
}

function escapeLatexTextContent(text: string): string {
  return text
    .replace(/\\/g, '\\textbackslash ')
    .replace(/([%#$&_{}])/g, '\\$1');
}

function mapLeftDelimiter(chr: string): string {
  if (chr === '') return '\\left.';
  if (chr === '[') return '\\left[';
  if (chr === '{') return '\\left\\{';
  if (chr === '|') return '\\left|';
  if (chr === '‖' || chr === '||') return '\\left\\|';
  if (chr === '⟨' || chr === '<') return '\\left\\langle ';
  if (chr === '(') return '\\left(';
  return `\\left${chr}`;
}

function mapRightDelimiter(chr: string): string {
  if (chr === '') return '\\right.';
  if (chr === ']') return '\\right]';
  if (chr === '}') return '\\right\\}';
  if (chr === '|') return '\\right|';
  if (chr === '‖' || chr === '||') return '\\right\\|';
  if (chr === '⟩' || chr === '>') return '\\right\\rangle ';
  if (chr === ')') return '\\right)';
  return `\\right${chr}`;
}

/**
 * Converts Unicode math symbols, Vietnamese phrases inside math runs, and chemical notation into valid LaTeX
 */
function cleanMathText(text: string): string {
  if (!text) return '';

  // 1. Protect segments containing Vietnamese diacritics (plus optional surrounding parens/spaces like " (đặc) ")
  //    so KaTeX preserves Vietnamese accents & spaces instead of collapsing math-italic letters.
  const vietDiacriticSegment = /(?:\s*\([^\)]*[àáảãạăằắẳẵặâầấẩẫậèéẻẽẹêềếểễệìíỉĩịòóỏõọôồốổỗộơờớởỡợùúủũụưừứửữựỳýỷỹỵđĐ][^\)]*\)\s*|\s*[A-Za-zÀ-ỹ]*[àáảãạăằắẳẵặâầấẩẫậèéẻẽẹêềếểễệìíỉĩịòóỏõọôồốổỗộơờớởỡợùúủũụưừứửữựỳýỷỹỵđĐ][A-Za-zÀ-ỹ\s]*(?=\s|$|[.,;)]))/gi;

  const segments: { isViet: boolean; value: string }[] = [];
  let lastIdx = 0;
  for (const m of text.matchAll(vietDiacriticSegment)) {
    const idx = m.index ?? 0;
    if (idx > lastIdx) {
      segments.push({ isViet: false, value: text.slice(lastIdx, idx) });
    }
    segments.push({ isViet: true, value: m[0] });
    lastIdx = idx + m[0].length;
  }
  if (lastIdx < text.length) {
    segments.push({ isViet: false, value: text.slice(lastIdx) });
  }

  return segments
    .map(seg => {
      if (seg.isViet) {
        return `\\text{${escapeLatexTextContent(seg.value)}}`;
      }

      return seg.value
        // Escape LaTeX control chars inside text runs first
        .replace(/%/g, '\\%')
        .replace(/#/g, '\\#')
        .replace(/&/g, '\\&')
        // Chemical reaction arrows
        .replace(/⇄|⇆/g, ' \\rightleftarrows ')
        .replace(/⇌/g, ' \\rightleftharpoons ')
        .replace(/⟶|→|➔|➜|➝|➞|➡/g, ' \\rightarrow ')
        .replace(/⟵|←/g, ' \\leftarrow ')
        .replace(/⟷|↔/g, ' \\leftrightarrow ')
        .replace(/⇒/g, ' \\Rightarrow ')
        .replace(/⇐/g, ' \\Leftarrow ')
        .replace(/⇔/g, ' \\Leftrightarrow ')
        .replace(/↑/g, ' \\uparrow ')
        .replace(/↓/g, ' \\downarrow ')
        // Greek letters
        .replace(/Δ/g, ' \\Delta ')
        .replace(/δ/g, ' \\delta ')
        .replace(/α/g, ' \\alpha ')
        .replace(/β/g, ' \\beta ')
        .replace(/γ/g, ' \\gamma ')
        .replace(/ε/g, ' \\varepsilon ')
        .replace(/π/g, ' \\pi ')
        .replace(/λ/g, ' \\lambda ')
        .replace(/μ/g, ' \\mu ')
        .replace(/ρ/g, ' \\rho ')
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
        .replace(/∈/g, ' \\in ')
        .replace(/∉/g, ' \\notin ')
        .replace(/∀/g, ' \\forall ')
        .replace(/∃/g, ' \\exists ')
        // Temperature & degree symbols (keep attached cleanly without stray leading space before ^)
        .replace(/℃|°C/g, '^\\circ\\text{C}')
        .replace(/°/g, '^\\circ')
        .replace(/‰/g, ' \\text{‰}');
    })
    .join('');
}
