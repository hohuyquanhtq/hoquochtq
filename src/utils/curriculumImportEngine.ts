import type {
  CurriculumGrade,
  CurriculumImportMode,
  CurriculumLesson,
  CurriculumStatus,
  SubjectItem,
} from '../types/index.ts';
import {
  DEFAULT_GDPT_2018_SUBJECTS,
  TEXTBOOK_SERIES_OPTIONS,
} from '../constants/subjects.ts';

export interface CurriculumImportRawRow {
  rowNumber: number;
  subject?: unknown;
  subjectId?: unknown;
  subjectName?: unknown;
  grade?: unknown;
  textbook?: unknown;
  textbookYear?: unknown;
  chapterId?: unknown;
  chapterOrder?: unknown;
  chapterName?: unknown;
  lessonId?: unknown;
  lessonOrder?: unknown;
  lessonName?: unknown;
  status?: unknown;
}

export interface CurriculumImportNormalizedRow {
  rowNumber: number;
  subjectId: string;
  subjectName: string;
  grade: CurriculumGrade;
  textbookSeries: string;
  textbookYear: string;
  explicitChapterId?: string;
  chapterOrder: number;
  chapterName: string;
  explicitLessonId?: string;
  lessonOrder: number;
  lessonName: string;
  status: CurriculumStatus;
}

export interface CurriculumImportRowIssue {
  rowNumber: number;
  kind: 'error' | 'duplicate';
  field?: string;
  message: string;
  rawSummary?: string;
}

export interface CurriculumImportValidationStats {
  totalDataRows: number;
  totalSubjects: number;
  totalGrades: number;
  totalChapters: number;
  totalLessons: number;
  validRowsCount: number;
  errorRowsCount: number;
  duplicateRowsCount: number;
  detectedTextbooks: string[];
}

export interface CurriculumImportValidationResult {
  validRows: CurriculumImportNormalizedRow[];
  errors: CurriculumImportRowIssue[];
  duplicates: CurriculumImportRowIssue[];
  stats: CurriculumImportValidationStats;
  missingRequiredHeaders: string[];
}

export interface PlannedLessonAction {
  rowNumber: number;
  action: 'add' | 'update' | 'skip';
  reason: string;
  lesson: CurriculumLesson;
  existingLesson?: CurriculumLesson;
}

export interface CurriculumImportPlan {
  mode: CurriculumImportMode;
  items: PlannedLessonAction[];
  toAdd: CurriculumLesson[];
  toUpdate: CurriculumLesson[];
  skipped: PlannedLessonAction[];
  missingInFile: CurriculumLesson[];
  affectedScopes: Array<{ subjectId: string; grade: CurriculumGrade; textbookSeries: string }>;
  existingOverlapCount: number;
}

export function normalizeVietnameseText(raw: string): string {
  return (raw || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function slugifySafe(raw: string, prefix: string, maxLen = 96): string {
  const ascii = normalizeVietnameseText(raw)
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
  const base = ascii ? `${prefix}_${ascii}` : `${prefix}_${Date.now()}`;
  return base.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, maxLen);
}

export function sanitizeFirestoreId(raw: string, fallbackPrefix = 'item'): string {
  const cleaned = (raw || '').trim().replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 128);
  return cleaned || `${fallbackPrefix}_${Date.now()}`;
}

export function getTextbookShortTag(textbookSeries?: string): string {
  const norm = normalizeVietnameseText(textbookSeries || '');
  if (!norm) return '';
  if (norm.includes('ket noi tri thuc') || norm === 'kntt') return 'kntt';
  if (norm.includes('chan troi sang tao') || norm === 'ctst') return 'ctst';
  if (norm.includes('canh dieu') || norm === 'cd') return 'cd';
  return norm.replace(/[^a-z0-9]+/g, '').slice(0, 10) || 'sgk';
}

export function generateStableChapterId(
  subjectId: string,
  grade: CurriculumGrade,
  chapterName: string,
  textbookSeries?: string
): string {
  const subShort = sanitizeFirestoreId(subjectId, 'sub').slice(0, 22);
  const tbTag = getTextbookShortTag(textbookSeries);
  const prefix = tbTag ? `${subShort}_g${grade}_${tbTag}_ch` : `${subShort}_g${grade}_ch`;
  return slugifySafe(chapterName, prefix, 128);
}

export function generateStableLessonId(
  subjectId: string,
  grade: CurriculumGrade,
  chapterId: string,
  lessonName: string,
  lessonOrder?: number
): string {
  const subShort = sanitizeFirestoreId(subjectId, 'sub').slice(0, 20);
  const chShort = sanitizeFirestoreId(chapterId, 'ch').slice(-26);
  const orderTag = typeof lessonOrder === 'number' && lessonOrder > 0 ? `b${lessonOrder}_` : '';
  return slugifySafe(`${orderTag}${lessonName}`, `${subShort}_g${grade}_${chShort}`, 128);
}

const SUBJECT_SYNONYMS: Record<string, string> = {
  'toan': 'toan_hoc',
  'toan hoc': 'toan_hoc',
  'ngu van': 'ngu_van',
  'van': 'ngu_van',
  'van hoc': 'ngu_van',
  'tieng anh': 'ngoai_ngu_1',
  'ngoai ngu': 'ngoai_ngu_1',
  'ngoai ngu 1': 'ngoai_ngu_1',
  'tieng anh va cac ngoai ngu khac': 'ngoai_ngu_1',
  'vat li': 'vat_li',
  'vat ly': 'vat_li',
  'li': 'vat_li',
  'ly': 'vat_li',
  'hoa hoc': 'hoa_hoc',
  'hoa': 'hoa_hoc',
  'sinh hoc': 'sinh_hoc',
  'sinh': 'sinh_hoc',
  'lich su': 'lich_su',
  'su': 'lich_su',
  'dia li': 'dia_li',
  'dia ly': 'dia_li',
  'dia': 'dia_li',
  'giao duc kinh te va phap luat': 'gdkt_pl',
  'gdkt&pl': 'gdkt_pl',
  'gdktpl': 'gdkt_pl',
  'ktpl': 'gdkt_pl',
  'tin hoc': 'tin_hoc',
  'tin': 'tin_hoc',
  'cong nghe': 'cong_nghe',
  'giao duc the chat': 'gdtc',
  'gdtc': 'gdtc',
  'giao duc quoc phong va an ninh': 'gdqpan',
  'gdqp&an': 'gdqpan',
  'gdqpan': 'gdqpan',
  'qpan': 'gdqpan',
  'am nhac': 'am_nhac',
  'mi thuat': 'mi_thuat',
  'my thuat': 'mi_thuat',
  'hoat dong trai nghiem huong nghiep': 'hdtn_hn',
  'hoat dong trai nghiem, huong nghiep': 'hdtn_hn',
  'hdtn-hn': 'hdtn_hn',
  'hdtn': 'hdtn_hn',
  'noi dung giao duc dia phuong': 'gd_dia_phuong',
  'giao duc dia phuong': 'gd_dia_phuong',
  'gddp': 'gd_dia_phuong',
};

export function resolveSubjectMatch(
  rawSubject: string,
  subjects: SubjectItem[] = DEFAULT_GDPT_2018_SUBJECTS,
  fallbackName?: string
): { id: string; name: string } | null {
  const candidates = [rawSubject, fallbackName || '']
    .map((v) => String(v || '').trim())
    .filter(Boolean);

  for (const val of candidates) {
    const lower = val.toLowerCase();
    const norm = normalizeVietnameseText(val);

    // 1. Exact ID match
    const byId = subjects.find((s) => s.id.toLowerCase() === lower);
    if (byId) return { id: byId.id, name: byId.name };

    // 2. Exact name or normalized name match
    const byName = subjects.find(
      (s) => s.name.toLowerCase() === lower || normalizeVietnameseText(s.name) === norm
    );
    if (byName) return { id: byName.id, name: byName.name };

    // 3. ShortName / codePrefix match
    const byShort = subjects.find(
      (s) =>
        (s.shortName && normalizeVietnameseText(s.shortName) === norm) ||
        (s.codePrefix && s.codePrefix.toLowerCase() === lower)
    );
    if (byShort) return { id: byShort.id, name: byShort.name };

    // 4. Built-in Vietnamese spelling / synonym lookup
    const mappedId = SUBJECT_SYNONYMS[norm];
    if (mappedId) {
      const target = subjects.find((s) => s.id === mappedId);
      if (target) return { id: target.id, name: target.name };
    }
  }

  return null;
}

export function normalizeCurriculumGrade(rawGrade: unknown): CurriculumGrade | null {
  const text = normalizeVietnameseText(String(rawGrade ?? ''));
  if (text === '10' || text === 'lop 10' || text === 'khoi 10' || text === 'grade 10') return '10';
  if (text === '11' || text === 'lop 11' || text === 'khoi 11' || text === 'grade 11') return '11';
  if (text === '12' || text === 'lop 12' || text === 'khoi 12' || text === 'grade 12') return '12';
  return null;
}

export function resolveConfiguredTextbook(
  rawTextbook: unknown,
  allowedTextbooks: string[]
): { valid: boolean; canonicalName: string; reason?: string } {
  const cleaned = String(rawTextbook ?? '').trim();
  if (!cleaned) {
    return {
      valid: false,
      canonicalName: '',
      reason: 'Thiếu bộ sách giáo khoa (Textbook).',
    };
  }
  if (cleaned.length > 150) {
    return {
      valid: false,
      canonicalName: '',
      reason: 'Tên bộ sách giáo khoa vượt quá 150 ký tự.',
    };
  }

  const normInput = normalizeVietnameseText(cleaned);
  const canonicalList = Array.from(
    new Set([...TEXTBOOK_SERIES_OPTIONS, ...allowedTextbooks.map((t) => t.trim()).filter(Boolean)])
  );

  // Direct exact or accent-insensitive match
  for (const candidate of canonicalList) {
    if (normalizeVietnameseText(candidate) === normInput) {
      return { valid: true, canonicalName: candidate };
    }
  }

  // Standard Vietnamese textbook aliases
  const aliasPairs: Array<[string[], string]> = [
    [['kntt', 'knttvcs', 'ket noi tri thuc', 'ket noi tri thuc voi cuoc song'], 'Kết nối tri thức với cuộc sống'],
    [['ctst', 'chan troi', 'chan troi sang tao'], 'Chân trời sáng tạo'],
    [['cd', 'canh dieu'], 'Cánh diều'],
  ];

  for (const [aliases, target] of aliasPairs) {
    if (aliases.includes(normInput)) {
      const allowedMatch = canonicalList.find((c) => normalizeVietnameseText(c) === normalizeVietnameseText(target));
      if (allowedMatch) {
        return { valid: true, canonicalName: allowedMatch };
      }
    }
  }

  return {
    valid: false,
    canonicalName: '',
    reason: `Bộ sách "${cleaned}" chưa tồn tại hoặc chưa được cấu hình trong hệ thống (hợp lệ: ${canonicalList.join(', ')}).`,
  };
}

function parsePositiveIntegerOrder(raw: unknown): number | null {
  if (raw === undefined || raw === null) return null;
  const text = String(raw).trim();
  if (!text) return null;
  if (!/^\d+$/.test(text)) return null;
  const num = Number.parseInt(text, 10);
  if (!Number.isSafeInteger(num) || num < 1 || num > 10000) return null;
  return num;
}

export function extractNormalizedRawRowsFromSheetRecords(
  records: Record<string, unknown>[]
): {
  rows: CurriculumImportRawRow[];
  detectedColumns: string[];
  missingRequiredHeaders: string[];
} {
  if (!Array.isArray(records) || records.length === 0) {
    return { rows: [], detectedColumns: [], missingRequiredHeaders: [] };
  }

  const headerSet = new Set<string>();
  records.forEach((rec) => {
    Object.keys(rec || {}).forEach((k) => {
      const normalized = normalizeVietnameseText(k).replace(/[\s_-]+/g, '');
      if (normalized) headerSet.add(normalized);
    });
  });

  const hasAny = (keys: string[]) => keys.some((k) => headerSet.has(k));
  const missingRequiredHeaders: string[] = [];
  if (!hasAny(['subject', 'subjectid', 'subjectname', 'mamon', 'tenmon', 'monhoc'])) {
    missingRequiredHeaders.push('Subject');
  }
  if (!hasAny(['grade', 'khoilop', 'lop', 'khoi'])) {
    missingRequiredHeaders.push('Grade');
  }
  if (!hasAny(['textbook', 'textbookseries', 'bosach', 'bosachgiaokhoa', 'sgk'])) {
    missingRequiredHeaders.push('Textbook');
  }
  if (!hasAny(['chapterorder', 'thutuchuong', 'sttchuong'])) {
    missingRequiredHeaders.push('ChapterOrder');
  }
  if (!hasAny(['chaptername', 'tenchuong', 'chuong', 'chude'])) {
    missingRequiredHeaders.push('ChapterName');
  }
  if (!hasAny(['lessonorder', 'thutubai', 'thutubaihoc', 'sttbai', 'stt'])) {
    missingRequiredHeaders.push('LessonOrder');
  }
  if (!hasAny(['lessonname', 'tenbai', 'tenbaihoc', 'baihoc'])) {
    missingRequiredHeaders.push('LessonName');
  }

  const rows: CurriculumImportRawRow[] = records.map((raw, idx) => {
    const normalizedMap: Record<string, unknown> = {};
    Object.entries(raw || {}).forEach(([k, v]) => {
      const compactKey = normalizeVietnameseText(k).replace(/[\s_-]+/g, '');
      if (compactKey) {
        normalizedMap[compactKey] = v;
      }
    });

    const pick = (...keys: string[]): unknown => {
      for (const k of keys) {
        if (k in normalizedMap && String(normalizedMap[k] ?? '').trim() !== '') {
          return normalizedMap[k];
        }
      }
      return '';
    };

    return {
      rowNumber: idx + 2, // Row 1 is Excel header
      subject: pick('subject', 'subjectid', 'mamon', 'subjectname', 'tenmon', 'monhoc'),
      subjectId: pick('subjectid', 'mamon'),
      subjectName: pick('subjectname', 'tenmon', 'monhoc'),
      grade: pick('grade', 'khoilop', 'lop', 'khoi'),
      textbook: pick('textbook', 'textbookseries', 'bosach', 'bosachgiaokhoa', 'sgk'),
      textbookYear: pick('textbookyear', 'namapdung', 'namhoc'),
      chapterId: pick('chapterid', 'machuong'),
      chapterOrder: pick('chapterorder', 'thutuchuong', 'sttchuong'),
      chapterName: pick('chaptername', 'tenchuong', 'chuong', 'chude'),
      lessonId: pick('lessonid', 'mabai', 'mabaihoc'),
      lessonOrder: pick('lessonorder', 'thutubai', 'thutubaihoc', 'sttbai', 'stt'),
      lessonName: pick('lessonname', 'tenbai', 'tenbaihoc', 'baihoc'),
      status: pick('status', 'trangthai'),
    };
  });

  return {
    rows,
    detectedColumns: Array.from(headerSet),
    missingRequiredHeaders,
  };
}

export function validateCurriculumImportRows(
  rawRows: CurriculumImportRawRow[],
  options: {
    subjects?: SubjectItem[];
    configuredTextbooks?: string[];
    defaultTextbookYear?: string;
    missingRequiredHeaders?: string[];
  } = {}
): CurriculumImportValidationResult {
  const subjects = options.subjects && options.subjects.length > 0 ? options.subjects : DEFAULT_GDPT_2018_SUBJECTS;
  const configuredTextbooks = options.configuredTextbooks || [];
  const defaultTextbookYear = (options.defaultTextbookYear || '2025-2026').trim().slice(0, 64) || '2025-2026';

  const validRows: CurriculumImportNormalizedRow[] = [];
  const errors: CurriculumImportRowIssue[] = [];
  const duplicates: CurriculumImportRowIssue[] = [];

  const subjectSet = new Set<string>();
  const gradeSet = new Set<string>();
  const chapterKeySet = new Set<string>();
  const textbookSet = new Set<string>();

  // Track chapterOrder consistency per (subjectId, grade, textbook, normalizedChapterName)
  const chapterOrderSeen = new Map<string, { order: number; rowNumber: number }>();
  // Track duplicate lessons within uploaded file
  const lessonIdentitySeen = new Map<string, number>();
  const lessonSlotSeen = new Map<string, number>();

  let totalDataRows = 0;

  for (const raw of rawRows) {
    const rowNumber = Number(raw.rowNumber) || 0;
    const subjectStr = String(raw.subject ?? raw.subjectId ?? raw.subjectName ?? '').trim();
    const subjectIdStr = String(raw.subjectId ?? '').trim();
    const subjectNameStr = String(raw.subjectName ?? '').trim();
    const gradeStr = String(raw.grade ?? '').trim();
    const textbookStr = String(raw.textbook ?? '').trim();
    const chapterOrderRaw = raw.chapterOrder;
    const chapterNameStr = String(raw.chapterName ?? '').trim();
    const lessonOrderRaw = raw.lessonOrder;
    const lessonNameStr = String(raw.lessonName ?? '').trim();
    const yearStr = String(raw.textbookYear ?? '').trim() || defaultTextbookYear;
    const explicitChapterId = String(raw.chapterId ?? '').trim() || undefined;
    const explicitLessonId = String(raw.lessonId ?? '').trim() || undefined;
    const statusNorm = normalizeVietnameseText(String(raw.status ?? 'active'));

    // Ignore completely blank Excel rows
    if (
      !subjectStr &&
      !gradeStr &&
      !textbookStr &&
      !String(chapterOrderRaw ?? '').trim() &&
      !chapterNameStr &&
      !String(lessonOrderRaw ?? '').trim() &&
      !lessonNameStr
    ) {
      continue;
    }

    totalDataRows += 1;
    const rawSummary = `${subjectStr || '?'} | Lớp ${gradeStr || '?'} | ${chapterNameStr || '?'} | ${lessonNameStr || '?'}`;
    const rowErrors: string[] = [];

    // 1. Validate Subject
    const resolvedSubject = resolveSubjectMatch(
      subjectIdStr || subjectStr,
      subjects,
      subjectNameStr || subjectStr
    );
    if (!resolvedSubject) {
      rowErrors.push(
        subjectStr
          ? `Môn học "${subjectStr}" không tồn tại trong danh mục hệ thống.`
          : 'Thiếu thông tin môn học (Subject).'
      );
    }

    // 2. Validate Grade
    const resolvedGrade = normalizeCurriculumGrade(gradeStr);
    if (!resolvedGrade) {
      rowErrors.push(
        gradeStr
          ? `Khối lớp "${gradeStr}" không hợp lệ (chỉ chấp nhận 10, 11 hoặc 12).`
          : 'Thiếu khối lớp (Grade).'
      );
    }

    // 3. Validate Textbook
    const textbookCheck = resolveConfiguredTextbook(textbookStr, configuredTextbooks);
    if (!textbookCheck.valid) {
      rowErrors.push(textbookCheck.reason || 'Bộ sách giáo khoa (Textbook) không hợp lệ.');
    }

    // 4. Validate ChapterOrder & ChapterName
    const chapterOrder = parsePositiveIntegerOrder(chapterOrderRaw);
    if (chapterOrder === null) {
      rowErrors.push(
        String(chapterOrderRaw ?? '').trim()
          ? `Thứ tự chương "${String(chapterOrderRaw).trim()}" không hợp lệ (phải là số nguyên dương từ 1 đến 10000).`
          : 'Thiếu thứ tự chương (ChapterOrder).'
      );
    }
    if (!chapterNameStr) {
      rowErrors.push('Tên chương (ChapterName) không được để trống.');
    } else if (chapterNameStr.length > 250) {
      rowErrors.push('Tên chương (ChapterName) vượt quá giới hạn 250 ký tự.');
    }

    // 5. Validate LessonOrder & LessonName
    const lessonOrder = parsePositiveIntegerOrder(lessonOrderRaw);
    if (lessonOrder === null) {
      rowErrors.push(
        String(lessonOrderRaw ?? '').trim()
          ? `Thứ tự bài học "${String(lessonOrderRaw).trim()}" không hợp lệ (phải là số nguyên dương từ 1 đến 10000).`
          : 'Thiếu thứ tự bài học (LessonOrder).'
      );
    }
    if (!lessonNameStr) {
      rowErrors.push('Tên bài học (LessonName) không được để trống.');
    } else if (lessonNameStr.length > 250) {
      rowErrors.push('Tên bài học (LessonName) vượt quá giới hạn 250 ký tự.');
    }

    if (yearStr.length > 64) {
      rowErrors.push('Năm áp dụng (textbookYear) vượt quá 64 ký tự.');
    }

    if (rowErrors.length > 0 || !resolvedSubject || !resolvedGrade || chapterOrder === null || lessonOrder === null) {
      errors.push({
        rowNumber,
        kind: 'error',
        message: rowErrors.join(' '),
        rawSummary,
      });
      continue;
    }

    const chapterScopeKey = `${resolvedSubject.id}::${resolvedGrade}::${normalizeVietnameseText(textbookCheck.canonicalName)}::${normalizeVietnameseText(chapterNameStr)}`;
    const prevChOrder = chapterOrderSeen.get(chapterScopeKey);
    if (prevChOrder && prevChOrder.order !== chapterOrder) {
      errors.push({
        rowNumber,
        kind: 'error',
        field: 'ChapterOrder',
        message: `Chương "${chapterNameStr}" có ChapterOrder=${chapterOrder} không thống nhất với dòng ${prevChOrder.rowNumber} (ChapterOrder=${prevChOrder.order}).`,
        rawSummary,
      });
      continue;
    }
    if (!prevChOrder) {
      chapterOrderSeen.set(chapterScopeKey, { order: chapterOrder, rowNumber });
    }

    // 6. Check duplicate lesson name or duplicate lesson order within the same chapter in the file
    const lessonIdentityKey = `${chapterScopeKey}::${normalizeVietnameseText(lessonNameStr)}`;
    const prevIdentityRow = lessonIdentitySeen.get(lessonIdentityKey);
    if (prevIdentityRow !== undefined) {
      duplicates.push({
        rowNumber,
        kind: 'duplicate',
        field: 'LessonName',
        message: `Bài học "${lessonNameStr}" trong "${chapterNameStr}" bị trùng với dòng ${prevIdentityRow} trong file.`,
        rawSummary,
      });
      continue;
    }

    const lessonSlotKey = `${chapterScopeKey}::order_${lessonOrder}`;
    const prevSlotRow = lessonSlotSeen.get(lessonSlotKey);
    if (prevSlotRow !== undefined) {
      duplicates.push({
        rowNumber,
        kind: 'duplicate',
        field: 'LessonOrder',
        message: `Trùng thứ tự bài học (LessonOrder=${lessonOrder}) trong "${chapterNameStr}" với dòng ${prevSlotRow} trong file.`,
        rawSummary,
      });
      continue;
    }

    lessonIdentitySeen.set(lessonIdentityKey, rowNumber);
    lessonSlotSeen.set(lessonSlotKey, rowNumber);

    const status: CurriculumStatus =
      statusNorm === 'inactive' || statusNorm === 'hidden' || statusNorm === 'an' ? 'inactive' : 'active';

    subjectSet.add(resolvedSubject.id);
    gradeSet.add(resolvedGrade);
    chapterKeySet.add(chapterScopeKey);
    textbookSet.add(textbookCheck.canonicalName);

    validRows.push({
      rowNumber,
      subjectId: resolvedSubject.id,
      subjectName: resolvedSubject.name,
      grade: resolvedGrade,
      textbookSeries: textbookCheck.canonicalName,
      textbookYear: yearStr,
      explicitChapterId: explicitChapterId ? sanitizeFirestoreId(explicitChapterId, 'ch') : undefined,
      chapterOrder,
      chapterName: chapterNameStr,
      explicitLessonId: explicitLessonId ? sanitizeFirestoreId(explicitLessonId, 'ls') : undefined,
      lessonOrder,
      lessonName: lessonNameStr,
      status,
    });
  }

  return {
    validRows,
    errors,
    duplicates,
    missingRequiredHeaders: options.missingRequiredHeaders || [],
    stats: {
      totalDataRows,
      totalSubjects: subjectSet.size,
      totalGrades: gradeSet.size,
      totalChapters: chapterKeySet.size,
      totalLessons: validRows.length,
      validRowsCount: validRows.length,
      errorRowsCount: errors.length,
      duplicateRowsCount: duplicates.length,
      detectedTextbooks: Array.from(textbookSet),
    },
  };
}

function buildLessonIdentityKey(input: {
  subjectId: string;
  grade: CurriculumGrade;
  textbookSeries: string;
  chapterName: string;
  lessonName: string;
}): string {
  return [
    input.subjectId,
    input.grade,
    normalizeVietnameseText(input.textbookSeries),
    normalizeVietnameseText(input.chapterName),
    normalizeVietnameseText(input.lessonName),
  ].join('::');
}

function buildLessonSlotKey(input: {
  subjectId: string;
  grade: CurriculumGrade;
  textbookSeries: string;
  chapterOrder: number;
  lessonOrder: number;
}): string {
  return [
    input.subjectId,
    input.grade,
    normalizeVietnameseText(input.textbookSeries),
    `ch${input.chapterOrder}`,
    `ls${input.lessonOrder}`,
  ].join('::');
}

function buildChapterGroupKey(input: {
  subjectId: string;
  grade: CurriculumGrade;
  textbookSeries: string;
  chapterName: string;
}): string {
  return [
    input.subjectId,
    input.grade,
    normalizeVietnameseText(input.textbookSeries),
    normalizeVietnameseText(input.chapterName),
  ].join('::');
}

function buildScopeKey(subjectId: string, grade: CurriculumGrade, textbookSeries: string): string {
  return `${subjectId}::${grade}::${normalizeVietnameseText(textbookSeries)}`;
}

export function planCurriculumImport(
  validRows: CurriculumImportNormalizedRow[],
  existingLessons: CurriculumLesson[],
  mode: CurriculumImportMode,
  actorUid?: string
): CurriculumImportPlan {
  const nowIso = new Date().toISOString();

  // Index existing lessons for fast deterministic lookup
  const existingById = new Map<string, CurriculumLesson>();
  const existingByIdentity = new Map<string, CurriculumLesson>();
  const existingBySlot = new Map<string, CurriculumLesson>();
  const existingChapterIdByGroup = new Map<string, string>();

  for (const ex of existingLessons) {
    existingById.set(ex.id, ex);
    if (ex.lessonId && ex.lessonId !== ex.id) {
      existingById.set(ex.lessonId, ex);
    }
    const idKey = buildLessonIdentityKey(ex);
    if (!existingByIdentity.has(idKey)) {
      existingByIdentity.set(idKey, ex);
    }
    const slotKey = buildLessonSlotKey({
      subjectId: ex.subjectId,
      grade: ex.grade,
      textbookSeries: ex.textbookSeries,
      chapterOrder: ex.chapterOrder ?? 1,
      lessonOrder: ex.lessonOrder,
    });
    if (!existingBySlot.has(slotKey)) {
      existingBySlot.set(slotKey, ex);
    }
    const chKey = buildChapterGroupKey(ex);
    if (!existingChapterIdByGroup.has(chKey)) {
      existingChapterIdByGroup.set(chKey, ex.chapterId);
    }
  }

  // Track chapterIds assigned within this import so rows with identical (Subject, Grade, Textbook, ChapterName) ALWAYS share one chapterId
  const assignedChapterIds = new Map<string, string>();
  const matchedExistingIds = new Set<string>();
  const usedNewIds = new Set<string>(existingLessons.map((e) => e.id));

  // Pass 1: exact explicitLessonId or exact (Subject, Grade, Textbook, ChapterName, LessonName) identity matches
  const rowMatches = new Map<number, CurriculumLesson>();
  for (const row of validRows) {
    let matched: CurriculumLesson | undefined;
    if (row.explicitLessonId) {
      const candidate = existingById.get(row.explicitLessonId);
      if (candidate && !matchedExistingIds.has(candidate.id)) {
        matched = candidate;
      }
    }
    if (!matched) {
      const idKey = buildLessonIdentityKey(row);
      const candidate = existingByIdentity.get(idKey);
      if (candidate && !matchedExistingIds.has(candidate.id)) {
        matched = candidate;
      }
    }
    if (matched) {
      rowMatches.set(row.rowNumber, matched);
      matchedExistingIds.add(matched.id);
      const chKey = buildChapterGroupKey(row);
      if (!assignedChapterIds.has(chKey)) {
        assignedChapterIds.set(chKey, matched.chapterId);
      }
    }
  }

  // Pass 2 (Sync mode only): match remaining unmatched rows to remaining unmatched existing lessons by stable slot (Subject, Grade, Textbook, ChapterOrder, LessonOrder) so renaming works cleanly
  if (mode === 'sync') {
    for (const row of validRows) {
      if (rowMatches.has(row.rowNumber)) continue;
      const slotKey = buildLessonSlotKey(row);
      const candidate = existingBySlot.get(slotKey);
      if (candidate && !matchedExistingIds.has(candidate.id)) {
        rowMatches.set(row.rowNumber, candidate);
        matchedExistingIds.add(candidate.id);
        const chKey = buildChapterGroupKey(row);
        if (!assignedChapterIds.has(chKey)) {
          assignedChapterIds.set(chKey, candidate.chapterId);
        }
      }
    }
  }

  const items: PlannedLessonAction[] = [];
  const toAdd: CurriculumLesson[] = [];
  const toUpdate: CurriculumLesson[] = [];
  const skipped: PlannedLessonAction[] = [];
  const affectedScopeMap = new Map<
    string,
    { subjectId: string; grade: CurriculumGrade; textbookSeries: string }
  >();

  let existingOverlapCount = 0;

  for (const row of validRows) {
    const scopeKey = buildScopeKey(row.subjectId, row.grade, row.textbookSeries);
    if (!affectedScopeMap.has(scopeKey)) {
      affectedScopeMap.set(scopeKey, {
        subjectId: row.subjectId,
        grade: row.grade,
        textbookSeries: row.textbookSeries,
      });
    }

    const chGroupKey = buildChapterGroupKey(row);
    const matched = rowMatches.get(row.rowNumber);

    let resolvedChapterId =
      assignedChapterIds.get(chGroupKey) ||
      existingChapterIdByGroup.get(chGroupKey) ||
      row.explicitChapterId ||
      generateStableChapterId(row.subjectId, row.grade, row.chapterName, row.textbookSeries);
    assignedChapterIds.set(chGroupKey, resolvedChapterId);

    if (matched) {
      existingOverlapCount += 1;

      if (mode === 'append') {
        const skipItem: PlannedLessonAction = {
          rowNumber: row.rowNumber,
          action: 'skip',
          reason: 'Bài học đã tồn tại trên hệ thống (Chế độ Bổ sung giữ nguyên bản ghi cũ).',
          lesson: matched,
          existingLesson: matched,
        };
        items.push(skipItem);
        skipped.push(skipItem);
        continue;
      }

      // Sync mode: check if any tracked fields differ
      const needsUpdate =
        matched.subjectName !== row.subjectName ||
        matched.textbookSeries !== row.textbookSeries ||
        matched.textbookYear !== row.textbookYear ||
        matched.chapterId !== resolvedChapterId ||
        matched.chapterName !== row.chapterName ||
        (matched.chapterOrder ?? 1) !== row.chapterOrder ||
        matched.lessonName !== row.lessonName ||
        matched.lessonOrder !== row.lessonOrder ||
        matched.status !== row.status;

      const updatedLesson: CurriculumLesson = {
        ...matched,
        id: matched.id,
        lessonId: matched.lessonId || matched.id,
        subjectId: row.subjectId,
        subjectName: row.subjectName,
        grade: row.grade,
        textbookSeries: row.textbookSeries,
        textbookYear: row.textbookYear,
        chapterId: resolvedChapterId,
        chapterName: row.chapterName,
        chapterOrder: row.chapterOrder,
        lessonName: row.lessonName,
        lessonOrder: row.lessonOrder,
        status: row.status,
        createdBy: matched.createdBy || actorUid,
        updatedBy: actorUid || matched.updatedBy,
        createdAt: matched.createdAt || nowIso,
        updatedAt: nowIso,
      };

      if (!needsUpdate) {
        const skipItem: PlannedLessonAction = {
          rowNumber: row.rowNumber,
          action: 'skip',
          reason: 'Dữ liệu trùng khớp với hệ thống, không cần ghi đè.',
          lesson: matched,
          existingLesson: matched,
        };
        items.push(skipItem);
        skipped.push(skipItem);
      } else {
        const updateItem: PlannedLessonAction = {
          rowNumber: row.rowNumber,
          action: 'update',
          reason: 'Cập nhật tên / thứ tự chương hoặc bài học theo mã định danh ổn định.',
          lesson: updatedLesson,
          existingLesson: matched,
        };
        items.push(updateItem);
        toUpdate.push(updatedLesson);
      }
      continue;
    }

    // Brand-new lesson
    let newLessonId =
      row.explicitLessonId ||
      generateStableLessonId(
        row.subjectId,
        row.grade,
        resolvedChapterId,
        row.lessonName,
        row.lessonOrder
      );

    // Guarantee uniqueness against any existing or previously planned ID
    if (usedNewIds.has(newLessonId)) {
      let suffix = 2;
      while (usedNewIds.has(`${newLessonId.slice(0, 120)}_${suffix}`)) {
        suffix += 1;
      }
      newLessonId = `${newLessonId.slice(0, 120)}_${suffix}`;
    }
    usedNewIds.add(newLessonId);

    const newLesson: CurriculumLesson = {
      id: newLessonId,
      subjectId: row.subjectId,
      subjectName: row.subjectName,
      grade: row.grade,
      textbookSeries: row.textbookSeries,
      textbookYear: row.textbookYear,
      chapterId: resolvedChapterId,
      chapterName: row.chapterName,
      chapterOrder: row.chapterOrder,
      lessonId: newLessonId,
      lessonName: row.lessonName,
      lessonOrder: row.lessonOrder,
      status: row.status,
      createdBy: actorUid,
      updatedBy: actorUid,
      createdAt: nowIso,
      updatedAt: nowIso,
    };

    items.push({
      rowNumber: row.rowNumber,
      action: 'add',
      reason: 'Thêm bài học mới vào danh mục.',
      lesson: newLesson,
    });
    toAdd.push(newLesson);
  }

  // Detect existing lessons in the affected (Subject, Grade, Textbook) scopes that are absent from the uploaded file
  const missingInFile: CurriculumLesson[] = [];
  if (mode === 'sync') {
    for (const ex of existingLessons) {
      const sk = buildScopeKey(ex.subjectId, ex.grade, ex.textbookSeries);
      if (affectedScopeMap.has(sk) && !matchedExistingIds.has(ex.id)) {
        missingInFile.push(ex);
      }
    }
  }

  return {
    mode,
    items,
    toAdd,
    toUpdate,
    skipped,
    missingInFile,
    affectedScopes: Array.from(affectedScopeMap.values()),
    existingOverlapCount,
  };
}
