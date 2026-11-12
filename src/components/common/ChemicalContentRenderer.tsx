/**
 * CHEMICAL CONTENT RENDERER (HQTest Unified Formula & Equation Engine)
 * Component hiển thị thống nhất cho toàn bộ hệ thống HQTest:
 * - Văn bản tiếng Việt có dấu
 * - Biểu thức toán học KaTeX ($...$ và $$...$$)
 * - Công thức hóa học chỉ số trên/dưới tự động (H2SO4, Fe3+, SO4 2-, [Cu(NH3)4]2+)
 * - Phương trình hóa học (mũi tên, điều kiện t°, thuận nghịch ⇌, khí ↑, kết tủa ↓)
 * - Công thức hữu cơ (liên kết đơn -, đôi =, ba ≡, nhóm chức)
 * - Bảng Markdown (|...|)
 * - Thẻ HTML an toàn (sub, sup, b, i, u, br)
 * - Hình ảnh minh họa nhúng từ DOCX (data URL hoặc ảnh web)
 * - Bảo toàn ký hiệu %, ‰, °C, kJ/mol, mol/L, ±, ≥, ≤, ≠, ≈, Δ
 */

import React from 'react';
import katex from 'katex';

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

  // 1. Check if text contains Markdown table
  if (hasMarkdownTable(rawText)) {
    return <RenderContentWithTables text={rawText} className={className} inline={inline} />;
  }

  // 2. Standard rendering
  return renderTextBlocks(rawText, className, inline);
};

/**
 * Checks if text contains a markdown table (| ... |)
 */
function hasMarkdownTable(text: string): boolean {
  return /\|[^\n]+\|\r?\n\|[\s\-:]+\|\r?\n\|[^\n]+\|/m.test(text);
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
    const line = lines[i];
    const isTableLine = line.trim().startsWith('|') && line.trim().endsWith('|');

    if (isTableLine) {
      if (!inTable) {
        if (currentTextLines.length > 0) {
          blocks.push({ type: 'text', content: currentTextLines.join('\n') });
          currentTextLines = [];
        }
        inTable = true;
      }
      currentTableLines.push(line.trim());
    } else {
      if (inTable) {
        blocks.push({ type: 'table', content: currentTableLines });
        currentTableLines = [];
        inTable = false;
      }
      currentTextLines.push(line);
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
        return (
          <div key={idx}>
            {renderTextBlocks(block.content as string, '', !!inline)}
          </div>
        );
      })}
    </div>
  );
};

/**
 * Renders Markdown Table as clean styled HTML Table
 */
const TableRenderer: React.FC<{ tableLines: string[] }> = ({ tableLines }) => {
  if (tableLines.length < 2) return null;

  const headerLine = tableLines[0];
  const separatorLine = tableLines[1];
  const dataLines = tableLines.slice(2);

  // Split pipes
  const parseRow = (line: string) => {
    return line
      .slice(1, -1)
      .split('|')
      .map(cell => cell.trim());
  };

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
 * Splits text into LaTeX segments ($...$ and $$...$$), HTML tags (sub, sup, img), and plain chemical text
 */
function renderTextBlocks(text: string, className: string, inline: boolean): React.ReactElement {
  // Regex splitting:
  // 1. Display Math: $$...$$ or \[...\]
  // 2. Inline Math: $...$ or \(...\)
  // 3. HTML tags: <sub>...</sub>, <sup>...</sup>, <img.../>, <b>...</b>, <i>...</i>
  // 4. Markdown images: ![alt](url)
  const masterSplitRegex = /(\$\$[\s\S]*?\$\$|\\\[[\s\S]*?\\\]|\$[^$\n]+\$|\\\([\s\S]*?\\\)|<sub>[\s\S]*?<\/sub>|<sup>[\s\S]*?<\/sup>|<img\b[^>]*\/>|!\[[^\]]*\]\([^\)]+\))/gi;

  const parts = text.split(masterSplitRegex);

  const Component = inline ? 'span' : 'div';

  return (
    <Component className={`leading-relaxed ${className}`}>
      {parts.map((part, index) => {
        if (!part) return null;

        // 1. Display Math: $$ ... $$ or \[ ... \]
        if ((part.startsWith('$$') && part.endsWith('$$')) || (part.startsWith('\\[') && part.endsWith('\\]'))) {
          const rawMath = part.startsWith('$$') ? part.slice(2, -2) : part.slice(2, -2);
          return <KatexMathBlock key={index} math={rawMath} displayMode={true} />;
        }

        // 2. Inline Math: $ ... $ or \( ... \)
        if ((part.startsWith('$') && part.endsWith('$')) || (part.startsWith('\\(') && part.endsWith('\\)'))) {
          const rawMath = part.startsWith('$') ? part.slice(1, -1) : part.slice(2, -2);
          return <KatexMathBlock key={index} math={rawMath} displayMode={false} />;
        }

        // 3. HTML Subscript: <sub>...</sub>
        if (/^<sub>([\s\S]*?)<\/sub>$/i.test(part)) {
          const match = part.match(/^<sub>([\s\S]*?)<\/sub>$/i);
          return (
            <sub key={index} className="text-[0.72em] font-semibold text-slate-800">
              {match ? match[1] : ''}
            </sub>
          );
        }

        // 4. HTML Superscript: <sup>...</sup>
        if (/^<sup>([\s\S]*?)<\/sup>$/i.test(part)) {
          const match = part.match(/^<sup>([\s\S]*?)<\/sup>$/i);
          return (
            <sup key={index} className="text-[0.72em] font-bold text-blue-800">
              {match ? match[1] : ''}
            </sup>
          );
        }

        // 5. Markdown Image: ![alt](url)
        if (/^!\[([^\]]*)\]\(([^\)]+)\)$/i.test(part)) {
          const m = part.match(/^!\[([^\]]*)\]\(([^\)]+)\)$/i);
          if (m) {
            return (
              <span key={index} className="my-2 block text-center">
                <img 
                  src={m[2]} 
                  alt={m[1] || 'Hình ảnh minh họa'} 
                  className="max-h-72 max-w-full rounded-xl border border-slate-200 shadow-xs inline-block bg-white p-1" 
                />
              </span>
            );
          }
        }

        // 6. HTML Image: <img ... />
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

        // 7. Plain text with Chemistry Auto-Formatter
        return <span key={index}>{renderSmartChemistry(part)}</span>;
      })}
    </Component>
  );
}

/**
 * KaTeX Safe Math Element (Handles KaTeX errors gracefully)
 */
const KatexMathBlock: React.FC<{ math: string; displayMode: boolean }> = ({ math, displayMode }) => {
  const cleanMath = math.trim();
  if (!cleanMath) return null;

  try {
    const html = katex.renderToString(cleanMath, {
      displayMode,
      throwOnError: false,
      strict: false,
    });

    const Tag = displayMode ? 'div' : 'span';
    return (
      <Tag
        className={`${displayMode ? 'my-2 block overflow-x-auto text-center' : 'inline-block px-0.5'} text-slate-900 font-serif select-text`}
        dangerouslySetInnerHTML={{ __html: html }}
      />
    );
  } catch {
    // Fallback: render text without throwing
    return <span className="font-mono text-purple-700 font-medium px-1 bg-purple-50 rounded">${cleanMath}$</span>;
  }
};

/**
 * Chemistry Plain-Text Formatter:
 * Formats:
 * - Reaction arrows (->, -->, →, <=>, ⇌, ⇄, \xrightarrow{t^\circ})
 * - Gas ↑ and precipitate ↓
 * - Chemical formulas: H2SO4, Fe2O3, Al2(SO4)3, Ca(OH)2, CH3COOH, C6H12O6
 * - Ion charges: Fe3+, Cu2+, SO4 2-, PO4 3-, NH4+, [Cu(NH3)4]2+, [Ag(NH3)2]+
 * - Organic bonds: CH3-CH2-OH, CH2=CH2, CH≡CH
 * - Temperature and reaction conditions: t°, 25°C, xt, đun nóng
 * - Percent %, ‰, ±, ≥, ≤, ≠, ≈, Δ, α, β, γ
 */
function renderSmartChemistry(content: string): React.ReactNode {
  // Normalize arrows and symbols
  const normalized = content
    .replace(/<===>|<=>|⇄|⇆/g, ' ⇌ ')
    .replace(/-->|->/g, ' → ')
    .replace(/\\Delta|delta H|ΔH/gi, 'ΔᵣH')
    .replace(/\\uparrow/gi, '↑')
    .replace(/\\downarrow/gi, '↓');

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
  if (!line.trim()) return null;

  // Split by reaction arrow segments: ' → ' or ' ⇌ '
  const arrowParts = line.split(/(\s*→\s*|\s*⇌\s*)/g);

  return arrowParts.map((part, pIdx) => {
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

    // Split into words/tokens, separating punctuation but keeping chemical formulas intact
    // Keep units like %, °C, kJ/mol, mol/L intact
    const words = part.split(/(\s+|[,;()\[\]])/g);

    return (
      <span key={pIdx}>
        {words.map((word, wIdx) => {
          if (!word) return null;
          if (word.startsWith(' ') || word === ',' || word === ';' || word === '(' || word === ')' || word === '[' || word === ']') {
            return <span key={wIdx}>{word}</span>;
          }

          if (isChemicalFormulaToken(word)) {
            return <FormattedChemicalFormula key={wIdx} formula={word} />;
          }

          // Check for units with numbers e.g. 10%, 25°C, 100kJ/mol
          if (/^\d+(?:[,.]\d+)?(?:%|‰|°C|M|g|kg|mol|mL|L)$/i.test(word)) {
            return <span key={wIdx} className="font-medium text-slate-900">{word}</span>;
          }

          return <span key={wIdx}>{word}</span>;
        })}
      </span>
    );
  });
}

/**
 * Checks if a word token looks like a chemical formula:
 * e.g. H2O, H2SO4, Fe2O3, Al2(SO4)3, Ca(OH)2, CH3COOH, C6H12O6, Fe3+, Cu2+, SO4^2-, [Cu(NH3)4]2+, CH3-CH2-OH, CH2=CH2, CH≡CH
 */
function isChemicalFormulaToken(token: string): boolean {
  if (!token || token.length < 2) return false;

  // Discard pure Vietnamese or English words starting with capital letter
  if (/^(Khi|Trong|Cho|Chất|Dung|Biết|Sau|Tính|Nếu|Hãy|Thí|Đề|Mỗi|Phần|Câu|Các|Có|Lấy|Hòa|Đốt|Kim|Nước|Muối|Dầu|Axit|Aces|Acid|Base|Anion|Cation|Mol|Gam|Lít|Học|Sinh|Giáo|Viên|Nam|Bắc)$/i.test(token)) {
    return false;
  }
  if (/^(The|And|With|For|From|That|This|Then|When|What|Which)$/i.test(token)) {
    return false;
  }

  // Organic structural formulas with hyphens, equals, triples e.g. CH3-CH2-OH, CH2=CH2, CH≡CH
  if (/[A-Z][a-z0-9]*[–\-=≡][A-Z]/.test(token)) {
    return true;
  }

  // Complex ions e.g. [Cu(NH3)4]2+ or [Ag(NH3)2]+
  if (/^\[[A-Z][a-z0-9()]+\][0-9]*[+-]?$/i.test(token)) {
    return true;
  }

  // Element with digits e.g. H2, CO2, H2SO4, C6H12O6, Fe2O3, KMnO4
  const hasElementAndDigits = /^[A-Z][a-z]?[0-9]/.test(token) || /[A-Z][a-z]?[0-9]+[A-Z]/.test(token);

  // Element with charges e.g. Fe3+, Cu2+, Al3+, Cl-, Na+, SO42-, SO4^2-
  const hasCharge = /[0-9]*[+-]$/.test(token) || /\^[0-9]*[+-]/.test(token);

  // Parentheses in formula e.g. Ca(OH)2, Ba(NO3)2, Al2(SO4)3
  const hasFormulaParens = /^[A-Z][a-z]?\([A-Za-z0-9]+\)[0-9]*/.test(token);

  // Valid chemical formula characters
  const validCharsOnly = /^[A-Z][a-z0-9()\[\]+\-^–=≡]+$/.test(token);

  return validCharsOnly && (hasElementAndDigits || hasCharge || hasFormulaParens);
}

/**
 * Formats a chemical token into JSX with accurate subscripts and superscripts:
 * e.g. H2SO4 -> H<sub>2</sub>SO<sub>4</sub>
 * Fe3+ -> Fe<sup>3+</sup>
 * SO4 2- or SO4^2- -> SO<sub>4</sub><sup>2-</sup>
 * [Cu(NH3)4]2+ -> [Cu(NH<sub>3</sub>)<sub>4</sub>]<sup>2+</sup>
 * CH3-CH2-OH -> CH<sub>3</sub>–CH<sub>2</sub>–OH
 */
const FormattedChemicalFormula: React.FC<{ formula: string }> = ({ formula }) => {
  const elements: React.ReactNode[] = [];
  let i = 0;

  while (i < formula.length) {
    const char = formula[i];

    // Explicit caret superscript: ^2+, ^-, ^{2-}
    if (char === '^') {
      i++;
      let supText = '';
      if (formula[i] === '{') {
        i++;
        while (i < formula.length && formula[i] !== '}') {
          supText += formula[i];
          i++;
        }
        if (formula[i] === '}') i++;
      } else {
        while (i < formula.length && /[0-9+\-]/.test(formula[i])) {
          supText += formula[i];
          i++;
        }
      }
      elements.push(<sup key={`sup-${i}`} className="text-[0.72em] font-bold text-blue-800">{supText}</sup>);
      continue;
    }

    // Trailing ion charge e.g. 2+, 3+, 2-, +, -
    if ((char === '+' || char === '-') || (/\d/.test(char) && (formula[i+1] === '+' || formula[i+1] === '-'))) {
      if (/\d/.test(char) && (formula[i+1] === '+' || formula[i+1] === '-')) {
        elements.push(<sup key={`charge-${i}`} className="text-[0.72em] font-bold text-blue-800">{char + formula[i+1]}</sup>);
        i += 2;
        continue;
      } else {
        elements.push(<sup key={`charge-${i}`} className="text-[0.72em] font-bold text-blue-800">{char}</sup>);
        i++;
        continue;
      }
    }

    // Numbers in formula: subscripts (e.g. H2 -> H<sub>2</sub>)
    if (/\d/.test(char)) {
      let num = '';
      while (i < formula.length && /\d/.test(formula[i])) {
        // Look ahead: If followed immediately by + or - at end of formula, it's a charge, not a subscript!
        if ((formula[i+1] === '+' || formula[i+1] === '-') && (i + 2 === formula.length || !/[a-zA-Z]/.test(formula[i+2]))) {
          break;
        }
        num += formula[i];
        i++;
      }
      if (num) {
        elements.push(<sub key={`sub-${i}`} className="text-[0.72em] font-semibold text-slate-800">{num}</sub>);
      }
      continue;
    }

    // Organic bonds: hyphen -, en-dash –, double bond =, triple bond ≡
    if (char === '-' || char === '–') {
      elements.push(<span key={`bond-${i}`} className="px-0.5 text-slate-500 font-bold select-none">–</span>);
      i++;
      continue;
    }
    if (char === '=') {
      elements.push(<span key={`double-${i}`} className="px-0.5 text-blue-600 font-bold select-none">=</span>);
      i++;
      continue;
    }
    if (char === '≡') {
      elements.push(<span key={`triple-${i}`} className="px-0.5 text-indigo-600 font-bold select-none">≡</span>);
      i++;
      continue;
    }

    // Normal chemical character
    elements.push(<span key={`c-${i}`}>{char}</span>);
    i++;
  }

  return (
    <span className="font-semibold text-slate-900 tracking-tight px-0.5 inline-block chem-formula">
      {elements}
    </span>
  );
};

export default ChemicalContentRenderer;
