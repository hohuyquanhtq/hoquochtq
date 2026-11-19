import type {
  AdminChapterLessonStat,
  AdminQuestionBankFilterOptions,
  AdminQuestionBankFilterParams,
  AdminQuestionBankResponse,
  AdminQuestionBankStats,
  AdminSchoolQuestionItem,
  AdminSchoolTeacherSummary,
  AdminTeacherSubjectGradeRow,
  CognitiveLevel,
  CurriculumLesson,
  Question,
  QuestionType,
  User,
} from '../types/index.ts';
import {
  DEFAULT_GDPT_2018_SUBJECTS,
  DEFAULT_SUBJECT_ID,
  DEFAULT_SUBJECT_NAME,
  matchesQuestionTypeFilter,
  resolveQuestionDifficulty,
  resolveQuestionType,
} from '../constants/subjects.ts';

const SUBJECT_NAME_MAP = new Map<string, string>(
  DEFAULT_GDPT_2018_SUBJECTS.map((s) => [s.id, s.name])
);

const LEVEL_ORDER: CognitiveLevel[] = ['nhan_biet', 'thong_hieu', 'van_dung', 'van_dung_cao'];
const TYPE_ORDER: QuestionType[] = [
  'part1_single_choice',
  'part1_multiple_choice',
  'part2_true_false',
  'part3_short_answer',
  'essay',
];
const GRADE_ORDER = ['10', '11', '12', 'chuyen_hsg'];

export function normalizeTextForSearch(raw: unknown): string {
  if (typeof raw !== 'string') return '';
  return raw
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase()
    .trim();
}

export function resolveQuestionSubject(q: Question): { subjectId: string; subjectName: string } {
  const rawId = typeof q.subjectId === 'string' && q.subjectId.trim() ? q.subjectId.trim() : '';
  const rawName = typeof q.subjectName === 'string' && q.subjectName.trim() ? q.subjectName.trim() : '';

  if (rawId && rawName) {
    return { subjectId: rawId, subjectName: rawName };
  }
  if (rawId && SUBJECT_NAME_MAP.has(rawId)) {
    return { subjectId: rawId, subjectName: SUBJECT_NAME_MAP.get(rawId) || DEFAULT_SUBJECT_NAME };
  }
  if (rawName) {
    const found = DEFAULT_GDPT_2018_SUBJECTS.find(
      (s) => normalizeTextForSearch(s.name) === normalizeTextForSearch(rawName)
    );
    if (found) {
      return { subjectId: found.id, subjectName: found.name };
    }
    return { subjectId: rawId || DEFAULT_SUBJECT_ID, subjectName: rawName };
  }
  return { subjectId: DEFAULT_SUBJECT_ID, subjectName: DEFAULT_SUBJECT_NAME };
}

export function resolveQuestionChapter(q: Question): { key: string; name: string } {
  const chapterId = typeof q.chapterId === 'string' && q.chapterId.trim() ? q.chapterId.trim() : '';
  const chapterName =
    typeof q.chapterName === 'string' && q.chapterName.trim() ? q.chapterName.trim() : '';
  if (chapterId || chapterName) {
    return {
      key: chapterId || normalizeTextForSearch(chapterName),
      name: chapterName || chapterId,
    };
  }
  const fallbackTopic = typeof q.topic === 'string' && q.topic.trim() ? q.topic.trim() : 'khac';
  return {
    key: `legacy_topic_${fallbackTopic}`,
    name: `Chủ đề (${fallbackTopic})`,
  };
}

export function resolveQuestionLesson(q: Question): { key: string; name: string } {
  const lessonId = typeof q.lessonId === 'string' && q.lessonId.trim() ? q.lessonId.trim() : '';
  const lessonName =
    typeof q.lessonName === 'string' && q.lessonName.trim()
      ? q.lessonName.trim()
      : typeof q.lessonTopic === 'string' && q.lessonTopic.trim()
      ? q.lessonTopic.trim()
      : '';
  if (lessonId || lessonName) {
    return {
      key: lessonId || normalizeTextForSearch(lessonName),
      name: lessonName || lessonId,
    };
  }
  return { key: 'unassigned_lesson', name: 'Chưa gắn bài học' };
}

export function enrichSchoolQuestions(params: {
  questions: Question[];
  users: User[];
  curriculumLessons: CurriculumLesson[];
}): AdminSchoolQuestionItem[] {
  const userMap = new Map<string, User>();
  for (const u of params.users) {
    const uid = (u.uid || u.id || '').trim();
    if (uid) userMap.set(uid, u);
  }

  const lessonById = new Map<string, CurriculumLesson>();
  const chapterTextbookMap = new Map<string, string>();
  for (const lesson of params.curriculumLessons) {
    if (lesson.id) lessonById.set(lesson.id, lesson);
    if (lesson.lessonId) lessonById.set(lesson.lessonId, lesson);
    if (lesson.chapterId && lesson.textbookSeries && !chapterTextbookMap.has(lesson.chapterId)) {
      chapterTextbookMap.set(lesson.chapterId, lesson.textbookSeries);
    }
  }

  return params.questions.map((q) => {
    const ownerUid = (q.ownerId || q.authorId || 'unknown').trim() || 'unknown';
    const user = userMap.get(ownerUid);
    const { subjectId, subjectName } = resolveQuestionSubject(q);

    const matchedLesson = q.lessonId ? lessonById.get(q.lessonId) : undefined;
    const resolvedTextbookSeries =
      (typeof q.textbookSeries === 'string' && q.textbookSeries.trim()) ||
      matchedLesson?.textbookSeries ||
      (q.chapterId ? chapterTextbookMap.get(q.chapterId) : undefined) ||
      undefined;

    const ownerName =
      user?.name?.trim() ||
      (ownerUid === 'unknown' ? 'Chưa xác định giáo viên' : `Giáo viên (${ownerUid.slice(0, 8)})`);
    const ownerEmail = user?.email?.trim() || '';

    return {
      ...q,
      ownerId: ownerUid,
      ownerUid,
      ownerName,
      ownerEmail,
      ownerRole: user?.role,
      ownerSchool: user?.school,
      resolvedSubjectId: subjectId,
      resolvedSubjectName: subjectName,
      chapterName: q.chapterName || matchedLesson?.chapterName,
      lessonName: q.lessonName || q.lessonTopic || matchedLesson?.lessonName,
      resolvedTextbookSeries,
      textbookSeries: q.textbookSeries || resolvedTextbookSeries,
    };
  });
}

export function computeSchoolQuestionBankStats(
  items: AdminSchoolQuestionItem[],
  allUsers: User[] = []
): AdminQuestionBankStats {
  const teacherMap = new Map<
    string,
    {
      uid: string;
      name: string;
      email: string;
      role: AdminSchoolTeacherSummary['role'];
      school?: string;
      status?: AdminSchoolTeacherSummary['status'];
      questionCount: number;
      subjectSet: Set<string>;
      lastQuestionAt?: string;
    }
  >();

  const subjectCounts = new Map<string, { subjectId: string; subjectName: string; count: number }>();
  const gradeCounts = new Map<string, number>();
  const levelCounts = new Map<CognitiveLevel, number>();
  const typeCounts = new Map<QuestionType, number>();
  const chapterLessonMap = new Map<string, AdminChapterLessonStat>();
  const tsgMap = new Map<string, AdminTeacherSubjectGradeRow>();

  for (const level of LEVEL_ORDER) levelCounts.set(level, 0);
  for (const type of TYPE_ORDER) typeCounts.set(type, 0);

  const userLookup = new Map<string, User>();
  for (const u of allUsers) {
    const uid = (u.uid || u.id || '').trim();
    if (uid) userLookup.set(uid, u);
  }

  for (const item of items) {
    const uid = item.ownerUid;
    const u = userLookup.get(uid);
    const existingTeacher = teacherMap.get(uid) || {
      uid,
      name: item.ownerName,
      email: item.ownerEmail,
      role: item.ownerRole || u?.role || 'teacher',
      school: item.ownerSchool || u?.school,
      status: u?.status,
      questionCount: 0,
      subjectSet: new Set<string>(),
      lastQuestionAt: undefined as string | undefined,
    };
    existingTeacher.questionCount += 1;
    existingTeacher.subjectSet.add(item.resolvedSubjectId);
    const ts = item.updatedAt || item.createdAt;
    if (ts && (!existingTeacher.lastQuestionAt || Date.parse(ts) > Date.parse(existingTeacher.lastQuestionAt))) {
      existingTeacher.lastQuestionAt = ts;
    }
    teacherMap.set(uid, existingTeacher);

    // By Subject
    const subEntry = subjectCounts.get(item.resolvedSubjectId) || {
      subjectId: item.resolvedSubjectId,
      subjectName: item.resolvedSubjectName,
      count: 0,
    };
    subEntry.count += 1;
    subjectCounts.set(item.resolvedSubjectId, subEntry);

    // By Grade
    const grade = item.grade || '12';
    gradeCounts.set(grade, (gradeCounts.get(grade) || 0) + 1);

    // By Level / Difficulty
    const resolvedLevel = resolveQuestionDifficulty(item);
    levelCounts.set(resolvedLevel, (levelCounts.get(resolvedLevel) || 0) + 1);

    // By Type / QuestionType
    const resolvedType = resolveQuestionType(item);
    typeCounts.set(resolvedType, (typeCounts.get(resolvedType) || 0) + 1);

    // By Chapter / Lesson
    const ch = resolveQuestionChapter(item);
    const ls = resolveQuestionLesson(item);
    const clKey = `${item.resolvedSubjectId}::${grade}::${ch.key}::${ls.key}`;
    const clEntry = chapterLessonMap.get(clKey) || {
      subjectId: item.resolvedSubjectId,
      subjectName: item.resolvedSubjectName,
      grade,
      chapterKey: ch.key,
      chapterName: ch.name,
      lessonKey: ls.key,
      lessonName: ls.name,
      count: 0,
    };
    clEntry.count += 1;
    chapterLessonMap.set(clKey, clEntry);

    // Teacher x Subject x Grade table
    const tsgKey = `${uid}::${item.resolvedSubjectId}::${grade}`;
    const tsgRow = tsgMap.get(tsgKey) || {
      teacherUid: uid,
      teacherName: item.ownerName,
      teacherEmail: item.ownerEmail,
      subjectId: item.resolvedSubjectId,
      subjectName: item.resolvedSubjectName,
      grade,
      count: 0,
    };
    tsgRow.count += 1;
    tsgMap.set(tsgKey, tsgRow);
  }

  const byTeacher: AdminSchoolTeacherSummary[] = Array.from(teacherMap.values())
    .map((t) => ({
      uid: t.uid,
      name: t.name,
      email: t.email,
      role: t.role,
      school: t.school,
      status: t.status,
      questionCount: t.questionCount,
      subjectsCount: t.subjectSet.size,
      lastQuestionAt: t.lastQuestionAt,
    }))
    .sort((a, b) => b.questionCount - a.questionCount || a.name.localeCompare(b.name, 'vi'));

  const bySubject = Array.from(subjectCounts.values()).sort(
    (a, b) => b.count - a.count || a.subjectName.localeCompare(b.subjectName, 'vi')
  );

  const byGrade = Array.from(gradeCounts.entries())
    .map(([grade, count]) => ({ grade, count }))
    .sort((a, b) => {
      const ia = GRADE_ORDER.indexOf(a.grade);
      const ib = GRADE_ORDER.indexOf(b.grade);
      return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
    });

  const byLevel = LEVEL_ORDER.map((level) => ({ level, count: levelCounts.get(level) || 0 }));
  const byType = TYPE_ORDER.map((type) => ({ type, count: typeCounts.get(type) || 0 }));

  const byChapterLesson = Array.from(chapterLessonMap.values()).sort(
    (a, b) => b.count - a.count || a.chapterName.localeCompare(b.chapterName, 'vi')
  );

  const teacherSubjectGradeRows = Array.from(tsgMap.values()).sort(
    (a, b) =>
      b.count - a.count ||
      a.teacherName.localeCompare(b.teacherName, 'vi') ||
      a.subjectName.localeCompare(b.subjectName, 'vi') ||
      a.grade.localeCompare(b.grade)
  );

  return {
    totalTeachersWithQuestions: byTeacher.length,
    totalQuestions: items.length,
    bySubject,
    byGrade,
    byChapterLesson,
    byLevel,
    byType,
    byTeacher,
    teacherSubjectGradeRows,
  };
}

export function buildFilterOptionsFromSchoolQuestions(
  items: AdminSchoolQuestionItem[],
  curriculumLessons: CurriculumLesson[] = []
): AdminQuestionBankFilterOptions {
  const subjectMap = new Map<string, string>();
  const gradeSet = new Set<string>();
  const textbookSet = new Set<string>();
  const chapterMap = new Map<string, { key: string; name: string; subjectId: string; grade: string }>();
  const lessonMap = new Map<
    string,
    { key: string; name: string; chapterKey: string; subjectId: string; grade: string }
  >();

  for (const lesson of curriculumLessons) {
    if (lesson.textbookSeries?.trim()) textbookSet.add(lesson.textbookSeries.trim());
  }

  for (const item of items) {
    subjectMap.set(item.resolvedSubjectId, item.resolvedSubjectName);
    if (item.grade) gradeSet.add(item.grade);
    if (item.resolvedTextbookSeries?.trim()) textbookSet.add(item.resolvedTextbookSeries.trim());

    const ch = resolveQuestionChapter(item);
    const chKeyComposite = `${item.resolvedSubjectId}::${item.grade}::${ch.key}`;
    if (!chapterMap.has(chKeyComposite)) {
      chapterMap.set(chKeyComposite, {
        key: ch.key,
        name: ch.name,
        subjectId: item.resolvedSubjectId,
        grade: item.grade,
      });
    }

    const ls = resolveQuestionLesson(item);
    const lsKeyComposite = `${item.resolvedSubjectId}::${item.grade}::${ch.key}::${ls.key}`;
    if (!lessonMap.has(lsKeyComposite)) {
      lessonMap.set(lsKeyComposite, {
        key: ls.key,
        name: ls.name,
        chapterKey: ch.key,
        subjectId: item.resolvedSubjectId,
        grade: item.grade,
      });
    }
  }

  return {
    subjects: Array.from(subjectMap.entries())
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name, 'vi')),
    grades: Array.from(gradeSet).sort((a, b) => {
      const ia = GRADE_ORDER.indexOf(a);
      const ib = GRADE_ORDER.indexOf(b);
      return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
    }),
    textbookSeries: Array.from(textbookSet).sort((a, b) => a.localeCompare(b, 'vi')),
    chapters: Array.from(chapterMap.values()).sort((a, b) => a.name.localeCompare(b.name, 'vi')),
    lessons: Array.from(lessonMap.values()).sort((a, b) => a.name.localeCompare(b.name, 'vi')),
  };
}

export function filterAndPaginateSchoolQuestions(
  enrichedItems: AdminSchoolQuestionItem[],
  filters: AdminQuestionBankFilterParams,
  allUsers: User[] = [],
  curriculumLessons: CurriculumLesson[] = []
): AdminQuestionBankResponse {
  const teacherSet =
    Array.isArray(filters.teacherIds) && filters.teacherIds.length > 0
      ? new Set(filters.teacherIds.map((v) => v.trim()).filter(Boolean))
      : null;
  const subjectSet =
    Array.isArray(filters.subjectIds) && filters.subjectIds.length > 0
      ? new Set(filters.subjectIds.map((v) => v.trim()).filter(Boolean))
      : null;
  const gradeSet =
    Array.isArray(filters.grades) && filters.grades.length > 0
      ? new Set(filters.grades.map((v) => v.trim()).filter(Boolean))
      : null;
  const levelSet =
    Array.isArray(filters.levels) && filters.levels.length > 0
      ? new Set(filters.levels)
      : null;
  const typeSet =
    Array.isArray(filters.types) && filters.types.length > 0
      ? new Set(filters.types)
      : null;

  const textbookNorm = normalizeTextForSearch(filters.textbookSeries);
  const chapterFilter = (filters.chapter || '').trim();
  const chapterNorm = normalizeTextForSearch(chapterFilter);
  const lessonFilter = (filters.lesson || '').trim();
  const lessonNorm = normalizeTextForSearch(lessonFilter);
  const searchNorm = normalizeTextForSearch(filters.search);

  const dateFromMs =
    filters.dateFrom && !isNaN(Date.parse(filters.dateFrom))
      ? new Date(`${filters.dateFrom.slice(0, 10)}T00:00:00.000Z`).getTime()
      : null;
  const dateToMs =
    filters.dateTo && !isNaN(Date.parse(filters.dateTo))
      ? new Date(`${filters.dateTo.slice(0, 10)}T23:59:59.999Z`).getTime()
      : null;

  const filtered = enrichedItems.filter((item) => {
    if (teacherSet && !teacherSet.has(item.ownerUid)) return false;
    if (subjectSet && !subjectSet.has(item.resolvedSubjectId)) return false;
    if (gradeSet && !gradeSet.has(item.grade)) return false;
    if (levelSet && !levelSet.has(resolveQuestionDifficulty(item))) return false;
    if (typeSet) {
      const matchedAnyType = Array.from(typeSet).some((t) => matchesQuestionTypeFilter(item, t));
      if (!matchedAnyType) return false;
    }

    if (textbookNorm) {
      const itemTb = normalizeTextForSearch(item.resolvedTextbookSeries || item.textbookSeries || '');
      if (itemTb !== textbookNorm) return false;
    }

    if (chapterFilter) {
      const ch = resolveQuestionChapter(item);
      if (
        ch.key !== chapterFilter &&
        normalizeTextForSearch(ch.name) !== chapterNorm &&
        !normalizeTextForSearch(ch.name).includes(chapterNorm)
      ) {
        return false;
      }
    }

    if (lessonFilter) {
      const ls = resolveQuestionLesson(item);
      if (
        ls.key !== lessonFilter &&
        normalizeTextForSearch(ls.name) !== lessonNorm &&
        !normalizeTextForSearch(ls.name).includes(lessonNorm)
      ) {
        return false;
      }
    }

    if (dateFromMs !== null || dateToMs !== null) {
      const createdMs = Date.parse(item.createdAt || item.updatedAt || '');
      if (isNaN(createdMs)) return false;
      if (dateFromMs !== null && createdMs < dateFromMs) return false;
      if (dateToMs !== null && createdMs > dateToMs) return false;
    }

    if (searchNorm) {
      const haystack = normalizeTextForSearch(
        [
          item.code,
          item.content,
          item.explanation,
          item.chapterName,
          item.lessonName,
          item.lessonTopic,
          item.resolvedSubjectName,
          item.ownerName,
          item.ownerEmail,
          item.source,
          ...(item.options || []).map((o) => o.text),
          ...(item.statements || []).map((s) => s.statement),
        ]
          .filter(Boolean)
          .join(' ')
      );
      if (!haystack.includes(searchNorm)) return false;
    }

    return true;
  });

  const sortBy = filters.sortBy || 'updatedAt_desc';
  const sorted = [...filtered].sort((a, b) => {
    if (sortBy === 'code_asc') {
      return (a.code || '').localeCompare(b.code || '', 'vi');
    }
    if (sortBy === 'createdAt_asc') {
      return Date.parse(a.createdAt || '') - Date.parse(b.createdAt || '');
    }
    if (sortBy === 'createdAt_desc') {
      return Date.parse(b.createdAt || '') - Date.parse(a.createdAt || '');
    }
    return Date.parse(b.updatedAt || b.createdAt || '') - Date.parse(a.updatedAt || a.createdAt || '');
  });

  const stats = computeSchoolQuestionBankStats(enrichedItems, allUsers);
  const filterOptions = buildFilterOptionsFromSchoolQuestions(enrichedItems, curriculumLessons);

  const totalFiltered = sorted.length;
  if (filters.includeAllFiltered) {
    return {
      items: sorted,
      totalFiltered,
      page: 1,
      pageSize: Math.max(1, totalFiltered),
      totalPages: 1,
      stats,
      teachers: stats.byTeacher,
      filterOptions,
    };
  }

  const pageSize = Math.max(5, Math.min(200, Number(filters.pageSize) || 20));
  const totalPages = Math.max(1, Math.ceil(totalFiltered / pageSize));
  const page = Math.max(1, Math.min(totalPages, Number(filters.page) || 1));
  const start = (page - 1) * pageSize;

  return {
    items: sorted.slice(start, start + pageSize),
    totalFiltered,
    page,
    pageSize,
    totalPages,
    stats,
    teachers: stats.byTeacher,
    filterOptions,
  };
}

/**
 * Builds an independent personal copy of a teacher's question owned by Admin.
 * Never mutates the source question and preserves copiedFrom* provenance.
 */
export function buildAdminPersonalQuestionCopy(params: {
  source: Question;
  adminUid: string;
  originalOwnerId: string;
  originalOwnerName: string;
  nowIso?: string;
}): Question {
  const nowIso = params.nowIso || new Date().toISOString();
  const rand = Math.random().toString(36).slice(2, 7);
  const newId = `q_admcopy_${Date.now()}_${rand}`;
  const baseCode = (params.source.code || 'Q').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 48);

  return {
    ...params.source,
    id: newId,
    ownerId: params.adminUid,
    authorId: params.adminUid,
    code: `${baseCode}_COPY`.slice(0, 64),
    options: params.source.options ? params.source.options.map((o) => ({ ...o })) : undefined,
    correctOptionIds: params.source.correctOptionIds
      ? [...params.source.correctOptionIds]
      : undefined,
    statements: params.source.statements
      ? params.source.statements.map((s) => ({ ...s }))
      : undefined,
    shortAnswerConfig: params.source.shortAnswerConfig
      ? {
          ...params.source.shortAnswerConfig,
          acceptableAnswers: [...(params.source.shortAnswerConfig.acceptableAnswers || [])],
        }
      : undefined,
    copiedFromQuestionId: params.source.id,
    copiedFromOwnerId: params.originalOwnerId,
    copiedFromOwnerName: params.originalOwnerName.slice(0, 150),
    createdAt: nowIso,
    updatedAt: nowIso,
  };
}

/**
 * Clones a question for inclusion inside an Exam without mutating or copying it
 * into the Admin's personal question bank. Records sourceQuestionId & original teacher provenance.
 */
export function buildExamQuestionProvenanceClone(
  q: Question & { ownerUid?: string; ownerName?: string },
  scope: 'personal' | 'school_bank',
  fallbackOwnerName?: string
): Question {
  const sourceQuestionId = q.sourceQuestionId || q.id;
  const sourceOwnerId = q.sourceOwnerId || q.ownerUid || q.ownerId || q.authorId || '';
  const sourceOwnerName = q.sourceOwnerName || q.ownerName || fallbackOwnerName || undefined;

  return {
    ...q,
    id: `${sourceQuestionId}__ex_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    options: q.options ? q.options.map((o) => ({ ...o })) : undefined,
    correctOptionIds: q.correctOptionIds ? [...q.correctOptionIds] : undefined,
    statements: q.statements ? q.statements.map((s) => ({ ...s })) : undefined,
    shortAnswerConfig: q.shortAnswerConfig
      ? {
          ...q.shortAnswerConfig,
          acceptableAnswers: [...(q.shortAnswerConfig.acceptableAnswers || [])],
        }
      : undefined,
    sourceQuestionId,
    ...(sourceOwnerId ? { sourceOwnerId } : {}),
    ...(sourceOwnerName ? { sourceOwnerName } : {}),
    sourceScope: q.sourceScope || scope,
  };
}

export function summarizeQuestionForAudit(q: Partial<Question>): string {
  const parts = [
    `Mã: ${q.code || q.id || 'N/A'}`,
    `Môn: ${q.subjectName || q.subjectId || DEFAULT_SUBJECT_NAME}`,
    `Lớp: ${q.grade || '12'}`,
    `Mức độ: ${q.level || 'nhan_biet'}`,
    `Nội dung: ${(q.content || '').replace(/\s+/g, ' ').trim().slice(0, 220)}`,
  ];
  return parts.join(' | ').slice(0, 1800);
}
