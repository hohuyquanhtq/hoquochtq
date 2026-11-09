import React from 'react';
import katex from 'katex';

interface ChemTextProps {
  text: string;
  className?: string;
  inline?: boolean;
}

/**
 * Format chemical text containing:
 * 1. KaTeX formulas: $...$ or $$...$$
 * 2. Chemical equations: -> (mũi tên), <=> (thuận nghịch), ^ (khí bay lên), v (kết tủa)
 * 3. Chemical formulas with auto subscript/superscript numbers: H2SO4, Fe3+, Cu2+, OH-
 */
export const ChemRenderer: React.FC<ChemTextProps> = ({ text, className = '', inline = false }) => {
  if (!text) return null;

  // Check if text has LaTeX syntax ($...$)
  const hasLatex = text.includes('$');

  if (hasLatex) {
    const parts = text.split(/(\$\$[\s\S]*?\$\$|\$[^$\n]+\$)/g);
    return (
      <span className={`inline-block ${className}`}>
        {parts.map((part, index) => {
          if (part.startsWith('$$') && part.endsWith('$$')) {
            const math = part.slice(2, -2).trim();
            try {
              const html = katex.renderToString(math, {
                displayMode: true,
                throwOnError: false,
              });
              return (
                <span
                  key={index}
                  className="my-2 block overflow-x-auto text-blue-950 font-serif"
                  dangerouslySetInnerHTML={{ __html: html }}
                />
              );
            } catch {
              return <span key={index} className="text-red-500 font-mono">{part}</span>;
            }
          } else if (part.startsWith('$') && part.endsWith('$')) {
            const math = part.slice(1, -1).trim();
            try {
              const html = katex.renderToString(math, {
                displayMode: false,
                throwOnError: false,
              });
              return (
                <span
                  key={index}
                  className="inline-block px-0.5 text-blue-950 font-serif"
                  dangerouslySetInnerHTML={{ __html: html }}
                />
              );
            } catch {
              return <span key={index} className="text-red-500 font-mono">{part}</span>;
            }
          }
          // Non-math text, format chemistry
          return <span key={index}>{renderSmartChem(part)}</span>;
        })}
      </span>
    );
  }

  // Pure text with chemistry conventions
  const Component = inline ? 'span' : 'div';
  return (
    <Component className={`leading-relaxed ${className}`}>
      {renderSmartChem(text)}
    </Component>
  );
};

/**
 * Parses normal Vietnamese chemistry text, converting symbols:
 * - Reaction arrows: "->" -> " → ", "<=>" -> " ⇌ "
 * - Gas: "↑" or "(k)"
 * - Precipitate: "↓" or "(r)"
 * - State indicators: (aq), (s), (l), (g)
 * - Basic chemical formulas like H2SO4, KMnO4, Fe(OH)3, Al3+, SO4 2-
 */
function renderSmartChem(content: string): React.ReactNode {
  // Normalize arrows
  const normalized = content
    .replace(/<===>|<=>|⇄/g, ' ⇌ ')
    .replace(/-->|->|→/g, ' → ')
    .replace(/\^/g, ' ↑ ')
    .replace(/\\Delta|delta H|ΔH/gi, 'ΔᵣH');

  // Split lines
  const lines = normalized.split('\n');
  return (
    <>
      {lines.map((line, lineIdx) => (
        <React.Fragment key={lineIdx}>
          {lineIdx > 0 && <br />}
          {tokenizeAndFormatLine(line)}
        </React.Fragment>
      ))}
    </>
  );
}

function tokenizeAndFormatLine(line: string): React.ReactNode {
  // Regex to detect chemical formula tokens like H2SO4, Fe3+, Cu(OH)2, [Ag(NH3)2]+, CH3COOH, C6H12O6, CO2, H2O
  // Elements: A-Z followed by optional a-z, numbers, parenthesis, brackets, charges (+, -)
  const tokenRegex = /([A-Z][a-z]?\d*(?:\([A-Za-z0-9]+\)\d*)*[A-Za-z0-9]*(?:\^[0-9]*[+-]|[0-9]*[+-])?)/g;
  
  // Also handle arrow symbols
  const parts = line.split(/(\s*→\s*|\s*⇌\s*)/g);

  return parts.map((part, pIdx) => {
    if (part.includes('→')) {
      return (
        <span key={pIdx} className="font-semibold text-blue-700 px-1.5 select-none">
          →
        </span>
      );
    }
    if (part.includes('⇌')) {
      return (
        <span key={pIdx} className="font-semibold text-emerald-700 px-1.5 select-none">
          ⇌
        </span>
      );
    }

    // Format chemical tokens inside normal words
    const subTokens = part.split(tokenRegex);
    return (
      <span key={pIdx}>
        {subTokens.map((st, sIdx) => {
          if (looksLikeChemicalFormula(st)) {
            return <FormattedFormula key={sIdx} formula={st} />;
          }
          return <span key={sIdx}>{st}</span>;
        })}
      </span>
    );
  });
}

function looksLikeChemicalFormula(str: string): boolean {
  if (!str || str.length < 2) return false;
  // Discard pure common words
  if (/^(Ai|An|Ba|Ca|Co|Cu|Da|Di|Do|Em|Ha|He|Ho|In|La|Le|Ma|Me|Mo|Na|No|On|Pa|Ra|Se|Ta|Th|To|Xe|La)$/i.test(str)) {
    return false;
  }
  // If it has digits or parentheses or charges with chemical elements
  const hasElementAndDigits = /^[A-Z][a-z]?[0-9]/.test(str) || /[A-Z][a-z]?\([A-Za-z0-9]+\)/.test(str);
  const hasFormulaPattern = /^[A-Z][a-z0-9()\[\]+\-]*$/.test(str) && /[0-9+\-]/.test(str);
  return hasElementAndDigits || hasFormulaPattern;
}

const FormattedFormula: React.FC<{ formula: string }> = ({ formula }) => {
  // Parse subscripts and superscripts in formula
  // E.g. H2SO4 -> H <sub>2</sub> S O <sub>4</sub>
  // Fe3+ -> Fe <sup>3+</sup>
  // SO4^2- or SO42- -> SO <sub>4</sub> <sup>2-</sup>
  const elements: React.ReactNode[] = [];
  let i = 0;
  
  while (i < formula.length) {
    const char = formula[i];
    
    // Check for explicit superscript: ^2+ or ^{2+}
    if (char === '^') {
      i++;
      let sup = '';
      if (formula[i] === '{') {
        i++;
        while (i < formula.length && formula[i] !== '}') {
          sup += formula[i];
          i++;
        }
        if (formula[i] === '}') i++;
      } else {
        while (i < formula.length && /[0-9+\-]/.test(formula[i])) {
          sup += formula[i];
          i++;
        }
      }
      elements.push(<sup key={`sup-${i}`} className="text-[0.7em] text-blue-800 font-semibold">{sup}</sup>);
      continue;
    }

    // Check for charge at end of formula e.g. 2+, 3+, +, -
    if ((char === '+' || char === '-') || (/\d/.test(char) && (formula[i+1] === '+' || formula[i+1] === '-'))) {
      if (/\d/.test(char) && (formula[i+1] === '+' || formula[i+1] === '-')) {
        elements.push(<sup key={`charge-${i}`} className="text-[0.7em] text-blue-800 font-semibold">{char + formula[i+1]}</sup>);
        i += 2;
        continue;
      } else {
        elements.push(<sup key={`charge-${i}`} className="text-[0.7em] text-blue-800 font-semibold">{char}</sup>);
        i++;
        continue;
      }
    }

    // Number after element is subscript: H2 -> H<sub>2</sub>
    if (/\d/.test(char)) {
      let num = '';
      while (i < formula.length && /\d/.test(formula[i])) {
        num += formula[i];
        i++;
      }
      elements.push(<sub key={`sub-${i}`} className="text-[0.72em] text-slate-700">{num}</sub>);
      continue;
    }

    // Normal character
    elements.push(<span key={`char-${i}`}>{char}</span>);
    i++;
  }

  return (
    <span className="font-medium text-slate-900 tracking-tight px-0.5 chem-formula inline-block">
      {elements}
    </span>
  );
};
