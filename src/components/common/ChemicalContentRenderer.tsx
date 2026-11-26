/**
 * CHEMICAL CONTENT RENDERER (HQTest Unified Formula & Equation Engine)
 * Component hiển thị thống nhất cho toàn bộ hệ thống HQTest:
 * - Văn bản tiếng Việt có dấu
 * - Biểu thức toán học KaTeX ($...$, $$...$$, \(...\), \[...\]) & mhchem (\ce{...}, \pu{...})
 * - Công thức hóa học chỉ số trên/dưới tự động (H2SO4, 4HNO3, Fe(NO3)3, Al2(SO4)3, SO4 2-, [Cu(NH3)4]2+)
 * - Phương trình hóa học (mũi tên, điều kiện t°/xt trên & dưới mũi tên, thuận nghịch ⇌, khí ↑, kết tủa ↓)
 * - Công thức hữu cơ (liên kết đơn -, đôi =, ba ≡, nhóm chức)
 * - Bảng Markdown đa cột (|...|) chứa công thức & Equation
 * - Thẻ định dạng an toàn (sub, sup, b, strong, i, em, u, s, br, **bold**, *italic*)
 * - Hình ảnh minh họa nhúng từ DOCX (data URL hoặc ảnh web)
 * - Bảo toàn ký hiệu %, ‰, °C, kJ/mol, mol/L, ±, ≥, ≤, ≠, ≈, Δ
 */

import React from 'react';
import katex from 'katex';
import 'katex/contrib/mhchem';
import { tokenizeRichContent, normalizeLatexExpression } from '../../utils/latexNormalizer';

export interface ChemicalContentRendererProps {
  content?: string;
  text?: string; // Backward compatibility alias
  className?: string;
  inline?: boolean;
}

export const ChemicalContentRenderer: React.FC<ChemicalContentRendererProps> = ({
  content,
  text,
  className = '',
  inline = false,
}) => {
  const rawCandidate = content !== undefined ? content : text;
  const rawText = typeof rawCandidate === 'string' ? rawCandidate : '';
  if (!rawText) return null;

  // 1. Check if text contains HTML <table>...</table> (from Word/Mammoth parser)
  if (hasHtmlTable(rawText)) {
    return <RenderContentWithHtmlTables text={rawText} className={className} inline={inline} />;
  }

  // 2. Check if text contains Markdown table (including multi-column tables |---|---|)
  if (!inline && hasMarkdownTable(rawText)) {
    return <RenderContentWithTables text={rawText} className={className} inline={inline} />;
  }

  // 3. Standard rendering
  return renderTextBlocks(rawText, className, inline);
};

/**
 * Checks if text contains an HTML <table>...</table> element
 */
function hasHtmlTable(text: string): boolean {
  return /<table\b[^>]*>[\s\S]*?<\/table>/i.test(text);
}

/**
 * Checks if text contains a single- or multi-column markdown table
 */
function hasMarkdownTable(text: string): boolean {
  return /^\s*\|[^\n]+\|\r?\n\s*\|[\s\-:|]+\|\r?\n\s*\|[^\n]+\|/m.test(text);
}

interface SafeTableCellNode {
  tag: 'th' | 'td';
  colSpan: number;
  rowSpan: number;
  content: string;
}

interface SafeTableRowNode {
  cells: SafeTableCellNode[];
}

interface SafeParsedHtmlTable {
  headRows: SafeTableRowNode[];
  bodyRows: SafeTableRowNode[];
}

/**
 * Safely parses an HTML <table> string into structured React-renderable rows/cells via DOMParser
 * (never injects raw HTML into the DOM — immune to XSS while keeping colspan, rowspan, KaTeX, and <img>).
 */
function parseSafeHtmlTable(tableHtml: string): SafeParsedHtmlTable | null {
  if (typeof DOMParser === 'undefined') return null;
  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(tableHtml, 'text/html');
    const tableEl = doc.querySelector('table');
    if (!tableEl) return null;

    const serializeSafeCellInner = (cellEl: Element): string => {
      const parts: string[] = [];
      const walk = (node: Node) => {
        if (node.nodeType === 3) {
          parts.push(node.textContent || '');
          return;
        }
        if (node.nodeType !== 1) return;
        const el = node as Element;
        const tag = el.tagName.toLowerCase();

        if (tag === 'script' || tag === 'style' || tag === 'iframe' || tag === 'object' || tag === 'embed') {
          return;
        }
        if (tag === 'br') {
          parts.push('<br/>');
          return;
        }
        if (tag === 'img') {
          const src = el.getAttribute('src') || '';
          const alt = el.getAttribute('alt') || 'Hình ảnh minh họa';
          if (isSafeImageUrl(src)) {
            const safeAlt = alt.replace(/"/g, '&quot;');
            parts.push(`<img src="${src}" alt="${safeAlt}" />`);
          }
          return;
        }
        if (tag === 'math') {
          parts.push(el.outerHTML);
          return;
        }
        if (tag === 'sub' || tag === 'sup' || tag === 'u' || tag === 's' || tag === 'b' || tag === 'strong' || tag === 'i' || tag === 'em') {
          const innerBuf: string[] = [];
          for (let i = 0; i < el.childNodes.length; i++) {
            const prevLen = parts.length;
            walk(el.childNodes[i]);
            innerBuf.push(...parts.splice(prevLen));
          }
          parts.push(`<${tag}>${innerBuf.join('')}</${tag}>`);
          return;
        }
        if (tag === 'p' || tag === 'div' || tag === 'li') {
          const before = parts.length;
          for (let i = 0; i < el.childNodes.length; i++) {
            walk(el.childNodes[i]);
          }
          if (parts.length > before) {
            parts.push('<br/>');
          }
          return;
        }
        for (let i = 0; i < el.childNodes.length; i++) {
          walk(el.childNodes[i]);
        }
      };

      for (let i = 0; i < cellEl.childNodes.length; i++) {
        walk(cellEl.childNodes[i]);
      }

      return parts
        .join('')
        .replace(/(?:<br\s*\/?>\s*)+$/gi, '')
        .trim();
    };

    const parseRowEl = (trEl: Element): SafeTableRowNode => {
      const cells: SafeTableCellNode[] = [];
      for (let i = 0; i < trEl.children.length; i++) {
        const child = trEl.children[i];
        const tag = child.tagName.toLowerCase();
        if (tag !== 'td' && tag !== 'th') continue;
        const rawCol = parseInt(child.getAttribute('colspan') || '1', 10);
        const rawRow = parseInt(child.getAttribute('rowspan') || '1', 10);
        const colSpan = Number.isFinite(rawCol) && rawCol > 1 ? Math.min(20, rawCol) : 1;
        const rowSpan = Number.isFinite(rawRow) && rawRow > 1 ? Math.min(20, rawRow) : 1;
        cells.push({
          tag,
          colSpan,
          rowSpan,
          content: serializeSafeCellInner(child),
        });
      }
      return { cells };
    };

    const headRows: SafeTableRowNode[] = [];
    const bodyRows: SafeTableRowNode[] = [];

    const theadEl = tableEl.querySelector(':scope > thead');
    if (theadEl) {
      Array.from(theadEl.querySelectorAll(':scope > tr')).forEach((tr) => {
        const parsed = parseRowEl(tr);
        if (parsed.cells.length > 0) headRows.push(parsed);
      });
    }

    const tbodyEls = Array.from(tableEl.querySelectorAll(':scope > tbody'));
    if (tbodyEls.length > 0) {
      tbodyEls.forEach((tb) => {
        Array.from(tb.querySelectorAll(':scope > tr')).forEach((tr) => {
          const parsed = parseRowEl(tr);
          if (parsed.cells.length > 0) bodyRows.push(parsed);
        });
      });
    } else {
      Array.from(tableEl.querySelectorAll(':scope > tr')).forEach((tr, idx) => {
        const parsed = parseRowEl(tr);
        if (parsed.cells.length === 0) return;
        const allTh = parsed.cells.every((c) => c.tag === 'th');
        if (idx === 0 && allTh && headRows.length === 0) {
          headRows.push(parsed);
        } else {
          bodyRows.push(parsed);
        }
      });
    }

    const tfootEl = tableEl.querySelector(':scope > tfoot');
    if (tfootEl) {
      Array.from(tfootEl.querySelectorAll(':scope > tr')).forEach((tr) => {
        const parsed = parseRowEl(tr);
        if (parsed.cells.length > 0) bodyRows.push(parsed);
      });
    }

    if (headRows.length === 0 && bodyRows.length === 0) return null;
    return { headRows, bodyRows };
  } catch {
    return null;
  }
}

/**
 * Renders mixed content containing one or more HTML <table> blocks cleanly with slate-300 responsive borders
 */
const RenderContentWithHtmlTables: React.FC<{ text: string; className?: string; inline?: boolean }> = ({
  text,
  className,
  inline,
}) => {
  const parts: { type: 'text' | 'html_table'; value: string }[] = [];
  const regex = /<table\b[^>]*>[\s\S]*?<\/table>/gi;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push({ type: 'text', value: text.slice(lastIndex, match.index) });
    }
    parts.push({ type: 'html_table', value: match[0] });
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < text.length) {
    parts.push({ type: 'text', value: text.slice(lastIndex) });
  }

  return (
    <div className={`space-y-2.5 ${className}`}>
      {parts.map((part, idx) => {
        if (part.type === 'html_table') {
          return <HtmlTableRenderer key={idx} tableHtml={part.value} />;
        }
        const trimmed = part.value.trim();
        if (!trimmed) return null;
        if (!inline && hasMarkdownTable(trimmed)) {
          return <RenderContentWithTables key={idx} text={trimmed} className="" inline={false} />;
        }
        return <div key={idx}>{renderTextBlocks(trimmed, '', false)}</div>;
      })}
    </div>
  );
};

const HtmlTableRenderer: React.FC<{ tableHtml: string }> = ({ tableHtml }) => {
  const parsed = parseSafeHtmlTable(tableHtml);
  if (!parsed) {
    return <div>{renderTextBlocks(tableHtml.replace(/<[^>]+>/g, ' '), '', false)}</div>;
  }

  return (
    <div className="hq-exam-table-wrap">
      <table className="hq-exam-table">
        {parsed.headRows.length > 0 && (
          <thead>
            {parsed.headRows.map((row, rIdx) => (
              <tr key={rIdx}>
                {row.cells.map((cell, cIdx) => (
                  <th
                    key={cIdx}
                    colSpan={cell.colSpan > 1 ? cell.colSpan : undefined}
                    rowSpan={cell.rowSpan > 1 ? cell.rowSpan : undefined}
                  >
                    <ChemicalContentRenderer content={cell.content} inline />
                  </th>
                ))}
              </tr>
            ))}
          </thead>
        )}
        {parsed.bodyRows.length > 0 && (
          <tbody>
            {parsed.bodyRows.map((row, rIdx) => (
              <tr key={rIdx}>
                {row.cells.map((cell, cIdx) => {
                  const CellTag = cell.tag === 'th' ? 'th' : 'td';
                  return (
                    <CellTag
                      key={cIdx}
                      colSpan={cell.colSpan > 1 ? cell.colSpan : undefined}
                      rowSpan={cell.rowSpan > 1 ? cell.rowSpan : undefined}
                      className={cell.tag === 'th' ? 'bg-slate-100 font-semibold text-slate-900' : undefined}
                    >
                      <ChemicalContentRenderer content={cell.content} inline />
                    </CellTag>
                  );
                })}
              </tr>
            ))}
          </tbody>
        )}
      </table>
    </div>
  );
};

/**
 * Renders mixed text with Markdown tables cleanly formatted as HTML tables
 */
const RenderContentWithTables: React.FC<{ text: string; className?: string; inline?: boolean }> = ({
  text,
  className,
  inline,
}) => {
  const lines = text.split(/\r?\n/);
  const blocks: { type: 'text' | 'table'; content: string | string[] }[] = [];

  let currentTextLines: string[] = [];
  let currentTableLines: string[] = [];
  let inTable = false;

  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    const isTableLine = trimmed.startsWith('|') && trimmed.endsWith('|') && trimmed.length >= 3;

    if (isTableLine) {
      if (!inTable) {
        if (currentTextLines.length > 0) {
          blocks.push({ type: 'text', content: currentTextLines.join('\n') });
          currentTextLines = [];
        }
        inTable = true;
      }
      currentTableLines.push(trimmed);
    } else {
      if (inTable) {
        blocks.push({ type: 'table', content: currentTableLines });
        currentTableLines = [];
        inTable = false;
      }
      currentTextLines.push(lines[i]);
    }
  }

  if (inTable && currentTableLines.length > 0) {
    blocks.push({ type: 'table', content: currentTableLines });
  } else if (currentTextLines.length > 0) {
    blocks.push({ type: 'text', content: currentTextLines.join('\n') });
  }

  return (
    <div className={`space-y-3 ${className}`}>
      {blocks.map((block, idx) => {
        if (block.type === 'table') {
          return <TableRenderer key={idx} tableLines={block.content as string[]} />;
        }
        const txt = (block.content as string).trim();
        if (!txt) return null;
        return <div key={idx}>{renderTextBlocks(txt, '', !!inline)}</div>;
      })}
    </div>
  );
};

/**
 * Renders Markdown Table as clean styled HTML Table (preserving math & chemistry inside every cell)
 */
const TableRenderer: React.FC<{ tableLines: string[] }> = ({ tableLines }) => {
  if (tableLines.length < 2) {
    return <div>{renderTextBlocks(tableLines.join('\n'), '', false)}</div>;
  }

  const headerLine = tableLines[0];
  const isSeparator = /^\|[\s\-:|]+\|$/.test(tableLines[1].trim());
  const dataLines = isSeparator ? tableLines.slice(2) : tableLines.slice(1);

  const parseRow = (line: string) =>
    line
      .slice(1, -1)
      .split('|')
      .map(cell => cell.trim());

  const headers = parseRow(headerLine);
  const dataRows = dataLines.map(parseRow);

  return (
    <div className="hq-exam-table-wrap">
      <table className="hq-exam-table">
        <thead>
          <tr>
            {headers.map((h, i) => (
              <th key={i}>
                <ChemicalContentRenderer content={h} inline />
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {dataRows.map((row, rIdx) => (
            <tr key={rIdx}>
              {row.map((cell, cIdx) => (
                <td key={cIdx}>
                  <ChemicalContentRenderer content={cell} inline />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

/**
 * Splits text into LaTeX segments, safe HTML tags, Markdown formatting, images, and smart plain chemistry
 */
function renderTextBlocks(text: string, className: string, inline: boolean): React.ReactElement {
  const Component = inline ? 'span' : 'div';
  return (
    <Component className={`leading-relaxed ${className}`}>
      {renderInlineTokens(text, 0)}
    </Component>
  );
}

function isSafeImageUrl(url: string): boolean {
  const trimmed = (url || '').trim();
  if (!trimmed) return false;
  if (trimmed.startsWith('/')) return true;
  if (/^data:image\/(?:png|jpeg|jpg|gif|webp|bmp|svg\+xml);base64,/i.test(trimmed)) return true;
  if (/^https?:\/\//i.test(trimmed)) return true;
  return false;
}

function renderInlineTokens(text: string, depth: number): React.ReactNode {
  if (!text) return null;
  if (depth > 6) return renderSmartChemistry(text);

  const segments = tokenizeRichContent(text);

  return segments.map((seg, index) => {
    if (seg.type === 'math') {
      return <KatexMathBlock key={index} math={seg.value} displayMode={seg.displayMode} />;
    }

    if (seg.type === 'html_tag') {
      if (seg.tag === 'br') return <br key={index} />;
      if (seg.tag === 'sub') {
        return (
          <sub key={index} className="text-[0.73em] font-semibold text-slate-800">
            {seg.inner.replace(/<[^>]+>/g, '')}
          </sub>
        );
      }
      if (seg.tag === 'sup') {
        return (
          <sup key={index} className="text-[0.73em] font-bold text-blue-800">
            {seg.inner.replace(/<[^>]+>/g, '')}
          </sup>
        );
      }
      if (seg.tag === 'u') {
        return (
          <u key={index} className="underline decoration-slate-500 underline-offset-2">
            {renderInlineTokens(seg.inner, depth + 1)}
          </u>
        );
      }
      if (seg.tag === 's') {
        return (
          <s key={index} className="line-through text-slate-500">
            {renderInlineTokens(seg.inner, depth + 1)}
          </s>
        );
      }
      if (seg.tag === 'b') {
        return (
          <strong key={index} className="font-bold">
            {renderInlineTokens(seg.inner, depth + 1)}
          </strong>
        );
      }
      if (seg.tag === 'i') {
        return (
          <em key={index} className="italic">
            {renderInlineTokens(seg.inner, depth + 1)}
          </em>
        );
      }
      return null;
    }

    if (seg.type === 'md_style') {
      if (seg.style === 'bold_italic') {
        return (
          <strong key={index} className="font-bold italic">
            {renderInlineTokens(seg.inner, depth + 1)}
          </strong>
        );
      }
      return (
        <strong key={index} className="font-bold">
          {renderInlineTokens(seg.inner, depth + 1)}
        </strong>
      );
    }

    if (seg.type === 'image') {
      if (!isSafeImageUrl(seg.src)) {
        return <span key={index} className="text-slate-500 text-xs">[{seg.alt}]</span>;
      }
      return (
        <span key={index} className="my-2 block">
          <img
            src={seg.src}
            alt={seg.alt || 'Hình ảnh minh họa'}
            loading="lazy"
            className="hq-question-img inline-block shadow-xs"
          />
        </span>
      );
    }

    if (seg.type === 'text') {
      // Plain text with Chemistry Auto-Formatter
      return <span key={index}>{renderSmartChemistry(seg.value)}</span>;
    }

    return null;
  });
}

/**
 * KaTeX Safe Math Element (normalizes escaped syntax, keeps inline baseline aligned, and falls back gracefully)
 */
const KatexMathBlock: React.FC<{ math: string; displayMode: boolean }> = ({ math, displayMode }) => {
  const normalized = normalizeLatexExpression(math);
  if (!normalized) return null;

  const renderWithKatex = (expr: string, strictErr: boolean) =>
    katex.renderToString(expr, {
      displayMode,
      throwOnError: strictErr,
      errorColor: '#b91c1c',
      strict: false,
      trust: false,
    });

  try {
    let html: string;
    try {
      html = renderWithKatex(normalized, true);
    } catch {
      // Fallback: strip stray unescaped backslashes before underscores and retry strict render before falling back to safe text badge
      const relaxed = normalized.replace(/\\_(?=[A-Za-z0-9{])/g, '_');
      html = renderWithKatex(relaxed, true);
    }

    const Tag = displayMode ? 'div' : 'span';
    return (
      <Tag
        className={`${
          displayMode
            ? 'my-2 block overflow-x-auto text-center hq-katex-display'
            : 'inline-block px-0.5 align-baseline hq-katex-inline'
        } text-slate-900 select-text`}
        dangerouslySetInnerHTML={{ __html: html }}
      />
    );
  } catch {
    return (
      <span
        className="font-mono text-amber-800 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded text-[0.9em]"
        title="Công thức không thể phân tích hoàn toàn bằng KaTeX — đang hiển thị dạng dự phòng"
      >
        {normalized}
      </span>
    );
  }
};

/**
 * Chemistry Plain-Text Formatter:
 * Formats:
 * - Conditional reaction arrows: ->[t°], -->[xt, t°], <=>[Fe][t°]
 * - Plain reaction arrows: ->, -->, →, <=>, ⇌, ⇄
 * - Gas ↑ and precipitate ↓
 * - Chemical formulas (preserving parentheses & brackets!): H2SO4, 4HNO3, Fe(NO3)3, Al2(SO4)3, Ca(OH)2
 * - Ion charges (including spaced): Fe3+, Cu2+, SO4 2-, PO4^3-, [Cu(NH3)4]2+, [Ag(NH3)2]+
 * - Organic bonds: CH3-CH2-OH, CH2=CH2, CH≡CH
 * - Units & symbols: %, ‰, °C, kJ/mol, mol/L, ±, ≥, ≤, ≠, ≈, Δ
 */
function renderSmartChemistry(content: string): React.ReactNode {
  // Handle inline conditional arrow syntax first: e.g. ->[t°], -->[xt], <=>[Fe][t°]
  const condArrowSplit = /((?:<==>|<=>|⇄|⇆|-->|->|→)\[[^\]\n]+\](?:\[[^\]\n]+\])?)/g;
  if (condArrowSplit.test(content)) {
    const segs = content.split(condArrowSplit);
    return (
      <>
        {segs.map((seg, i) => {
          if (!seg) return null;
          const revMatch = seg.match(/^(?:<==>|<=>|⇄|⇆)\[([^\]]+)\](?:\[([^\]]+)\])?$/);
          if (revMatch) {
            const top = formatArrowCondLatex(revMatch[1]);
            const bot = revMatch[2] ? formatArrowCondLatex(revMatch[2]) : '';
            return (
              <KatexMathBlock
                key={i}
                math={bot ? `\\xrightleftharpoons[${bot}]{${top}}` : `\\xrightleftharpoons{${top}}`}
                displayMode={false}
              />
            );
          }
          const fwdMatch = seg.match(/^(?:-->|->|→)\[([^\]]+)\](?:\[([^\]]+)\])?$/);
          if (fwdMatch) {
            const top = formatArrowCondLatex(fwdMatch[1]);
            const bot = fwdMatch[2] ? formatArrowCondLatex(fwdMatch[2]) : '';
            return (
              <KatexMathBlock
                key={i}
                math={bot ? `\\xrightarrow[${bot}]{${top}}` : `\\xrightarrow{${top}}`}
                displayMode={false}
              />
            );
          }
          return <React.Fragment key={i}>{renderPlainChemistryCore(seg)}</React.Fragment>;
        })}
      </>
    );
  }

  return renderPlainChemistryCore(content);
}

function formatArrowCondLatex(cond: string): string {
  const c = cond.trim();
  if (/^t[°o]$/i.test(c)) return 't^\\circ';
  return c
    .replace(/t°/g, 't^\\circ')
    .replace(/°C/g, '^\\circ\\text{C}')
    .replace(/°/g, '^\\circ')
    .replace(/([àáảãạăằắẳẵặâầấẩẫậèéẻẽẹêềếểễệìíỉĩịòóỏõọôồốổỗộơờớởỡợùúủũụưừứửữựỳýỷỹỵđĐ][A-Za-zÀ-ỹ\s,]*)/gi, '\\text{$1}');
}

function renderPlainChemistryCore(content: string): React.ReactNode {
  const normalized = content
    .replace(/<===>|<=>|⇄|⇆/g, ' ⇌ ')
    .replace(/-->|->/g, ' → ')
    .replace(/\\Delta\b/g, 'Δ')
    .replace(/\\uparrow\b/gi, '↑')
    .replace(/\\downarrow\b/gi, '↓');

  const lines = normalized.split('\n');

  return (
    <>
      {lines.map((line, lineIdx) => (
        <React.Fragment key={lineIdx}>
          {lineIdx > 0 && <br />}
          {formatLineChemistry(line)}
        </React.Fragment>
      ))}
    </>
  );
}

function formatLineChemistry(line: string): React.ReactNode {
  if (!line) return null;
  if (!line.trim()) return line;

  // Pre-merge spaced ion charges safely: e.g. "SO4 2-" -> "SO4^2-", "[Cu(NH3)4] 2+" -> "[Cu(NH3)4]^2+"
  const withMergedCharges = line.replace(
    /\b([A-Z][A-Za-z0-9()]*\d+|\[[A-Za-z0-9()]+\])[ \t]+([1-4]?[+-])(?=\s|$|[.,;:)\]])/g,
    '$1^$2'
  );

  // Split by reaction arrows ONLY, keeping spaces intact
  const arrowParts = withMergedCharges.split(/(\s*→\s*|\s*⇌\s*)/g);

  return arrowParts.map((part, pIdx) => {
    if (!part) return null;

    if (part.includes('→')) {
      return (
        <span key={pIdx} className="font-bold text-blue-700 px-1.5 select-none text-sm inline-block">
          →
        </span>
      );
    }
    if (part.includes('⇌')) {
      return (
        <span key={pIdx} className="font-bold text-emerald-700 px-1.5 select-none text-sm inline-block">
          ⇌
        </span>
      );
    }

    // Split STRICTLY on whitespace so parentheses inside Fe(NO3)3, Al2(SO4)3, [Cu(NH3)4]2+ stay intact!
    const chunks = part.split(/(\s+)/g);

    return (
      <span key={pIdx}>
        {chunks.map((chunk, cIdx) => {
          if (!chunk) return null;
          if (/^\s+$/.test(chunk)) {
            return <span key={cIdx}>{chunk}</span>;
          }

          const { lead, core, trail } = peelOuterPunctuation(chunk);

          if (!core) {
            return <span key={cIdx}>{chunk}</span>;
          }

          // Handle Unicode chemistry & equilibrium constants like K_C, [H₂]·[Br₂], [HBr]², SO₄²⁻
          if (core.includes('·') && /[\[\]₀-₉¹²³⁰⁴⁵⁶⁷⁸⁹⁺⁻\d]/.test(core)) {
            return (
              <React.Fragment key={cIdx}>
                {lead && <span>{lead}</span>}
                {core.split('·').map((subTok, stIdx) => (
                  <React.Fragment key={stIdx}>
                    {stIdx > 0 && <span className="px-0.5 font-bold text-slate-700">·</span>}
                    {formatCompoundOrConstant(subTok)}
                  </React.Fragment>
                ))}
                {trail && <span>{trail}</span>}
              </React.Fragment>
            );
          }

          if (isEquilibriumOrVarSubscript(core)) {
            const [base, subPart] = core.split('_');
            return (
              <React.Fragment key={cIdx}>
                {lead && <span>{lead}</span>}
                <span className="font-semibold text-slate-900">
                  <em className="italic font-serif">{base}</em>
                  <sub className="text-[0.73em] font-semibold text-slate-800">{subPart}</sub>
                </span>
                {trail && <span>{trail}</span>}
              </React.Fragment>
            );
          }

          if (isChemicalFormulaToken(normalizeUnicodeSubSup(core))) {
            return (
              <React.Fragment key={cIdx}>
                {lead && <span>{lead}</span>}
                <FormattedChemicalFormula formula={normalizeUnicodeSubSup(core)} />
                {trail && <span>{trail}</span>}
              </React.Fragment>
            );
          }

          if (/^\d+(?:[,.]\d+)?(?:%|‰|°C|M|g|kg|mol|mL|L)$/i.test(core)) {
            return (
              <React.Fragment key={cIdx}>
                {lead && <span>{lead}</span>}
                <span className="font-medium text-slate-900">{core}</span>
                {trail && <span>{trail}</span>}
              </React.Fragment>
            );
          }

          return <span key={cIdx}>{chunk}</span>;
        })}
      </span>
    );
  });
}

const UNICODE_SUB_MAP: Record<string, string> = {
  '₀': '0',
  '₁': '1',
  '₂': '2',
  '₃': '3',
  '₄': '4',
  '₅': '5',
  '₆': '6',
  '₇': '7',
  '₈': '8',
  '₉': '9',
};

const UNICODE_SUP_MAP: Record<string, string> = {
  '⁰': '0',
  '¹': '1',
  '²': '2',
  '³': '3',
  '⁴': '4',
  '⁵': '5',
  '⁶': '6',
  '⁷': '7',
  '⁸': '8',
  '⁹': '9',
  '⁺': '+',
  '⁻': '-',
};

function normalizeUnicodeSubSup(token: string): string {
  let out = token.replace(/[₀-₉]/g, ch => UNICODE_SUB_MAP[ch] || ch);
  out = out.replace(/[¹²³⁰⁴⁵⁶⁷⁸⁹⁺⁻]+/g, seq => {
    const ascii = seq
      .split('')
      .map(c => UNICODE_SUP_MAP[c] || c)
      .join('');
    return `^{${ascii}}`;
  });
  return out;
}

function isEquilibriumOrVarSubscript(token: string): boolean {
  return /^(?:K|pK)_(?:[CcPpAaBbWw]|sp|eq|b|a)$/i.test(token);
}

function formatCompoundOrConstant(tok: string): React.ReactNode {
  const { lead, core, trail } = peelOuterPunctuation(tok);
  const norm = normalizeUnicodeSubSup(core);
  if (isChemicalFormulaToken(norm)) {
    return (
      <>
        {lead && <span>{lead}</span>}
        <FormattedChemicalFormula formula={norm} />
        {trail && <span>{trail}</span>}
      </>
    );
  }
  return tok;
}

/**
 * Peels only outer sentence punctuation (.,;:!?) and UNMATCHED outer parentheses/brackets
 * without breaking balanced chemical formulas like Fe(NO3)3, Ca(OH)2, or [Cu(NH3)4]2+.
 */
function peelOuterPunctuation(token: string): { lead: string; core: string; trail: string } {
  let lead = '';
  let core = token;
  let trail = '';

  // Peel leading quotes or opening parens when the token doesn't start with a complex bracket [Cu(...)
  while (core.length > 0 && /^["'“‘(]/.test(core)) {
    lead += core[0];
    core = core.slice(1);
  }

  // Peel trailing sentence punctuation .,;:!?"'”’
  while (core.length > 0 && /[.,;:!?"'”’]$/.test(core)) {
    trail = core[core.length - 1] + trail;
    core = core.slice(0, -1);
  }

  // Peel trailing ')' only if there are more ')' than '(' inside core (i.e. it closed an outer paren!)
  while (core.endsWith(')')) {
    const openCount = (core.match(/\(/g) || []).length;
    const closeCount = (core.match(/\)/g) || []).length;
    if (closeCount > openCount) {
      trail = ')' + trail;
      core = core.slice(0, -1);
      // Also peel any inner trailing punctuation exposed after removing ')'
      while (core.length > 0 && /[.,;:!?]$/.test(core)) {
        trail = core[core.length - 1] + trail;
        core = core.slice(0, -1);
      }
    } else {
      break;
    }
  }

  return { lead, core, trail };
}

/**
 * Checks if a token looks like a chemical formula (with optional leading stoichiometric coefficient and trailing ↑/↓)
 */
function isChemicalFormulaToken(rawToken: string): boolean {
  if (!rawToken || rawToken.length < 2) return false;

  // Strip trailing gas/precipitate arrow if attached: e.g. H2↑, CO2↑, CaCO3↓
  const noArrow = rawToken.replace(/[↑↓]+$/, '');
  if (noArrow.length < 2) return false;

  // Allow optional leading stoichiometric coefficient: e.g. 4HNO3, 2H2O, 3H2, 2Fe(OH)3
  const coeffMatch = noArrow.match(/^(\d+)([A-Z\[].*)$/);
  const token = coeffMatch ? coeffMatch[2] : noArrow;

  if (!token || token.length < 2) return false;

  // Discard Vietnamese/English prose words
  if (
    /^(Khi|Trong|Cho|Chất|Dung|Biết|Sau|Tính|Nếu|Hãy|Thí|Đề|Mỗi|Phần|Câu|Các|Có|Lấy|Hòa|Đốt|Kim|Nước|Muối|Dầu|Axit|Aces|Acid|Base|Anion|Cation|Mol|Gam|Lít|Học|Sinh|Giáo|Viên|Nam|Bắc|The|And|With|For|From|That|This|Then|When|What|Which)$/i.test(
      token
    )
  ) {
    return false;
  }

  // Polymer brackets / structural formula like [C6H7O2(OOCCH3)3]n or (C6H10O5)n
  if (/^[\[\(][A-Z][A-Za-z0-9()\[\]]+[\]\)]n?$/.test(token) && /\d/.test(token)) {
    return true;
  }

  // Organic structural formulas with hyphens, equals, triples e.g. CH3-CH2-OH, CH2=CH2, CH≡CH
  if (/[A-Z][a-z0-9]*[–\-=≡][A-Z]/.test(token) && /^[A-Za-z0-9()\[\]–\-=≡+^{}]+$/.test(token)) {
    return true;
  }

  // Concentration / complex ions e.g. [HBr]^2, [H2], [Cu(NH3)4]2+, [Cu(NH3)4]^2+, [Ag(NH3)2]+
  if (/^\[[A-Z][A-Za-z0-9()]+\](?:\^\{?[0-9]*[+-]?\}?|\^?[0-9]*[+-]?)$/.test(token)) {
    return true;
  }

  // Element with digits or caret superscripts e.g. H2, CO2, H2SO4, C6H12O6, Fe2O3, KMnO4, Fe(NO3)3, Fe^{3+}
  const hasElementAndDigits = /^[A-Z][a-z]?[0-9]/.test(token) || /[A-Z][a-z]?[0-9]+[A-Z\)]/.test(token) || /\)[0-9]+/.test(token);

  // Element with charges e.g. Fe3+, Cu2+, Al3+, Cl-, Na+, SO42-, SO4^2-, Fe^{3+}
  const hasCharge = /(?:[0-9]*[+-]|\^\{?[0-9]*[+-]?\}?)$/.test(token);

  // Parentheses in formula e.g. Ca(OH)2, Ba(NO3)2, Al2(SO4)3, Fe(NO3)3
  const hasFormulaParens = /^[A-Z][a-z]?\d*\([A-Za-z0-9]+\)\d*/.test(token);

  // Valid chemical formula characters (also allow leading/trailing stoichiometry or caret charges)
  const validCharsOnly = /^[A-Z\[][A-Za-z0-9()\[\]+\-^–=≡{}]+$/.test(token);

  return validCharsOnly && (hasElementAndDigits || hasCharge || hasFormulaParens);
}

/**
 * Formats a chemical token (including optional leading coefficient & trailing ↑/↓) into JSX with accurate subscripts and superscripts
 */
const FormattedChemicalFormula: React.FC<{ formula: string }> = ({ formula }) => {
  const arrowMatch = formula.match(/([↑↓]+)$/);
  const trailingArrow = arrowMatch ? arrowMatch[1] : '';
  const withoutArrow = trailingArrow ? formula.slice(0, -trailingArrow.length) : formula;

  const coeffMatch = withoutArrow.match(/^(\d+)([A-Z\[].*)$/);
  const leadingCoeff = coeffMatch ? coeffMatch[1] : '';
  const coreFormula = coeffMatch ? coeffMatch[2] : withoutArrow;

  const elements: React.ReactNode[] = [];
  let i = 0;

  while (i < coreFormula.length) {
    const char = coreFormula[i];

    // Explicit caret superscript: ^2+, ^-, ^{2-}
    if (char === '^') {
      i++;
      let supText = '';
      if (coreFormula[i] === '{') {
        i++;
        while (i < coreFormula.length && coreFormula[i] !== '}') {
          supText += coreFormula[i];
          i++;
        }
        if (coreFormula[i] === '}') i++;
      } else {
        while (i < coreFormula.length && /[0-9+\-]/.test(coreFormula[i])) {
          supText += coreFormula[i];
          i++;
        }
      }
      elements.push(
        <sup key={`sup-${i}`} className="text-[0.73em] font-bold text-blue-800">
          {supText}
        </sup>
      );
      continue;
    }

    // Trailing ion charge e.g. 2+, 3+, 2-, +, - (only at end of formula or followed by non-letter)
    if (
      (char === '+' || char === '-') &&
      (i === coreFormula.length - 1 || !/[A-Z]/.test(coreFormula[i + 1]))
    ) {
      elements.push(
        <sup key={`charge-${i}`} className="text-[0.73em] font-bold text-blue-800">
          {char}
        </sup>
      );
      i++;
      continue;
    }

    if (
      /\d/.test(char) &&
      (coreFormula[i + 1] === '+' || coreFormula[i + 1] === '-') &&
      (i + 2 === coreFormula.length || !/[a-zA-Z]/.test(coreFormula[i + 2]))
    ) {
      elements.push(
        <sup key={`charge-${i}`} className="text-[0.73em] font-bold text-blue-800">
          {char + coreFormula[i + 1]}
        </sup>
      );
      i += 2;
      continue;
    }

    // Numbers in formula: subscripts (e.g. H2 -> H<sub>2</sub>, Fe(NO3)3 -> Fe(NO<sub>3</sub>)<sub>3</sub>)
    if (/\d/.test(char)) {
      let num = '';
      while (i < coreFormula.length && /\d/.test(coreFormula[i])) {
        if (
          (coreFormula[i + 1] === '+' || coreFormula[i + 1] === '-') &&
          (i + 2 === coreFormula.length || !/[a-zA-Z]/.test(coreFormula[i + 2]))
        ) {
          break;
        }
        num += coreFormula[i];
        i++;
      }
      if (num) {
        elements.push(
          <sub key={`sub-${i}`} className="text-[0.73em] font-semibold text-slate-800">
            {num}
          </sub>
        );
      }
      continue;
    }

    // Trailing polymer index 'n' after closing paren/bracket: (C6H10O5)n -> (C6H10O5)<sub>n</sub>
    if (
      char === 'n' &&
      i === coreFormula.length - 1 &&
      i > 0 &&
      (coreFormula[i - 1] === ')' || coreFormula[i - 1] === ']')
    ) {
      elements.push(
        <sub key={`poly-${i}`} className="text-[0.73em] italic font-semibold text-slate-800">
          n
        </sub>
      );
      i++;
      continue;
    }

    // Organic bonds: hyphen -, en-dash –, double bond =, triple bond ≡
    if (char === '-' || char === '–') {
      elements.push(
        <span key={`bond-${i}`} className="px-0.5 text-slate-500 font-bold select-none">
          –
        </span>
      );
      i++;
      continue;
    }
    if (char === '=') {
      elements.push(
        <span key={`double-${i}`} className="px-0.5 text-blue-600 font-bold select-none">
          =
        </span>
      );
      i++;
      continue;
    }
    if (char === '≡') {
      elements.push(
        <span key={`triple-${i}`} className="px-0.5 text-indigo-600 font-bold select-none">
          ≡
        </span>
      );
      i++;
      continue;
    }

    elements.push(<span key={`c-${i}`}>{char}</span>);
    i++;
  }

  return (
    <span className="font-semibold text-slate-900 tracking-tight inline-block chem-formula">
      {leadingCoeff && <span className="font-semibold text-slate-900">{leadingCoeff}</span>}
      {elements}
      {trailingArrow && <span className="text-slate-700 font-bold">{trailingArrow}</span>}
    </span>
  );
};

export default ChemicalContentRenderer;
