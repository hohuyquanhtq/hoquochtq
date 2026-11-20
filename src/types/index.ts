/**
 * HQTest - Type Definitions
 * Hệ thống ngân hàng câu hỏi, tạo đề và thi trắc nghiệm online
 */

export type UserRole = 'admin' | 'teacher' | 'student';

export type AccountStatus = 'pending' | 'active' | 'locked' | 'rejected';

export interface User {
  id: string;
  uid?: string;
  name: string;
  email: string;
  role: UserRole;
  status?: AccountStatus;
  phone?: string;
  avatar?: string;
  className?: string; // For students
  school?: string;
  joinedClassIds?: string[];
  approvedBy?: string;
  approvedAt?: string;
  createdAt: string;
  updatedAt?: string;
}

export interface Classroom {
  id: string;
  ownerId: string;
  teacherName: string;
  school?: string;
  className: string;
  classCode: string;
  description?: string;
  assignedExamCodes: string[];
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ClassJoinLookup {
  classCode: string;
  classId: string;
  className: string;
  teacherId: string;
  teacherName: string;
  school?: string;
  assignedExamCodes: string[];
  isActive: boolean;
  updatedAt: string;
}

export interface ClassEnrollment {
  id: string; // `${classId}_${studentId}`
  classId: string;
  classCode: string;
  className: string;
  teacherId: string;
  teacherName: string;
  studentId: string;
  studentName: string;
  studentEmail: string;
  studentClassName?: string;
  joinedAt: string;
}

export interface UploadRecord {
  id: string;
  ownerId: string;
  fileName: string;
  fileType: 'docx' | 'pdf' | 'text';
  examTitle: string;
  totalQuestions: number;
  grade: ChemGrade;
  createdAt: string;
}

export type QuestionType = 
  | 'part1_single_choice'    // Phần I: Trắc nghiệm 4 lựa chọn (1 đáp án đúng)
  | 'part1_multiple_choice'  // Phần I mở rộng: Trắc nghiệm nhiều lựa chọn
  | 'part2_true_false'       // Phần II: Trắc nghiệm Đúng - Sai (4 ý a, b, c, d)
  | 'part3_short_answer';    // Phần III: Trắc nghiệm trả lời ngắn (số/chữ)

export type CognitiveLevel = 
  | 'nhan_biet'   // Nhận biết
  | 'thong_hieu'  // Thông hiểu
  | 'van_dung'    // Vận dụng
  | 'van_dung_cao'; // Vận dụng cao

export type ChemGrade = '10' | '11' | '12' | 'chuyen_hsg';
export type CurriculumGrade = '10' | '11' | '12';
export type CurriculumStatus = 'active' | 'inactive';

export interface CurriculumConfig {
  id: string;
  textbookSeries: string;
  textbookYear: string;
  schoolName?: string;
  updatedBy?: string;
  updatedAt: string;
}

export interface CurriculumLesson {
  id: string;
  subjectId: string;
  subjectName: string;
  grade: CurriculumGrade;
  textbookSeries: string;
  textbookYear: string;
  chapterId: string;
  chapterName: string;
  chapterOrder?: number;
  lessonId: string;
  lessonName: string;
  lessonOrder: number;
  status: CurriculumStatus;
  createdBy?: string;
  updatedBy?: string;
  createdAt: string;
  updatedAt: string;
}

export type CurriculumImportMode = 'append' | 'sync';

export interface CurriculumImportLog {
  id: string;
  fileName: string;
  actorUid: string;
  actorName: string;
  actorEmail?: string;
  importedAt: string;
  mode: CurriculumImportMode;
  subjectsCount: number;
  gradesCount: number;
  chaptersCount: number;
  lessonsCount: number;
  addedCount: number;
  updatedCount: number;
  skippedCount: number;
  deletedCount: number;
  errorCount: number;
  duplicateCount: number;
  textbooks?: string[];
}

export interface SubjectItem {
  id: string;
  name: string;
  shortName?: string;
  codePrefix?: string;
  isDefault?: boolean;
  order?: number;
  ownerId?: string;
  authorId?: string;
  createdAt?: string;
  updatedAt?: string;
}

export type ChemTopic = 
  | 'hoa_dai_cuong'    // Hóa học đại cương (nguyên tử, liên kết, tốc độ phản ứng, cân bằng hóa học)
  | 'hoa_vo_co'        // Hóa vô cơ (kim loại, phi kim, phức chất, pin điện hóa)
  | 'hoa_huu_co'       // Hóa hữu cơ (hydrocarbon, dẫn xuất halogen, alcohol, amine, amino acid, polymer)
  | 'hoa_thuc_nghiem'  // Hóa học thực nghiệm & ứng dụng
  | 'chuyen_sau_hsg';  // Bồi dưỡng học sinh giỏi & Chuyên Hóa

export interface MultipleChoiceOption {
  id: string; // 'A' | 'B' | 'C' | 'D'
  text: string;
  isCorrect?: boolean;
}

export interface TrueFalseStatement {
  id: string; // 'a' | 'b' | 'c' | 'd'
  statement: string;
  correctAnswer: boolean; // true = Đúng, false = Sai
  explanation?: string;
}

export interface ShortAnswerConfig {
  acceptableAnswers: string[]; // Ví dụ: ["4", "4.0", "4,0"] hoặc ["CH3COOH"]
  isNumeric: boolean;
  numericValue?: number;
  tolerance?: number; // Ví dụ: ±0.05
  unit?: string;      // Ví dụ: "g/mol", "M", "mL"
}

export interface Question {
  id: string;
  code: string;               // Mã câu hỏi, VD: "H12_HC_001"
  content: string;            // Nội dung câu hỏi (chứa công thức hóa học, latex, text)
  type: QuestionType;
  subjectId?: string;         // ID môn học GDPT 2018 (mặc định fallback: "hoa_hoc")
  subjectName?: string;       // Tên môn học hiển thị (mặc định fallback: "Hóa học")
  grade: ChemGrade;
  topic: ChemTopic;
  chapterId?: string;         // Mã chương / chủ đề lớn chuẩn GDPT 2018
  chapterName?: string;       // Tên chương / chủ đề lớn
  lessonId?: string;          // Mã bài học chuẩn hóa từ danh mục SGK
  lessonName?: string;        // Tên bài học chuẩn hóa từ danh mục SGK
  lessonTopic?: string;       // Tên bài học / chủ đề hiển thị (tương thích ngược dữ liệu cũ)
  level: CognitiveLevel;
  folderId?: string;
  
  // Dành cho Phần I (4 lựa chọn hoặc nhiều lựa chọn)
  options?: MultipleChoiceOption[];
  correctOptionId?: string;   // 'A' | 'B' | 'C' | 'D'
  correctOptionIds?: string[]; // Hỗ trợ câu hỏi nhiều đáp án đúng, VD: ['A', 'C']
  
  // Dành cho Phần II (Đúng / Sai)
  statements?: TrueFalseStatement[];
  
  // Dành cho Phần III (Trả lời ngắn)
  shortAnswerConfig?: ShortAnswerConfig;
  
  // Tài liệu bổ trợ
  imageUrl?: string;          // Sơ đồ thí nghiệm, bảng số liệu, đồ thị
  explanation?: string;       // Hướng dẫn giải chi tiết
  source?: string;            // Đề thi thử THPT Quốc gia 2024, Chuyên Sư Phạm...
  ownerId?: string;
  authorId: string;
  createdAt: string;
  updatedAt: string;
  
  // Trạng thái kiểm tra (cho parser)
  parseStatus?: 'verified' | 'needs_review' | 'error';
  parseWarning?: string;
  equationWarnings?: string[];
  ommlSources?: string[];
  teacherVerified?: boolean;
  recognitionSource?: RecognitionSource;
  sectionId?: string;
  section?: string;
  part?: string;
  sectionTitle?: string;
  partTitle?: string;
  rawSourceText?: string;

  // Bộ sách giáo khoa & truy xuất nguồn gốc (Super Admin / tạo đề kết hợp nhiều giáo viên)
  textbookSeries?: string;
  sourceQuestionId?: string;
  sourceOwnerId?: string;
  sourceOwnerName?: string;
  sourceScope?: 'personal' | 'school_bank';
  copiedFromQuestionId?: string;
  copiedFromOwnerId?: string;
  copiedFromOwnerName?: string;
}

export interface Folder {
  id: string;
  folderId?: string;
  name: string;
  parentId?: string | null;
  description?: string;
  grade?: ChemGrade;
  color?: string;
  ownerId?: string;
  authorId: string;
  createdBy?: string;
  updatedBy?: string;
  createdAt: string;
  updatedAt?: string;
  itemCount?: number;
}

export interface ExamRuleScore {
  part1ScorePerQuestion: number; // Mặc định 0.25đ/câu (18 câu = 4.5đ)
  part2GradingModel: 'standard_moet' | 'custom_per_statement'; // Quy chế Bộ GD&ĐT: 1 ý=0.1, 2 ý=0.25, 3 ý=0.5, 4 ý=1.0
  part2CustomScorePerStatement?: number;
  part3ScorePerQuestion: number; // Mặc định 0.25đ/câu (6 câu = 1.5đ)
  totalTargetScore: number;      // Bắt buộc 10.0 điểm
}

export interface ExamVariant {
  code: string; // VD: "101", "102", "103", "104"
  questionIds: string[];
  optionShuffles?: Record<string, string[]>; // questionId -> ['B', 'A', 'D', 'C']
}

export interface Exam {
  id: string;
  examId?: string;
  title: string;
  description?: string;       // Mô tả ngắn của đề thi
  code: string;                 // Mã đề tham gia online, VD: "CHEM12A", "HSG2024"
  publicCode?: string;          // Mã truy cập đường dẫn ngắn 6 ký tự (chữ hoa + số không nhầm lẫn, hoặc 6 chữ số cũ)
  folderId?: string | null;
  subjectId?: string;
  subjectName?: string;
  grade: ChemGrade;
  topic?: ChemTopic;
  durationMinutes: number;      // Thời gian làm bài (phút), VD: 50 phút
  totalQuestions: number;
  totalScore: number;           // Mặc định 10.0
  
  questions: Question[];
  detectedSections?: DetectedExamSection[];
  rules: ExamRuleScore;
  
  variants?: ExamVariant[];     // Các mã đề đảo
  shuffleQuestions: boolean;
  shuffleOptions: boolean;
  
  // Cài đặt thi online
  isPublished: boolean;
  openAt?: string;
  closeAt?: string;
  maxAttempts: number;          // Số lần làm bài, 0 = không giới hạn
  showScoreAfterSubmit: boolean;
  showAnswersAfterSubmit: boolean;
  showSolutionsAfterSubmit: boolean;
  allowReviewLater: boolean;
  assignedClassCodes?: string[];

  // Bảo mật đề thi & mở đáp án theo điểm sàn
  requiresPassword?: boolean;          // Chỉ boolean trạng thái; tuyệt đối không lưu mật khẩu rõ/hash ở đây
  passwordUpdatedAt?: string | null;   // Mốc cập nhật mật khẩu gần nhất (hủy grant cũ khi đổi/bật mật khẩu)
  allowAnswerReview?: boolean;         // Mặc định true cho đề mới; đề cũ fallback theo showAnswersAfterSubmit
  answerReviewMinScore?: number;       // Điểm sàn từ 0.0 -> 10.0 (bước 0.1), mặc định 8.0 cho đề mới
  answerReviewEnabledAt?: string | null; // Thời điểm mở xem đáp án (ISO datetime hoặc null = mở ngay khi đạt sàn)
  
  ownerId?: string;
  authorId: string;
  authorName: string;
  createdBy?: string;
  updatedBy?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ExamAnswerReviewCheck {
  allowed: boolean;
  reason?:
    | 'allowed'
    | 'disabled'
    | 'below_min_score'
    | 'not_yet_enabled'
    | 'unauthenticated'
    | 'no_submission'
    | 'access_denied'
    | 'server_unavailable';
  score?: number;
  minScore?: number;
  enabledAt?: string | null;
  message?: string;
}

export interface StudentAnswer {
  questionId: string;
  questionType: QuestionType;
  
  // Phần I
  selectedOptionId?: string;
  selectedOptionIds?: string[];
  
  // Phần II
  selectedStatements?: Record<string, boolean>; // statementId ('a','b','c','d') -> true (Đúng) | false (Sai)
  
  // Phần III
  textAnswer?: string;
  
  isMarkedForReview?: boolean;
}

export type QuestionResultStatus = 'correct' | 'incorrect' | 'unanswered';

export interface StatementEvaluationDetail {
  statementId: string;
  statementText: string;
  studentChoice?: boolean;
  correctAnswer: boolean;
  isCorrect: boolean;
  isAnswered: boolean;
  explanation?: string;
}

export interface QuestionEvaluationDetail {
  questionId: string;
  questionCode: string;
  orderIndex: number;
  type: QuestionType;
  status: QuestionResultStatus;
  earnedScore: number;
  maxScore: number;
  selectedOptionId?: string;
  selectedOptionIds?: string[];
  correctOptionId?: string;
  correctOptionIds?: string[];
  statementDetails?: StatementEvaluationDetail[];
  correctStatementsCount?: number;
  totalStatementsCount?: number;
  textAnswer?: string;
  acceptableAnswers?: string[];
  isNumeric?: boolean;
  numericValue?: number;
  tolerance?: number;
  unit?: string;
}

export interface SubmissionQuestionSnapshot {
  questionId: string;
  questionCode: string;
  orderIndex: number;
  type: QuestionType;
  content: string;
  imageUrl?: string;
  options?: MultipleChoiceOption[];
  correctOptionId?: string;
  correctOptionIds?: string[];
  statements?: TrueFalseStatement[];
  shortAnswerConfig?: ShortAnswerConfig;
  explanation?: string;
  studentAnswer?: StudentAnswer;
  statementDetails?: StatementEvaluationDetail[];
  correctStatementsCount?: number;
  totalStatementsCount?: number;
  earnedScore: number;
  maxScore: number;
  status: QuestionResultStatus;
}

export interface SubmissionSnapshotRecord {
  id: string;
  submissionId: string;
  attemptId?: string;
  examId: string;
  examCode: string;
  publicCode?: string;
  variantCode?: string;
  examTitle: string;
  examVersionUpdatedAt?: string;
  ownerId: string;
  studentId: string;
  studentName: string;
  studentClass: string;
  startedAt: string;
  submittedAt: string;
  durationSeconds: number;
  part1Score: number;
  part2Score: number;
  part3Score: number;
  totalScore: number;
  maxPossibleScore: number;
  totalQuestions: number;
  correctQuestionsCount: number;
  wrongQuestionsCount: number;
  unansweredQuestionsCount: number;
  tabSwitchesCount?: number;
  status: 'completed' | 'in_progress' | 'timed_out';
  gradedByServer?: boolean;
  isLegacyReconstructed?: boolean;
  capturedAt: string;
  questionResults: SubmissionQuestionSnapshot[];
}

export interface StudentSubmission {
  id: string;
  attemptId?: string;
  examId: string;
  examTitle: string;
  examCode: string;
  publicCode?: string;
  variantCode?: string;
  ownerId?: string;
  
  studentId: string;
  studentName: string;
  studentClass: string;
  
  startedAt: string;
  submittedAt: string;
  durationSeconds: number;
  
  answers: Record<string, StudentAnswer>;
  
  // Kết quả chấm điểm
  part1Score: number;
  part2Score: number;
  part3Score: number;
  totalScore: number;
  maxPossibleScore: number;
  totalQuestions?: number;
  correctQuestionsCount: number;
  wrongQuestionsCount?: number;
  unansweredQuestionsCount?: number;
  
  tabSwitchesCount?: number;    // Giám sát rời màn hình thi
  status: 'completed' | 'in_progress' | 'timed_out';
  gradedByServer?: boolean;
  serverGradeDigest?: string;
  serverGradedAt?: string;
  examVersionUpdatedAt?: string;
  hasSubmissionSnapshot?: boolean;
}

export interface ExamStatistics {
  examId: string;
  totalSubmissions: number;
  averageScore: number;
  highestScore: number;
  lowestScore: number;
  scoreDistribution: {
    under5: number;
    from5to65: number;
    from65to8: number;
    from8to9: number;
    from9to10: number;
  };
  questionAccuracy: {
    questionId: string;
    questionCode: string;
    questionText: string;
    type: QuestionType;
    correctCount: number;
    totalAttempts: number;
    accuracyPercent: number;
  }[];
}

export type RecognitionStatus = 'verified' | 'needs_review' | 'not_found' | 'conflicted';
export type RecognitionSource = 'answer_table' | 'question_content' | 'detailed_solution' | 'manual' | 'table' | 'text' | 'gemini_ai';

export interface AnswerRecognitionItem {
  id: string; // e.g. "I.1", "II.1a", "III.1"
  questionId: string;
  section: 'part1' | 'part2' | 'part3';
  questionNumber: number;
  subQuestion?: 'a' | 'b' | 'c' | 'd';
  answerType: 'choice' | 'true_false' | 'short_answer';
  correctAnswer: string;
  acceptedAnswers?: string[];
  tolerance?: number;
  recognitionStatus: RecognitionStatus;
  recognitionSource: RecognitionSource;
  teacherVerified: boolean;
  notes?: string;
  validationIssues?: string[];
}

export type SectionDetectionMethod = 'roman_header' | 'semantic_header' | 'structure_inferred' | 'ambiguous';

export interface DetectedExamSection {
  id: string;
  rawTitle: string;
  detectedType: QuestionType;
  detectionMethod: SectionDetectionMethod;
  confidence: number;
  needsConfirmation: boolean;
  warning?: string;
  questionCount: number;
  statementCount: number;
  teacherConfirmed?: boolean;
}

export interface AnswerTableCandidate {
  id: string;
  label: string;
  variantCode?: string;
  sectionHint?: 'part1' | 'part2' | 'part3' | 'mixed';
  questionRange?: string;
  itemCount: number;
  previewText: string;
  sourceSnippet?: string;
}

export interface PdfExtractionMeta {
  pageCount: number;
  pagesWithText: number;
  charCount: number;
  isLikelyScanned: boolean;
  warning?: string;
}

export interface ParsedExamResult {
  title: string;
  grade?: ChemGrade;
  totalQuestions: number;
  part1Count: number;
  part2Count: number;
  part2StatementsCount?: number;
  part3Count: number;
  questionsWithAnswers: number;
  questionsMissingAnswers: number;
  questionsWithWarnings: number;
  questions: Question[];
  rawTextPreview?: string;
  
  // Dedicated Answer Recognition Breakdown (Sections V, VI, VIII)
  answerItems: AnswerRecognitionItem[];
  part1FoundCount: number;
  part1TotalCount: number;
  part2StatementsFoundCount: number;
  part2StatementsTotalCount: number;
  part3FoundCount: number;
  part3TotalCount: number;
  allAnswersVerified: boolean;
  successRatePercent?: number;

  // Detected Exam Sections & Confirmation
  detectedSections?: DetectedExamSection[];
  hasAmbiguousSections?: boolean;
  sectionsConfirmed?: boolean;

  // Multi-table / Variant Answer Mapping Confirmation
  answerTableCandidates?: AnswerTableCandidate[];
  selectedAnswerCandidateId?: string;
  hasAmbiguousAnswerMapping?: boolean;
  answerMappingConfirmed?: boolean;
  part3LengthWarningsCount?: number;

  // PDF & Table Extraction Diagnostics
  pdfMeta?: PdfExtractionMeta;
  extractedTables?: {
    id: string;
    sourceType: string;
    surroundingHeader?: string;
    rows: string[][];
  }[];

  // Equation & OMML Parse Diagnostics
  equationWarnings?: string[];
  unsupportedEquationCount?: number;
}

// --- SUPER ADMIN SCHOOL-WIDE QUESTION BANK & AUDIT TYPES ---
export interface AdminSchoolTeacherSummary {
  uid: string;
  name: string;
  email: string;
  role: UserRole;
  school?: string;
  status?: AccountStatus;
  questionCount: number;
  subjectsCount: number;
  lastQuestionAt?: string;
}

export interface AdminSchoolQuestionItem extends Question {
  ownerUid: string;
  ownerName: string;
  ownerEmail: string;
  ownerRole?: UserRole;
  ownerSchool?: string;
  resolvedSubjectId: string;
  resolvedSubjectName: string;
  resolvedTextbookSeries?: string;
}

export interface AdminTeacherSubjectGradeRow {
  teacherUid: string;
  teacherName: string;
  teacherEmail: string;
  subjectId: string;
  subjectName: string;
  grade: string;
  count: number;
}

export interface AdminChapterLessonStat {
  subjectId: string;
  subjectName: string;
  grade: string;
  chapterKey: string;
  chapterName: string;
  lessonKey: string;
  lessonName: string;
  count: number;
}

export interface AdminQuestionBankStats {
  totalTeachersWithQuestions: number;
  totalQuestions: number;
  bySubject: Array<{ subjectId: string; subjectName: string; count: number }>;
  byGrade: Array<{ grade: string; count: number }>;
  byChapterLesson: AdminChapterLessonStat[];
  byLevel: Array<{ level: CognitiveLevel; count: number }>;
  byType: Array<{ type: QuestionType; count: number }>;
  byTeacher: AdminSchoolTeacherSummary[];
  teacherSubjectGradeRows: AdminTeacherSubjectGradeRow[];
}

export interface AdminQuestionBankFilterParams {
  teacherIds?: string[];
  subjectIds?: string[];
  grades?: string[];
  textbookSeries?: string;
  chapter?: string;
  lesson?: string;
  levels?: CognitiveLevel[];
  types?: QuestionType[];
  dateFrom?: string;
  dateTo?: string;
  search?: string;
  sortBy?: 'updatedAt_desc' | 'createdAt_desc' | 'createdAt_asc' | 'code_asc';
  page?: number;
  pageSize?: number;
  includeAllFiltered?: boolean;
}

export interface AdminQuestionBankFilterOptions {
  subjects: Array<{ id: string; name: string }>;
  grades: string[];
  textbookSeries: string[];
  chapters: Array<{ key: string; name: string; subjectId: string; grade: string }>;
  lessons: Array<{ key: string; name: string; chapterKey: string; subjectId: string; grade: string }>;
}

export interface AdminQuestionBankResponse {
  items: AdminSchoolQuestionItem[];
  totalFiltered: number;
  page: number;
  pageSize: number;
  totalPages: number;
  stats: AdminQuestionBankStats;
  teachers: AdminSchoolTeacherSummary[];
  filterOptions: AdminQuestionBankFilterOptions;
}

export type AdminQuestionAuditAction = 'copy_to_admin' | 'edit_original' | 'delete_original';

export interface AdminQuestionAuditLog {
  id: string;
  action: AdminQuestionAuditAction;
  questionId: string;
  questionCode: string;
  copiedQuestionId?: string;
  originalOwnerId: string;
  originalOwnerName: string;
  originalOwnerEmail?: string;
  actorUid: string;
  actorName: string;
  actorEmail?: string;
  reason: string;
  beforeSummary: string;
  afterSummary?: string;
  createdAt: string;
}

declare global {
  const __APP_URL__: string | undefined;
  const __PRODUCTION_APP_URL__: string | undefined;
}
