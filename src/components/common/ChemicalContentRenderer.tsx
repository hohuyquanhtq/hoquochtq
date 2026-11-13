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
  const rawText = content !== undefined ? content : text || '';
  if (!rawText) return null;

  // 1. Check if text contains Markdown table (including multi-column tables |---|---|)
  if (!inline && hasMarkdownTable(rawText)) {
    return <RenderContentWithTables text={rawText} className={className} inline={inline} />;
  }

  // 2. Standard rendering
  return renderTextBlocks(rawText, className, inline);
};

/**
 * Checks if text contains a single- or multi-column markdown table
 */
function hasMarkdownTable(text: string): boolean {
  return /^\s*\|[^\n]+\|\r?\n\s*\|[\s\-:|]+\|\r?\n\s*\|[^\n]+\|/m.test(text);
}

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
    <div className="overflow-x-auto my-2 border border-slate-200 rounded-xl shadow-2xs bg-white">
      <table className="w-full text-xs text-left border-collapse">
        <thead>
          <tr className="bg-slate-100 text-slate-800 font-bold border-b border-slate-200">
            {headers.map((h, i) => (
              <th key={i} className="py-2 px-3 border-r border-slate-200 last:border-r-0">
                <ChemicalContentRenderer content={h} inline />
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-200">
          {dataRows.map((row, rIdx) => (
            <tr key={rIdx} className="hover:bg-slate-50 transition-colors">
              {row.map((cell, cIdx) => (
                <td key={cIdx} className="py-2 px-3 border-r border-slate-200 last:border-r-0 text-slate-700">
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

function renderInlineTokens(text: string, depth: number): React.ReactNode {
  if (!text) return null;
  if (depth > 6) return renderSmartChemistry(text);

  const masterSplitRegex =
    /(\$\$[\s\S]*?\$\$|\\\[[\s\S]*?\\\]|(?<!\\)\$[^$\n]+(?<!\\)\$|\\\([\s\S]*?\\\)|\\x(?:right|left|leftrightarrow|rightleftharpoons|rightleftarrows|Rightarrow|Leftarrow|Leftrightarrow|longequal)(?:\[[^\]]*\])?\{[^}]*\}|<sub>[\s\S]*?<\/sub>|<sup>[\s\S]*?<\/sup>|<u>[\s\S]*?<\/u>|<s>[\s\S]*?<\/s>|<b>[\s\S]*?<\/b>|<strong>[\s\S]*?<\/strong>|<i>[\s\S]*?<\/i>|<em>[\s\S]*?<\/em>|<br\s*\/?>|<img\b[^>]*\/>|!\[[^\]]*\]\([^\)]+\)|\*\*\*[^\s*](?:[^*\n]*?[^\s*])?\*\*\*|\*\*[^\s*](?:[^*\n]*?[^\s*])?\*\*)/gi;

  const parts = text.split(masterSplitRegex);

  return parts.map((part, index) => {
    if (!part) return null;

    // 1. Display Math: $$ ... $$ or \[ ... \]
    if ((part.startsWith('$$') && part.endsWith('$$')) || (part.startsWith('\\[') && part.endsWith('\\]'))) {
      const rawMath = part.slice(2, -2);
      return <KatexMathBlock key={index} math={rawMath} displayMode={true} />;
    }

    // 2. Inline Math: $ ... $ or \( ... \)
    if ((part.startsWith('$') && part.endsWith('$')) || (part.startsWith('\\(') && part.endsWith('\\)'))) {
      const rawMath = part.startsWith('$') ? part.slice(1, -1) : part.slice(2, -2);
      return <KatexMathBlock key={index} math={rawMath} displayMode={false} />;
    }

    // 2b. Unwrapped extensible arrow command e.g. \xrightarrow{t^\circ}
    if (/^\\x(?:right|left|leftrightarrow|rightleftharpoons|rightleftarrows|Rightarrow|Leftarrow|Leftrightarrow|longequal)/i.test(part)) {
      return <KatexMathBlock key={index} math={part} displayMode={false} />;
    }

    // 3. HTML Subscript: <sub>...</sub>
    const subMatch = part.match(/^<sub>([\s\S]*?)<\/sub>$/i);
    if (subMatch) {
      return (
        <sub key={index} className="text-[0.73em] font-semibold text-slate-800">
          {subMatch[1].replace(/<[^>]+>/g, '')}
        </sub>
      );
    }

    // 4. HTML Superscript: <sup>...</sup>
    const supMatch = part.match(/^<sup>([\s\S]*?)<\/sup>$/i);
    if (supMatch) {
      return (
        <sup key={index} className="text-[0.73em] font-bold text-blue-800">
          {supMatch[1].replace(/<[^>]+>/g, '')}
        </sup>
      );
    }

    // 5. HTML Underline / Strike / Bold / Italic / Break
    const uMatch = part.match(/^<u>([\s\S]*?)<\/u>$/i);
    if (uMatch) {
      return (
        <u key={index} className="underline decoration-slate-500 underline-offset-2">
          {renderInlineTokens(uMatch[1], depth + 1)}
        </u>
      );
    }

    const sMatch = part.match(/^<s>([\s\S]*?)<\/s>$/i);
    if (sMatch) {
      return (
        <s key={index} className="line-through text-slate-500">
          {renderInlineTokens(sMatch[1], depth + 1)}
        </s>
      );
    }

    const bMatch = part.match(/^<(?:b|strong)>([\s\S]*?)<\/(?:b|strong)>$/i);
    if (bMatch) {
      return (
        <strong key={index} className="font-bold">
          {renderInlineTokens(bMatch[1], depth + 1)}
        </strong>
      );
    }

    const iMatch = part.match(/^<(?:i|em)>([\s\S]*?)<\/(?:i|em)>$/i);
    if (iMatch) {
      return (
        <em key={index} className="italic">
          {renderInlineTokens(iMatch[1], depth + 1)}
        </em>
      );
    }

    if (/^<br\s*\/?>$/i.test(part)) {
      return <br key={index} />;
    }

    // 6. Markdown Bold+Italic (***...***) and Bold (**...**)
    if (part.startsWith('***') && part.endsWith('***') && part.length > 6) {
      return (
        <strong key={index} className="font-bold italic">
          {renderInlineTokens(part.slice(3, -3), depth + 1)}
        </strong>
      );
    }

    if (part.startsWith('**') && part.endsWith('**') && part.length > 4) {
      return (
        <strong key={index} className="font-bold">
          {renderInlineTokens(part.slice(2, -2), depth + 1)}
        </strong>
      );
    }

    // 7. Markdown Image: ![alt](url)
    const mdImgMatch = part.match(/^!\[([^\]]*)\]\(([^\)]+)\)$/i);
    if (mdImgMatch) {
      return (
        <span key={index} className="my-2 block text-center">
          <img
            src={mdImgMatch[2]}
            alt={mdImgMatch[1] || 'Hình ảnh minh họa'}
            className="max-h-72 max-w-full rounded-xl border border-slate-200 shadow-xs inline-block bg-white p-1"
          />
        </span>
      );
    }

    // 8. HTML Image: <img ... />
    if (/^<img\b/i.test(part)) {
      const srcMatch = part.match(/src="([^"]+)"/i);
      const altMatch = part.match(/alt="([^"]*)"/i);
      if (srcMatch) {
        return (
          <span key={index} className="my-2 block text-center">
            <img
              src={srcMatch[1]}
              alt={altMatch ? altMatch[1] : 'Hình ảnh'}
              className="max-h-72 max-w-full rounded-xl border border-slate-200 shadow-xs inline-block bg-white p-1"
            />
          </span>
        );
      }
    }

    // 9. Plain text with Chemistry Auto-Formatter (unescape literal \$ if present)
    return <span key={index}>{renderSmartChemistry(part.replace(/\\\$/g, '$'))}</span>;
  });
}

/**
 * KaTeX Safe Math Element (Handles KaTeX errors gracefully and supports mhchem \ce / \pu)
 */
const KatexMathBlock: React.FC<{ math: string; displayMode: boolean }> = ({ math, displayMode }) => {
  const cleanMath = math.trim();
  if (!cleanMath) return null;

  const renderWithKatex = (expr: string) =>
    katex.renderToString(expr, {
      displayMode,
      throwOnError: true,
      strict: false,
      trust: false,
    });

  try {
    let html: string;
    try {
      html = renderWithKatex(cleanMath);
    } catch {
      // Retry after escaping unescaped '%' which would otherwise comment out trailing braces
      const repaired = cleanMath.replace(/(?<!\\)%/g, '\\%');
      try {
        html = renderWithKatex(repaired);
      } catch {
        html = katex.renderToString(repaired, {
          displayMode,
          throwOnError: false,
          strict: false,
        });
      }
    }

    const Tag = displayMode ? 'div' : 'span';
    return (
      <Tag
        className={`${
          displayMode ? 'my-2 block overflow-x-auto text-center hq-katex-display' : 'inline-block px-0.5 align-middle hq-katex-inline'
        } text-slate-900 select-text`}
        dangerouslySetInnerHTML={{ __html: html }}
      />
    );
  } catch {
    return (
      <span className="font-mono text-purple-700 font-medium px-1 bg-purple-50 rounded">
        ${cleanMath}$
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

          if (isChemicalFormulaToken(core)) {
            return (
              <React.Fragment key={cIdx}>
                {lead && <span>{lead}</span>}
                <FormattedChemicalFormula formula={core} />
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
  if (/[A-Z][a-z0-9]*[–\-=≡][A-Z]/.test(token) && /^[A-Za-z0-9()\[\]–\-=≡+^]+$/.test(token)) {
    return true;
  }

  // Complex ions e.g. [Cu(NH3)4]2+, [Cu(NH3)4]^2+, [Ag(NH3)2]+
  if (/^\[[A-Z][A-Za-z0-9()]+\](?:\^?[0-9]*[+-]?)$/.test(token)) {
    return true;
  }

  // Element with digits e.g. H2, CO2, H2SO4, C6H12O6, Fe2O3, KMnO4, Fe(NO3)3
  const hasElementAndDigits = /^[A-Z][a-z]?[0-9]/.test(token) || /[A-Z][a-z]?[0-9]+[A-Z\)]/.test(token) || /\)[0-9]+/.test(token);

  // Element with charges e.g. Fe3+, Cu2+, Al3+, Cl-, Na+, SO42-, SO4^2-
  const hasCharge = /(?:[0-9]*[+-]|\^[0-9]*[+-])$/.test(token);

  // Parentheses in formula e.g. Ca(OH)2, Ba(NO3)2, Al2(SO4)3, Fe(NO3)3
  const hasFormulaParens = /^[A-Z][a-z]?\d*\([A-Za-z0-9]+\)\d*/.test(token);

  // Valid chemical formula characters (also allow leading/trailing stoichiometry or caret charges)
  const validCharsOnly = /^[A-Z\[][A-Za-z0-9()\[\]+\-^–=≡]+$/.test(token);

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
