import { ChemGrade, ChemTopic, CognitiveLevel, Question, QuestionType, SubjectItem } from '../types';

export const DEFAULT_SUBJECT_ID = 'hoa_hoc';
export const DEFAULT_SUBJECT_NAME = 'Hóa học';

export const DEFAULT_GDPT_2018_SUBJECTS: SubjectItem[] = [
  { id: 'toan_hoc', name: 'Toán học', shortName: 'Toán', codePrefix: 'TOAN', isDefault: true, order: 1 },
  { id: 'ngu_van', name: 'Ngữ văn', shortName: 'Văn', codePrefix: 'VAN', isDefault: true, order: 2 },
  {
    id: 'ngoai_ngu_1',
    name: 'Tiếng Anh và các ngoại ngữ khác',
    shortName: 'Ngoại ngữ',
    codePrefix: 'NN',
    isDefault: true,
    order: 3,
  },
  { id: 'vat_li', name: 'Vật lí', shortName: 'Lí', codePrefix: 'VL', isDefault: true, order: 4 },
  { id: 'hoa_hoc', name: 'Hóa học', shortName: 'Hóa', codePrefix: 'HH', isDefault: true, order: 5 },
  { id: 'sinh_hoc', name: 'Sinh học', shortName: 'Sinh', codePrefix: 'SH', isDefault: true, order: 6 },
  { id: 'lich_su', name: 'Lịch sử', shortName: 'Sử', codePrefix: 'LS', isDefault: true, order: 7 },
  { id: 'dia_li', name: 'Địa lí', shortName: 'Địa', codePrefix: 'DL', isDefault: true, order: 8 },
  {
    id: 'gdkt_pl',
    name: 'Giáo dục kinh tế và pháp luật',
    shortName: 'GDKT&PL',
    codePrefix: 'KTPL',
    isDefault: true,
    order: 9,
  },
  { id: 'tin_hoc', name: 'Tin học', shortName: 'Tin', codePrefix: 'TIN', isDefault: true, order: 10 },
  { id: 'cong_nghe', name: 'Công nghệ', shortName: 'CN', codePrefix: 'CN', isDefault: true, order: 11 },
  { id: 'gdtc', name: 'Giáo dục thể chất', shortName: 'GDTC', codePrefix: 'GDTC', isDefault: true, order: 12 },
  {
    id: 'gdqpan',
    name: 'Giáo dục quốc phòng và an ninh',
    shortName: 'GDQP&AN',
    codePrefix: 'QPAN',
    isDefault: true,
    order: 13,
  },
  { id: 'am_nhac', name: 'Âm nhạc', shortName: 'Âm nhạc', codePrefix: 'AN', isDefault: true, order: 14 },
  { id: 'mi_thuat', name: 'Mĩ thuật', shortName: 'Mĩ thuật', codePrefix: 'MT', isDefault: true, order: 15 },
  {
    id: 'hdtn_hn',
    name: 'Hoạt động trải nghiệm, hướng nghiệp',
    shortName: 'HĐTN-HN',
    codePrefix: 'HDTN',
    isDefault: true,
    order: 16,
  },
  {
    id: 'gd_dia_phuong',
    name: 'Nội dung giáo dục địa phương',
    shortName: 'GDĐP',
    codePrefix: 'GDDP',
    isDefault: true,
    order: 17,
  },
];

export const CHEM_TOPIC_LABELS: Record<ChemTopic, string> = {
  hoa_dai_cuong: 'Hóa học đại cương',
  hoa_vo_co: 'Hóa vô cơ',
  hoa_huu_co: 'Hóa hữu cơ',
  hoa_thuc_nghiem: 'Hóa học thực nghiệm',
  chuyen_sau_hsg: 'Bồi dưỡng HSG Chuyên',
};

export const GRADE_LABELS: Record<ChemGrade, string> = {
  '10': 'Lớp 10',
  '11': 'Lớp 11',
  '12': 'Lớp 12',
  chuyen_hsg: 'Chuyên & HSG',
};

export const CURRICULUM_GRADES: { id: '10' | '11' | '12'; label: string }[] = [
  { id: '10', label: 'Lớp 10' },
  { id: '11', label: 'Lớp 11' },
  { id: '12', label: 'Lớp 12' },
];

export const TEXTBOOK_SERIES_OPTIONS: string[] = [
  'Kết nối tri thức với cuộc sống',
  'Chân trời sáng tạo',
  'Cánh diều',
];

export const COGNITIVE_LEVEL_LABELS: Record<CognitiveLevel, string> = {
  nhan_biet: 'Biết (Nhận biết)',
  thong_hieu: 'Hiểu (Thông hiểu)',
  van_dung: 'Vận dụng',
  van_dung_cao: 'Vận dụng cao',
};

export const COGNITIVE_LEVEL_SHORT_LABELS: Record<CognitiveLevel, string> = {
  nhan_biet: 'Biết',
  thong_hieu: 'Hiểu',
  van_dung: 'Vận dụng',
  van_dung_cao: 'Vận dụng cao',
};

export const PRIMARY_QUESTION_TYPES: {
  id: QuestionType;
  label: string;
  shortLabel: string;
}[] = [
  {
    id: 'part1_single_choice',
    label: 'Trắc nghiệm nhiều lựa chọn',
    shortLabel: 'Trắc nghiệm nhiều lựa chọn',
  },
  {
    id: 'part2_true_false',
    label: 'Trắc nghiệm đúng/sai',
    shortLabel: 'Đúng / Sai',
  },
  {
    id: 'part3_short_answer',
    label: 'Trắc nghiệm trả lời ngắn',
    shortLabel: 'Trả lời ngắn',
  },
  {
    id: 'essay',
    label: 'Tự luận',
    shortLabel: 'Tự luận',
  },
];

export const QUESTION_TYPE_LABELS: Record<QuestionType, string> = {
  part1_single_choice: 'Trắc nghiệm nhiều lựa chọn',
  part1_multiple_choice: 'Trắc nghiệm nhiều lựa chọn (nhiều đáp án)',
  part2_true_false: 'Trắc nghiệm đúng/sai',
  part3_short_answer: 'Trắc nghiệm trả lời ngắn',
  essay: 'Tự luận',
};

export const QUESTION_TYPE_SHORT_LABELS: Record<QuestionType, string> = {
  part1_single_choice: 'Trắc nghiệm nhiều lựa chọn',
  part1_multiple_choice: 'Trắc nghiệm (nhiều đáp án)',
  part2_true_false: 'Đúng / Sai',
  part3_short_answer: 'Trả lời ngắn',
  essay: 'Tự luận',
};

export function resolveQuestionType(
  q: Pick<Question, 'type' | 'questionType'>
): QuestionType {
  return q.type || q.questionType || 'part1_single_choice';
}

export function resolveQuestionDifficulty(
  q: Pick<Question, 'level' | 'difficulty'>
): CognitiveLevel {
  return q.level || q.difficulty || 'nhan_biet';
}

export function matchesQuestionTypeFilter(
  q: Pick<Question, 'type' | 'questionType'>,
  filterValue: string
): boolean {
  if (!filterValue || filterValue === 'all') return true;
  const resolved = resolveQuestionType(q);
  if (filterValue === 'part1_single_choice') {
    return resolved === 'part1_single_choice' || resolved === 'part1_multiple_choice';
  }
  return resolved === filterValue;
}

export function slugifySubjectId(name: string): string {
  const ascii = name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
  return ascii ? `sub_${ascii.slice(0, 48)}` : `sub_${Date.now()}`;
}

export function mergeSubjectsList(customSubjects: SubjectItem[] = []): SubjectItem[] {
  const byId = new Map<string, SubjectItem>();
  DEFAULT_GDPT_2018_SUBJECTS.forEach((s) => byId.set(s.id, s));
  customSubjects.forEach((s) => {
    if (!s || !s.id || !s.name) return;
    byId.set(s.id, {
      ...s,
      isDefault: byId.has(s.id) ? byId.get(s.id)!.isDefault : false,
      order: typeof s.order === 'number' ? s.order : 100,
    });
  });
  return Array.from(byId.values()).sort((a, b) => {
    const orderDiff = (a.order ?? 999) - (b.order ?? 999);
    if (orderDiff !== 0) return orderDiff;
    return a.name.localeCompare(b.name, 'vi');
  });
}

export function resolveQuestionSubject(
  q: Pick<Question, 'subjectId' | 'subjectName'>,
  subjects: SubjectItem[] = DEFAULT_GDPT_2018_SUBJECTS
): { id: string; name: string } {
  const rawId = (q.subjectId || '').trim();
  const rawName = (q.subjectName || '').trim();
  if (rawId) {
    const found = subjects.find((s) => s.id === rawId);
    if (found) {
      return { id: found.id, name: found.name };
    }
    return { id: rawId, name: rawName || DEFAULT_SUBJECT_NAME };
  }
  if (rawName) {
    const lower = rawName.toLowerCase();
    if (lower === 'ngoại ngữ 1' || lower === 'tiếng anh') {
      const lang = subjects.find((s) => s.id === 'ngoai_ngu_1');
      if (lang) return { id: lang.id, name: lang.name };
    }
    const byName = subjects.find((s) => s.name.toLowerCase() === lower);
    return { id: byName?.id || DEFAULT_SUBJECT_ID, name: byName?.name || rawName };
  }
  return { id: DEFAULT_SUBJECT_ID, name: DEFAULT_SUBJECT_NAME };
}

export function getQuestionTopicDisplay(
  q: Pick<Question, 'lessonName' | 'chapterName' | 'lessonTopic' | 'topic'>
): string {
  const lessonName = (q.lessonName || '').trim();
  if (lessonName) return lessonName;
  const custom = (q.lessonTopic || '').trim();
  if (custom) return custom;
  return CHEM_TOPIC_LABELS[q.topic] || 'Chủ đề chung';
}

export function generateQuestionCode(params: {
  subjectId?: string;
  grade?: ChemGrade;
  type?: QuestionType;
  subjects?: SubjectItem[];
}): string {
  const subjects = params.subjects || DEFAULT_GDPT_2018_SUBJECTS;
  const subj = subjects.find((s) => s.id === (params.subjectId || DEFAULT_SUBJECT_ID));
  const prefix = (subj?.codePrefix || 'CH').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
  const gradeCode = params.grade === 'chuyen_hsg' ? 'HSG' : params.grade || '12';
  const typeCode =
    params.type === 'part1_single_choice' || params.type === 'part1_multiple_choice'
      ? 'TN'
      : params.type === 'part2_true_false'
      ? 'DS'
      : params.type === 'essay'
      ? 'TUL'
      : 'TLN';
  const rand = Math.floor(100 + Math.random() * 900);
  return `${prefix}${gradeCode}_${typeCode}_${rand}`;
}
