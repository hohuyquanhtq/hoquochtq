import type { CognitiveLevel } from '../types';

export type WordImportLevelMode = 'auto' | CognitiveLevel;

export type LevelDetectionSource = 'tag' | 'ai' | 'default_fallback' | 'fixed' | 'manual';

export interface CognitiveLevelTagResult {
  detectedLevel: CognitiveLevel | null;
  matchedTag: string | null;
  cleanedContent: string;
}

export const WORD_IMPORT_AUTO_LEVEL_LABEL =
  'Tự động nhận diện theo mã [NB], [TH], [VD], [VDC] trong file';

/**
 * Bảng màu phong thủy HQTest đồng bộ cho 4 mức độ nhận thức:
 * - [NB]: Xanh lá (Emerald)
 * - [TH]: Xanh lam (Sky)
 * - [VD]: Vàng hổ phách (Amber)
 * - [VDC]: Đỏ hồng (Rose)
 */
export const COGNITIVE_LEVEL_BADGE_STYLES: Record<
  CognitiveLevel,
  {
    label: string;
    shortLabel: string;
    tagCode: string;
    badgeClass: string;
    selectClass: string;
  }
> = {
  nhan_biet: {
    label: 'Nhận biết',
    shortLabel: 'NB',
    tagCode: 'NB',
    badgeClass: 'bg-emerald-50 text-emerald-700 border border-emerald-200',
    selectClass: 'bg-emerald-50 text-emerald-800 border-emerald-200',
  },
  thong_hieu: {
    label: 'Thông hiểu',
    shortLabel: 'TH',
    tagCode: 'TH',
    badgeClass: 'bg-sky-50 text-sky-700 border border-sky-200',
    selectClass: 'bg-sky-50 text-sky-800 border-sky-200',
  },
  van_dung: {
    label: 'Vận dụng',
    shortLabel: 'VD',
    tagCode: 'VD',
    badgeClass: 'bg-amber-50 text-amber-700 border border-amber-300',
    selectClass: 'bg-amber-50 text-amber-800 border-amber-300',
  },
  van_dung_cao: {
    label: 'Vận dụng cao',
    shortLabel: 'VDC',
    tagCode: 'VDC',
    badgeClass: 'bg-rose-50 text-rose-700 border border-rose-200',
    selectClass: 'bg-rose-50 text-rose-800 border-rose-200',
  },
};

const TAG_TOKEN_TO_LEVEL: Record<string, CognitiveLevel> = {
  NB: 'nhan_biet',
  M1: 'nhan_biet',
  TH: 'thong_hieu',
  M2: 'thong_hieu',
  VD: 'van_dung',
  M3: 'van_dung',
  VDC: 'van_dung_cao',
  M4: 'van_dung_cao',
};

/**
 * Strict whitelist token pattern with MATCHED delimiter pairs:
 *   - Square brackets: [NB], [TH], [VD], [VDC], [M1], [M2], [M3], [M4]
 *   - Parentheses:     (NB), (TH), (VD), (VDC), (M1), (M2), (M3), (M4)
 *
 * Chemical concentration & complex notations such as [H+], [OH-], [Fe3+], [Cl-],
 * [Cu(NH3)4]2+, [Ag(NH3)2]+, (NH4)2SO4 NEVER match because only exact allowlisted
 * tokens (NB|TH|VDC|VD|M1|M2|M3|M4) are permitted inside matched brackets/parens.
 */
const EXACT_WHITELIST_BRACKET_REGEX =
  /^(?:\[\s*(NB|TH|VDC|VD|M1|M2|M3|M4)\s*\]|\(\s*(NB|TH|VDC|VD|M1|M2|M3|M4)\s*\))$/i;

const PREFIX_BEFORE_TAG =
  '((?:\\s|<(?:p|div)(?:\\s[^>]*)?>)*(?:(?:Câu|Bài)\\s*\\d+\\s*[:.)\\-–—]*\\s*)?)';

// Matched bracket or paren token (2 capture groups: square-token or paren-token)
const MATCHED_TAG_TOKEN =
  '(?:\\[\\s*(NB|TH|VDC|VD|M1|M2|M3|M4)\\s*\\]|\\(\\s*(NB|TH|VDC|VD|M1|M2|M3|M4)\\s*\\))';

// Optional single trailing punctuation right after tag (e.g. "Câu 1 [TH]: ...", "Câu 1 (VD). ...")
// Uses negative lookahead \.(?!\.) so ellipses "..." in fill-in-the-blank questions are preserved.
const OPTIONAL_TRAILING_SEP = '(?:\\s*(?:[:–—\\-]|\\.(?!\\.)))?[ \\t]*';

// Case 1: Leading tag wrapped in its own inline HTML tag, e.g. "<p><strong>[VDC]</strong> ..." or "<b>(VD):</b> ..."
const WRAPPED_HTML_TAG_REGEX = new RegExp(
  `^${PREFIX_BEFORE_TAG}<(strong|b|em|i|u|span)(?:\\s[^>]*)?>\\s*${MATCHED_TAG_TOKEN}(?:\\s*(?:[:–—\\-]|\\.(?!\\.)))?\\s*<\\/\\2>${OPTIONAL_TRAILING_SEP}`,
  'i'
);

// Case 2: Leading tag wrapped in markdown bold/italic, e.g. "Câu 12: **[VD]** ..." or "**(TH):** ..."
const WRAPPED_MD_TAG_REGEX = new RegExp(
  `^${PREFIX_BEFORE_TAG}(\\*{1,2}|_{1,2})\\s*${MATCHED_TAG_TOKEN}(?:\\s*(?:[:–—\\-]|\\.(?!\\.)))?\\s*\\2${OPTIONAL_TRAILING_SEP}`,
  'i'
);

// Case 3: Bare leading tag at start of stem (or inside an inline tag spanning the whole question stem)
const BARE_LEADING_TAG_REGEX = new RegExp(
  `^((?:\\s|<(?:p|div|span|strong|b|em|i|u)(?:\\s[^>]*)?>)*(?:(?:Câu|Bài)\\s*\\d+\\s*[:.)\\-–—]*\\s*)?(?:<(?:strong|b|em|i|u|span)(?:\\s[^>]*)?>|\\*{1,2}|_{1,2})*\\s*)${MATCHED_TAG_TOKEN}${OPTIONAL_TRAILING_SEP}`,
  'i'
);

/**
 * Checks if a standalone bracketed string like "[TH]" or "(VD)" is an exact whitelisted
 * cognitive-level tag. Returns the CognitiveLevel or null (never matches [H+], [Fe3+], etc.).
 */
export function parseCognitiveLevelToken(rawBracket: string): CognitiveLevel | null {
  if (!rawBracket) return null;
  const m = rawBracket.trim().match(EXACT_WHITELIST_BRACKET_REGEX);
  if (!m) return null;
  const token = (m[1] || m[2] || '').toUpperCase();
  return TAG_TOKEN_TO_LEVEL[token] || null;
}

/**
 * Extract and strip a leading cognitive-level tag ([NB]/[TH]/[VD]/[VDC]/[M1]-[M4]
 * or (NB)/(TH)/(VD)/(VDC)/(M1)-(M4)) from the start of a question stem.
 * Strictly preserves all Chemistry notations like [H+], [OH-], [Fe3+], [Cl-],
 * [Cu(NH3)4]2+, [Ag(NH3)2]+.
 */
export function extractCognitiveLevelTag(content: string): CognitiveLevelTagResult {
  if (!content) {
    return {
      detectedLevel: null,
      matchedTag: null,
      cleanedContent: '',
    };
  }

  let prefix = '';
  let rawToken = '';
  let matchedLength = 0;

  const htmlMatch = content.match(WRAPPED_HTML_TAG_REGEX);
  if (htmlMatch) {
    prefix = htmlMatch[1] || '';
    rawToken = (htmlMatch[3] || htmlMatch[4] || '').toUpperCase();
    matchedLength = htmlMatch[0].length;
  } else {
    const mdMatch = content.match(WRAPPED_MD_TAG_REGEX);
    if (mdMatch) {
      prefix = mdMatch[1] || '';
      rawToken = (mdMatch[3] || mdMatch[4] || '').toUpperCase();
      matchedLength = mdMatch[0].length;
    } else {
      const bareMatch = content.match(BARE_LEADING_TAG_REGEX);
      if (bareMatch) {
        prefix = bareMatch[1] || '';
        rawToken = (bareMatch[2] || bareMatch[3] || '').toUpperCase();
        matchedLength = bareMatch[0].length;
      }
    }
  }

  const detectedLevel = rawToken ? TAG_TOKEN_TO_LEVEL[rawToken] || null : null;
  if (!detectedLevel) {
    return {
      detectedLevel: null,
      matchedTag: null,
      cleanedContent: content,
    };
  }

  const remainder = content.slice(matchedLength);
  const cleanedContent = `${prefix}${remainder}`.replace(/^[ \t]+/, '');

  return {
    detectedLevel,
    matchedTag: `[${rawToken}]`,
    cleanedContent,
  };
}

/**
 * Strip any leading cognitive-level tag without touching Chemistry notations like [H+], [OH-], [Fe3+].
 */
export function stripLeadingCognitiveLevelTag(content: string): string {
  return extractCognitiveLevelTag(content).cleanedContent;
}

/**
 * Format level tag code for sample Word templates (e.g. "NB", "TH", "VD", "VDC").
 */
export function getCognitiveLevelTagCode(level?: CognitiveLevel): string {
  if (!level) return 'NB';
  return COGNITIVE_LEVEL_BADGE_STYLES[level]?.tagCode || 'NB';
}
