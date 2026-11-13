/**
 * HQTest - Type Definitions
 * Hệ thống ngân hàng câu hỏi, tạo đề và thi trắc nghiệm online
 */

export type UserRole = 'admin' | 'teacher' | 'student';

export interface User {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  avatar?: string;
  className?: string; // For students
  school?: string;
  createdAt: string;
}

export type QuestionType = 
  | 'part1_single_choice'  // Phần I: Trắc nghiệm 4 lựa chọn (A, B, C, D)
  | 'part2_true_false'     // Phần II: Trắc nghiệm Đúng - Sai (4 ý a, b, c, d)
  | 'part3_short_answer';  // Phần III: Trắc nghiệm trả lời ngắn (số/chữ)

export type CognitiveLevel = 
  | 'nhan_biet'   // Nhận biết
  | 'thong_hieu'  // Thông hiểu
  | 'van_dung'    // Vận dụng
  | 'van_dung_cao'; // Vận dụng cao

export type ChemGrade = '10' | '11' | '12' | 'chuyen_hsg';

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
  grade: ChemGrade;
  topic: ChemTopic;
  level: CognitiveLevel;
  folderId?: string;
  
  // Dành cho Phần I (4 lựa chọn)
  options?: MultipleChoiceOption[];
  correctOptionId?: string; // 'A' | 'B' | 'C' | 'D'
  
  // Dành cho Phần II (Đúng / Sai)
  statements?: TrueFalseStatement[];
  
  // Dành cho Phần III (Trả lời ngắn)
  shortAnswerConfig?: ShortAnswerConfig;
  
  // Tài liệu bổ trợ
  imageUrl?: string;          // Sơ đồ thí nghiệm, bảng số liệu, đồ thị
  explanation?: string;       // Hướng dẫn giải chi tiết
  source?: string;            // Đề thi thử THPT Quốc gia 2024, Chuyên Sư Phạm...
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
  rawSourceText?: string;
}

export interface Folder {
  id: string;
  name: string;
  parentId?: string | null;
  description?: string;
  grade?: ChemGrade;
  color?: string;
  authorId: string;
  createdAt: string;
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
  title: string;
  code: string;                 // Mã đề tham gia online, VD: "CHEM12A", "HSG2024"
  folderId?: string;
  grade: ChemGrade;
  topic?: ChemTopic;
  durationMinutes: number;      // Thời gian làm bài (phút), VD: 50 phút
  totalQuestions: number;
  totalScore: number;           // Mặc định 10.0
  
  questions: Question[];
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
  
  authorId: string;
  authorName: string;
  createdAt: string;
  updatedAt: string;
}

export interface StudentAnswer {
  questionId: string;
  questionType: QuestionType;
  
  // Phần I
  selectedOptionId?: string;
  
  // Phần II
  selectedStatements?: Record<string, boolean>; // statementId ('a','b','c','d') -> true (Đúng) | false (Sai)
  
  // Phần III
  textAnswer?: string;
  
  isMarkedForReview?: boolean;
}

export interface StudentSubmission {
  id: string;
  examId: string;
  examTitle: string;
  examCode: string;
  variantCode?: string;
  
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
  correctQuestionsCount: number;
  
  tabSwitchesCount?: number;    // Giám sát rời màn hình thi
  status: 'completed' | 'in_progress' | 'timed_out';
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

  // Equation & OMML Parse Diagnostics
  equationWarnings?: string[];
  unsupportedEquationCount?: number;
}

declare global {
  const __APP_URL__: string | undefined;
  const __PRODUCTION_APP_URL__: string | undefined;
}
