import {
  AlignmentType,
  BorderStyle,
  Document,
  Footer,
  Packer,
  PageNumber,
  Paragraph,
  ShadingType,
  Table,
  TableCell,
  TableRow,
  TextRun,
  VerticalAlign,
  WidthType,
  convertMillimetersToTwip,
} from 'docx';
import JSZip from 'jszip';
import { saveAs } from 'file-saver';
import type {
  ExamHeaderMeta,
  ShuffledExamBundle,
  ShuffledExamVariant,
} from '../utils/examShuffler';

const FONT_FAMILY = 'Times New Roman';
const FONT_SIZE_12PT = 24; // docx uses half-points: 12pt = 24
const FONT_SIZE_11PT = 22;
const FONT_SIZE_13PT = 26;
const FONT_SIZE_10PT = 20;

const A4_WIDTH_TWIP = convertMillimetersToTwip(210);
const A4_HEIGHT_TWIP = convertMillimetersToTwip(297);
const MARGIN_TOP_TWIP = convertMillimetersToTwip(20); // 2cm
const MARGIN_BOTTOM_TWIP = convertMillimetersToTwip(20); // 2cm
const MARGIN_LEFT_TWIP = convertMillimetersToTwip(25); // 2.5cm
const MARGIN_RIGHT_TWIP = convertMillimetersToTwip(20); // 2cm

const NO_BORDER = { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' };
const THIN_BORDER = { style: BorderStyle.SINGLE, size: 4, color: '334155' };
const BOX_BORDER = { style: BorderStyle.SINGLE, size: 6, color: '0F172A' };

const NO_BORDERS_ALL = {
  top: NO_BORDER,
  bottom: NO_BORDER,
  left: NO_BORDER,
  right: NO_BORDER,
  insideHorizontal: NO_BORDER,
  insideVertical: NO_BORDER,
};

const TABLE_BORDERS_ALL = {
  top: THIN_BORDER,
  bottom: THIN_BORDER,
  left: THIN_BORDER,
  right: THIN_BORDER,
  insideHorizontal: THIN_BORDER,
  insideVertical: THIN_BORDER,
};

export interface InlineStyleFlags {
  bold?: boolean;
  italics?: boolean;
  size?: number;
  subScript?: boolean;
  superScript?: boolean;
}

interface TextRunSpec {
  text: string;
  size: number;
  bold: boolean;
  italics: boolean;
  subScript: boolean;
  superScript: boolean;
}

const ESCAPED_LBRACE_SENTINEL = '\uE001';
const ESCAPED_RBRACE_SENTINEL = '\uE002';

const UNICODE_SUBSCRIPT_MAP: Record<string, string> = {
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
  '₊': '+',
  '₋': '-',
  '₍': '(',
  '₎': ')',
};

const UNICODE_SUPERSCRIPT_MAP: Record<string, string> = {
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
  '⁽': '(',
  '⁾': ')',
};

/**
 * Extracts a balanced `{ ... }` group starting at `openIndex`.
 * Returns `null` if no matching closing brace exists.
 */
function extractBalancedBraces(
  input: string,
  openIndex: number
): { content: string; endIndex: number } | null {
  if (input[openIndex] !== '{') return null;
  let depth = 0;
  for (let i = openIndex; i < input.length; i++) {
    const ch = input[i];
    if (ch === '{') {
      depth += 1;
    } else if (ch === '}') {
      depth -= 1;
      if (depth === 0) {
        return {
          content: input.slice(openIndex + 1, i),
          endIndex: i + 1,
        };
      }
    }
  }
  return null;
}

/**
 * Replaces a 1-argument LaTeX command like `\text{...}`, `\mathrm{...}`, `\ce{...}`, `\sqrt{...}`
 * while properly handling nested curly braces.
 */
function replaceUnaryLatexCommand(
  input: string,
  commandName: string,
  transform: (inner: string) => string
): string {
  const token = `\\${commandName}`;
  let result = '';
  let idx = 0;

  while (idx < input.length) {
    const found = input.indexOf(token, idx);
    if (found === -1) {
      result += input.slice(idx);
      break;
    }

    const afterCmd = found + token.length;
    // Ensure command boundary (not prefix of a longer command name)
    if (afterCmd < input.length && /[a-zA-Z]/.test(input[afterCmd])) {
      result += input.slice(idx, afterCmd);
      idx = afterCmd;
      continue;
    }

    let braceStart = afterCmd;
    while (braceStart < input.length && input[braceStart] === ' ') {
      braceStart += 1;
    }

    const group = extractBalancedBraces(input, braceStart);
    if (!group) {
      result += input.slice(idx, afterCmd);
      idx = afterCmd;
      continue;
    }

    result += input.slice(idx, found) + transform(group.content);
    idx = group.endIndex;
  }

  return result;
}

/**
 * Replaces a 2-argument LaTeX command like `\frac{num}{den}` with balanced brace support.
 */
function replaceBinaryLatexCommand(
  input: string,
  commandName: string,
  transform: (first: string, second: string) => string
): string {
  const token = `\\${commandName}`;
  let result = '';
  let idx = 0;

  while (idx < input.length) {
    const found = input.indexOf(token, idx);
    if (found === -1) {
      result += input.slice(idx);
      break;
    }

    const afterCmd = found + token.length;
    if (afterCmd < input.length && /[a-zA-Z]/.test(input[afterCmd])) {
      result += input.slice(idx, afterCmd);
      idx = afterCmd;
      continue;
    }

    let pos = afterCmd;
    while (pos < input.length && input[pos] === ' ') pos += 1;
    const first = extractBalancedBraces(input, pos);
    if (!first) {
      result += input.slice(idx, afterCmd);
      idx = afterCmd;
      continue;
    }

    pos = first.endIndex;
    while (pos < input.length && input[pos] === ' ') pos += 1;
    const second = extractBalancedBraces(input, pos);
    if (!second) {
      result += input.slice(idx, afterCmd);
      idx = afterCmd;
      continue;
    }

    result += input.slice(idx, found) + transform(first.content, second.content);
    idx = second.endIndex;
  }

  return result;
}

/**
 * Normalizes HTML/LaTeX/OMML chemical and math markup into a clean intermediate format
 * ready for native Word TextRun tokenization without losing bold/italic/sub/sup attributes.
 */
function normalizeRichTextForWord(raw: string): string {
  if (!raw) return '';
  let text = raw
    .replace(/\r\n/g, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&amp;/gi, '&')
    // Protect explicitly escaped literal braces \{ and \}
    .replace(/\\\{/g, ESCAPED_LBRACE_SENTINEL)
    .replace(/\\\}/g, ESCAPED_RBRACE_SENTINEL);

  // Convert \ce{...} chemical expressions (auto-mark element-attached digits as subscripts)
  text = replaceUnaryLatexCommand(text, 'ce', (inner) =>
    inner.replace(/([A-Za-z)\]])(\d+)/g, '$1_{$2}')
  );

  // Convert nested \frac and \dfrac
  for (let pass = 0; pass < 3; pass++) {
    const prev = text;
    text = replaceBinaryLatexCommand(text, 'frac', (n, d) => `(${n}/${d})`);
    text = replaceBinaryLatexCommand(text, 'dfrac', (n, d) => `(${n}/${d})`);
    text = replaceBinaryLatexCommand(text, 'tfrac', (n, d) => `(${n}/${d})`);
    if (text === prev) break;
  }

  // Convert \sqrt[n]{x} and \sqrt{x}
  text = text.replace(/\\sqrt\[([^\]]+)\]/g, '^{$1}\\sqrt');
  text = replaceUnaryLatexCommand(text, 'sqrt', (rad) => `√(${rad})`);

  // Convert LaTeX inline styling & text wrappers while preserving bold/italic
  text = replaceUnaryLatexCommand(text, 'textbf', (inner) => `**${inner}**`);
  text = replaceUnaryLatexCommand(text, 'mathbf', (inner) => `**${inner}**`);
  text = replaceUnaryLatexCommand(text, 'textit', (inner) => `*${inner}*`);
  text = replaceUnaryLatexCommand(text, 'emph', (inner) => `*${inner}*`);
  text = replaceUnaryLatexCommand(text, 'text', (inner) => inner);
  text = replaceUnaryLatexCommand(text, 'mathrm', (inner) => inner);
  text = replaceUnaryLatexCommand(text, 'mathit', (inner) => inner);
  text = replaceUnaryLatexCommand(text, 'operatorname', (inner) => inner);
  text = replaceUnaryLatexCommand(text, 'rm', (inner) => inner);

  // Convert reaction arrows with optional conditions
  text = text
    .replace(/\\xrightarrow(?:\[([^\]]*)\])?\{([^}]*)\}/g, (_m, below, above) => {
      const cond = [above, below].map((s) => (s || '').trim()).filter(Boolean).join(', ');
      return cond ? ` →(${cond}) ` : ' → ';
    })
    .replace(/\\xleftarrow(?:\[([^\]]*)\])?\{([^}]*)\}/g, ' ← ')
    .replace(/\\xrightleftharpoons(?:\[([^\]]*)\])?\{([^}]*)\}/g, ' ⇌ ')
    .replace(/\\xleftrightarrow(?:\[([^\]]*)\])?\{([^}]*)\}/g, ' ↔ ')
    .replace(/\\rightarrow|\\longrightarrow|\\to\b/g, ' → ')
    .replace(/\\leftarrow|\\longleftarrow/g, ' ← ')
    .replace(/\\rightleftharpoons|\\leftrightarrow|\\longleftrightarrow/g, ' ⇌ ')
    .replace(/\\Rightarrow/g, ' ⇒ ')
    .replace(/\\Leftrightarrow/g, ' ⇔ ')
    .replace(/\\uparrow/g, '↑')
    .replace(/\\downarrow/g, '↓')
    .replace(/\\times/g, '×')
    .replace(/\\cdot/g, '·')
    .replace(/\\pm/g, '±')
    .replace(/\\le\b|\\leq\b/g, '≤')
    .replace(/\\ge\b|\\geq\b/g, '≥')
    .replace(/\\neq\b|\\ne\b/g, '≠')
    .replace(/\\approx\b/g, '≈')
    .replace(/\\equiv\b/g, '≡')
    .replace(/\\Delta\b/g, 'Δ')
    .replace(/\\alpha\b/g, 'α')
    .replace(/\\beta\b/g, 'β')
    .replace(/\\gamma\b/g, 'γ')
    .replace(/\\delta\b/g, 'δ')
    .replace(/\\lambda\b/g, 'λ')
    .replace(/\\mu\b/g, 'μ')
    .replace(/\\pi\b/g, 'π')
    .replace(/\\sigma\b/g, 'σ')
    .replace(/\\omega\b/g, 'ω')
    .replace(/\\degree|\^\{\s*\\circ\s*\}|\^\\circ|\\circ\b/g, '°')
    .replace(/\\left\b|\\right\b/g, '')
    .replace(/\\%/g, '%')
    .replace(/\\[,;:!]/g, ' ')
    .replace(/\\q?quad\b/g, ' ')
    .replace(/\$\$/g, '')
    .replace(/\$/g, '');

  // Convert Unicode subscript/superscript runs into explicit <sub>/<sup> tags so Word renders crisp native Times New Roman scripts
  text = text
    .replace(/[₀₁₂₃₄₅₆₇₈₉₊₋₍₎]+/g, (seq) => {
      const mapped = [...seq].map((ch) => UNICODE_SUBSCRIPT_MAP[ch] ?? ch).join('');
      return `<sub>${mapped}</sub>`;
    })
    .replace(/[⁰¹²³⁴⁵⁶⁷⁸⁹⁺⁻⁽⁾]+/g, (seq) => {
      const mapped = [...seq].map((ch) => UNICODE_SUPERSCRIPT_MAP[ch] ?? ch).join('');
      return `<sup>${mapped}</sup>`;
    });

  // Strip stray HTML tags except <sub>, <sup>, <b>, <strong>, <i>, <em>
  text = text.replace(/<\/?(?!sub\b|sup\b|b\b|strong\b|i\b|em\b)[a-z][^>]*>/gi, '');

  // Normalize HTML bold/italic tags to markdown markers for unified recursive parsing
  text = text
    .replace(/<(?:b|strong)>([\s\S]*?)<\/(?:b|strong)>/gi, '**$1**')
    .replace(/<(?:i|em)>([\s\S]*?)<\/(?:i|em)>/gi, '*$1*');

  return text.trim();
}

function pushRunSpec(
  out: TextRunSpec[],
  rawText: string,
  style: Omit<TextRunSpec, 'text'>
): void {
  if (!rawText) return;
  const restored = rawText
    .replace(new RegExp(ESCAPED_LBRACE_SENTINEL, 'g'), '{')
    .replace(new RegExp(ESCAPED_RBRACE_SENTINEL, 'g'), '}');
  if (!restored) return;

  const prev = out[out.length - 1];
  if (
    prev &&
    prev.size === style.size &&
    prev.bold === style.bold &&
    prev.italics === style.italics &&
    prev.subScript === style.subScript &&
    prev.superScript === style.superScript
  ) {
    prev.text += restored;
  } else {
    out.push({
      text: restored,
      size: style.size,
      bold: style.bold,
      italics: style.italics,
      subScript: style.subScript,
      superScript: style.superScript,
    });
  }
}

/**
 * Recursively tokenizes inline formatting (`***`, `**`, `*`, `<sub>`, `<sup>`)
 * and chemical/LaTeX subscripts & superscripts (`{CH}_{3}`, `{CH}_3`, `{CH}3`, `C_6H_5`, `H_2O`, `Fe^{3+}`)
 * while stripping all stray LaTeX grouping braces `{}` and redundant `_` / `^`.
 */
function parseFormulaToRunSpecs(
  input: string,
  style: Omit<TextRunSpec, 'text'>,
  out: TextRunSpec[]
): void {
  let i = 0;
  const len = input.length;

  while (i < len) {
    // 1. Bold + Italic: ***...***
    if (input.startsWith('***', i)) {
      const closeIdx = input.indexOf('***', i + 3);
      if (closeIdx > i + 3) {
        parseFormulaToRunSpecs(
          input.slice(i + 3, closeIdx),
          { ...style, bold: true, italics: true },
          out
        );
        i = closeIdx + 3;
        continue;
      }
    }

    // 2. Bold: **...**
    if (input.startsWith('**', i)) {
      const closeIdx = input.indexOf('**', i + 2);
      if (closeIdx > i + 2) {
        parseFormulaToRunSpecs(
          input.slice(i + 2, closeIdx),
          { ...style, bold: true },
          out
        );
        i = closeIdx + 2;
        continue;
      }
    }

    // 3. Italic: *...* (only when non-whitespace borders inside, preserving math multiplication "2 * 3")
    if (input[i] === '*' && input[i + 1] !== '*' && i + 1 < len && !/\s/.test(input[i + 1])) {
      let closeIdx = -1;
      for (let j = i + 1; j < len; j++) {
        if (input[j] === '\n') break;
        if (
          input[j] === '*' &&
          input[j - 1] !== '*' &&
          input[j + 1] !== '*' &&
          !/\s/.test(input[j - 1])
        ) {
          closeIdx = j;
          break;
        }
      }
      if (closeIdx > i + 1) {
        parseFormulaToRunSpecs(
          input.slice(i + 1, closeIdx),
          { ...style, italics: true },
          out
        );
        i = closeIdx + 1;
        continue;
      }
    }

    // 4. HTML <sub>...</sub> and <sup>...</sup>
    if (input[i] === '<') {
      const subMatch = /^<sub>([\s\S]*?)<\/sub>/i.exec(input.slice(i));
      if (subMatch) {
        parseFormulaToRunSpecs(
          subMatch[1],
          { ...style, subScript: true, superScript: false },
          out
        );
        i += subMatch[0].length;
        continue;
      }
      const supMatch = /^<sup>([\s\S]*?)<\/sup>/i.exec(input.slice(i));
      if (supMatch) {
        parseFormulaToRunSpecs(
          supMatch[1],
          { ...style, superScript: true, subScript: false },
          out
        );
        i += supMatch[0].length;
        continue;
      }
    }

    // 5. Subscript: _{...} or _<digits> or _<single letter> (while preserving fill-in blanks like "____")
    if (input[i] === '_') {
      const blankLineMatch = /^_{2,}/.exec(input.slice(i));
      if (blankLineMatch) {
        pushRunSpec(out, blankLineMatch[0], style);
        i += blankLineMatch[0].length;
        continue;
      }
      if (input[i + 1] === '{') {
        const group = extractBalancedBraces(input, i + 1);
        if (group) {
          parseFormulaToRunSpecs(
            group.content,
            { ...style, subScript: true, superScript: false },
            out
          );
          i = group.endIndex;
          continue;
        }
      }
      const shortSubMatch = /^([0-9]+|[a-zA-Z](?![a-zA-Z0-9_]))/.exec(input.slice(i + 1));
      if (shortSubMatch) {
        pushRunSpec(out, shortSubMatch[1], {
          ...style,
          subScript: true,
          superScript: false,
        });
        i += 1 + shortSubMatch[1].length;
        continue;
      }
      // Drop stray standalone underscore before non-blank formula tokens
      i += 1;
      continue;
    }

    // 6. Superscript: ^{...} or ^<charge/digits/single letter>
    if (input[i] === '^') {
      if (input[i + 1] === '{') {
        const group = extractBalancedBraces(input, i + 1);
        if (group) {
          parseFormulaToRunSpecs(
            group.content,
            { ...style, superScript: true, subScript: false },
            out
          );
          i = group.endIndex;
          continue;
        }
      }
      const shortSupMatch = /^([0-9]*[+-]|[0-9]+|[a-zA-Z](?![a-zA-Z0-9_]))/.exec(
        input.slice(i + 1)
      );
      if (shortSupMatch) {
        pushRunSpec(out, shortSupMatch[1], {
          ...style,
          superScript: true,
          subScript: false,
        });
        i += 1 + shortSupMatch[1].length;
        continue;
      }
      i += 1;
      continue;
    }

    // 7. LaTeX / OMML braced group `{...}` (e.g. `{CH}_{3}`, `{C}_6{H}_5`, or `{HCOOCH}2{C}6{H}5`)
    if (input[i] === '{') {
      const group = extractBalancedBraces(input, i);
      if (group) {
        parseFormulaToRunSpecs(group.content, style, out);
        i = group.endIndex;

        // Handle braced chemical fragments followed directly by bare subscript digits
        // such as `{HCOOCH}2{C}6{H}5` or `{CH}3{COOCH}2{C}6{H}5`
        const looksLikeChemBase = /[A-Za-z)\]]/.test(group.content);
        if (looksLikeChemBase && !style.subScript && !style.superScript) {
          const trailingDigits = /^(\d+)/.exec(input.slice(i));
          if (trailingDigits) {
            pushRunSpec(out, trailingDigits[1], {
              ...style,
              subScript: true,
              superScript: false,
            });
            i += trailingDigits[1].length;
          }
        }
        continue;
      }
      // Drop unmatched stray `{`
      i += 1;
      continue;
    }

    // 8. Drop any stray closing brace `}`
    if (input[i] === '}') {
      i += 1;
      continue;
    }

    // 9. Normal character
    pushRunSpec(out, input[i], style);
    i += 1;
  }
}

/**
 * Parses chemical/math formula text (including `{CH}_3`, `{CH}_{3}`, `{HCOOCH}2{C}6{H}5`,
 * `C_6H_5`, `H_2O`, `<sub>...</sub>`, `<sup>...</sup>`, bold `**...**`, italic `*...*`)
 * into clean native Word `TextRun[]` in Times New Roman without stray `{}` or `_`.
 */
export function renderFormulaTextRuns(
  text: string,
  base: InlineStyleFlags = {}
): TextRun[] {
  const fontSize = base.size ?? FONT_SIZE_12PT;
  const normalized = normalizeRichTextForWord(text || '');
  const specs: TextRunSpec[] = [];

  parseFormulaToRunSpecs(
    normalized,
    {
      size: fontSize,
      bold: Boolean(base.bold),
      italics: Boolean(base.italics),
      subScript: Boolean(base.subScript),
      superScript: Boolean(base.superScript),
    },
    specs
  );

  if (specs.length === 0) {
    return [
      new TextRun({
        text: '',
        font: FONT_FAMILY,
        size: fontSize,
        bold: base.bold,
        italics: base.italics,
      }),
    ];
  }

  return specs.map(
    (spec) =>
      new TextRun({
        text: spec.text,
        font: FONT_FAMILY,
        size: spec.size,
        ...(spec.bold ? { bold: true } : {}),
        ...(spec.italics ? { italics: true } : {}),
        ...(spec.subScript ? { subScript: true } : {}),
        ...(spec.superScript ? { superScript: true } : {}),
      })
  );
}

/**
 * Computes visible printed text length (excluding LaTeX braces, HTML tags, and markdown markers)
 * so Part I option column layout (4-col / 2x2 / vertical) sizes accurately for chemical formulas.
 */
function getVisibleFormulaLength(text: string): number {
  const normalized = normalizeRichTextForWord(text || '');
  const specs: TextRunSpec[] = [];
  parseFormulaToRunSpecs(
    normalized,
    {
      size: FONT_SIZE_12PT,
      bold: false,
      italics: false,
      subScript: false,
      superScript: false,
    },
    specs
  );
  return specs.reduce((acc, s) => acc + s.text.length, 0);
}

/**
 * Strips leading duplicated question number prefix (e.g. "Câu 12.", "Câu 1:") from content
 * so re-numbered shuffled questions never show "Câu 1. Câu 12. ...".
 */
function stripLeadingQuestionPrefix(content: string): string {
  return content
    .replace(/^\s*(?:\*\*)?(?:Câu|Bài)\s*\d+\s*[:.)\-–—]?\s*(?:\*\*)?\s*/i, '')
    .trim();
}

/**
 * Strips leading duplicated option prefix (e.g. "A.", "B)") from option text.
 */
function stripLeadingOptionPrefix(text: string): string {
  return text.replace(/^\s*(?:\*\*)?[A-H]\s*[.)]\s*(?:\*\*)?\s*/i, '').trim();
}

/**
 * Strips leading duplicated statement prefix (e.g. "a)", "b.") from Part II statement text.
 */
function stripLeadingStatementPrefix(text: string): string {
  return text.replace(/^\s*(?:\*\*)?[a-h]\s*[.)]\s*(?:\*\*)?\s*/, '').trim();
}

function buildExamHeaderBlock(meta: ExamHeaderMeta, variantCode: string): (Paragraph | Table)[] {
  const schoolUpper = (meta.schoolName || 'TRƯỜNG THPT ...').trim().toUpperCase();
  const deptUpper = (meta.departmentName || 'SỞ GIÁO DỤC VÀ ĐÀO TẠO').trim().toUpperCase();
  const examTitleUpper = (meta.examTitle || 'ĐỀ KIỂM TRA ĐỊNH KỲ').trim().toUpperCase();
  const subjectText = (meta.subjectName || 'Hóa học').trim();
  const yearText = (meta.schoolYear || 'Năm học 2025 – 2026').trim();
  const durationText = `Thời gian làm bài: ${meta.durationMinutes || 50} phút, không kể thời gian phát đề`;

  const topBannerTable = new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: NO_BORDERS_ALL,
    rows: [
      new TableRow({
        children: [
          new TableCell({
            width: { size: 44, type: WidthType.PERCENTAGE },
            verticalAlign: VerticalAlign.TOP,
            children: [
              new Paragraph({
                alignment: AlignmentType.CENTER,
                spacing: { after: 40 },
                children: [
                  new TextRun({
                    text: deptUpper,
                    font: FONT_FAMILY,
                    size: FONT_SIZE_11PT,
                  }),
                ],
              }),
              new Paragraph({
                alignment: AlignmentType.CENTER,
                spacing: { after: 40 },
                children: [
                  new TextRun({
                    text: schoolUpper,
                    font: FONT_FAMILY,
                    size: FONT_SIZE_11PT,
                    bold: true,
                  }),
                ],
              }),
              new Paragraph({
                alignment: AlignmentType.CENTER,
                spacing: { after: 40 },
                children: [
                  new TextRun({
                    text: 'ĐỀ CHÍNH THỨC',
                    font: FONT_FAMILY,
                    size: FONT_SIZE_11PT,
                    bold: true,
                  }),
                ],
              }),
              new Paragraph({
                alignment: AlignmentType.CENTER,
                children: [
                  new TextRun({
                    text: '——————————',
                    font: FONT_FAMILY,
                    size: FONT_SIZE_10PT,
                  }),
                ],
              }),
            ],
          }),
          new TableCell({
            width: { size: 56, type: WidthType.PERCENTAGE },
            verticalAlign: VerticalAlign.TOP,
            children: [
              new Paragraph({
                alignment: AlignmentType.CENTER,
                spacing: { after: 40 },
                children: [
                  new TextRun({
                    text: examTitleUpper,
                    font: FONT_FAMILY,
                    size: FONT_SIZE_12PT,
                    bold: true,
                  }),
                ],
              }),
              new Paragraph({
                alignment: AlignmentType.CENTER,
                spacing: { after: 40 },
                children: [
                  new TextRun({
                    text: yearText.toUpperCase(),
                    font: FONT_FAMILY,
                    size: FONT_SIZE_11PT,
                    bold: true,
                  }),
                ],
              }),
              new Paragraph({
                alignment: AlignmentType.CENTER,
                spacing: { after: 40 },
                children: [
                  new TextRun({
                    text: `Môn: ${subjectText}`,
                    font: FONT_FAMILY,
                    size: FONT_SIZE_12PT,
                    bold: true,
                  }),
                ],
              }),
              new Paragraph({
                alignment: AlignmentType.CENTER,
                children: [
                  new TextRun({
                    text: durationText,
                    font: FONT_FAMILY,
                    size: FONT_SIZE_11PT,
                    italics: true,
                  }),
                ],
              }),
            ],
          }),
        ],
      }),
    ],
  });

  const studentAndCodeTable = new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: NO_BORDERS_ALL,
    rows: [
      new TableRow({
        children: [
          new TableCell({
            width: { size: 74, type: WidthType.PERCENTAGE },
            verticalAlign: VerticalAlign.CENTER,
            margins: { top: 80, bottom: 80, left: 40, right: 120 },
            children: [
              new Paragraph({
                spacing: { after: 60 },
                children: [
                  new TextRun({
                    text: 'Họ và tên thí sinh: ',
                    font: FONT_FAMILY,
                    size: FONT_SIZE_12PT,
                    bold: true,
                  }),
                  new TextRun({
                    text: '.........................................................................',
                    font: FONT_FAMILY,
                    size: FONT_SIZE_12PT,
                  }),
                ],
              }),
              new Paragraph({
                children: [
                  new TextRun({
                    text: 'Số báo danh: ',
                    font: FONT_FAMILY,
                    size: FONT_SIZE_12PT,
                    bold: true,
                  }),
                  new TextRun({
                    text: '.....................................   ',
                    font: FONT_FAMILY,
                    size: FONT_SIZE_12PT,
                  }),
                  new TextRun({
                    text: 'Lớp: ',
                    font: FONT_FAMILY,
                    size: FONT_SIZE_12PT,
                    bold: true,
                  }),
                  new TextRun({
                    text: '......................',
                    font: FONT_FAMILY,
                    size: FONT_SIZE_12PT,
                  }),
                ],
              }),
            ],
          }),
          new TableCell({
            width: { size: 26, type: WidthType.PERCENTAGE },
            verticalAlign: VerticalAlign.CENTER,
            borders: {
              top: BOX_BORDER,
              bottom: BOX_BORDER,
              left: BOX_BORDER,
              right: BOX_BORDER,
            },
            margins: { top: 100, bottom: 100, left: 100, right: 100 },
            children: [
              new Paragraph({
                alignment: AlignmentType.CENTER,
                children: [
                  new TextRun({
                    text: `Mã đề thi: ${variantCode}`,
                    font: FONT_FAMILY,
                    size: FONT_SIZE_12PT,
                    bold: true,
                  }),
                ],
              }),
            ],
          }),
        ],
      }),
    ],
  });

  const divider = new Paragraph({
    spacing: { before: 80, after: 140 },
    border: {
      bottom: { style: BorderStyle.SINGLE, size: 6, color: '1E293B' },
    },
    children: [],
  });

  return [
    topBannerTable,
    new Paragraph({ spacing: { before: 100, after: 40 }, children: [] }),
    studentAndCodeTable,
    divider,
  ];
}

function buildQuestionParagraphs(label: string, rawContent: string): Paragraph[] {
  const cleaned = stripLeadingQuestionPrefix(rawContent || '')
    .replace(/\r\n/g, '\n')
    .replace(/<br\s*\/?>/gi, '\n');
  const lines = cleaned.split('\n').filter((l, idx) => idx === 0 || l.trim().length > 0);
  if (lines.length === 0) {
    return [
      new Paragraph({
        spacing: { before: 120, after: 60, line: 276 },
        children: [
          new TextRun({
            text: `${label} `,
            font: FONT_FAMILY,
            size: FONT_SIZE_12PT,
            bold: true,
          }),
        ],
      }),
    ];
  }

  return lines.map((line, idx) => {
    if (idx === 0) {
      return new Paragraph({
        spacing: { before: 120, after: 50, line: 276 },
        alignment: AlignmentType.JUSTIFIED,
        children: [
          new TextRun({
            text: `${label} `,
            font: FONT_FAMILY,
            size: FONT_SIZE_12PT,
            bold: true,
          }),
          ...renderFormulaTextRuns(line),
        ],
      });
    }
    return new Paragraph({
      spacing: { before: 20, after: 50, line: 276 },
      indent: { left: convertMillimetersToTwip(5) },
      alignment: AlignmentType.JUSTIFIED,
      children: renderFormulaTextRuns(line),
    });
  });
}

function buildPart1OptionsElements(
  options: Array<{ id: string; text: string }>
): (Paragraph | Table)[] {
  if (options.length === 0) return [];

  const cleanedOpts = options.map((opt) => {
    const raw = stripLeadingOptionPrefix(opt.text || '')
      .replace(/\r\n/g, '\n')
      .replace(/<br\s*\/?>/gi, '\n');
    return {
      id: opt.id,
      raw,
      visibleLength: getVisibleFormulaLength(raw),
    };
  });

  const maxLen = Math.max(...cleanedOpts.map((o) => o.visibleLength));
  const hasMultiline = cleanedOpts.some((o) => o.raw.includes('\n'));

  // 4-column single row for short options (<= 16 visible chars)
  if (!hasMultiline && cleanedOpts.length === 4 && maxLen <= 16) {
    return [
      new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        borders: NO_BORDERS_ALL,
        rows: [
          new TableRow({
            children: cleanedOpts.map(
              (opt) =>
                new TableCell({
                  width: { size: 25, type: WidthType.PERCENTAGE },
                  margins: { top: 20, bottom: 40, left: 60, right: 60 },
                  children: [
                    new Paragraph({
                      spacing: { after: 20, line: 264 },
                      children: [
                        new TextRun({
                          text: `${opt.id}. `,
                          font: FONT_FAMILY,
                          size: FONT_SIZE_12PT,
                          bold: true,
                        }),
                        ...renderFormulaTextRuns(opt.raw),
                      ],
                    }),
                  ],
                })
            ),
          }),
        ],
      }),
    ];
  }

  // 2x2 grid for medium options (<= 38 visible chars)
  if (!hasMultiline && cleanedOpts.length === 4 && maxLen <= 38) {
    const buildRow = (pair: typeof cleanedOpts) =>
      new TableRow({
        children: pair.map(
          (opt) =>
            new TableCell({
              width: { size: 50, type: WidthType.PERCENTAGE },
              margins: { top: 20, bottom: 40, left: 60, right: 80 },
              children: [
                new Paragraph({
                  spacing: { after: 20, line: 264 },
                  children: [
                    new TextRun({
                      text: `${opt.id}. `,
                      font: FONT_FAMILY,
                      size: FONT_SIZE_12PT,
                      bold: true,
                    }),
                    ...renderFormulaTextRuns(opt.raw),
                  ],
                }),
              ],
            })
        ),
      });

    return [
      new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        borders: NO_BORDERS_ALL,
        rows: [buildRow(cleanedOpts.slice(0, 2)), buildRow(cleanedOpts.slice(2, 4))],
      }),
    ];
  }

  // Vertical 1-per-line layout for longer options
  return cleanedOpts.map(
    (opt) =>
      new Paragraph({
        spacing: { before: 20, after: 40, line: 276 },
        indent: { left: convertMillimetersToTwip(5) },
        alignment: AlignmentType.JUSTIFIED,
        children: [
          new TextRun({
            text: `${opt.id}. `,
            font: FONT_FAMILY,
            size: FONT_SIZE_12PT,
            bold: true,
          }),
          ...renderFormulaTextRuns(opt.raw.replace(/\n/g, ' ')),
        ],
      })
  );
}

/**
 * Creates a formatted Word (.docx) Document for a single shuffled exam variant.
 */
export function buildVariantExamDocument(
  variant: ShuffledExamVariant,
  meta: ExamHeaderMeta
): Document {
  const children: (Paragraph | Table)[] = [
    ...buildExamHeaderBlock(meta, variant.variantCode),
  ];

  // PHẦN I
  if (variant.part1.length > 0) {
    children.push(
      new Paragraph({
        spacing: { before: 120, after: 40 },
        children: [
          new TextRun({
            text: 'PHẦN I. Câu trắc nghiệm nhiều phương án lựa chọn. ',
            font: FONT_FAMILY,
            size: FONT_SIZE_12PT,
            bold: true,
          }),
          new TextRun({
            text: `Thí sinh trả lời từ câu 1 đến câu ${variant.part1.length}. Mỗi câu hỏi thí sinh chỉ chọn một phương án.`,
            font: FONT_FAMILY,
            size: FONT_SIZE_12PT,
            italics: true,
          }),
        ],
      })
    );

    for (const item of variant.part1) {
      children.push(...buildQuestionParagraphs(`Câu ${item.newNumber}.`, item.question.content));
      if (Array.isArray(item.question.options) && item.question.options.length > 0) {
        children.push(...buildPart1OptionsElements(item.question.options));
      }
    }
  }

  // PHẦN II
  if (variant.part2.length > 0) {
    children.push(
      new Paragraph({
        spacing: { before: 200, after: 40 },
        children: [
          new TextRun({
            text: 'PHẦN II. Câu trắc nghiệm đúng sai. ',
            font: FONT_FAMILY,
            size: FONT_SIZE_12PT,
            bold: true,
          }),
          new TextRun({
            text: `Thí sinh trả lời từ câu 1 đến câu ${variant.part2.length}. Trong mỗi ý a), b), c), d) ở mỗi câu, thí sinh chọn đúng hoặc sai.`,
            font: FONT_FAMILY,
            size: FONT_SIZE_12PT,
            italics: true,
          }),
        ],
      })
    );

    for (const item of variant.part2) {
      children.push(...buildQuestionParagraphs(`Câu ${item.newNumber}.`, item.question.content));
      const statements = Array.isArray(item.question.statements) ? item.question.statements : [];
      for (const st of statements) {
        const cleanSt = stripLeadingStatementPrefix(st.statement || '')
          .replace(/<br\s*\/?>/gi, ' ')
          .replace(/\r\n|\n/g, ' ');
        children.push(
          new Paragraph({
            spacing: { before: 30, after: 40, line: 276 },
            indent: { left: convertMillimetersToTwip(6) },
            alignment: AlignmentType.JUSTIFIED,
            children: [
              new TextRun({
                text: `${st.id}) `,
                font: FONT_FAMILY,
                size: FONT_SIZE_12PT,
                bold: true,
              }),
              ...renderFormulaTextRuns(cleanSt),
            ],
          })
        );
      }
    }
  }

  // PHẦN III
  if (variant.part3.length > 0) {
    children.push(
      new Paragraph({
        spacing: { before: 200, after: 40 },
        children: [
          new TextRun({
            text: 'PHẦN III. Câu trắc nghiệm trả lời ngắn. ',
            font: FONT_FAMILY,
            size: FONT_SIZE_12PT,
            bold: true,
          }),
          new TextRun({
            text: `Thí sinh trả lời từ câu 1 đến câu ${variant.part3.length}.`,
            font: FONT_FAMILY,
            size: FONT_SIZE_12PT,
            italics: true,
          }),
        ],
      })
    );

    for (const item of variant.part3) {
      children.push(...buildQuestionParagraphs(`Câu ${item.newNumber}.`, item.question.content));
    }
  }

  // End marker
  children.push(
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 260, after: 60 },
      children: [
        new TextRun({
          text: '---------------- HẾT ----------------',
          font: FONT_FAMILY,
          size: FONT_SIZE_12PT,
          bold: true,
        }),
      ],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [
        new TextRun({
          text: '(Thí sinh không được sử dụng tài liệu. Cán bộ coi thi không giải thích gì thêm.)',
          font: FONT_FAMILY,
          size: FONT_SIZE_11PT,
          italics: true,
        }),
      ],
    })
  );

  return new Document({
    sections: [
      {
        properties: {
          page: {
            size: {
              width: A4_WIDTH_TWIP,
              height: A4_HEIGHT_TWIP,
            },
            margin: {
              top: MARGIN_TOP_TWIP,
              bottom: MARGIN_BOTTOM_TWIP,
              left: MARGIN_LEFT_TWIP,
              right: MARGIN_RIGHT_TWIP,
            },
          },
        },
        footers: {
          default: new Footer({
            children: [
              new Paragraph({
                alignment: AlignmentType.RIGHT,
                children: [
                  new TextRun({
                    text: `Trang `,
                    font: FONT_FAMILY,
                    size: FONT_SIZE_10PT,
                    italics: true,
                  }),
                  new TextRun({
                    children: [PageNumber.CURRENT],
                    font: FONT_FAMILY,
                    size: FONT_SIZE_10PT,
                    italics: true,
                  }),
                  new TextRun({
                    text: ' / ',
                    font: FONT_FAMILY,
                    size: FONT_SIZE_10PT,
                    italics: true,
                  }),
                  new TextRun({
                    children: [PageNumber.TOTAL_PAGES],
                    font: FONT_FAMILY,
                    size: FONT_SIZE_10PT,
                    italics: true,
                  }),
                  new TextRun({
                    text: `   —   Mã đề ${variant.variantCode}`,
                    font: FONT_FAMILY,
                    size: FONT_SIZE_10PT,
                    bold: true,
                  }),
                ],
              }),
            ],
          }),
        },
        children,
      },
    ],
  });
}

function makeMatrixHeaderCell(text: string, widthPercent: number): TableCell {
  return new TableCell({
    width: { size: widthPercent, type: WidthType.PERCENTAGE },
    verticalAlign: VerticalAlign.CENTER,
    shading: { type: ShadingType.SOLID, color: 'E2E8F0', fill: 'E2E8F0' },
    margins: { top: 80, bottom: 80, left: 60, right: 60 },
    children: [
      new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [
          new TextRun({
            text,
            font: FONT_FAMILY,
            size: FONT_SIZE_11PT,
            bold: true,
          }),
        ],
      }),
    ],
  });
}

function makeMatrixCell(text: string, widthPercent: number, bold = false): TableCell {
  return new TableCell({
    width: { size: widthPercent, type: WidthType.PERCENTAGE },
    verticalAlign: VerticalAlign.CENTER,
    margins: { top: 55, bottom: 55, left: 60, right: 60 },
    children: [
      new Paragraph({
        alignment: AlignmentType.CENTER,
        children: renderFormulaTextRuns(text, { size: FONT_SIZE_11PT, bold }),
      }),
    ],
  });
}

/**
 * Creates a consolidated Answer Key Matrix Word (.docx) document comparing all generated exam codes.
 */
export function buildConsolidatedAnswerKeyDocument(bundle: ShuffledExamBundle): Document {
  const { meta, variants, sourceCounts } = bundle;
  const children: (Paragraph | Table)[] = [];

  children.push(
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 40 },
      children: [
        new TextRun({
          text: (meta.schoolName || 'TRƯỜNG THPT ...').trim().toUpperCase(),
          font: FONT_FAMILY,
          size: FONT_SIZE_11PT,
          bold: true,
        }),
      ],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 40, after: 40 },
      children: [
        new TextRun({
          text: 'BẢNG ĐÁP ÁN TỔNG HỢP CÁC MÃ ĐỀ',
          font: FONT_FAMILY,
          size: FONT_SIZE_13PT,
          bold: true,
        }),
      ],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 40 },
      children: [
        new TextRun({
          text: `${(meta.examTitle || 'ĐỀ KIỂM TRA').trim()} — Môn: ${(meta.subjectName || 'Hóa học').trim()}`,
          font: FONT_FAMILY,
          size: FONT_SIZE_12PT,
          bold: true,
        }),
      ],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 180 },
      children: [
        new TextRun({
          text: `${meta.schoolYear || 'Năm học 2025 – 2026'}  ·  Tổng cộng ${variants.length} mã đề (${variants.map((v) => v.variantCode).join(', ')})`,
          font: FONT_FAMILY,
          size: FONT_SIZE_11PT,
          italics: true,
        }),
      ],
    })
  );

  const firstColPct = 14;
  const variantColPct = Math.floor((100 - firstColPct) / Math.max(1, variants.length));

  // PART I MATRIX
  if (sourceCounts.part1 > 0) {
    children.push(
      new Paragraph({
        spacing: { before: 120, after: 80 },
        children: [
          new TextRun({
            text: `PHẦN I. ĐÁP ÁN TRẮC NGHIỆM NHIỀU PHƯƠNG ÁN LỰA CHỌN (${sourceCounts.part1} câu)`,
            font: FONT_FAMILY,
            size: FONT_SIZE_12PT,
            bold: true,
          }),
        ],
      })
    );

    const headerRow = new TableRow({
      tableHeader: true,
      children: [
        makeMatrixHeaderCell('Câu', firstColPct),
        ...variants.map((v) => makeMatrixHeaderCell(`Mã ${v.variantCode}`, variantColPct)),
      ],
    });

    const dataRows: TableRow[] = [];
    for (let qNum = 1; qNum <= sourceCounts.part1; qNum++) {
      dataRows.push(
        new TableRow({
          children: [
            makeMatrixCell(String(qNum), firstColPct, true),
            ...variants.map((v) => makeMatrixCell(v.part1Answers[qNum] || '—', variantColPct, true)),
          ],
        })
      );
    }

    children.push(
      new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        borders: TABLE_BORDERS_ALL,
        rows: [headerRow, ...dataRows],
      })
    );
  }

  // PART II MATRIX
  if (sourceCounts.part2 > 0) {
    children.push(
      new Paragraph({
        spacing: { before: 220, after: 80 },
        children: [
          new TextRun({
            text: `PHẦN II. ĐÁP ÁN TRẮC NGHIỆM ĐÚNG / SAI (${sourceCounts.part2} câu — Đ: Đúng, S: Sai)`,
            font: FONT_FAMILY,
            size: FONT_SIZE_12PT,
            bold: true,
          }),
        ],
      })
    );

    const qColPct = 10;
    const subColPct = 8;
    const p2VarColPct = Math.floor((100 - qColPct - subColPct) / Math.max(1, variants.length));

    const headerRow = new TableRow({
      tableHeader: true,
      children: [
        makeMatrixHeaderCell('Câu', qColPct),
        makeMatrixHeaderCell('Ý', subColPct),
        ...variants.map((v) => makeMatrixHeaderCell(`Mã ${v.variantCode}`, p2VarColPct)),
      ],
    });

    const dataRows: TableRow[] = [];
    for (let qNum = 1; qNum <= sourceCounts.part2; qNum++) {
      // Collect union of sub-statement keys across variants (typically a, b, c, d)
      const firstVarMap = variants[0]?.part2Answers[qNum] || { a: false, b: false, c: false, d: false };
      const letters = Object.keys(firstVarMap).length > 0 ? Object.keys(firstVarMap) : ['a', 'b', 'c', 'd'];

      letters.forEach((letter, lIdx) => {
        dataRows.push(
          new TableRow({
            children: [
              makeMatrixCell(lIdx === 0 ? `Câu ${qNum}` : '', qColPct, true),
              makeMatrixCell(`${letter})`, subColPct, true),
              ...variants.map((v) => {
                const map = v.part2Answers[qNum];
                const val = map && letter in map ? (map[letter] ? 'Đ' : 'S') : '—';
                return makeMatrixCell(val, p2VarColPct, val === 'Đ');
              }),
            ],
          })
        );
      });
    }

    children.push(
      new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        borders: TABLE_BORDERS_ALL,
        rows: [headerRow, ...dataRows],
      })
    );
  }

  // PART III MATRIX
  if (sourceCounts.part3 > 0) {
    children.push(
      new Paragraph({
        spacing: { before: 220, after: 80 },
        children: [
          new TextRun({
            text: `PHẦN III. ĐÁP ÁN TRẢ LỜI NGẮN (${sourceCounts.part3} câu)`,
            font: FONT_FAMILY,
            size: FONT_SIZE_12PT,
            bold: true,
          }),
        ],
      })
    );

    const headerRow = new TableRow({
      tableHeader: true,
      children: [
        makeMatrixHeaderCell('Câu', firstColPct),
        ...variants.map((v) => makeMatrixHeaderCell(`Mã ${v.variantCode}`, variantColPct)),
      ],
    });

    const dataRows: TableRow[] = [];
    for (let qNum = 1; qNum <= sourceCounts.part3; qNum++) {
      dataRows.push(
        new TableRow({
          children: [
            makeMatrixCell(String(qNum), firstColPct, true),
            ...variants.map((v) => makeMatrixCell(v.part3Answers[qNum] || '—', variantColPct, true)),
          ],
        })
      );
    }

    children.push(
      new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        borders: TABLE_BORDERS_ALL,
        rows: [headerRow, ...dataRows],
      })
    );
  }

  return new Document({
    sections: [
      {
        properties: {
          page: {
            size: {
              width: A4_WIDTH_TWIP,
              height: A4_HEIGHT_TWIP,
            },
            margin: {
              top: MARGIN_TOP_TWIP,
              bottom: MARGIN_BOTTOM_TWIP,
              left: MARGIN_LEFT_TWIP,
              right: MARGIN_RIGHT_TWIP,
            },
          },
        },
        footers: {
          default: new Footer({
            children: [
              new Paragraph({
                alignment: AlignmentType.RIGHT,
                children: [
                  new TextRun({
                    text: 'Bảng đáp án tổng hợp  ·  Trang ',
                    font: FONT_FAMILY,
                    size: FONT_SIZE_10PT,
                    italics: true,
                  }),
                  new TextRun({
                    children: [PageNumber.CURRENT],
                    font: FONT_FAMILY,
                    size: FONT_SIZE_10PT,
                    italics: true,
                  }),
                  new TextRun({
                    text: ' / ',
                    font: FONT_FAMILY,
                    size: FONT_SIZE_10PT,
                    italics: true,
                  }),
                  new TextRun({
                    children: [PageNumber.TOTAL_PAGES],
                    font: FONT_FAMILY,
                    size: FONT_SIZE_10PT,
                    italics: true,
                  }),
                ],
              }),
            ],
          }),
        },
        children,
      },
    ],
  });
}

function sanitizeFileName(raw: string): string {
  return (raw || 'De_Thi')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .replace(/[^a-zA-Z0-9_-]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 64) || 'De_Thi';
}

/**
 * Generates a single variant Word (.docx) Blob.
 */
export async function generateVariantDocxBlob(
  variant: ShuffledExamVariant,
  meta: ExamHeaderMeta
): Promise<Blob> {
  const doc = buildVariantExamDocument(variant, meta);
  return Packer.toBlob(doc);
}

/**
 * Generates the consolidated answer key Word (.docx) Blob.
 */
export async function generateAnswerKeyDocxBlob(bundle: ShuffledExamBundle): Promise<Blob> {
  const doc = buildConsolidatedAnswerKeyDocument(bundle);
  return Packer.toBlob(doc);
}

/**
 * Downloads a single variant Word file (`De_<CODE>.docx`).
 */
export async function downloadSingleVariantDocx(
  variant: ShuffledExamVariant,
  meta: ExamHeaderMeta
): Promise<void> {
  const blob = await generateVariantDocxBlob(variant, meta);
  const safeCode = sanitizeFileName(variant.variantCode);
  saveAs(blob, `De_${safeCode}.docx`);
}

/**
 * Downloads the consolidated answer key Word file (`Bang_Dap_An_Tong_Hop.docx`).
 */
export async function downloadConsolidatedAnswerKeyDocx(bundle: ShuffledExamBundle): Promise<void> {
  const blob = await generateAnswerKeyDocxBlob(bundle);
  saveAs(blob, 'Bang_Dap_An_Tong_Hop.docx');
}

/**
 * Packages all shuffled exam variants (`De_101.docx`, `De_102.docx`, ...) and
 * the consolidated answer key matrix (`Bang_Dap_An_Tong_Hop.docx`) into a single `.zip`
 * file entirely on the client side and initiates browser download.
 */
export async function exportShuffledExamBundleAsZip(
  bundle: ShuffledExamBundle,
  onProgress?: (percent: number, message: string) => void
): Promise<{ fileName: string; fileCount: number }> {
  const zip = new JSZip();
  const totalSteps = bundle.variants.length + 2;

  for (let i = 0; i < bundle.variants.length; i++) {
    const variant = bundle.variants[i];
    onProgress?.(
      Math.round(((i + 0.5) / totalSteps) * 100),
      `Đang tạo file Word cho Mã đề ${variant.variantCode}...`
    );
    const docxBlob = await generateVariantDocxBlob(variant, bundle.meta);
    const safeCode = sanitizeFileName(variant.variantCode);
    zip.file(`De_${safeCode}.docx`, docxBlob);
  }

  onProgress?.(
    Math.round(((bundle.variants.length + 0.6) / totalSteps) * 100),
    'Đang tạo bảng đáp án tổng hợp tất cả các mã đề...'
  );
  const answerKeyBlob = await generateAnswerKeyDocxBlob(bundle);
  zip.file('Bang_Dap_An_Tong_Hop.docx', answerKeyBlob);

  onProgress?.(92, 'Đang nén tất cả tệp Word vào gói .zip...');
  const zipBlob = await zip.generateAsync({
    type: 'blob',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 },
  });

  const slug = sanitizeFileName(bundle.meta.examTitle || 'Bo_De_Tron');
  const fileName = `${slug}_${bundle.variants.length}MaDe.zip`;
  saveAs(zipBlob, fileName);

  onProgress?.(100, `Đã xuất thành công ${bundle.variants.length} đề thi và 1 bảng đáp án.`);
  return {
    fileName,
    fileCount: bundle.variants.length + 1,
  };
}
