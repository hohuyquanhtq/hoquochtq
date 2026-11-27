/**
 * DOCX EQUATION PARSER (Real XML DOM + OMML AST -> LaTeX & Rich Chemistry)
 * Module chuyên biệt đọc và chuyển đổi Office Math Markup Language (OMML) bằng XML DOM thực thụ,
 * bảo toàn đầy đủ chỉ số trên/dưới, phân số, căn thức, ngoặc lồng nhau, mũi tên phản ứng kèm điều kiện,
 * ma trận, hệ phương trình, ký hiệu Word, bảng và hình ảnh từ MS Word (.docx).
 */

import JSZip from 'jszip';
import mammoth from 'mammoth';
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
  tableCount?: number;
  imageCount?: number;
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
  'limsup',
  'liminf',
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
  'ker',
  'hom',
  'Pr',
]);

const CRITICAL_MATH_OPERATOR_REGEX =
  /\b(arcsin|arccos|arctan|limsup|liminf|sinh|cosh|tanh|coth|log|ln|lg|sin|cos|tan|cot|sec|csc|lim|exp|det|max|min|sup|inf)\b/gi;

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

function getImageMimeTypeFromPath(filePath: string): string {
  const ext = filePath.split('.').pop()?.toLowerCase() || 'png';
  if (ext === 'jpg' || ext === 'jpeg') return 'image/jpeg';
  if (ext === 'png') return 'image/png';
  if (ext === 'gif') return 'image/gif';
  if (ext === 'svg') return 'image/svg+xml';
  if (ext === 'webp') return 'image/webp';
  if (ext === 'bmp') return 'image/bmp';
  return 'image/png';
}

function escapeHtmlAttr(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function buildSafeInlineImgTag(dataUrl: string, alt = 'Hình ảnh minh họa'): string {
  const safeUrl = (dataUrl || '').trim();
  if (!/^data:image\/(?:png|jpeg|jpg|gif|webp|bmp|svg\+xml);base64,[A-Za-z0-9+/=\s]+$/i.test(safeUrl)) {
    return '';
  }
  const compactUrl = safeUrl.replace(/\s+/g, '');
  return `<img src="${compactUrl}" alt="${escapeHtmlAttr(alt)}" class="hq-question-img" />`;
}

/**
 * Extracts HTML and all embedded images as base64 Data URLs using mammoth.images.imgElement.
 * Preserves <img> tags with data:image/... and HTML <table>, <tr>, <td> structure.
 */
export async function extractDocxHtmlWithMammoth(arrayBuffer: ArrayBuffer): Promise<{
  html: string;
  images: string[];
}> {
  const extractedImages: string[] = [];
  const result = await mammoth.convertToHtml(
    { arrayBuffer },
    {
      convertImage: mammoth.images.imgElement(async (image) => {
        const base64 = await image.read('base64');
        const rawMime = (image.contentType || 'image/png').toLowerCase();
        const contentType = /^image\/(png|jpeg|jpg|gif|webp|bmp|svg\+xml)$/.test(rawMime)
          ? rawMime
          : 'image/png';
        const dataUrl = `data:${contentType};base64,${base64}`;
        extractedImages.push(dataUrl);
        const altText = (image as { altText?: string }).altText || 'Hình ảnh minh họa';
        return {
          src: dataUrl,
          alt: altText,
          class: 'hq-question-img',
        };
      }),
    }
  );
  return {
    html: result.value || '',
    images: extractedImages,
  };
}

/**
 * Resolves <mc:AlternateContent> cleanly: prefers <mc:Choice> (modern drawing/OMML),
 * falling back to <mc:Fallback> (VML pict / legacy equation) when Choice yields no content.
 */
function resolveAlternateContentChildren(altEl: Element): Element[] {
  const choice = getDirectChildByLocal(altEl, 'choice');
  const fallback = getDirectChildByLocal(altEl, 'fallback');
  const choiceChildren = choice ? getDirectElements(choice) : [];
  if (choiceChildren.length > 0) {
    return choiceChildren;
  }
  return fallback ? getDirectElements(fallback) : [];
}

/**
 * Main function: Unzips DOCX with JSZip (and supplements with mammoth.images.imgElement),
 * extracts relationships & media as base64, parses document.xml + footnotes/headers/footers
 * while preserving OMML equations, HTML <table>/<tr>/<td>, and inline <img> tags.
 */
export async function parseDocxWithEquations(arrayBuffer: ArrayBuffer): Promise<DocxParseResult> {
  const zip = await JSZip.loadAsync(arrayBuffer);

  // 1. Load document.xml
  const docFile = zip.file('word/document.xml');
  if (!docFile) {
    throw new Error('File không hợp lệ: Không tìm thấy word/document.xml trong file DOCX.');
  }
  const documentXml = await docFile.async('string');

  // 2. Load relationships (document + header/footer/footnotes/endnotes rels) & all media files via JSZip
  const imageMap = new Map<string, string>(); // rId or media basename -> base64 Data URL
  const mediaPathToDataUrl = new Map<string, string>();

  // Pre-index all raster/svg media inside word/media/* so no embedded image is missed
  const mediaFiles = Object.keys(zip.files).filter(
    (name) => /^word\/media\/.+\.(?:png|jpe?g|gif|webp|bmp|svg)$/i.test(name) && !zip.files[name].dir
  );
  for (const mediaPath of mediaFiles) {
    try {
      const f = zip.file(mediaPath);
      if (!f) continue;
      const mimeType = getImageMimeTypeFromPath(mediaPath);
      const base64Data = await f.async('base64');
      const dataUrl = `data:${mimeType};base64,${base64Data}`;
      mediaPathToDataUrl.set(mediaPath.toLowerCase(), dataUrl);
      const baseName = mediaPath.split('/').pop()?.toLowerCase();
      if (baseName && !imageMap.has(`media:${baseName}`)) {
        imageMap.set(`media:${baseName}`, dataUrl);
      }
    } catch (e) {
      console.warn(`Error reading media file (${mediaPath}):`, e);
    }
  }

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

        if (rId && target && (type.includes('/image') || /^media\//i.test(target)) && !imageMap.has(rId)) {
          let targetPath = target.replace(/^\/+/, '');
          if (targetPath.startsWith('../')) {
            targetPath = targetPath.replace(/^(\.\.\/)+/, '');
          }
          if (!targetPath.startsWith('word/')) {
            targetPath = 'word/' + targetPath;
          }

          const cached = mediaPathToDataUrl.get(targetPath.toLowerCase());
          if (cached) {
            imageMap.set(rId, cached);
            continue;
          }

          const imgZipFile = zip.file(targetPath);
          if (imgZipFile) {
            const mimeType = getImageMimeTypeFromPath(targetPath);
            const base64Data = await imgZipFile.async('base64');
            const dataUrl = `data:${mimeType};base64,${base64Data}`;
            imageMap.set(rId, dataUrl);
            mediaPathToDataUrl.set(targetPath.toLowerCase(), dataUrl);
          }
        }
      }
    } catch (e) {
      console.warn(`Error reading relationships (${relPath}):`, e);
    }
  }

  // Supplement with mammoth.images.imgElement when JSZip rels yield no images but media/embeddings exist
  if (imageMap.size === 0 && Object.keys(zip.files).some((name) => /^word\/(?:media|embeddings)\//i.test(name))) {
    try {
      const mammothRes = await extractDocxHtmlWithMammoth(arrayBuffer);
      mammothRes.images.forEach((dataUrl, idx) => {
        imageMap.set(`mammoth_img_${idx + 1}`, dataUrl);
      });
    } catch {
      // Non-fatal supplement failure
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
        const { htmlTable, structuredRows, plainParagraphs, isOptionLayoutTable } = parseTableElement(child, imageMap, {
          onEquationFound: () => {
            equationCount++;
          },
          warnings,
        });
        if (structuredRows.length > 0) {
          const maxCols = Math.max(...structuredRows.map(r => r.length));
          if ((maxCols === 1 || isOptionLayoutTable) && plainParagraphs.length > 0) {
            blocks.push(plainParagraphs.join('\n'));
          } else if (htmlTable) {
            blocks.push(htmlTable);
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
  let currentPartScopeHeader: string | undefined;
  let currentMetaHeader: string | undefined;
  let sawQuestionSincePartHeader = false;

  const getCombinedSectionHeader = (): string | undefined => {
    const parts = [currentPartScopeHeader, currentMetaHeader].filter(Boolean);
    return parts.length > 0 ? parts.join(' | ').slice(0, 200) : undefined;
  };

  const updateSectionHeader = (text: string) => {
    const clean = text.replace(/\*\*|\*|<u>|<\/u>|<s>|<\/s>/gi, '').trim();
    if (!clean) return;

    // End-of-exam marker resets stale exam-body part scope so answer section starts fresh
    if (/^[\-–—*_\s|]*HẾT[\-–—*_\s|]*$/i.test(clean)) {
      currentPartScopeHeader = undefined;
      currentMetaHeader = undefined;
      sawQuestionSincePartHeader = false;
      return;
    }

    const isExplicitPartHeader =
      /(?:(?:PHẦN|PHAN|MỤC|MUC)\s+(?:III|II|I|Ⅲ|Ⅱ|Ⅰ|3|2|1)\b|^(?:III|II|I)\.\s*(?:TRẮC\s*NGHIỆM|CÂU\s+TRẮC\s*NGHIỆM|ĐÚNG\s*[-–\/]?\s*SAI|TRẢ\s*LỜI\s*NGẮN)|TRẮC\s*NGHIỆM\s+(?:4|BỐN|NHIỀU)\s+(?:LỰA\s+CHỌN|PHƯƠNG\s+ÁN)|ĐÚNG\s*[-–\/]?\s*SAI|TRẢ\s*LỜI\s*NGẮN)/i.test(
        clean
      );
    const isVariantCodeHeader = /\bMÃ\s*ĐỀ(?:\s*THI)?\s*[:\-–]?\s*[A-Z0-9]{2,6}\b/i.test(clean);
    const isGenericAnswerBanner =
      /^(?:[\-–—*_\s]*)(?:BẢNG\s+ĐÁP\s*ÁN|ĐÁP\s*ÁN(?:\s+VÀ\s+HƯỚNG\s*DẪN\s*CHẤM)?|HƯỚNG\s*DẪN\s*CHẤM)\b/i.test(
        clean
      );

    if (isExplicitPartHeader) {
      currentPartScopeHeader = clean.slice(0, 160);
      sawQuestionSincePartHeader = false;
      if (isVariantCodeHeader) {
        currentMetaHeader = clean.slice(0, 80);
      }
      return;
    }

    if (isVariantCodeHeader) {
      currentMetaHeader = clean.slice(0, 120);
      return;
    }

    if (isGenericAnswerBanner) {
      // If exam questions occurred since the last PHẦN header, this "ĐÁP ÁN" starts the answer block -> clear stale exam-body PHẦN
      if (sawQuestionSincePartHeader) {
        currentPartScopeHeader = undefined;
        sawQuestionSincePartHeader = false;
      }
      currentMetaHeader = clean.slice(0, 120);
      return;
    }

    if (/^(?:Câu|CÂU|Bài|BÀI)\s+\d+\s*[.:)–—\-]\s*\S/.test(clean) && clean.length > 20) {
      // Real exam question stem — prevent data tables inside questions from inheriting PHẦN I/II/III
      currentPartScopeHeader = undefined;
      currentMetaHeader = undefined;
      sawQuestionSincePartHeader = true;
    }
  };

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
          updateSectionHeader(pText.trim());
          markdownBlocks.push(pText.trim());
        }
      } else if (loc === 'tbl') {
        const { htmlTable, structuredRows, plainParagraphs, isOptionLayoutTable } = parseTableElement(el, imageMap, {
          onEquationFound: () => {
            equationCount++;
          },
          warnings,
        });
        if (structuredRows.length > 0) {
          const maxCols = Math.max(...structuredRows.map(r => r.length));
          if ((maxCols === 1 || isOptionLayoutTable) && plainParagraphs.length > 0) {
            plainParagraphs.forEach(p => updateSectionHeader(p));
            markdownBlocks.push(plainParagraphs.join('\n'));
          } else if (htmlTable) {
            markdownBlocks.push(htmlTable);
          }
          tables.push({
            id: `tbl_docx_${tables.length + 1}`,
            sourceType: 'docx_html',
            rows: structuredRows,
            surroundingHeader: getCombinedSectionHeader(),
          });
        }
      }
    }
  };

  if (body) {
    processBlockContainer(body);
  }

  const fullMarkdownText = markdownBlocks.join('\n\n');
  const imageCount = (fullMarkdownText.match(/<img\b/gi) || []).length;

  return {
    fullMarkdownText,
    tables,
    images: imageMap,
    equationCount,
    warnings,
    tableCount: tables.length,
    imageCount,
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

      // Office AlternateContent wrapper (modern Word equations, shapes, and embedded images)
      if (loc === 'alternatecontent') {
        for (const altChild of resolveAlternateContentChildren(child)) {
          const altLoc = getLocalName(altChild);
          if (altLoc === 'drawing' || altLoc === 'pict') {
            const imgHtml = extractImageFromElement(altChild, imageMap);
            if (imgHtml) tokens.push({ kind: 'raw', text: imgHtml });
          } else {
            visitInlineContainer(altChild);
          }
        }
        continue;
      }

      // Drawing directly inside paragraph
      if (loc === 'drawing' || loc === 'pict') {
        const imgHtml = extractImageFromElement(child, imageMap);
        if (imgHtml) tokens.push({ kind: 'raw', text: imgHtml });
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

    if (loc === 'alternatecontent') {
      for (const altChild of resolveAlternateContentChildren(child)) {
        const altLoc = getLocalName(altChild);
        if (altLoc === 'drawing' || altLoc === 'pict') {
          const imgHtml = extractImageFromElement(altChild, imageMap);
          if (imgHtml) tokens.push({ kind: 'raw', text: imgHtml });
        } else {
          const nestedImg = extractImageFromElement(altChild, imageMap);
          if (nestedImg) tokens.push({ kind: 'raw', text: nestedImg });
        }
      }
      continue;
    }

    if (loc === 'drawing' || loc === 'pict') {
      const imgHtml = extractImageFromElement(child, imageMap);
      if (imgHtml) tokens.push({ kind: 'raw', text: imgHtml });
      continue;
    }

    // Embedded legacy OLE Equation object (<w:object>)
    if (loc === 'object') {
      const imgHtml = extractImageFromElement(child, imageMap);
      if (imgHtml) {
        tokens.push({ kind: 'raw', text: imgHtml });
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
  const docPr = findDescendantByLocal(el, 'docpr');
  const altText = (getAttr(docPr, 'descr') || getAttr(docPr, 'title') || getAttr(docPr, 'name') || 'Hình ảnh minh họa').trim();

  const blip = findDescendantByLocal(el, 'blip');
  if (blip) {
    const rId = getAttr(blip, 'embed') || getAttr(blip, 'link');
    if (rId && imageMap.has(rId)) {
      const tag = buildSafeInlineImgTag(imageMap.get(rId)!, altText || 'Hình ảnh minh họa');
      if (tag) return ` ${tag} `;
    }
  }
  const imageData = findDescendantByLocal(el, 'imagedata');
  if (imageData) {
    const rId = getAttr(imageData, 'id') || getAttr(imageData, 'relid');
    if (rId && imageMap.has(rId)) {
      const tag = buildSafeInlineImgTag(imageMap.get(rId)!, altText || 'Hình ảnh minh họa');
      if (tag) return ` ${tag} `;
    }
  }
  return '';
}

interface ParsedHtmlTableCell {
  html: string;
  plainText: string;
  colSpan: number;
  rowSpan: number;
  isHeader: boolean;
  skipMergeContinuation?: boolean;
}

/**
 * Checks whether a Word table is purely a 1x4 or 2x2 layout grid for Part I options (A., B., C., D.)
 * so those cells flatten into option lines while preserving inline <img> and formulas!
 */
function detectOptionLayoutGrid(rows: string[][]): boolean {
  const nonEmptyCells = rows.flat().map((c) => c.trim()).filter(Boolean);
  if (nonEmptyCells.length < 2 || nonEmptyCells.length > 4) return false;
  if (rows.length > 2) return false;
  const matchedLetters = new Set<string>();
  for (const cell of nonEmptyCells) {
    const m = cell.match(/^(?:\*{0,3}|<\/?(?:b|u|strong|i|em)>)*([A-D])\s*[.):]/);
    if (!m) return false;
    matchedLetters.add(m[1].toUpperCase());
  }
  return matchedLetters.size === nonEmptyCells.length && matchedLetters.has('A') && matchedLetters.has('B');
}

/**
 * Parses a Word table (<w:tbl>) into clean semantic HTML <table><tr><td> (supporting colspan/rowspan,
 * nested equations, and inline <img>) alongside structuredRows for answer table recognition.
 */
function parseTableElement(
  tblEl: Element,
  imageMap: Map<string, string>,
  opts: ParagraphParseOptions
): {
  htmlTable: string;
  mdTable: string;
  structuredRows: string[][];
  plainParagraphs: string[];
  isOptionLayoutTable: boolean;
} {
  const structuredRows: string[][] = [];
  const plainParagraphs: string[] = [];
  const htmlGrid: ParsedHtmlTableCell[][] = [];

  const trElements = getDirectChildrenByLocal(tblEl, 'tr');

  for (let rIdx = 0; rIdx < trElements.length; rIdx++) {
    const trEl = trElements[rIdx];
    const trPr = getDirectChildByLocal(trEl, 'trpr');
    const isTblHeaderRow = Boolean(trPr && getDirectChildByLocal(trPr, 'tblheader'));
    const rowCellsPlain: string[] = [];
    const htmlRow: ParsedHtmlTableCell[] = [];

    for (const tcEl of getDirectChildrenByLocal(trEl, 'tc')) {
      const tcPr = getDirectChildByLocal(tcEl, 'tcpr');
      const gridSpanEl = tcPr ? getDirectChildByLocal(tcPr, 'gridspan') : null;
      const colSpanRaw = parseInt(getAttr(gridSpanEl, 'val') || '1', 10);
      const colSpan = Number.isFinite(colSpanRaw) && colSpanRaw > 1 ? Math.min(20, colSpanRaw) : 1;

      const vMergeEl = tcPr ? getDirectChildByLocal(tcPr, 'vmerge') : null;
      const vMergeVal = vMergeEl ? (getAttr(vMergeEl, 'val') || 'continue').toLowerCase() : null;
      const isVMergeContinue = Boolean(vMergeEl && vMergeVal !== 'restart');

      const cellLines: string[] = [];

      const collectCellContent = (container: Element) => {
        for (const ch of getDirectElements(container)) {
          const loc = getLocalName(ch);
          if (loc === 'p') {
            const line = parseParagraphElement(ch, imageMap, opts).trim();
            if (line) cellLines.push(line);
          } else if (loc === 'tbl') {
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
      if (!isVMergeContinue && cellLines.length > 0) {
        plainParagraphs.push(cellLines.join(' '));
      }

      const cellHtml = cellLines.join('<br/>').trim();
      const cellPlain = cellLines.join(' ').replace(/\|/g, '/').replace(/\s+/g, ' ').trim();

      rowCellsPlain.push(cellPlain);
      htmlRow.push({
        html: cellHtml,
        plainText: cellPlain,
        colSpan,
        rowSpan: 1,
        isHeader: isTblHeaderRow || rIdx === 0,
        skipMergeContinuation: isVMergeContinue,
      });
    }

    if (rowCellsPlain.length > 0 && (rowCellsPlain.some(c => c.length > 0) || htmlRow.some(c => c.skipMergeContinuation))) {
      structuredRows.push(rowCellsPlain);
      htmlGrid.push(htmlRow);
    }
  }

  if (structuredRows.length === 0) {
    return { htmlTable: '', mdTable: '', structuredRows: [], plainParagraphs: [], isOptionLayoutTable: false };
  }

  // Resolve vertical merges (rowspan) by column slot index
  const activeAnchorByCol = new Map<number, ParsedHtmlTableCell>();
  for (const row of htmlGrid) {
    let colCursor = 0;
    for (const cell of row) {
      if (cell.skipMergeContinuation) {
        const anchor = activeAnchorByCol.get(colCursor);
        if (anchor) {
          anchor.rowSpan += 1;
        }
      } else {
        for (let k = 0; k < cell.colSpan; k++) {
          activeAnchorByCol.set(colCursor + k, cell);
        }
      }
      colCursor += cell.colSpan;
    }
  }

  const maxCols = Math.max(...structuredRows.map(r => r.length));
  const normalizedRows = structuredRows.map(r => {
    const copy = [...r];
    while (copy.length < maxCols) copy.push('');
    return copy;
  });

  const isOptionLayoutTable = detectOptionLayoutGrid(structuredRows);

  // Build clean single-line semantic HTML <table>...</table> so exam block splitter preserves the entire table intact
  const renderRowHtml = (row: ParsedHtmlTableCell[], useTh: boolean): string => {
    const cellsHtml = row
      .filter((c) => !c.skipMergeContinuation)
      .map((c) => {
        const tag = useTh ? 'th' : 'td';
        const colAttr = c.colSpan > 1 ? ` colspan="${c.colSpan}"` : '';
        const rowAttr = c.rowSpan > 1 ? ` rowspan="${c.rowSpan}"` : '';
        return `<${tag}${colAttr}${rowAttr}>${c.html}</${tag}>`;
      })
      .join('');
    return `<tr>${cellsHtml}</tr>`;
  };

  let htmlTable = '';
  if (htmlGrid.length === 1) {
    htmlTable = `<table class="hq-exam-table"><tbody>${renderRowHtml(htmlGrid[0], false)}</tbody></table>`;
  } else {
    const headHtml = `<thead>${renderRowHtml(htmlGrid[0], true)}</thead>`;
    const bodyHtml = `<tbody>${htmlGrid
      .slice(1)
      .map((r) => renderRowHtml(r, false))
      .join('')}</tbody>`;
    htmlTable = `<table class="hq-exam-table">${headHtml}${bodyHtml}</table>`;
  }

  let mdTable = '\n\n';
  mdTable += '| ' + normalizedRows[0].join(' | ') + ' |\n';
  mdTable += '|' + Array(maxCols).fill('---').join('|') + '|\n';
  for (let i = 1; i < normalizedRows.length; i++) {
    mdTable += '| ' + normalizedRows[i].join(' | ') + ' |\n';
  }
  mdTable += '\n';

  return { htmlTable, mdTable, structuredRows: normalizedRows, plainParagraphs, isOptionLayoutTable };
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
  let result = '';

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
          currentLine = concatMathPieces(currentLine, convertOmmlNode(ch, ctx));
        }
      }
      if (currentLine.trim()) lines.push(currentLine.trim());
      if (lines.length > 1) {
        result = `\\begin{aligned} ${lines.join(' \\\\ ')} \\end{aligned}`;
      } else {
        result = lines[0] || '';
      }
    } else {
      result = convertOmmlSequence(el, ctx);
    }

    // Fallback integrity guard: ensure <m:t> runs (especially math functions/operators) are never silently swallowed
    return applyOmmlFallbackGuard(el, result, ctx);
  }

  result = convertOmmlNode(el, ctx);
  return applyOmmlFallbackGuard(el, result, ctx);
}

/**
 * Fallback integrity guard for <m:oMath>:
 * 1. If structured OMML conversion produces empty text while <m:t> runs exist, extract all <m:t> text runs.
 * 2. If a critical math operator present in raw <m:t> runs (e.g. log, ln, sin, cos, lim) completely
 *    disappeared from the converted LaTeX, record a warning and fall back to raw <m:t> text runs.
 */
function applyOmmlFallbackGuard(el: Element, convertedLatex: string, ctx: OmmlContext): string {
  const rawRunsText = extractAllDescendantMathText(el).trim();
  if (!rawRunsText) return convertedLatex;

  const trimmedLatex = convertedLatex.trim();
  if (!trimmedLatex) {
    ctx.warnings.push({
      tagName: el.nodeName || 'm:oMath',
      message: 'Không bóc tách trực tiếp được cấu trúc công thức — đã dùng chế độ Fallback trích xuất toàn bộ chuỗi ký tự m:t.',
      rawXml: serializeXmlNode(el).slice(0, 600),
      blockSnippet: ctx.blockContext,
    });
    return cleanMathText(rawRunsText);
  }

  const rawOps = rawRunsText.match(CRITICAL_MATH_OPERATOR_REGEX);
  if (rawOps && rawOps.length > 0) {
    const lowerLatex = trimmedLatex.toLowerCase();
    const missingOp = rawOps.find(op => !lowerLatex.includes(op.toLowerCase()));
    if (missingOp) {
      ctx.warnings.push({
        tagName: el.nodeName || 'm:oMath',
        message: `Phát hiện toán tử "${missingOp}" bị thiếu sau khi chuyển đổi OMML — đã kích hoạt Fallback bảo toàn ký tự từ các thẻ m:t.`,
        rawXml: serializeXmlNode(el).slice(0, 600),
        blockSnippet: ctx.blockContext,
      });
      return cleanMathText(rawRunsText);
    }
  }

  return convertedLatex;
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

    // 1. Math Run (<m:r>) & embedded Word Run (<w:r>)
    case 'r':
      return getNodePrefix(el) === 'w' ? convertWordRunInsideMath(el) : convertMathRun(el);

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

    // 4. Subscripts (<m:sSub>) — preserves math function operators cleanly (e.g. \log_{3}, \lim_{x \to 0})
    case 'ssub': {
      const baseEl = getDirectChildByLocal(el, 'e');
      const subEl = getDirectChildByLocal(el, 'sub');
      const base = baseEl ? convertOmmlSequence(baseEl, ctx) : '';
      const sub = subEl ? convertOmmlSequence(subEl, ctx).trim() : '';
      const normalizedOp = normalizeMathOperatorBase(base);
      if (!sub) return normalizedOp || base;
      if (normalizedOp) {
        return `${normalizedOp}_{${sub}}`;
      }
      const wrappedBase = base.trim() ? `{${base.trimEnd()}}` : '{}';
      return `${wrappedBase}_{${sub}}`;
    }

    // 5. Superscripts (<m:sSup>) — preserves math function powers cleanly (e.g. \sin^{2}, \cos^{2})
    case 'ssup': {
      const baseEl = getDirectChildByLocal(el, 'e');
      const supEl = getDirectChildByLocal(el, 'sup');
      const base = baseEl ? convertOmmlSequence(baseEl, ctx) : '';
      const sup = supEl ? convertOmmlSequence(supEl, ctx).trim() : '';
      const normalizedOp = normalizeMathOperatorBase(base);
      if (!sup) return normalizedOp || base;
      if (normalizedOp) {
        return `${normalizedOp}^{${sup}}`;
      }
      const wrappedBase = base.trim() ? `{${base.trimEnd()}}` : '{}';
      return `${wrappedBase}^{${sup}}`;
    }

    // 6. Subscript-Superscript (<m:sSubSup>) — e.g. \log_{3}^{2}
    case 'ssubsup': {
      const baseEl = getDirectChildByLocal(el, 'e');
      const subEl = getDirectChildByLocal(el, 'sub');
      const supEl = getDirectChildByLocal(el, 'sup');
      const base = baseEl ? convertOmmlSequence(baseEl, ctx) : '';
      const sub = subEl ? convertOmmlSequence(subEl, ctx).trim() : '';
      const sup = supEl ? convertOmmlSequence(supEl, ctx).trim() : '';
      const normalizedOp = normalizeMathOperatorBase(base);
      const wrappedBase = normalizedOp || (base.trim() ? `{${base.trimEnd()}}` : '{}');

      if (sub && sup) return `${wrappedBase}_{${sub}}^{${sup}}`;
      if (sub) return `${wrappedBase}_{${sub}}`;
      if (sup) return `${wrappedBase}^{${sup}}`;
      return normalizedOp || base;
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

    // 9. Delimiters / Brackets (<m:d>) — upgrades matrix & system-of-equations delimiters cleanly
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

      // Detect Matrix or System of Equations (cases) directly inside <m:d><m:e>...</m:e></m:d>
      if (eChildren.length === 1) {
        const innerEls = getDirectElements(eChildren[0]).filter(
          ch => !['ctrlpr', 'argpr'].includes(getLocalName(ch))
        );
        if (innerEls.length === 1) {
          const innerLoc = getLocalName(innerEls[0]);
          if (innerLoc === 'm') {
            const rows = getDirectChildrenByLocal(innerEls[0], 'mr');
            const rowLatexList = rows.map(row => {
              const cells = getDirectChildrenByLocal(row, 'e');
              return cells.map(c => convertOmmlSequence(c, ctx).trim()).join(' & ');
            });
            if (begChr === '{' && endChr === '') {
              return `\\begin{cases} ${rowLatexList.join(' \\\\ ')} \\end{cases}`;
            }
            const envMap: Record<string, string> = {
              '(|)': 'pmatrix',
              '[|]': 'bmatrix',
              '{|}': 'Bmatrix',
              '|||': 'vmatrix',
              '‖|‖': 'Vmatrix',
            };
            const env = envMap[`${begChr}|${endChr}`];
            if (env) {
              return `\\begin{${env}} ${rowLatexList.join(' \\\\ ')} \\end{${env}}`;
            }
          } else if (innerLoc === 'eqarr' && begChr === '{' && endChr === '') {
            const rows = getDirectChildrenByLocal(innerEls[0], 'e');
            const rowLatexList = rows.map(r => convertOmmlSequence(r, ctx).trim()).filter(Boolean);
            if (rowLatexList.length > 0) {
              return `\\begin{cases} ${rowLatexList.join(' \\\\ ')} \\end{cases}`;
            }
          }
        }
      }

      const parts = eChildren.map(eCh => convertOmmlSequence(eCh, ctx).trim());
      const sepLatex = sepChr === '|' ? ' \\middle| ' : sepChr ? `${sepChr} ` : ', ';
      const inner = parts.join(sepLatex);

      const leftDelim = mapLeftDelimiter(begChr);
      const rightDelim = mapRightDelimiter(endChr);
      return `${leftDelim}${inner}${rightDelim}`;
    }

    // 10. N-ary operators (<m:nary>) — ECMA-376 default when <m:chr> is omitted is INTEGRAL (∫)!
    case 'nary': {
      const naryPr = getDirectChildByLocal(el, 'narypr');
      const chrEl = naryPr ? getDirectChildByLocal(naryPr, 'chr') : null;
      const limLocEl = naryPr ? getDirectChildByLocal(naryPr, 'limloc') : null;
      const subHideEl = naryPr ? getDirectChildByLocal(naryPr, 'subhide') : null;
      const supHideEl = naryPr ? getDirectChildByLocal(naryPr, 'suphide') : null;

      const opChar = chrEl ? getAttr(chrEl, 'val') || '∫' : '∫';
      const limLoc = (limLocEl ? getAttr(limLocEl, 'val') : '')?.toLowerCase() || '';
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
        '∯': '\\oiint',
        '∰': '\\oiiint',
        '⋃': '\\bigcup',
        '⋂': '\\bigcap',
        '⋁': '\\bigvee',
        '⋀': '\\bigwedge',
      };
      const opLatex = opMap[opChar] || '\\int';
      const limitsMod = limLoc === 'undovr' && /^\\(?:i*nt|oi*nt)$/.test(opLatex) ? '\\limits' : '';

      const subEl = getDirectChildByLocal(el, 'sub');
      const supEl = getDirectChildByLocal(el, 'sup');
      const baseEl = getDirectChildByLocal(el, 'e');

      const sub = !subHide && subEl ? convertOmmlSequence(subEl, ctx).trim() : '';
      const sup = !supHide && supEl ? convertOmmlSequence(supEl, ctx).trim() : '';
      const base = baseEl ? convertOmmlSequence(baseEl, ctx).trim() : '';

      return `${opLatex}${limitsMod}${sub ? `_{${sub}}` : ''}${sup ? `^{${sup}}` : ''}${base ? ` ${base}` : ''}`;
    }

    // 11. Functions (<m:func>) — supports plain names AND nested m:sSub / m:sSup / m:sSubSup / m:limLow inside m:fName
    case 'func': {
      const fNameEl = getDirectChildByLocal(el, 'fname');
      const baseEl = getDirectChildByLocal(el, 'e');
      const fLatex = fNameEl ? convertFuncNameElement(fNameEl, ctx).trim() : '';
      let base = baseEl ? convertOmmlSequence(baseEl, ctx).trim() : '';
      if (!base && baseEl) {
        const fallbackBase = extractAllDescendantMathText(baseEl).trim();
        if (fallbackBase) base = cleanMathText(fallbackBase).trim();
      }
      if (!fLatex) return base;
      if (!base) return fLatex;
      // When argument starts with a delimiter (\left(, (, [, \{, |), attach directly so delimiter never obscures operator
      if (/^(?:\\left|\(|\[|\\\{|\|)/.test(base)) {
        return `${fLatex}${base}`;
      }
      return `${fLatex} ${base}`;
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

    // 20. Direct text node inside OMML (<m:t> / <w:t>)
    case 't': {
      return cleanMathText(el.textContent || '');
    }

    default: {
      // Unsupported OMML construct: preserve raw XML warning AND extract readable inner content (with m:t fallback)
      const prefix = getNodePrefix(el);
      if (prefix === 'm') {
        ctx.warnings.push({
          tagName: el.nodeName,
          message: `Cấu trúc Word Equation <${el.nodeName}> chưa được hỗ trợ đầy đủ — đã trích xuất nội dung chữ/biểu thức bên trong.`,
          rawXml: serializeXmlNode(el).slice(0, 600),
          blockSnippet: ctx.blockContext,
        });
      }
      const seq = convertOmmlSequence(el, ctx);
      if (seq.trim()) return seq;
      const fallbackText = extractAllDescendantMathText(el).trim();
      return fallbackText ? cleanMathText(fallbackText) : '';
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

  // Standard math operators with lower/upper limits (e.g., \lim_{x \to 0}, \log_{3}, \max_{x}, \min_{x})
  const normalizedOp = normalizeMathOperatorBase(baseLatex);
  if (normalizedOp && (lowerStr || upperStr)) {
    if (lowerStr && upperStr) {
      return `${normalizedOp}_{${lowerStr}}^{${upperStr}}`;
    }
    if (lowerStr) {
      return `${normalizedOp}_{${lowerStr}}`;
    }
    return `${normalizedOp}^{${upperStr}}`;
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

/**
 * Normalizes a LaTeX base string representing a known math function/operator
 * (e.g. "log", "\text{log}", "{\text{log}}", "\mathrm{sin}", "\lim") into canonical LaTeX ("\log", "\sin", "\lim").
 * Returns null for non-operator bases (such as chemical elements "H", "Fe", variables "x") so chemistry stays untouched.
 */
function normalizeMathOperatorBase(rawLatex: string): string | null {
  let candidate = (rawLatex || '').trim();
  if (!candidate) return null;

  // Unwrap redundant outer braces and \text{...} / \mathrm{...} / \operatorname{...}
  let prev = '';
  while (candidate !== prev) {
    prev = candidate;
    if (candidate.startsWith('{') && candidate.endsWith('}')) {
      candidate = candidate.slice(1, -1).trim();
    }
    const wrapperMatch = candidate.match(/^\\(?:text|mathrm|operatorname|mathbf)\{([^{}]+)\}$/);
    if (wrapperMatch) {
      candidate = wrapperMatch[1].trim();
    }
  }

  const stripped = candidate.startsWith('\\') ? candidate.slice(1).trim() : candidate;
  if (!stripped) return null;

  if (KNOWN_MATH_FUNCTIONS.has(stripped)) {
    return `\\${stripped}`;
  }
  const lower = stripped.toLowerCase();
  if (KNOWN_MATH_FUNCTIONS.has(lower) && lower !== 'pr') {
    return `\\${lower}`;
  }
  return null;
}

/**
 * Converts <m:fName> inside <m:func>, supporting both:
 * - Plain function names (<m:r><m:t>log</m:t></m:r>, sin, cos, ln, lim, f)
 * - Structured function names containing <m:sSub> (\log_{3}), <m:sSup> (\sin^{2}),
 *   <m:sSubSup> (\log_{3}^{2}), <m:limLow> (\lim_{x \to 0}, \log_{3}), <m:box>, <m:acc>, etc.
 * - Fallback to extracting all descendant <m:t> / <w:t> runs if structured conversion returns empty.
 */
function convertFuncNameElement(fNameEl: Element, ctx: OmmlContext): string {
  const meaningfulChildren = getDirectElements(fNameEl).filter(
    ch => !['ctrlpr', 'argpr', 'rpr', 'funcpr'].includes(getLocalName(ch))
  );

  if (meaningfulChildren.length === 0) {
    const rawFallback = extractAllDescendantMathText(fNameEl).trim();
    if (!rawFallback) return '';
    return normalizeMathOperatorBase(rawFallback) || cleanMathText(rawFallback);
  }

  const hasOnlyPlainRuns = meaningfulChildren.every(ch => {
    const loc = getLocalName(ch);
    return loc === 'r' || loc === 't';
  });

  if (hasOnlyPlainRuns) {
    const rawName = extractPlainMathName(fNameEl);
    if (rawName) {
      const canonical = normalizeMathOperatorBase(rawName);
      if (canonical) return canonical;
      if (/^[A-Za-z]$/.test(rawName)) return rawName;
      if (/^[A-Za-z]+$/.test(rawName)) return `\\operatorname{${rawName}}`;
    }
  }

  // Recursive OMML conversion for structured <m:fName> (e.g. <m:sSub>, <m:sSup>, <m:sSubSup>, <m:limLow>, <m:box>)
  const converted = convertOmmlSequence(fNameEl, ctx).trim();
  if (converted) {
    const canonical = normalizeMathOperatorBase(converted);
    return canonical || converted;
  }

  // Final safety fallback: never drop function name characters
  const fallbackText = extractAllDescendantMathText(fNameEl).trim();
  if (!fallbackText) return '';
  return normalizeMathOperatorBase(fallbackText) || cleanMathText(fallbackText);
}

/**
 * Recursively collects all text runs inside <m:t> / <w:t> (and <m:sym>/<w:sym>) within an OMML subtree,
 * skipping property elements (*Pr). Used as a zero-loss fallback.
 */
function extractAllDescendantMathText(el: Element): string {
  let out = '';
  const visit = (node: Element) => {
    const loc = getLocalName(node);
    if (loc.endsWith('pr')) return;
    if (loc === 't') {
      out += node.textContent || '';
      return;
    }
    if (loc === 'sym') {
      const hexAttr = getAttr(node, 'char');
      if (hexAttr) {
        const code = parseInt(hexAttr, 16);
        if (!isNaN(code)) {
          out += SYMBOL_FONT_MAP[code] || String.fromCharCode(code);
        }
      }
      return;
    }
    if (loc === 'd') {
      const dPr = getDirectChildByLocal(node, 'dpr');
      const begEl = dPr ? getDirectChildByLocal(dPr, 'begchr') : null;
      const endEl = dPr ? getDirectChildByLocal(dPr, 'endchr') : null;
      const begChr = begEl ? getAttr(begEl, 'val') ?? '(' : '(';
      const endChr = endEl ? getAttr(endEl, 'val') ?? ')' : ')';
      out += begChr;
      for (const ch of getDirectElements(node)) {
        if (getLocalName(ch) !== 'dpr') visit(ch);
      }
      out += endChr;
      return;
    }
    for (const ch of getDirectElements(node)) {
      visit(ch);
    }
  };
  visit(el);
  return out;
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
  text = text.replace(/[\r\n]+/g, ' ');

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

/**
 * Converts an Office Math (OMML) XML fragment into standard Presentation MathML (<math>...</math>)
 * for interoperability alongside LaTeX ($...$).
 */
export function convertOmmlToMathMl(ommlXml: string): string {
  if (!ommlXml || !ommlXml.trim()) return '';
  const trimmed = ommlXml.trim();
  const hasOmmlWrapper = /^<(?:m:)?(?:oMath|oMathPara)\b/i.test(trimmed);
  let xmlToParse = trimmed;
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

  const escapeXmlText = (s: string) =>
    s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  const nodeToMml = (el: Element): string => {
    const loc = getLocalName(el);
    if (loc.endsWith('pr')) return '';

    switch (loc) {
      case 'omath':
      case 'omathpara':
      case 'e':
      case 'num':
      case 'den':
      case 'sub':
      case 'sup':
      case 'deg':
      case 'lim':
      case 'fname':
      case 'box':
        return `<mrow>${getDirectElements(el).map(nodeToMml).join('')}</mrow>`;
      case 'r': {
        const txt = extractAllDescendantMathText(el);
        if (!txt) return '';
        if (/^[0-9.,]+$/.test(txt.trim())) return `<mn>${escapeXmlText(txt)}</mn>`;
        if (/^[+\-*/=<>≤≥≠≈±×÷→⇌()[\]{},;:|∫∑∏]$/.test(txt.trim())) return `<mo>${escapeXmlText(txt)}</mo>`;
        return `<mi>${escapeXmlText(txt)}</mi>`;
      }
      case 't':
        return `<mi>${escapeXmlText(el.textContent || '')}</mi>`;
      case 'f': {
        const num = getDirectChildByLocal(el, 'num');
        const den = getDirectChildByLocal(el, 'den');
        return `<mfrac>${num ? nodeToMml(num) : '<mrow/>'}${den ? nodeToMml(den) : '<mrow/>'}</mfrac>`;
      }
      case 'rad': {
        const deg = getDirectChildByLocal(el, 'deg');
        const base = getDirectChildByLocal(el, 'e');
        const degTxt = deg ? extractAllDescendantMathText(deg).trim() : '';
        return degTxt
          ? `<mroot>${base ? nodeToMml(base) : '<mrow/>'}${nodeToMml(deg!)}</mroot>`
          : `<msqrt>${base ? nodeToMml(base) : '<mrow/>'}</msqrt>`;
      }
      case 'ssub': {
        const base = getDirectChildByLocal(el, 'e');
        const sub = getDirectChildByLocal(el, 'sub');
        return `<msub>${base ? nodeToMml(base) : '<mrow/>'}${sub ? nodeToMml(sub) : '<mrow/>'}</msub>`;
      }
      case 'ssup': {
        const base = getDirectChildByLocal(el, 'e');
        const sup = getDirectChildByLocal(el, 'sup');
        return `<msup>${base ? nodeToMml(base) : '<mrow/>'}${sup ? nodeToMml(sup) : '<mrow/>'}</msup>`;
      }
      case 'ssubsup': {
        const base = getDirectChildByLocal(el, 'e');
        const sub = getDirectChildByLocal(el, 'sub');
        const sup = getDirectChildByLocal(el, 'sup');
        return `<msubsup>${base ? nodeToMml(base) : '<mrow/>'}${sub ? nodeToMml(sub) : '<mrow/>'}${sup ? nodeToMml(sup) : '<mrow/>'}</msubsup>`;
      }
      case 'nary': {
        const naryPr = getDirectChildByLocal(el, 'narypr');
        const chrEl = naryPr ? getDirectChildByLocal(naryPr, 'chr') : null;
        const opChar = chrEl ? getAttr(chrEl, 'val') || '∫' : '∫';
        const sub = getDirectChildByLocal(el, 'sub');
        const sup = getDirectChildByLocal(el, 'sup');
        const base = getDirectChildByLocal(el, 'e');
        const opTag = sub && sup
          ? `<msubsup><mo>${escapeXmlText(opChar)}</mo>${nodeToMml(sub)}${nodeToMml(sup)}</msubsup>`
          : sub
          ? `<msub><mo>${escapeXmlText(opChar)}</mo>${nodeToMml(sub)}</msub>`
          : sup
          ? `<msup><mo>${escapeXmlText(opChar)}</mo>${nodeToMml(sup)}</msup>`
          : `<mo>${escapeXmlText(opChar)}</mo>`;
        return `<mrow>${opTag}${base ? nodeToMml(base) : ''}</mrow>`;
      }
      case 'm': {
        const rows = getDirectChildrenByLocal(el, 'mr')
          .map((mr) => `<mtr>${getDirectChildrenByLocal(mr, 'e').map((c) => `<mtd>${nodeToMml(c)}</mtd>`).join('')}</mtr>`)
          .join('');
        return `<mtable>${rows}</mtable>`;
      }
      case 'd': {
        const dPr = getDirectChildByLocal(el, 'dpr');
        const beg = dPr ? getAttr(getDirectChildByLocal(dPr, 'begchr'), 'val') ?? '(' : '(';
        const end = dPr ? getAttr(getDirectChildByLocal(dPr, 'endchr'), 'val') ?? ')' : ')';
        const inner = getDirectChildrenByLocal(el, 'e').map(nodeToMml).join('<mo>,</mo>');
        return `<mrow>${beg ? `<mo>${escapeXmlText(beg)}</mo>` : ''}${inner}${end ? `<mo>${escapeXmlText(end)}</mo>` : ''}</mrow>`;
      }
      default:
        return `<mrow>${getDirectElements(el).map(nodeToMml).join('')}</mrow>`;
    }
  };

  return `<math xmlns="http://www.w3.org/1998/Math/MathML">${nodeToMml(root)}</math>`;
}
