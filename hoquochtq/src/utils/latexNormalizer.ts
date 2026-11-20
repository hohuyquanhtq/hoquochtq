/**
 * LATEX & CHEMISTRY SYNTAX NORMALIZER + INLINE/DISPLAY TOKENIZER
 * Chuẩn hóa cú pháp LaTeX bị escape sai (\\frac, \\left, K\\_{C}, {\text{H}}\_{2}, \\( ... \\))
 * và tách chính xác công thức toán/hóa (có delimiter hoặc chưa bọc delimiter) khỏi văn bản tiếng Việt.
 */

export type ContentSegment =
  | { type: 'text'; value: string }
  | { type: 'math'; value: string; displayMode: boolean }
  | { type: 'image'; src: string; alt: string }
  | { type: 'html_tag'; tag: 'sub' | 'sup' | 'u' | 's' | 'b' | 'i' | 'br'; inner: string }
  | { type: 'md_style'; style: 'bold_italic' | 'bold'; inner: string };

const LATEX_COMMAND_NAMES = [
  'frac',
  'dfrac',
  'tfrac',
  'cfrac',
  'genfrac',
  'sqrt',
  'text',
  'mathrm',
  'mathbf',
  'mathit',
  'mathsf',
  'mathcal',
  'operatorname',
  'left',
  'right',
  'middle',
  'big',
  'Big',
  'bigg',
  'Bigg',
  'cdot',
  'times',
  'div',
  'pm',
  'mp',
  'quad',
  'qquad',
  'xrightarrow',
  'xleftarrow',
  'xleftrightarrow',
  'xrightleftharpoons',
  'xrightleftarrows',
  'xlongequal',
  'xRightarrow',
  'xLeftarrow',
  'xLeftrightarrow',
  'rightarrow',
  'longrightarrow',
  'leftarrow',
  'longleftarrow',
  'leftrightarrow',
  'rightleftharpoons',
  'rightleftarrows',
  'Rightarrow',
  'Leftarrow',
  'Leftrightarrow',
  'uparrow',
  'downarrow',
  'Delta',
  'delta',
  'alpha',
  'beta',
  'gamma',
  'varepsilon',
  'lambda',
  'mu',
  'pi',
  'rho',
  'sigma',
  'omega',
  'circ',
  'ce',
  'pu',
  'overline',
  'underline',
  'vec',
  'hat',
  'tilde',
  'dot',
  'ddot',
  'boxed',
  'overset',
  'underset',
  'overbrace',
  'underbrace',
  'overleftarrow',
  'overleftrightarrow',
  'phantom',
  'lim',
  'sum',
  'prod',
  'coprod',
  'int',
  'iint',
  'iiint',
  'oint',
  'bigcup',
  'bigcap',
  'log',
  'ln',
  'lg',
  'exp',
  'sin',
  'cos',
  'tan',
  'cot',
  'le',
  'ge',
  'ne',
  'approx',
  'equiv',
  'infty',
  'in',
  'notin',
  'forall',
  'exists',
  'begin',
  'end',
];

const DOUBLE_ESCAPED_CMD_REGEX = new RegExp(
  `(?<!\\\\)\\\\\\\\(?=(?:${LATEX_COMMAND_NAMES.join('|')})\\b|[(){}\\[\\]|%&_#$])`,
  'g'
);

// Strong LaTeX commands that indicate an unwrapped math/chemistry expression when found outside delimiters
const UNWRAPPED_LATEX_TRIGGER_REGEX =
  /\\(?:frac|dfrac|tfrac|cfrac|sqrt|xrightarrow|xleftarrow|xleftrightarrow|xrightleftharpoons|xrightleftarrows|xlongequal|xRightarrow|xLeftarrow|xLeftrightarrow|rightarrow|leftarrow|leftrightarrow|rightleftharpoons|rightleftarrows|cdot|times|div|pm|quad|qquad|left|right|text|mathrm|mathbf|overline|underline|sum|prod|int|lim|ce|pu|begin)\b|[A-Za-z0-9\)\]]\s*(?:_\{[^}\n]+\}|\^\{[^}\n]+\})/;

const KNOWN_TEXT_MACRO_PREFIXES = /^\\(?:text|mathrm|mathbf|operatorname)\{/;

/**
 * Repairs double-escaped math delimiters (e.g. from JSON / Firestore strings) and broken Markdown-escaped
 * subscripts/superscripts such as K\_{C}, {\text{H}}\_{2}, {\text{NH}}\_{3}.
 * Leaves plain prose and Data URLs completely untouched.
 */
export function normalizeMixedLatexContent(raw: string): string {
  if (typeof raw !== 'string' || !raw) return '';

  // Protect markdown/HTML images (which may contain base64 payloads) from any backslash/underscore touching
  const imgPlaceholders: string[] = [];
  let working = raw.replace(/!\[[^\]]*\]\((?:[^()\n]|\([^()\n]*\))+\)|<img\b[^>]*\/?>/gi, match => {
    const idx = imgPlaceholders.length;
    imgPlaceholders.push(match);
    return `\u0000IMG_${idx}\u0000`;
  });

  // 1. Unescape matched double-escaped delimiters \\( ... \\) and \\[ ... \\]
  working = working.replace(/(?<!\\)\\\\\(([\s\S]*?)\\\\\)/g, (_m, inner) => `\\(${inner}\\)`);
  working = working.replace(/(?<!\\)\\\\\[([\s\S]*?)\\\\\]/g, (_m, inner) => {
    // Only unescape \\[...\\] if inner actually looks like math rather than matrix spacing
    if (/\\|[_^{}=+\-*/]/.test(inner)) {
      return `\\[${inner}\\]`;
    }
    return _m;
  });

  // 2. Fix double-escaped LaTeX commands like \\frac, \\left, \\text, \\cdot, \\sqrt, \\xrightarrow
  working = working.replace(DOUBLE_ESCAPED_CMD_REGEX, '\\');

  // 3. Fix escaped Markdown subscripts/superscripts like K\_{C}, {\text{H}}\_{2}, H\_2SO\_4, Fe\^{3+}
  //    Only when clearly used as LaTeX subscript/superscript syntax (followed by {braces} or attached inside formula)
  working = working.replace(/\\_(?=\{[^}\n]+\})/g, '_');
  working = working.replace(/\\\^(?=\{[^}\n]+\}|[0-9+\-])/g, '^');
  working = working.replace(/([A-Za-z0-9\)\}])\\_(?=[0-9A-Za-z](?:\b|[_^=+\-*/\\)\]}.,;:\s]))/g, '$1_');

  if (imgPlaceholders.length > 0) {
    working = working.replace(/\u0000IMG_(\d+)\u0000/g, (_m, idx) => imgPlaceholders[Number(idx)] ?? '');
  }

  return working;
}

/**
 * Sanitizes and repairs a math expression right before passing it to KaTeX.
 * Fixes K\_{C}, {\text{H}}\_{2}, double-escaped \\frac / \\left, unescaped %, and stray newlines.
 */
export function normalizeLatexExpression(rawMath: string): string {
  if (!rawMath) return '';

  let expr = rawMath.trim();

  // Normalize Windows newlines / accidental single-line line breaks inside math
  if (!/\\begin\{(?:aligned|matrix|pmatrix|bmatrix|cases|array|gathered)\}/.test(expr)) {
    expr = expr.replace(/[\r\n]+/g, ' ');
  }

  // Fix double-escaped LaTeX commands (e.g., from JSON serialization)
  expr = expr.replace(DOUBLE_ESCAPED_CMD_REGEX, '\\');

  // Walk outside \text{...} / \mathrm{...} to repair \_ -> _ and \^ -> ^ safely
  // Note: {\text{H}}\_{2} has \_ OUTSIDE \text{H}, so this preserves real literal \_ inside \text{} while fixing all broken subscripts!
  let out = '';
  let i = 0;
  let textBraceDepth = 0;
  const braceStack: boolean[] = []; // true if brace belongs to \text{...} / \mathrm{...}

  while (i < expr.length) {
    // Check if entering \text{, \mathrm{, \mathbf{, \operatorname{
    const slice = expr.slice(i);
    const textMacroMatch = slice.match(KNOWN_TEXT_MACRO_PREFIXES);
    if (textMacroMatch) {
      out += textMacroMatch[0];
      i += textMacroMatch[0].length;
      braceStack.push(true);
      textBraceDepth++;
      continue;
    }

    const ch = expr[i];
    if (ch === '\\' && i + 1 < expr.length) {
      const next = expr[i + 1];
      if (textBraceDepth === 0 && (next === '_' || next === '^')) {
        out += next;
        i += 2;
        continue;
      }
      // Escaped brace \{ or \} does not alter brace depth
      out += ch + next;
      i += 2;
      continue;
    }

    if (ch === '{') {
      braceStack.push(false);
      out += ch;
      i++;
      continue;
    }

    if (ch === '}') {
      const wasTextMacro = braceStack.pop();
      if (wasTextMacro) textBraceDepth = Math.max(0, textBraceDepth - 1);
      out += ch;
      i++;
      continue;
    }

    out += ch;
    i++;
  }

  // Also ensure unescaped '%' does not comment out trailing KaTeX tokens
  out = out.replace(/(?<!\\)%/g, '\\%');

  return out.trim();
}

/**
 * Checks whether a character/token contains Vietnamese diacritics
 */
const VIET_DIACRITIC_REGEX = /[àáảãạăằắẳẵặâầấẩẫậèéẻẽẹêềếểễệìíỉĩịòóỏõọôồốổỗộơờớởỡợùúủũụưừứửữựỳýỷỹỵđĐ]/;

function isProseWord(word: string): boolean {
  if (!word) return false;
  if (VIET_DIACRITIC_REGEX.test(word)) return true;
  // Normal lowercase prose word (>= 2 lowercase letters, e.g. "ammonia", "mol", "cho", "tinh", "la")
  // Exclude common short chemical/math literals like "xt", "dd", "kt", "pH", "pK", "ln", "lg", "sin", "cos", "tan", "lim"
  if (/^[a-z]{2,}$/.test(word) && !/^(?:xt|dd|sin|cos|tan|cot|log|ln|lg|lim|exp|max|min|sup|inf|det|and|or)$/.test(word)) {
    return true;
  }
  // Capitalized Vietnamese/English word >= 3 letters without digits (e.g. "Cho", "Khi", "Ion", "Câu", "Ammonia")
  // Chemical element symbols are strictly 1-2 letters ([A-Z][a-z]?), never 3+ lowercase letters.
  if (/^[A-Z][a-z]{2,}$/.test(word)) return true;
  return false;
}

/**
 * Finds the next matching unescaped closing delimiter starting at `fromIndex`
 */
function findClosingDelimiter(text: string, fromIndex: number, closing: string): number {
  let i = fromIndex;
  while (i < text.length) {
    if (text[i] === '\\') {
      // If closing starts with '\', check if this IS the closing sequence
      if (closing.startsWith('\\') && text.startsWith(closing, i)) {
        return i;
      }
      // Skip escaped single character (e.g. \$ or \\)
      i += 2;
      continue;
    }
    if (text.startsWith(closing, i)) {
      return i;
    }
    i++;
  }
  return -1;
}

/**
 * Consumes a single balanced {...} block starting at `idx` where text[idx] === '{'
 */
function consumeBalancedBraces(text: string, idx: number): number {
  if (text[idx] !== '{') return idx;
  let depth = 0;
  let i = idx;
  while (i < text.length) {
    if (text[i] === '\\') {
      i += 2;
      continue;
    }
    if (text[i] === '{') depth++;
    else if (text[i] === '}') {
      depth--;
      if (depth === 0) return i + 1;
    }
    i++;
  }
  return idx;
}

/**
 * Extracts an unwrapped LaTeX span starting from an identified trigger index.
 * Walks backward over contiguous math LHS (e.g. "K_{C}=", "FeO+4HNO_3") without swallowing Vietnamese prose ("Câu 9.", "A. "),
 * and walks forward over balanced braces/delimiters/operators until prose or sentence end.
 */
function extractUnwrappedLatexBounds(
  plainChunk: string,
  triggerMatchIndex: number
): { start: number; end: number } | null {
  // 1. Walk backward to absorb tight math LHS
  let start = triggerMatchIndex;
  // Walk back while characters look like part of the same equation/expression
  let k = triggerMatchIndex - 1;
  while (k >= 0) {
    const ch = plainChunk[k];
    if (ch === '\n' || ch === '\r') {
      k++;
      break;
    }
    if (VIET_DIACRITIC_REGEX.test(ch)) {
      // Stop right after this Vietnamese character (+ skip following spaces/punctuation)
      k++;
      break;
    }
    // Check if we hit a sentence/question marker or prose word boundary followed by whitespace
    if (ch === ' ' || ch === '\t') {
      const beforeSpaces = plainChunk.slice(0, k).trimEnd();
      // Option prefix "A." / "B." / "C." / "D." or punctuation ": " / "; " / ", " / ". " -> stop after whitespace!
      if (/(?:^|\s)[A-Da-d][.)]$/.test(beforeSpaces) || /[.:;?!,]$/.test(beforeSpaces)) {
        k++;
        break;
      }
      // Check preceding word before spaces
      const wordMatch = beforeSpaces.match(/([A-Za-zÀ-ỹ]+)$/);
      if (wordMatch && isProseWord(wordMatch[1])) {
        k++;
        break;
      }
      // If spaces are preceded by a math operator or short formula identifier, keep walking only if there's an operator right between
      const between = plainChunk.slice(k + 1, triggerMatchIndex);
      if (!/[=+\-*\/<>^_{}\\]/.test(between) && !/^[=+\-*\/<>]/.test(beforeSpaces.slice(-1))) {
        k++;
        break;
      }
    }
    k--;
  }
  if (k < 0) k = 0;
  // Trim leading spaces/punctuation from start
  while (k < triggerMatchIndex && /[\s,;:]/.test(plainChunk[k])) {
    k++;
  }
  start = k;

  // 2. Walk forward from triggerMatchIndex balancing LaTeX commands, braces, and math operators
  let i = triggerMatchIndex;
  const len = plainChunk.length;
  let lastValidEnd = i;

  while (i < len) {
    const ch = plainChunk[i];

    if (ch === '\n' || ch === '\r') break;

    if (ch === '\\') {
      // Consume \commandName or escaped char
      const cmdMatch = plainChunk.slice(i).match(/^\\([A-Za-z]+|.)/);
      if (!cmdMatch) break;
      i += cmdMatch[0].length;
      // Consume optional [...] e.g. \xrightarrow[bot]{top} or \sqrt[3]{x}
      if (plainChunk[i] === '[') {
        const closeBracket = plainChunk.indexOf(']', i);
        if (closeBracket !== -1 && closeBracket - i < 80) {
          i = closeBracket + 1;
        }
      }
      // Consume attached {...} arguments (e.g. \frac{...}{...})
      while (plainChunk[i] === '{') {
        const nextIdx = consumeBalancedBraces(plainChunk, i);
        if (nextIdx === i) break;
        i = nextIdx;
      }
      lastValidEnd = i;
      continue;
    }

    if (ch === '{') {
      const nextIdx = consumeBalancedBraces(plainChunk, i);
      if (nextIdx > i) {
        i = nextIdx;
        lastValidEnd = i;
        continue;
      }
      break;
    }

    if (ch === '^' || ch === '_') {
      i++;
      if (plainChunk[i] === '{') {
        const nextIdx = consumeBalancedBraces(plainChunk, i);
        if (nextIdx > i) i = nextIdx;
      } else if (i < len && /[A-Za-z0-9+\-]/.test(plainChunk[i])) {
        i++;
      }
      lastValidEnd = i;
      continue;
    }

    if (ch === '.' && i > 0 && /\d/.test(plainChunk[i - 1]) && i + 1 < len && /\d/.test(plainChunk[i + 1])) {
      i++;
      lastValidEnd = i;
      continue;
    }

    if (/[A-Za-z0-9=+\-*\/<>()\[\]|·⋅×÷±°%']/.test(ch)) {
      // Check if this letter starts a prose word
      if (/[A-Za-z]/.test(ch) && (i === 0 || /[\s.,;:!?]/.test(plainChunk[i - 1]))) {
        const wordM = plainChunk.slice(i).match(/^[A-Za-zÀ-ỹ]+/);
        if (wordM && isProseWord(wordM[0])) {
          break;
        }
      }
      i++;
      lastValidEnd = i;
      continue;
    }

    if (ch === ' ' || ch === '\t') {
      // Look ahead past spaces: continue ONLY if next token is math/operator/latex/bracket/digit, NOT prose or end punctuation
      let j = i;
      while (j < len && (plainChunk[j] === ' ' || plainChunk[j] === '\t')) j++;
      if (j >= len) break;

      const rest = plainChunk.slice(j);
      if (rest.startsWith('\\') || /^[=+\-*\/<>^_{}\[\]()0-9]/.test(rest)) {
        i = j;
        continue;
      }
      // Also allow short math/chemical identifier followed by math op/sub/sup (e.g. " K_{C} = " or " x^2")
      const nextWordM = rest.match(/^([A-Za-zÀ-ỹ]+)/);
      if (nextWordM && !isProseWord(nextWordM[1])) {
        const afterWord = rest.slice(nextWordM[0].length);
        if (/^[_{^=+\-*\/<>]/.test(afterWord) || /^\s*[=+\-*\/<>]/.test(afterWord)) {
          i = j;
          continue;
        }
      }
      break;
    }

    // Comma inside expression only if followed immediately by math (e.g. \xrightarrow{xt, t°}); otherwise break
    if (ch === ',') {
      const rest = plainChunk.slice(i + 1).trimStart();
      if (rest.startsWith('\\')) {
        i++;
        continue;
      }
      break;
    }

    break;
  }

  // Peel trailing punctuation like '.' if not part of a decimal number
  let end = lastValidEnd;
  while (end > start && /[\s,;:]/.test(plainChunk[end - 1])) {
    end--;
  }

  if (end <= start) return null;
  const candidate = plainChunk.slice(start, end).trim();
  if (!candidate || !UNWRAPPED_LATEX_TRIGGER_REGEX.test(candidate)) return null;

  return { start, end };
}

/**
 * Splits rich mixed text into structured segments:
 * - $$...$$ and \[...\] (display math)
 * - \(...\) and $...$ (inline math)
 * - unwrapped LaTeX commands (\frac, \sqrt, \xrightarrow, K_{C}, etc.) embedded inside Vietnamese prose
 * - safe HTML tags (sub, sup, u, s, b, strong, i, em, br) & markdown bold/italic & images
 */
export function tokenizeRichContent(rawText: string): ContentSegment[] {
  const text = normalizeMixedLatexContent(rawText);
  if (!text) return [];

  const primarySegments: ContentSegment[] = [];
  let cursor = 0;
  let textBuf = '';

  const flushText = () => {
    if (!textBuf) return;
    splitUnwrappedLatexSegments(textBuf, primarySegments);
    textBuf = '';
  };

  while (cursor < text.length) {
    const ch = text[cursor];

    // Skip escaped literal dollar `\$` into text buffer
    if (ch === '\\' && text[cursor + 1] === '$') {
      textBuf += '$';
      cursor += 2;
      continue;
    }

    // 1. Display Math: $$ ... $$
    if (ch === '$' && text[cursor + 1] === '$') {
      const closeIdx = findClosingDelimiter(text, cursor + 2, '$$');
      if (closeIdx !== -1) {
        flushText();
        const inner = normalizeLatexExpression(text.slice(cursor + 2, closeIdx));
        if (inner) primarySegments.push({ type: 'math', value: inner, displayMode: true });
        cursor = closeIdx + 2;
        continue;
      }
    }

    // 2. Display Math: \[ ... \]
    if (ch === '\\' && text[cursor + 1] === '[') {
      const closeIdx = findClosingDelimiter(text, cursor + 2, '\\]');
      if (closeIdx !== -1) {
        flushText();
        const inner = normalizeLatexExpression(text.slice(cursor + 2, closeIdx));
        if (inner) primarySegments.push({ type: 'math', value: inner, displayMode: true });
        cursor = closeIdx + 2;
        continue;
      }
    }

    // 3. Inline Math: \( ... \)
    if (ch === '\\' && text[cursor + 1] === '(') {
      const closeIdx = findClosingDelimiter(text, cursor + 2, '\\)');
      if (closeIdx !== -1) {
        flushText();
        const inner = normalizeLatexExpression(text.slice(cursor + 2, closeIdx));
        if (inner) primarySegments.push({ type: 'math', value: inner, displayMode: false });
        cursor = closeIdx + 2;
        continue;
      }
    }

    // 4. Inline Math: $ ... $
    if (ch === '$' && text[cursor + 1] !== '$') {
      const closeIdx = findClosingDelimiter(text, cursor + 1, '$');
      if (closeIdx !== -1) {
        const rawInner = text.slice(cursor + 1, closeIdx);
        // Prevent treating multi-paragraph gap or currency prose ("$5 ... $10") as math
        const isMultiPara = /\n\s*\n/.test(rawInner);
        const looksLikeCurrencyProse = /^\d+(?:[.,]\d+)?\s/.test(rawInner) && !/[\\^_{}=+\-*\/]/.test(rawInner);
        if (!isMultiPara && !looksLikeCurrencyProse && rawInner.trim().length > 0) {
          flushText();
          const inner = normalizeLatexExpression(rawInner);
          if (inner) primarySegments.push({ type: 'math', value: inner, displayMode: false });
          cursor = closeIdx + 1;
          continue;
        }
      }
    }

    // 5. Markdown image: ![alt](url)
    if (ch === '!' && text[cursor + 1] === '[') {
      const imgMatch = text.slice(cursor).match(/^!\[([^\]]*)\]\(((?:[^()\n]|\([^()\n]*\))+)\)/);
      if (imgMatch) {
        flushText();
        primarySegments.push({ type: 'image', src: imgMatch[2], alt: imgMatch[1] || 'Hình ảnh minh họa' });
        cursor += imgMatch[0].length;
        continue;
      }
    }

    // 6. HTML Image or Safe inline tags (<sub>, <sup>, <u>, <s>, <b>, <strong>, <i>, <em>, <br/>)
    if (ch === '<') {
      const imgTagMatch = text.slice(cursor).match(/^<img\b([^>]*?)\/?>/i);
      if (imgTagMatch) {
        const attrs = imgTagMatch[1];
        const srcM = attrs.match(/src=["']([^"']+)["']/i);
        const altM = attrs.match(/alt=["']([^"']*)["']/i);
        if (srcM) {
          flushText();
          primarySegments.push({ type: 'image', src: srcM[1], alt: altM ? altM[1] : 'Hình ảnh' });
          cursor += imgTagMatch[0].length;
          continue;
        }
      }

      if (/^<br\s*\/?>/i.test(text.slice(cursor))) {
        const brM = text.slice(cursor).match(/^<br\s*\/?>/i)!;
        flushText();
        primarySegments.push({ type: 'html_tag', tag: 'br', inner: '' });
        cursor += brM[0].length;
        continue;
      }

      const inlineTagM = text.slice(cursor).match(/^<(sub|sup|u|s|b|strong|i|em)>([\s\S]*?)<\/\1>/i);
      if (inlineTagM) {
        const rawTag = inlineTagM[1].toLowerCase();
        const tag: 'sub' | 'sup' | 'u' | 's' | 'b' | 'i' =
          rawTag === 'strong' ? 'b' : rawTag === 'em' ? 'i' : (rawTag as any);
        flushText();
        primarySegments.push({ type: 'html_tag', tag, inner: inlineTagM[2] });
        cursor += inlineTagM[0].length;
        continue;
      }
    }

    // 7. Markdown Bold+Italic (***...***) or Bold (**...**)
    if (ch === '*' && text[cursor + 1] === '*') {
      if (text[cursor + 2] === '*') {
        const md3M = text.slice(cursor).match(/^\*\*\*([^\s*](?:[^\n]*?[^\s*])?)\*\*\*/);
        if (md3M) {
          flushText();
          primarySegments.push({ type: 'md_style', style: 'bold_italic', inner: md3M[1] });
          cursor += md3M[0].length;
          continue;
        }
      }
      const md2M = text.slice(cursor).match(/^\*\*([^\s*](?:[^\n]*?[^\s*])?)\*\*/);
      if (md2M) {
        flushText();
        primarySegments.push({ type: 'md_style', style: 'bold', inner: md2M[1] });
        cursor += md2M[0].length;
        continue;
      }
    }

    textBuf += ch;
    cursor++;
  }

  flushText();
  return primarySegments;
}

function splitUnwrappedLatexSegments(plain: string, out: ContentSegment[]): void {
  let pos = 0;

  while (pos < plain.length) {
    const rest = plain.slice(pos);
    const trigM = rest.match(UNWRAPPED_LATEX_TRIGGER_REGEX);
    if (!trigM || trigM.index === undefined) {
      if (rest) out.push({ type: 'text', value: rest });
      break;
    }

    const trigAbsIdx = pos + trigM.index;
    const bounds = extractUnwrappedLatexBounds(plain.slice(pos), trigM.index);

    if (!bounds) {
      // Advance safely past this trigger without infinite loop
      const safeEnd = trigAbsIdx + trigM[0].length;
      out.push({ type: 'text', value: plain.slice(pos, safeEnd) });
      pos = safeEnd;
      continue;
    }

    const absStart = pos + bounds.start;
    const absEnd = pos + bounds.end;

    if (absStart > pos) {
      out.push({ type: 'text', value: plain.slice(pos, absStart) });
    }

    const rawMath = plain.slice(absStart, absEnd);
    out.push({
      type: 'math',
      value: normalizeLatexExpression(rawMath),
      displayMode: false,
    });
    pos = absEnd;
  }
}
