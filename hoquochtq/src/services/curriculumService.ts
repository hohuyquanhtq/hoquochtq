import {
  collection,
  doc,
  getDoc,
  getDocFromServer,
  getDocs,
  query,
  where,
  setDoc,
  deleteDoc,
  writeBatch,
  serverTimestamp,
} from 'firebase/firestore';
import * as XLSX from 'xlsx';
import {
  CurriculumConfig,
  CurriculumGrade,
  CurriculumImportLog,
  CurriculumImportMode,
  CurriculumLesson,
  CurriculumStatus,
  SubjectItem,
} from '../types';
import {
  DEFAULT_GDPT_2018_SUBJECTS,
  TEXTBOOK_SERIES_OPTIONS,
} from '../constants/subjects';
import {
  extractNormalizedRawRowsFromSheetRecords,
  generateStableChapterId,
  generateStableLessonId,
  validateCurriculumImportRows,
  type CurriculumImportNormalizedRow,
  type CurriculumImportRawRow,
  type CurriculumImportValidationResult,
} from '../utils/curriculumImportEngine';
import {
  auth,
  db,
  firebaseInitError,
  handleFirestoreError,
  OperationType,
  stripUndefinedDeep,
} from './firebase';

const CURRICULUM_CONFIG_DOC_ID = 'global';
const CACHE_TTL_MS = 5 * 60 * 1000;

interface CachedSubjectLessons {
  fetchedAt: number;
  lessons: CurriculumLesson[];
}

let cachedConfig: { fetchedAt: number; value: CurriculumConfig | null } | null = null;
const subjectLessonsCache = new Map<string, CachedSubjectLessons>();

function slugifyId(raw: string, prefix: string, maxLen = 96): string {
  const ascii = (raw || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
  const base = ascii ? `${prefix}_${ascii}` : `${prefix}_${Date.now()}`;
  return base.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, maxLen);
}

function safeId(raw: string, fallbackPrefix = 'item'): string {
  const cleaned = (raw || '').trim().replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 128);
  return cleaned || `${fallbackPrefix}_${Date.now()}`;
}

export function generateChapterId(
  subjectId: string,
  grade: CurriculumGrade,
  chapterName: string,
  textbookSeries?: string
): string {
  return generateStableChapterId(subjectId, grade, chapterName, textbookSeries);
}

export function generateLessonId(
  subjectId: string,
  grade: CurriculumGrade,
  chapterId: string,
  lessonName: string,
  lessonOrder?: number
): string {
  return generateStableLessonId(subjectId, grade, chapterId, lessonName, lessonOrder);
}

export function invalidateCurriculumCache(subjectId?: string): void {
  if (subjectId) {
    subjectLessonsCache.delete(subjectId);
  } else {
    subjectLessonsCache.clear();
    cachedConfig = null;
  }
}

export function sortCurriculumLessons(lessons: CurriculumLesson[]): CurriculumLesson[] {
  return [...lessons].sort((a, b) => {
    if (a.grade !== b.grade) return a.grade.localeCompare(b.grade);
    const chOrderDiff = (a.chapterOrder ?? 9999) - (b.chapterOrder ?? 9999);
    if (chOrderDiff !== 0) return chOrderDiff;
    const chNameDiff = (a.chapterName || '').localeCompare(b.chapterName || '', 'vi');
    if (chNameDiff !== 0) return chNameDiff;
    const lOrderDiff = (a.lessonOrder ?? 9999) - (b.lessonOrder ?? 9999);
    if (lOrderDiff !== 0) return lOrderDiff;
    return (a.lessonName || '').localeCompare(b.lessonName || '', 'vi');
  });
}

export function filterAndGroupCurriculumLessons(
  lessons: CurriculumLesson[],
  options?: {
    grade?: CurriculumGrade | '';
    chapterId?: string;
    textbookSeries?: string;
    includeInactive?: boolean;
    searchTerm?: string;
  }
): {
  lessons: CurriculumLesson[];
  chapters: {
    chapterId: string;
    chapterName: string;
    chapterOrder: number;
    textbookSeries: string;
    lessons: CurriculumLesson[];
  }[];
} {
  const search = (options?.searchTerm || '').trim().toLowerCase();
  const filtered = sortCurriculumLessons(lessons).filter((item) => {
    if (!options?.includeInactive && item.status !== 'active') return false;
    if (options?.grade && item.grade !== options.grade) return false;
    if (
      options?.textbookSeries &&
      options.textbookSeries !== 'all' &&
      item.textbookSeries !== options.textbookSeries
    ) {
      return false;
    }
    if (options?.chapterId && options.chapterId !== 'all' && item.chapterId !== options.chapterId) {
      return false;
    }
    if (search) {
      const hitLesson = (item.lessonName || '').toLowerCase().includes(search);
      const hitChapter = (item.chapterName || '').toLowerCase().includes(search);
      const hitId = (item.lessonId || '').toLowerCase().includes(search);
      if (!hitLesson && !hitChapter && !hitId) return false;
    }
    return true;
  });

  const chapterMap = new Map<
    string,
    {
      chapterId: string;
      chapterName: string;
      chapterOrder: number;
      textbookSeries: string;
      lessons: CurriculumLesson[];
    }
  >();

  filtered.forEach((item) => {
    const existing = chapterMap.get(item.chapterId);
    if (existing) {
      existing.lessons.push(item);
    } else {
      chapterMap.set(item.chapterId, {
        chapterId: item.chapterId,
        chapterName: item.chapterName,
        chapterOrder: item.chapterOrder ?? item.lessonOrder ?? 999,
        textbookSeries: item.textbookSeries,
        lessons: [item],
      });
    }
  });

  const chapters = Array.from(chapterMap.values()).sort((a, b) => {
    const ord = a.chapterOrder - b.chapterOrder;
    if (ord !== 0) return ord;
    return a.chapterName.localeCompare(b.chapterName, 'vi');
  });

  return { lessons: filtered, chapters };
}

export async function fetchCurriculumConfigFromFirestore(
  forceRefresh = false
): Promise<CurriculumConfig | null> {
  if (firebaseInitError || !auth.currentUser) return null;
  if (!forceRefresh && cachedConfig && Date.now() - cachedConfig.fetchedAt < CACHE_TTL_MS) {
    return cachedConfig.value;
  }
  try {
    const snap = await getDoc(doc(db, 'curriculumConfig', CURRICULUM_CONFIG_DOC_ID));
    const value = snap.exists() ? (snap.data() as CurriculumConfig) : null;
    cachedConfig = { fetchedAt: Date.now(), value };
    return value;
  } catch (error) {
    console.warn('[HQTest Curriculum] Could not fetch curriculumConfig:', error);
    return null;
  }
}

export async function saveCurriculumConfigToFirestore(
  config: {
    textbookSeries: string;
    textbookYear: string;
    schoolName?: string;
  },
  adminUid?: string
): Promise<CurriculumConfig> {
  if (firebaseInitError || !auth.currentUser) {
    throw new Error('Cần đăng nhập Admin để lưu cấu hình bộ sách.');
  }
  const actorUid = adminUid || auth.currentUser.uid;
  const nowIso = new Date().toISOString();
  const payloadObj: CurriculumConfig = {
    id: CURRICULUM_CONFIG_DOC_ID,
    textbookSeries: config.textbookSeries.trim().slice(0, 150),
    textbookYear: (config.textbookYear || '2025-2026').trim().slice(0, 64),
    ...(config.schoolName?.trim() ? { schoolName: config.schoolName.trim().slice(0, 200) } : {}),
    updatedBy: actorUid,
    updatedAt: nowIso,
  };

  try {
    await setDoc(
      doc(db, 'curriculumConfig', CURRICULUM_CONFIG_DOC_ID),
      stripUndefinedDeep({
        ...payloadObj,
        serverUpdatedAt: serverTimestamp(),
      })
    );
    cachedConfig = { fetchedAt: Date.now(), value: payloadObj };
    return payloadObj;
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `curriculumConfig/${CURRICULUM_CONFIG_DOC_ID}`);
  }
}

export async function fetchCurriculumLessonsBySubjectGrade(
  subjectId: string,
  grade: CurriculumGrade,
  options?: {
    includeInactive?: boolean;
    forceRefresh?: boolean;
  }
): Promise<CurriculumLesson[]> {
  if (firebaseInitError || !auth.currentUser || !subjectId || !grade) {
    return [];
  }

  const cached = subjectLessonsCache.get(subjectId);
  let allForSubject: CurriculumLesson[];

  if (!options?.forceRefresh && cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
    allForSubject = cached.lessons;
  } else {
    try {
      // Single-field where query avoids missing composite index errors in Firestore
      const snap = await getDocs(
        query(collection(db, 'curriculumLessons'), where('subjectId', '==', subjectId))
      );
      allForSubject = sortCurriculumLessons(
        snap.docs.map((d) => {
          const raw = d.data() as CurriculumLesson;
          return {
            ...raw,
            id: d.id,
            lessonId: raw.lessonId || d.id,
            status: raw.status === 'inactive' ? 'inactive' : 'active',
          } satisfies CurriculumLesson;
        })
      );
      subjectLessonsCache.set(subjectId, { fetchedAt: Date.now(), lessons: allForSubject });
    } catch (error) {
      handleFirestoreError(error, OperationType.LIST, 'curriculumLessons');
    }
  }

  return allForSubject.filter((item) => {
    if (item.grade !== grade) return false;
    if (!options?.includeInactive && item.status !== 'active') return false;
    return true;
  });
}

export async function fetchAllCurriculumLessonsForAdmin(): Promise<CurriculumLesson[]> {
  if (firebaseInitError || !auth.currentUser) return [];
  try {
    const snap = await getDocs(collection(db, 'curriculumLessons'));
    const items = sortCurriculumLessons(
      snap.docs.map((d) => {
        const raw = d.data() as CurriculumLesson;
        return {
          ...raw,
          id: d.id,
          lessonId: raw.lessonId || d.id,
          status: raw.status === 'inactive' ? 'inactive' : 'active',
        } satisfies CurriculumLesson;
      })
    );
    // Warm per-subject cache cleanly
    const grouped = new Map<string, CurriculumLesson[]>();
    items.forEach((item) => {
      const list = grouped.get(item.subjectId) || [];
      list.push(item);
      grouped.set(item.subjectId, list);
    });
    const now = Date.now();
    grouped.forEach((list, subId) => {
      subjectLessonsCache.set(subId, { fetchedAt: now, lessons: list });
    });
    return items;
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, 'curriculumLessons');
  }
}

export function normalizeAndValidateLessonInput(
  input: Partial<CurriculumLesson> & {
    subjectId: string;
    subjectName: string;
    grade: CurriculumGrade;
    chapterName: string;
    lessonName: string;
  },
  actorUid?: string
): CurriculumLesson {
  const subjectId = safeId(input.subjectId, 'sub').slice(0, 64);
  const subjectName = (input.subjectName || '').trim().slice(0, 120);
  if (!subjectName) throw new Error('Thiếu tên môn học.');
  if (input.grade !== '10' && input.grade !== '11' && input.grade !== '12') {
    throw new Error(`Khối lớp không hợp lệ: "${String(input.grade)}". Chỉ chấp nhận 10, 11 hoặc 12.`);
  }
  const chapterName = (input.chapterName || '').trim().slice(0, 250);
  if (!chapterName) throw new Error('Tên chương / chủ đề không được để trống.');
  const lessonName = (input.lessonName || '').trim().slice(0, 250);
  if (!lessonName) throw new Error('Tên bài học không được để trống.');

  const textbookSeries = (input.textbookSeries || '').trim().slice(0, 150);
  if (!textbookSeries) {
    throw new Error('Vui lòng xác định rõ bộ sách giáo khoa (VD: Kết nối tri thức, Chân trời sáng tạo, Cánh diều).');
  }
  const textbookYear = (input.textbookYear || '2025-2026').trim().slice(0, 64);
  const lessonOrder =
    typeof input.lessonOrder === 'number' && Number.isFinite(input.lessonOrder) && input.lessonOrder >= 0
      ? Math.min(10000, Math.round(input.lessonOrder))
      : 1;
  const chapterOrder =
    typeof input.chapterOrder === 'number' && Number.isFinite(input.chapterOrder) && input.chapterOrder >= 0
      ? Math.min(10000, Math.round(input.chapterOrder))
      : 1;

  const chapterId = input.chapterId?.trim()
    ? safeId(input.chapterId.trim(), 'ch')
    : generateChapterId(subjectId, input.grade, chapterName, textbookSeries);

  const lessonId = input.lessonId?.trim()
    ? safeId(input.lessonId.trim(), 'ls')
    : input.id?.trim()
    ? safeId(input.id.trim(), 'ls')
    : generateLessonId(subjectId, input.grade, chapterId, lessonName, lessonOrder);

  const nowIso = new Date().toISOString();
  const status: CurriculumStatus = input.status === 'inactive' ? 'inactive' : 'active';

  return {
    id: lessonId,
    subjectId,
    subjectName,
    grade: input.grade,
    textbookSeries,
    textbookYear,
    chapterId,
    chapterName,
    chapterOrder,
    lessonId,
    lessonName,
    lessonOrder,
    status,
    createdBy: input.createdBy || actorUid,
    updatedBy: actorUid || input.updatedBy,
    createdAt: input.createdAt || nowIso,
    updatedAt: nowIso,
  };
}

export async function saveCurriculumLessonToFirestore(
  input: Partial<CurriculumLesson> & {
    subjectId: string;
    subjectName: string;
    grade: CurriculumGrade;
    chapterName: string;
    lessonName: string;
  },
  adminUid?: string
): Promise<CurriculumLesson> {
  if (firebaseInitError || !auth.currentUser) {
    throw new Error('Cần đăng nhập Quản trị viên để cập nhật danh mục bài học.');
  }
  const actorUid = adminUid || auth.currentUser.uid;
  const normalized = normalizeAndValidateLessonInput(input, actorUid);
  const ref = doc(db, 'curriculumLessons', normalized.id);

  try {
    const existing = await getDocFromServer(ref).catch(() => getDoc(ref).catch(() => null));
    const existingData = existing?.exists() ? existing.data() : null;
    const payload = stripUndefinedDeep({
      ...normalized,
      createdAt: (typeof existingData?.createdAt === 'string' && existingData.createdAt) || normalized.createdAt,
      createdBy: (typeof existingData?.createdBy === 'string' && existingData.createdBy) || normalized.createdBy || actorUid,
      updatedBy: actorUid,
      serverCreatedAt: existingData?.serverCreatedAt || serverTimestamp(),
      serverUpdatedAt: serverTimestamp(),
    });
    await setDoc(ref, payload);
    invalidateCurriculumCache(normalized.subjectId);
    return {
      ...normalized,
      createdAt: (typeof existingData?.createdAt === 'string' && existingData.createdAt) || normalized.createdAt,
    };
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `curriculumLessons/${normalized.id}`);
  }
}

export async function saveCurriculumLessonsBatchToFirestore(
  items: (Partial<CurriculumLesson> & {
    subjectId: string;
    subjectName: string;
    grade: CurriculumGrade;
    chapterName: string;
    lessonName: string;
  })[],
  adminUid?: string
): Promise<CurriculumLesson[]> {
  if (firebaseInitError || !auth.currentUser) {
    throw new Error('Cần đăng nhập Quản trị viên để nhập danh mục bài học.');
  }
  if (items.length === 0) return [];
  const actorUid = adminUid || auth.currentUser.uid;
  const validated = items.map((item) => normalizeAndValidateLessonInput(item, actorUid));

  try {
    for (let i = 0; i < validated.length; i += 400) {
      const chunk = validated.slice(i, i + 400);
      const existingMap = new Map<string, Record<string, unknown>>();
      await Promise.all(
        chunk.map(async (item) => {
          const snap = await getDoc(doc(db, 'curriculumLessons', item.id)).catch(() => null);
          if (snap?.exists()) {
            existingMap.set(item.id, snap.data() as Record<string, unknown>);
          }
        })
      );

      const batch = writeBatch(db);
      chunk.forEach((item) => {
        const ref = doc(db, 'curriculumLessons', item.id);
        const ex = existingMap.get(item.id);
        batch.set(
          ref,
          stripUndefinedDeep({
            ...item,
            createdAt: (typeof ex?.createdAt === 'string' && ex.createdAt) || item.createdAt,
            createdBy: (typeof ex?.createdBy === 'string' && ex.createdBy) || item.createdBy || actorUid,
            updatedBy: actorUid,
            serverCreatedAt: ex?.serverCreatedAt || serverTimestamp(),
            serverUpdatedAt: serverTimestamp(),
          })
        );
      });
      await batch.commit();
    }
    invalidateCurriculumCache();
    return validated;
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, 'curriculumLessons');
  }
}

export async function deleteCurriculumLessonFromFirestore(
  lessonId: string,
  subjectId?: string
): Promise<void> {
  if (firebaseInitError || !auth.currentUser) {
    throw new Error('Cần đăng nhập Quản trị viên để xóa bài học.');
  }
  const cleanId = safeId(lessonId);
  try {
    await deleteDoc(doc(db, 'curriculumLessons', cleanId));
    invalidateCurriculumCache(subjectId);
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `curriculumLessons/${cleanId}`);
  }
}

export interface ParsedCurriculumSpreadsheet {
  fileName: string;
  rawRowCount: number;
  validation: CurriculumImportValidationResult;
}

export async function parseCurriculumExcelOrCsvFile(
  file: File,
  options?: {
    subjects?: SubjectItem[];
    configuredTextbooks?: string[];
    defaultTextbookYear?: string;
  }
): Promise<ParsedCurriculumSpreadsheet> {
  const lowerName = (file.name || '').toLowerCase();
  if (!lowerName.endsWith('.xlsx') && !lowerName.endsWith('.csv')) {
    throw new Error('Định dạng tệp không được hỗ trợ. Vui lòng chọn tệp Excel (.xlsx) hoặc CSV (.csv).');
  }

  let workbook: XLSX.WorkBook;
  if (lowerName.endsWith('.csv')) {
    const csvText = await file.text();
    const cleanedCsv = csvText.replace(/^\uFEFF/, '');
    workbook = XLSX.read(cleanedCsv, { type: 'string' });
  } else {
    const buffer = await file.arrayBuffer();
    workbook = XLSX.read(buffer, { type: 'array' });
  }

  const firstSheetName = workbook.SheetNames[0];
  if (!firstSheetName) {
    throw new Error('Tệp không có trang dữ liệu (sheet) nào.');
  }

  const sheet = workbook.Sheets[firstSheetName];
  const rawRecords = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' });
  const extracted = extractNormalizedRawRowsFromSheetRecords(rawRecords);
  const validation = validateCurriculumImportRows(extracted.rows, {
    subjects: options?.subjects || DEFAULT_GDPT_2018_SUBJECTS,
    configuredTextbooks: options?.configuredTextbooks || [],
    defaultTextbookYear: options?.defaultTextbookYear || '2025-2026',
    missingRequiredHeaders: extracted.missingRequiredHeaders,
  });

  return {
    fileName: file.name,
    rawRowCount: rawRecords.length,
    validation,
  };
}

export interface CurriculumImportProgress {
  percent: number;
  processedRows: number;
  totalRows: number;
  currentBatch: number;
  totalBatches: number;
  statusText: string;
}

export interface CurriculumImportExecutionResult {
  mode: CurriculumImportMode;
  addedCount: number;
  updatedCount: number;
  skippedCount: number;
  deletedCount: number;
  missingInFileCount: number;
  errorCount: number;
  duplicateCount: number;
  log: CurriculumImportLog | null;
}

function partitionRowsByScope(
  rows: CurriculumImportNormalizedRow[],
  maxRowsPerBatch = 250
): CurriculumImportNormalizedRow[][] {
  const scopeGroups = new Map<string, CurriculumImportNormalizedRow[]>();
  for (const row of rows) {
    const key = `${row.subjectId}::${row.grade}::${row.textbookSeries}`;
    const list = scopeGroups.get(key) || [];
    list.push(row);
    scopeGroups.set(key, list);
  }

  const batches: CurriculumImportNormalizedRow[][] = [];
  let current: CurriculumImportNormalizedRow[] = [];

  for (const group of scopeGroups.values()) {
    if (current.length > 0 && current.length + group.length > maxRowsPerBatch) {
      batches.push(current);
      current = [];
    }
    current.push(...group);
  }
  if (current.length > 0) {
    batches.push(current);
  }
  return batches;
}

function toServerRawRow(row: CurriculumImportNormalizedRow): CurriculumImportRawRow {
  return {
    rowNumber: row.rowNumber,
    subject: row.subjectName,
    subjectId: row.subjectId,
    subjectName: row.subjectName,
    grade: row.grade,
    textbook: row.textbookSeries,
    textbookYear: row.textbookYear,
    chapterId: row.explicitChapterId,
    chapterOrder: row.chapterOrder,
    chapterName: row.chapterName,
    lessonId: row.explicitLessonId,
    lessonOrder: row.lessonOrder,
    lessonName: row.lessonName,
    status: row.status,
  };
}

export async function executeCurriculumImportOnServer(
  params: {
    fileName: string;
    mode: CurriculumImportMode;
    validRows: CurriculumImportNormalizedRow[];
    subjects?: SubjectItem[];
    configuredTextbooks?: string[];
    defaultTextbookYear?: string;
    confirmDeleteMissing?: boolean;
    confirmedDeleteIds?: string[];
    clientErrorCount?: number;
    clientDuplicateCount?: number;
    statsSummary?: {
      subjectsCount: number;
      gradesCount: number;
      chaptersCount: number;
      lessonsCount: number;
      textbooks: string[];
    };
  },
  onProgress?: (progress: CurriculumImportProgress) => void
): Promise<CurriculumImportExecutionResult> {
  if (firebaseInitError || !auth.currentUser) {
    throw new Error('Cần đăng nhập Quản trị viên (Admin) để thực hiện import.');
  }

  const idToken = await auth.currentUser.getIdToken();
  const batches = partitionRowsByScope(params.validRows, 250);
  if (batches.length === 0) {
    throw new Error('Không có dòng dữ liệu hợp lệ nào để import.');
  }

  let totalAdded = 0;
  let totalUpdated = 0;
  let totalSkipped = 0;
  let totalDeleted = 0;
  let totalMissingInFile = 0;
  let processedRows = 0;
  let finalLog: CurriculumImportLog | null = null;
  const totalRows = params.validRows.length;

  onProgress?.({
    percent: 5,
    processedRows: 0,
    totalRows,
    currentBatch: 1,
    totalBatches: batches.length,
    statusText: 'Đang xác thực quyền Admin và chuẩn bị dữ liệu...',
  });

  for (let i = 0; i < batches.length; i += 1) {
    const batchRows = batches[i];
    const isLastBatch = i === batches.length - 1;

    onProgress?.({
      percent: Math.min(92, Math.round(10 + (i / batches.length) * 80)),
      processedRows,
      totalRows,
      currentBatch: i + 1,
      totalBatches: batches.length,
      statusText: `Đang ghi đợt ${i + 1}/${batches.length} (${batchRows.length} bài học)...`,
    });

    const response = await fetch('/api/admin/curriculum/import', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${idToken}`,
      },
      body: JSON.stringify({
        fileName: params.fileName,
        mode: params.mode,
        rows: batchRows.map(toServerRawRow),
        subjects: params.subjects || DEFAULT_GDPT_2018_SUBJECTS,
        configuredTextbooks: params.configuredTextbooks || [],
        defaultTextbookYear: params.defaultTextbookYear || '2025-2026',
        confirmDeleteMissing: params.confirmDeleteMissing === true,
        confirmedDeleteIds: params.confirmDeleteMissing === true ? params.confirmedDeleteIds || [] : [],
        clientErrorCount: params.clientErrorCount || 0,
        clientDuplicateCount: params.clientDuplicateCount || 0,
        finalizeLog: isLastBatch,
        ...(isLastBatch && batches.length > 1
          ? {
              logTotals: {
                subjectsCount: params.statsSummary?.subjectsCount ?? 0,
                gradesCount: params.statsSummary?.gradesCount ?? 0,
                chaptersCount: params.statsSummary?.chaptersCount ?? 0,
                lessonsCount: params.statsSummary?.lessonsCount ?? totalRows,
                priorAddedCount: totalAdded,
                priorUpdatedCount: totalUpdated,
                priorSkippedCount: totalSkipped,
                priorDeletedCount: totalDeleted,
                errorCount: params.clientErrorCount || 0,
                duplicateCount: params.clientDuplicateCount || 0,
                textbooks: params.statsSummary?.textbooks || [],
              },
            }
          : {}),
      }),
    });

    const payload = (await response.json().catch(() => ({}))) as Record<string, unknown>;
    if (!response.ok) {
      const errMsg =
        typeof payload.error === 'string' && payload.error.trim()
          ? payload.error
          : `Import thất bại (mã lỗi ${response.status}).`;
      throw new Error(errMsg);
    }

    totalAdded += Number(payload.addedCount || 0);
    totalUpdated += Number(payload.updatedCount || 0);
    totalSkipped += Number(payload.skippedCount || 0);
    totalDeleted += Number(payload.deletedCount || 0);
    totalMissingInFile += Number(payload.missingInFileCount || 0);
    processedRows += batchRows.length;
    if (payload.log && typeof payload.log === 'object') {
      finalLog = payload.log as CurriculumImportLog;
    }

    // If multi-batch, finalize log with exact cumulative totals after final batch
    if (isLastBatch && batches.length > 1 && finalLog) {
      finalLog = {
        ...finalLog,
        addedCount: totalAdded,
        updatedCount: totalUpdated,
        skippedCount: totalSkipped,
        deletedCount: totalDeleted,
      };
    }
  }

  invalidateCurriculumCache();

  onProgress?.({
    percent: 100,
    processedRows: totalRows,
    totalRows,
    currentBatch: batches.length,
    totalBatches: batches.length,
    statusText: 'Hoàn tất import danh mục chương & bài học SGK.',
  });

  return {
    mode: params.mode,
    addedCount: totalAdded,
    updatedCount: totalUpdated,
    skippedCount: totalSkipped,
    deletedCount: totalDeleted,
    missingInFileCount: totalMissingInFile,
    errorCount: params.clientErrorCount || 0,
    duplicateCount: params.clientDuplicateCount || 0,
    log: finalLog,
  };
}

export async function fetchCurriculumImportHistory(): Promise<CurriculumImportLog[]> {
  if (firebaseInitError || !auth.currentUser) {
    return [];
  }

  try {
    const idToken = await auth.currentUser.getIdToken();
    const res = await fetch('/api/admin/curriculum/import-history', {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${idToken}`,
      },
    });
    if (res.status === 403 || res.status === 401) {
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      throw new Error(body.error || 'Bạn không có quyền xem lịch sử import danh mục.');
    }
    if (res.ok) {
      const data = (await res.json()) as { logs?: CurriculumImportLog[] };
      return Array.isArray(data.logs) ? data.logs : [];
    }
  } catch (err) {
    if (err instanceof Error && err.message.includes('không có quyền')) {
      throw err;
    }
  }

  // Fallback directly to Firestore (still enforced Admin-only by firestore.rules)
  try {
    const snap = await getDocs(collection(db, 'curriculumImportLogs'));
    return snap.docs
      .map((d) => {
        const raw = d.data() as CurriculumImportLog;
        return {
          ...raw,
          id: raw.id || d.id,
        };
      })
      .sort((a, b) => (b.importedAt || '').localeCompare(a.importedAt || ''))
      .slice(0, 50);
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, 'curriculumImportLogs');
  }
}

export function buildCurriculumTemplateWorkbook(
  subjects: SubjectItem[] = DEFAULT_GDPT_2018_SUBJECTS,
  config?: { textbookSeries?: string; textbookYear?: string }
): XLSX.WorkBook {
  const primarySeries = config?.textbookSeries?.trim() || TEXTBOOK_SERIES_OPTIONS[0];
  const secondarySeries =
    TEXTBOOK_SERIES_OPTIONS.find((s) => s !== primarySeries) || TEXTBOOK_SERIES_OPTIONS[1];

  const sampleRows = [
    {
      Subject: 'Hóa học',
      Grade: 10,
      Textbook: primarySeries,
      ChapterOrder: 1,
      ChapterName: 'Chương 1: Cấu tạo nguyên tử',
      LessonOrder: 1,
      LessonName: 'Bài 1: Thành phần của nguyên tử',
    },
    {
      Subject: 'Hóa học',
      Grade: 10,
      Textbook: primarySeries,
      ChapterOrder: 1,
      ChapterName: 'Chương 1: Cấu tạo nguyên tử',
      LessonOrder: 2,
      LessonName: 'Bài 2: Nguyên tố hóa học',
    },
    {
      Subject: 'Hóa học',
      Grade: 10,
      Textbook: primarySeries,
      ChapterOrder: 2,
      ChapterName: 'Chương 2: Bảng tuần hoàn các nguyên tố hóa học',
      LessonOrder: 1,
      LessonName: 'Bài 5: Cấu tạo của bảng tuần hoàn các nguyên tố hóa học',
    },
    {
      Subject: 'Hóa học',
      Grade: 11,
      Textbook: primarySeries,
      ChapterOrder: 1,
      ChapterName: 'Chương 1: Cân bằng hóa học',
      LessonOrder: 1,
      LessonName: 'Bài 1: Khái niệm về cân bằng hóa học',
    },
    {
      Subject: 'Vật lí',
      Grade: 10,
      Textbook: primarySeries,
      ChapterOrder: 1,
      ChapterName: 'Chương 1: Mở đầu',
      LessonOrder: 1,
      LessonName: 'Bài 1: Làm quen với Vật lí',
    },
    {
      Subject: 'Toán học',
      Grade: 10,
      Textbook: secondarySeries,
      ChapterOrder: 1,
      ChapterName: 'Chương 1: Mệnh đề và Tập hợp',
      LessonOrder: 1,
      LessonName: 'Bài 1: Mệnh đề',
    },
  ];

  const wb = XLSX.utils.book_new();
  const wsData = XLSX.utils.json_to_sheet(sampleRows, {
    header: [
      'Subject',
      'Grade',
      'Textbook',
      'ChapterOrder',
      'ChapterName',
      'LessonOrder',
      'LessonName',
    ],
  });
  wsData['!cols'] = [
    { wch: 24 },
    { wch: 8 },
    { wch: 32 },
    { wch: 14 },
    { wch: 44 },
    { wch: 13 },
    { wch: 46 },
  ];
  XLSX.utils.book_append_sheet(wb, wsData, 'DanhMucChuongBai');

  const allowedSeriesList = Array.from(
    new Set([primarySeries, ...TEXTBOOK_SERIES_OPTIONS].filter(Boolean))
  ).join(' | ');

  const wsGuide = XLSX.utils.json_to_sheet(
    subjects.map((s, index) => ({
      Subject: s.name,
      MaMonHeThong: s.id,
      KhoiLopHopLe: '10, 11, 12',
      BoSachHopLe: index === 0 ? allowedSeriesList : primarySeries,
    }))
  );
  wsGuide['!cols'] = [{ wch: 34 }, { wch: 18 }, { wch: 14 }, { wch: 56 }];
  XLSX.utils.book_append_sheet(wb, wsGuide, 'HuongDan_Va_MaMon');

  return wb;
}

export function downloadCurriculumTemplateExcel(
  subjects: SubjectItem[] = DEFAULT_GDPT_2018_SUBJECTS,
  config?: { textbookSeries?: string; textbookYear?: string }
): void {
  const wb = buildCurriculumTemplateWorkbook(subjects, config);
  XLSX.writeFile(wb, `Mau_Import_Danh_Muc_Chuong_Bai_SGK.xlsx`);
}

export function exportCurriculumCatalogExcel(
  lessons: CurriculumLesson[],
  fileName = `Danh_Muc_Bai_Hoc_GDPT2018_${new Date().toISOString().slice(0, 10)}.xlsx`
): void {
  const rows = sortCurriculumLessons(lessons).map((item) => ({
    Subject: item.subjectName,
    Grade: Number(item.grade),
    Textbook: item.textbookSeries,
    ChapterOrder: item.chapterOrder ?? 1,
    ChapterName: item.chapterName,
    LessonOrder: item.lessonOrder,
    LessonName: item.lessonName,
    subjectId: item.subjectId,
    textbookYear: item.textbookYear,
    chapterId: item.chapterId,
    lessonId: item.lessonId,
    status: item.status,
  }));

  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(rows);
  XLSX.utils.book_append_sheet(wb, ws, 'DanhMucChuongBai');
  XLSX.writeFile(wb, fileName);
}
