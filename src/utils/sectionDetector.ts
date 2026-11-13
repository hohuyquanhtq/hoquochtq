import { QuestionType, SectionDetectionMethod } from '../types';

export interface SectionDetectionCandidate {
  type: QuestionType | 'ambiguous';
  method: SectionDetectionMethod;
  confidence: number;
  needsConfirmation: boolean;
  warning?: string;
  rawTitle: string;
}

/**
 * Normalizes Vietnamese text to lowercase ASCII without diacritics,
 * explicitly mapping đ/Đ -> d and Unicode Roman numerals -> ASCII I/II/III.
 */
export function removeDiacritics(str: string): string {
  return str
    .replace(/[đĐ]/g, 'd')
    .replace(/Ⅲ/g, 'iii')
    .replace(/Ⅱ/g, 'ii')
    .replace(/Ⅰ/g, 'i')
    .replace(/ⅲ/g, 'iii')
    .replace(/ⅱ/g, 'ii')
    .replace(/ⅰ/g, 'i')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

/**
 * Cleans markdown / HTML / table cell wrappers from a single line
 * so section header detection works regardless of Word formatting or tables.
 */
export function cleanSectionHeaderLine(rawLine: string): string {
  return rawLine
    .replace(/<[^>]+>/g, ' ') // strip HTML tags like <u>, <b>, <strong>
    .replace(/\|/g, ' ')      // unwrap markdown table pipes
    .replace(/\*{1,3}|_{1,3}|`+/g, '') // strip bold/italic/underline markdown markers
    .replace(/^[#>\s•▪◦\-–—:]+/, '')
    .replace(/[\s\-–—]+$/, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

/**
 * Strips trailing parenthetical metadata like "(3,0 điểm)", "(12 câu)", "(45 phút)"
 */
function stripTrailingMetadata(norm: string): string {
  return norm
    .replace(/(?:\s*[\(\[][^\)\]]*(?:diem|cau|y|phut|thoi gian|tu cau|toi cau|muc|gdpt)[^\)\]]*[\)\]])+\s*$/gi, '')
    .replace(/(?:\s*[\(\[][\d\s,.\-\/]+[\)\]])+\s*$/g, '')
    .trim();
}

/**
 * Detects explicit question-type keywords in normalized header text
 */
function matchExplicitTypeKeyword(normText: string): QuestionType | null {
  // Part III: Short answer keywords (check before Part I so "trac nghiem tra loi ngan" doesn't match "trac nghiem")
  if (
    /\b(?:trac\s+nghiem\s+tra\s+loi\s+ngan|cau\s+(?:hoi\s+)?tra\s+loi\s+ngan|tra\s+loi\s+ngan|dien\s+khuyet|tra\s+loi\s+tu\s+do|dang\s+thuc\s+tra\s+loi\s+ngan)\b/i.test(normText)
  ) {
    return 'part3_short_answer';
  }

  // Part II: True/False keywords
  if (
    /\b(?:trac\s+nghiem\s+dung\s*[-–—\/\s]*sai|cau\s+(?:hoi\s+)?(?:trac\s+nghiem\s+)?dung\s*[-–—\/\s]*sai|dung\s*[-–—\/\s]+sai|dung\/sai)\b/i.test(normText)
  ) {
    return 'part2_true_false';
  }

  // Part I: Multiple choice keywords
  if (
    /\b(?:trac\s+nghiem\s+(?:4|bon|nhieu)\s+(?:lua\s+chon|phuong\s+an)|cau\s+(?:hoi\s+)?(?:trac\s+nghiem\s+)?nhieu\s+(?:lua\s+chon|phuong\s+an)|nhieu\s+phuong\s+an(?:\s+lua\s+chon)?|4\s+lua\s+chon|mot\s+lua\s+chon|trac\s+nghiem\s+khach\s+quan|khoanh\s+tron)\b/i.test(normText)
  ) {
    return 'part1_single_choice';
  }

  return null;
}

/**
 * Checks whether a normalized remainder looks like a natural prose sentence rather than a section header
 */
function looksLikeProseAfterHeader(normRest: string): boolean {
  if (!normRest) return false;
  // Prose chemistry indicators
  if (
    /\b(?:cua\s+thi\s+nghiem|cua\s+mau|thu\s+duoc|tac\s+dung|phan\s+ung|hoa\s+tan|tao\s+thanh|ket\s+tua|dun\s+nong|cho\s+vao|la\s+chat|la\s+dung\s+dich|la\s+khi|co\s+cong\s+thuc|trong\s+so\s+do|biet\s+rang|nguyen\s+chat|nong\s+do|khoi\s+luong)\b/i.test(normRest)
  ) {
    return true;
  }
  // Too many words without any exam-section vocabulary
  const words = normRest.split(/\s+/).filter(Boolean);
  const hasExamVocab = /\b(?:phan|trac\s+nghiem|cau|lua\s+chon|phuong\s+an|dung|sai|tra\s+loi|ngan|dien\s+khuyet|tu\s+luan|khach\s+quan|diem|thi\s+sinh)\b/i.test(normRest);
  if (!hasExamVocab && words.length > 5) {
    return true;
  }
  return false;
}

/**
 * Checks if a line is just an exam instruction sub-line directly under a section header,
 * e.g. "TRẮC NGHIỆM ĐÚNG SAI" or "Thí sinh trả lời từ câu 1 đến câu 4..." or "(2,0 điểm)".
 */
export function isSectionSubtitleLine(rawLine: string): boolean {
  const cleaned = cleanSectionHeaderLine(rawLine);
  if (!cleaned || cleaned.length > 180) return false;
  if (/^(?:cau|bai)\s+\d+/i.test(removeDiacritics(cleaned))) return false;

  const norm = removeDiacritics(cleaned);
  if (matchExplicitTypeKeyword(norm) !== null) return true;
  if (/^(?:thi\s+sinh\s+tra\s+loi|chon\s+(?:mot|1)\s+phuong\s+an|trong\s+moi\s+y|moi\s+cau\s+hoi\s+chi\s+chon|ghi\s+ro\s+ket\s+qua|lam\s+tron\s+ket\s+qua)\b/i.test(norm)) {
    return true;
  }
  if (/^\(?[\d,.]+\s*diem\)?$/i.test(norm)) {
    return true;
  }
  return false;
}

/**
 * Detailed section header detector supporting:
 * - Bare Roman titles: PHẦN I, Phần II, PHẦN III, Phần 1/2/3
 * - Punctuated/unpunctuated titles: PHẦN I:, Phần I., phần ii đúng sai
 * - Shorthand Roman headers: I. TRẮC NGHIỆM, II. ĐÚNG SAI, III. TRẢ LỜI NGẮN
 * - Semantic headers without Roman numerals: Trắc nghiệm đúng sai, Câu hỏi trả lời ngắn
 * - Ambiguous headers requiring teacher confirmation: PHẦN IV, PHẦN A, TỰ LUẬN
 * - Anti-false-positive protection against prose like "Ở phần I...", "Phần I của thí nghiệm...", "I là chất..."
 */
export function detectSectionHeaderDetailed(rawLine: string): SectionDetectionCandidate | null {
  const cleaned = cleanSectionHeaderLine(rawLine);
  if (!cleaned || cleaned.length > 180) return null;

  // Never treat pure separator / dashes / answer key lines / questions as section headers
  if (/^[\-–—=_|.\s]+$/.test(cleaned)) return null;

  const normFull = removeDiacritics(cleaned);
  const norm = stripTrailingMetadata(normFull);
  if (!norm) return null;

  // Reject lines starting with Question / Answer markers or prose prepositions
  if (/^(?:cau\s+\d+|bai\s+\d+|o\s+phan|tai\s+phan|trong\s+phan|tu\s+phan|cua\s+phan|dap\s+an\s+phan)\b/i.test(norm)) {
    return null;
  }

  // 1. Check "PHẦN / MỤC <Roman/Arabic>" pattern (ordered III -> II -> I)
  const phanMatch = norm.match(/^(?:phan|muc)\s+(?:(iii|3)|(ii|2)|(i|1))\b([\s.:–—\-\/]*)(.*)$/i);
  if (phanMatch) {
    const isPart3 = !!phanMatch[1];
    const isPart2 = !!phanMatch[2];
    const sep = phanMatch[4] || '';
    const rest = (phanMatch[5] || '').trim();

    const defaultByRoman: QuestionType = isPart3
      ? 'part3_short_answer'
      : isPart2
      ? 'part2_true_false'
      : 'part1_single_choice';

    // Bare header e.g. "PHẦN I", "PHẦN II.", "PHẦN III:" (after metadata stripped)
    if (!rest) {
      return {
        type: defaultByRoman,
        method: 'roman_header',
        confidence: 0.96,
        needsConfirmation: false,
        rawTitle: cleaned,
      };
    }

    // Reject prose without explicit exam-section keywords, e.g. "Phần I của thí nghiệm thu được..."
    const explicitType = matchExplicitTypeKeyword(rest);
    const hasGenericExamHeader = /^(?:trac\s+nghiem|cac\s+cau\s+hoi|cau\s+hoi|lua\s+chon|phan\s+(?:thi|kiem\s+tra)|bai\s+tap|ly\s+thuyet)\b/i.test(rest);
    const hasDelimiter = /[.:–—\-\/]/.test(sep);

    if (looksLikeProseAfterHeader(rest)) {
      return null;
    }

    // Without punctuation separator (e.g. "phần i của..."), ONLY accept if remainder starts with an exam-header keyword
    if (!hasDelimiter && !explicitType && !hasGenericExamHeader) {
      return null;
    }

    // Explicit type keyword takes priority (handles reordered exams like "PHẦN I: TRẢ LỜI NGẮN")
    if (explicitType) {
      const mismatchedOrder = explicitType !== defaultByRoman;
      return {
        type: explicitType,
        method: 'roman_header',
        confidence: mismatchedOrder ? 0.9 : 1.0,
        needsConfirmation: false,
        rawTitle: cleaned,
      };
    }

    // Has delimiter + generic/short title (e.g. "PHẦN II: CÁC CÂU HỎI", "PHẦN I. TRẮC NGHIỆM")
    if (hasGenericExamHeader || (hasDelimiter && rest.split(/\s+/).length <= 7 && !/[.,;]$/.test(rest))) {
      return {
        type: defaultByRoman,
        method: 'roman_header',
        confidence: 0.92,
        needsConfirmation: false,
        rawTitle: cleaned,
      };
    }

    return null;
  }

  // 2. Check standalone Roman numeral header without "PHẦN": e.g. "I. TRẮC NGHIỆM", "II. ĐÚNG SAI", "III. TRẢ LỜI NGẮN"
  // Require strict Roman numeral boundary + delimiter AND exam-section keyword so chemistry prose like "I là chất rắn" or "II. Khi đun nóng..." is never matched.
  const romanOnlyMatch = norm.match(/^(?:(iii)|(ii)|(i))\s*[.:–—\-]\s*(.+)$/i);
  if (romanOnlyMatch) {
    const isPart3 = !!romanOnlyMatch[1];
    const isPart2 = !!romanOnlyMatch[2];
    const rest = (romanOnlyMatch[4] || '').trim();

    if (looksLikeProseAfterHeader(rest)) {
      return null;
    }

    const defaultByRoman: QuestionType = isPart3
      ? 'part3_short_answer'
      : isPart2
      ? 'part2_true_false'
      : 'part1_single_choice';

    const explicitType = matchExplicitTypeKeyword(rest);
    if (explicitType) {
      return {
        type: explicitType,
        method: 'roman_header',
        confidence: 0.98,
        needsConfirmation: false,
        rawTitle: cleaned,
      };
    }

    if (/^(?:phan\s+)?(?:trac\s+nghiem|cau\s+trac\s+nghiem|dung\s*[-–\/]?\s*sai|tra\s+loi\s+ngan)\b/i.test(rest)) {
      return {
        type: defaultByRoman,
        method: 'roman_header',
        confidence: 0.94,
        needsConfirmation: false,
        rawTitle: cleaned,
      };
    }

    return null;
  }

  // 3. Semantic headers without Roman numerals: e.g. "TRẮC NGHIỆM ĐÚNG SAI", "CÂU HỎI TRẢ LỜI NGẮN", "TRẮC NGHIỆM NHIỀU LỰA CHỌN"
  const semanticType = matchExplicitTypeKeyword(norm);
  if (semanticType) {
    const words = norm.split(/\s+/).filter(Boolean);
    if (words.length <= 12 && !looksLikeProseAfterHeader(norm)) {
      return {
        type: semanticType,
        method: 'semantic_header',
        confidence: 0.9,
        needsConfirmation: false,
        rawTitle: cleaned,
      };
    }
  }

  // 4. Generic standalone "TRẮC NGHIỆM" (without Part number or 4-choice / TF / short-answer qualifier)
  if (/^(?:phan\s+)?trac\s+nghiem(?:\s+khach\s+quan)?$/i.test(norm)) {
    return {
      type: 'part1_single_choice',
      method: 'semantic_header',
      confidence: 0.85,
      needsConfirmation: true,
      warning: 'Tiêu đề chỉ ghi "Trắc nghiệm" không nêu rõ Phần I/II/III — tạm nhận diện là Phần I (4 lựa chọn), vui lòng xác nhận.',
      rawTitle: cleaned,
    };
  }

  // 5. Unknown/ambiguous section titles (e.g. "PHẦN IV: ...", "PHẦN A.", "PHẦN TỰ LUẬN", "MỤC B")
  const ambiguousPhanMatch = norm.match(/^(?:phan|muc)\s+(?:iv|v|[a-z]|tu\s+luan|van\s+dung)\b([\s.:–—\-]*)(.*)$/i);
  if (ambiguousPhanMatch) {
    const rest = (ambiguousPhanMatch[2] || '').trim();
    if (!looksLikeProseAfterHeader(rest) && norm.split(/\s+/).length <= 12) {
      return {
        type: 'ambiguous',
        method: 'ambiguous',
        confidence: 0.4,
        needsConfirmation: true,
        warning: `Tiêu đề phần "${cleaned}" không thuộc chuẩn PHẦN I/II/III — hệ thống sẽ tự suy luận theo cấu trúc câu hỏi bên trong, vui lòng xác nhận.`,
        rawTitle: cleaned,
      };
    }
  }

  return null;
}

/**
 * Compatibility wrapper returning the resolved QuestionType (or null if not a section header / ambiguous).
 */
export function detectSectionHeader(rawLine: string): QuestionType | null {
  const res = detectSectionHeaderDetailed(rawLine);
  if (!res || res.type === 'ambiguous') return null;
  return res.type;
}
