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
  CurriculumLesson,
  CurriculumStatus,
  SubjectItem,
} from '../types';
import {
  DEFAULT_GDPT_2018_SUBJECTS,
  TEXTBOOK_SERIES_OPTIONS,
} from '../constants/subjects';
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

export function generateChapterId(subjectId: string, grade: CurriculumGrade, chapterName: string): string {
  const subShort = safeId(subjectId, 'sub').slice(0, 24);
  return slugifyId(chapterName, `${subShort}_g${grade}_ch`, 128);
}

export function generateLessonId(
  subjectId: string,
  grade: CurriculumGrade,
  chapterId: string,
  lessonName: string,
  lessonOrder?: number
): string {
  const subShort = safeId(subjectId, 'sub').slice(0, 20);
  const chShort = safeId(chapterId, 'ch').slice(-24);
  const orderTag = typeof lessonOrder === 'number' && lessonOrder > 0 ? `b${lessonOrder}_` : '';
  return slugifyId(`${orderTag}${lessonName}`, `${subShort}_g${grade}_${chShort}`, 128);
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
    includeInactive?: boolean;
    searchTerm?: string;
  }
): {
  lessons: CurriculumLesson[];
  chapters: {
    chapterId: string;
    chapterName: string;
    chapterOrder: number;
    lessons: CurriculumLesson[];
  }[];
} {
  const search = (options?.searchTerm || '').trim().toLowerCase();
  const filtered = sortCurriculumLessons(lessons).filter((item) => {
    if (!options?.includeInactive && item.status !== 'active') return false;
    if (options?.grade && item.grade !== options.grade) return false;
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
    { chapterId: string; chapterName: string; chapterOrder: number; lessons: CurriculumLesson[] }
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
    : generateChapterId(subjectId, input.grade, chapterName);

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

export interface CurriculumImportParseResult {
  validRows: CurriculumLesson[];
  errors: { rowNumber: number; message: string }[];
  detectedSeries: string[];
}

function resolveSubjectFromImportRow(
  rawId: string,
  rawName: string,
  subjects: SubjectItem[]
): { id: string; name: string } | null {
  const cleanId = rawId.trim().toLowerCase();
  const cleanName = rawName.trim().toLowerCase();

  if (cleanId) {
    const byId = subjects.find((s) => s.id.toLowerCase() === cleanId);
    if (byId) return { id: byId.id, name: byId.name };
  }
  if (cleanName) {
    if (cleanName === 'ngoại ngữ 1' || cleanName === 'tiếng anh') {
      const nn = subjects.find((s) => s.id === 'ngoai_ngu_1');
      if (nn) return { id: nn.id, name: nn.name };
    }
    const byName = subjects.find((s) => s.name.toLowerCase() === cleanName);
    if (byName) return { id: byName.id, name: byName.name };
  }
  return null;
}

function normalizeGradeFromImportRow(rawGrade: unknown): CurriculumGrade | null {
  const text = String(rawGrade ?? '').trim().toLowerCase();
  if (text === '10' || text === 'lớp 10' || text === 'lop 10') return '10';
  if (text === '11' || text === 'lớp 11' || text === 'lop 11') return '11';
  if (text === '12' || text === 'lớp 12' || text === 'lop 12') return '12';
  return null;
}

export async function parseCurriculumImportFile(
  file: File,
  subjects: SubjectItem[] = DEFAULT_GDPT_2018_SUBJECTS,
  fallbackConfig?: { textbookSeries?: string; textbookYear?: string },
  adminUid?: string
): Promise<CurriculumImportParseResult> {
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: 'array' });
  const firstSheetName = workbook.SheetNames[0];
  if (!firstSheetName) {
    return {
      validRows: [],
      errors: [{ rowNumber: 0, message: 'Tệp Excel/CSV không có trang dữ liệu nào.' }],
      detectedSeries: [],
    };
  }

  const sheet = workbook.Sheets[firstSheetName];
  const rawRecords = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' });

  const validRows: CurriculumLesson[] = [];
  const errors: { rowNumber: number; message: string }[] = [];
  const seriesSet = new Set<string>();
  const seenLessonIds = new Set<string>();

  rawRecords.forEach((raw, idx) => {
    const rowNum = idx + 2; // +1 header, +1 1-indexed
    const row: Record<string, string> = {};
    Object.keys(raw).forEach((k) => {
      row[k.trim().toLowerCase()] = String(raw[k] ?? '').trim();
    });

    const subjectIdRaw = row['subjectid'] || row['ma_mon'] || row['mã môn'] || '';
    const subjectNameRaw = row['subjectname'] || row['ten_mon'] || row['môn học'] || '';
    const gradeRaw = row['grade'] || row['khoi_lop'] || row['khối lớp'] || row['lớp'] || '';
    const seriesRaw =
      row['textbookseries'] || row['bo_sach'] || row['bộ sách'] || fallbackConfig?.textbookSeries || '';
    const yearRaw =
      row['textbookyear'] || row['nam_ap_dung'] || row['năm áp dụng'] || fallbackConfig?.textbookYear || '2025-2026';
    const chapterIdRaw = row['chapterid'] || row['ma_chuong'] || '';
    const chapterNameRaw = row['chaptername'] || row['ten_chuong'] || row['chương'] || row['chủ đề'] || '';
    const chapterOrderRaw = row['chapterorder'] || row['thu_tu_chuong'] || '';
    const lessonIdRaw = row['lessonid'] || row['ma_bai'] || '';
    const lessonNameRaw = row['lessonname'] || row['ten_bai'] || row['bài học'] || '';
    const lessonOrderRaw = row['lessonorder'] || row['thu_tu_bai'] || row['stt'] || '';
    const statusRaw = (row['status'] || row['trang_thai'] || 'active').toLowerCase();

    // Skip completely empty rows
    if (!subjectIdRaw && !subjectNameRaw && !chapterNameRaw && !lessonNameRaw) {
      return;
    }

    const resolvedSubject = resolveSubjectFromImportRow(subjectIdRaw, subjectNameRaw, subjects);
    if (!resolvedSubject) {
      errors.push({
        rowNumber: rowNum,
        message: `Không nhận diện được môn học ("${subjectIdRaw || subjectNameRaw}").`,
      });
      return;
    }

    const normalizedGrade = normalizeGradeFromImportRow(gradeRaw);
    if (!normalizedGrade) {
      errors.push({
        rowNumber: rowNum,
        message: `Khối lớp "${gradeRaw}" không hợp lệ (chỉ chấp nhận 10, 11 hoặc 12).`,
      });
      return;
    }

    if (!seriesRaw) {
      errors.push({
        rowNumber: rowNum,
        message: 'Thiếu tên bộ sách giáo khoa (textbookSeries) và chưa chọn bộ sách mặc định.',
      });
      return;
    }

    if (!chapterNameRaw) {
      errors.push({ rowNumber: rowNum, message: 'Thiếu tên chương / chủ đề (chapterName).' });
      return;
    }

    if (!lessonNameRaw) {
      errors.push({ rowNumber: rowNum, message: 'Thiếu tên bài học (lessonName).' });
      return;
    }

    const parsedOrder = lessonOrderRaw ? Number(lessonOrderRaw) : validRows.length + 1;
    if (!Number.isFinite(parsedOrder) || parsedOrder < 0) {
      errors.push({ rowNumber: rowNum, message: `Thứ tự bài học "${lessonOrderRaw}" không hợp lệ.` });
      return;
    }

    const parsedChapterOrder = chapterOrderRaw ? Number(chapterOrderRaw) : undefined;
    const status: CurriculumStatus =
      statusRaw === 'inactive' || statusRaw === 'hidden' || statusRaw === 'ẩn' ? 'inactive' : 'active';

    try {
      const normalized = normalizeAndValidateLessonInput(
        {
          subjectId: resolvedSubject.id,
          subjectName: resolvedSubject.name,
          grade: normalizedGrade,
          textbookSeries: seriesRaw,
          textbookYear: yearRaw,
          chapterId: chapterIdRaw || undefined,
          chapterName: chapterNameRaw,
          chapterOrder: parsedChapterOrder,
          lessonId: lessonIdRaw || undefined,
          lessonName: lessonNameRaw,
          lessonOrder: parsedOrder,
          status,
        },
        adminUid
      );

      if (seenLessonIds.has(normalized.id)) {
        errors.push({
          rowNumber: rowNum,
          message: `Trùng mã bài học "${normalized.id}" trong tệp nhập.`,
        });
        return;
      }
      seenLessonIds.add(normalized.id);
      seriesSet.add(normalized.textbookSeries);
      validRows.push(normalized);
    } catch (err) {
      errors.push({
        rowNumber: rowNum,
        message: err instanceof Error ? err.message : 'Dữ liệu dòng không hợp lệ.',
      });
    }
  });

  return {
    validRows,
    errors,
    detectedSeries: Array.from(seriesSet),
  };
}

export function downloadCurriculumTemplateExcel(
  subjects: SubjectItem[] = DEFAULT_GDPT_2018_SUBJECTS,
  config?: { textbookSeries?: string; textbookYear?: string }
): void {
  const sampleSeries = config?.textbookSeries || TEXTBOOK_SERIES_OPTIONS[0];
  const sampleYear = config?.textbookYear || '2025-2026';

  const headerRows = [
    {
      subjectId: 'hoa_hoc',
      subjectName: 'Hóa học',
      grade: '10',
      textbookSeries: sampleSeries,
      textbookYear: sampleYear,
      chapterId: 'hoa_hoc_g10_ch_1',
      chapterName: 'Chương 1: Nhập tên chương đúng SGK của trường',
      chapterOrder: 1,
      lessonId: 'hoa_hoc_g10_ch1_b1',
      lessonName: 'Bài 1: Nhập tên bài đúng SGK của trường',
      lessonOrder: 1,
      status: 'active',
    },
  ];

  const wb = XLSX.utils.book_new();
  const wsData = XLSX.utils.json_to_sheet(headerRows);
  XLSX.utils.book_append_sheet(wb, wsData, 'DanhMucBaiHoc');

  const wsSubjects = XLSX.utils.json_to_sheet(
    subjects.map((s) => ({
      subjectId: s.id,
      subjectName: s.name,
      gradesSupported: '10, 11, 12',
    }))
  );
  XLSX.utils.book_append_sheet(wb, wsSubjects, 'MaMonHoc_GDPT2018');

  XLSX.writeFile(wb, `Mau_Danh_Muc_Bai_Hoc_GDPT2018.xlsx`);
}

export function exportCurriculumCatalogExcel(
  lessons: CurriculumLesson[],
  fileName = `Danh_Muc_Bai_Hoc_GDPT2018_${new Date().toISOString().slice(0, 10)}.xlsx`
): void {
  const rows = sortCurriculumLessons(lessons).map((item) => ({
    subjectId: item.subjectId,
    subjectName: item.subjectName,
    grade: item.grade,
    textbookSeries: item.textbookSeries,
    textbookYear: item.textbookYear,
    chapterId: item.chapterId,
    chapterName: item.chapterName,
    chapterOrder: item.chapterOrder ?? 1,
    lessonId: item.lessonId,
    lessonName: item.lessonName,
    lessonOrder: item.lessonOrder,
    status: item.status,
  }));

  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(rows);
  XLSX.utils.book_append_sheet(wb, ws, 'DanhMucBaiHoc');
  XLSX.writeFile(wb, fileName);
}
