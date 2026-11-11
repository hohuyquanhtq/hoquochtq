import { User, Question, Exam, Folder, StudentSubmission } from '../types';
import { parseExamContent, SAMPLE_CHEMISTRY_EXAMS } from '../utils/docxParser';

const STORAGE_KEYS = {
  CURRENT_USER: 'chemtest_current_user',
  QUESTIONS: 'chemtest_questions',
  EXAMS: 'chemtest_exams',
  FOLDERS: 'chemtest_folders',
  SUBMISSIONS: 'chemtest_submissions',
  CLASSES: 'chemtest_classes',
};

// Initial Demo Users
export const DEFAULT_USERS: User[] = [
  {
    id: 'teacher_1',
    name: 'Hồ Ngọc Quốc',
    email: 'quochn@chuyennguyenbinhkhiem.edu.vn',
    role: 'teacher',
    school: 'Trường THPT chuyên Nguyễn Bỉnh Khiêm, Tp. Đà Nẵng',
    createdAt: new Date().toISOString(),
  },
  {
    id: 'student_1',
    name: 'Trần Minh Khang',
    email: 'khang.tm@student.edu.vn',
    role: 'student',
    className: '12 Hóa 1',
    school: 'Trường THPT chuyên Nguyễn Bỉnh Khiêm, Tp. Đà Nẵng',
    createdAt: new Date().toISOString(),
  },
  {
    id: 'admin_1',
    name: 'Ban Giám Hiệu & Quản Trị Hệ Thống',
    email: 'admin@hqtest.edu.vn',
    role: 'admin',
    school: 'Trường THPT chuyên Nguyễn Bỉnh Khiêm, Tp. Đà Nẵng',
    createdAt: new Date().toISOString(),
  },
];

// Initial Folders
export const DEFAULT_FOLDERS: Folder[] = [
  { id: 'f_10_chuyen', name: 'Lớp 10 chuyên Hóa', grade: '10', color: 'blue', authorId: 'teacher_1', createdAt: new Date().toISOString(), itemCount: 12 },
  { id: 'f_11_chuyen', name: 'Lớp 11 chuyên Hóa', grade: '11', color: 'indigo', authorId: 'teacher_1', createdAt: new Date().toISOString(), itemCount: 15 },
  { id: 'f_12_chuyen', name: 'Lớp 12 chuyên Hóa', grade: '12', color: 'emerald', authorId: 'teacher_1', createdAt: new Date().toISOString(), itemCount: 28 },
  { id: 'f_hsg_city', name: 'Ôn thi học sinh giỏi cấp thành phố', grade: 'chuyen_hsg', color: 'amber', authorId: 'teacher_1', createdAt: new Date().toISOString(), itemCount: 20 },
  { id: 'f_hsg_nat', name: 'Ôn thi học sinh giỏi quốc gia', grade: 'chuyen_hsg', color: 'purple', authorId: 'teacher_1', createdAt: new Date().toISOString(), itemCount: 18 },
  { id: 'f_regular', name: 'Kiểm tra thường xuyên 15 phút', grade: '12', color: 'sky', authorId: 'teacher_1', createdAt: new Date().toISOString(), itemCount: 10 },
  { id: 'f_midterm', name: 'Kiểm tra giữa kỳ & cuối kỳ', grade: '12', color: 'rose', authorId: 'teacher_1', createdAt: new Date().toISOString(), itemCount: 8 },
];

// Initial Rich Chemistry Question Bank
export const DEFAULT_QUESTIONS: Question[] = [
  // --- PHẦN I: 4 LỰA CHỌN ---
  {
    id: 'q_001',
    code: 'H12_HC_001',
    type: 'part1_single_choice',
    grade: '12',
    topic: 'hoa_huu_co',
    level: 'nhan_biet',
    folderId: 'f_12_chuyen',
    content: 'Tên gọi gốc – chức của hợp chất amine có công thức phân tử C2H7N và công thức cấu tạo CH3-CH2-NH2 là',
    options: [
      { id: 'A', text: 'ethylamine', isCorrect: true },
      { id: 'B', text: 'methylamine' },
      { id: 'C', text: 'methanamine' },
      { id: 'D', text: 'ethanamine' },
    ],
    correctOptionId: 'A',
    explanation: 'Hợp chất CH3-CH2-NH2 gồm gốc ethyl (CH3-CH2-) gắn với nhóm amino (-NH2), tên gốc - chức là ethylamine. (Tên thay thế theo IUPAC là ethanamine).',
    source: 'Đề minh họa 2025 - Bộ GD&ĐT',
    authorId: 'teacher_1',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    parseStatus: 'verified',
  },
  {
    id: 'q_002',
    code: 'H12_VC_002',
    type: 'part1_single_choice',
    grade: '12',
    topic: 'hoa_vo_co',
    level: 'nhan_biet',
    folderId: 'f_12_chuyen',
    content: 'Trong công nghiệp hiện đại, kim loại nhôm (Al) được sản xuất chủ yếu bằng phương pháp điện phân nóng chảy hợp chất nào sau đây?',
    options: [
      { id: 'A', text: 'AlCl3' },
      { id: 'B', text: 'Al2O3 với chất xúc tác criolit (Na3AlF6)', isCorrect: true },
      { id: 'C', text: 'Al(NO3)3' },
      { id: 'D', text: 'Al2(SO4)3' },
    ],
    correctOptionId: 'B',
    explanation: 'Quá trình Hall–Héroult điện phân Al2O3 nóng chảy hòa tan trong criolit Na3AlF6 (giảm nhiệt độ nóng chảy từ 2050°C xuống khoảng 950°C và tăng độ dẫn điện).',
    source: 'SGK Hóa học 12 Chân Trời Sáng Tạo',
    authorId: 'teacher_1',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    parseStatus: 'verified',
  },
  {
    id: 'q_003',
    code: 'H12_HC_003',
    type: 'part1_single_choice',
    grade: '12',
    topic: 'hoa_huu_co',
    level: 'thong_hieu',
    folderId: 'f_12_chuyen',
    content: 'Thủy phân hoàn toàn ester đơn chức X có công thức phân tử C4H8O2 trong dung dịch NaOH đun nóng, thu được muối sodium acetate (CH3COONa). Công thức cấu tạo thu gọn của X là',
    options: [
      { id: 'A', text: 'HCOOCH2CH2CH3' },
      { id: 'B', text: 'CH3COOCH2CH3', isCorrect: true },
      { id: 'C', text: 'CH3COOCH3' },
      { id: 'D', text: 'C2H5COOCH3' },
    ],
    correctOptionId: 'B',
    explanation: 'Muối là CH3COONa nên gốc axit là CH3COO-. Do X là C4H8O2, phần còn lại là gốc ethyl -C2H5. Công thức ester là CH3COOC2H5 (ethyl acetate).',
    source: 'Đề thi THPT Quốc Gia',
    authorId: 'teacher_1',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    parseStatus: 'verified',
  },
  {
    id: 'q_004',
    code: 'H11_DC_004',
    type: 'part1_single_choice',
    grade: '11',
    topic: 'hoa_dai_cuong',
    level: 'thong_hieu',
    folderId: 'f_11_chuyen',
    content: 'Cho cân bằng hóa học sau trong bình kín: N2(k) + 3H2(k) <=> 2NH3(k); ΔrH°298 = -92 kJ. Cân bằng chuyển dịch theo chiều thuận khi',
    options: [
      { id: 'A', text: 'tăng nhiệt độ của hệ phản ứng' },
      { id: 'B', text: 'tăng áp suất chung của hệ', isCorrect: true },
      { id: 'C', text: 'giảm nồng độ khí N2' },
      { id: 'D', text: 'thêm chất xúc tác Fe vào hệ' },
    ],
    correctOptionId: 'B',
    explanation: 'Theo nguyên lý Le Chatelier: Phản ứng tỏa nhiệt (ΔH < 0), giảm số mol khí (4 mol -> 2 mol). Khi tăng áp suất, cân bằng dịch chuyển theo chiều làm giảm số mol khí (chiều thuận).',
    source: 'Cân bằng Hóa học 11',
    authorId: 'teacher_1',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    parseStatus: 'verified',
  },
  {
    id: 'q_005',
    code: 'HSG_PC_005',
    type: 'part1_single_choice',
    grade: 'chuyen_hsg',
    topic: 'chuyen_sau_hsg',
    level: 'van_dung_cao',
    folderId: 'f_hsg_nat',
    content: 'Phức chất bát diện [Co(NH3)6]3+ có từ tính là nghịch từ (diamagnetic). Theo thuyết trường phối tử, cấu hình electron của ion trung tâm Co3+ (d6) trong trường bát diện này là',
    options: [
      { id: 'A', text: '(t2g)^4 (eg)^2' },
      { id: 'B', text: '(t2g)^6 (eg)^0', isCorrect: true },
      { id: 'C', text: '(t2g)^3 (eg)^3' },
      { id: 'D', text: '(t2g)^5 (eg)^1' },
    ],
    correctOptionId: 'B',
    explanation: 'Phối tử NH3 là phối tử trường mạnh, năng lượng tách Δoct lớn hơn năng lượng ghép đôi electron P. Do đó 6 electron d đều dồn vào phân mức năng lượng thấp t2g: (t2g)^6 (eg)^0, không có electron độc thân -> nghịch từ.',
    source: 'Đề thi HSG Quốc gia Hóa học',
    authorId: 'teacher_1',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    parseStatus: 'verified',
  },

  // --- PHẦN II: TRẮC NGHIỆM ĐÚNG - SAI ---
  {
    id: 'q_006',
    code: 'H12_TN_006',
    type: 'part2_true_false',
    grade: '12',
    topic: 'hoa_thuc_nghiem',
    level: 'van_dung',
    folderId: 'f_12_chuyen',
    content: 'Một nhóm học sinh tiến hành thí nghiệm điều chế ester propyl acetate từ acetic acid (CH3COOH) và propan-1-ol (CH3CH2CH2OH) với xúc tác H2SO4 đặc: \nCH3COOH + CH3CH2CH2OH <=> CH3COOCH2CH2CH3 + H2O\nSau khi đun nóng cách thủy khoảng 15 phút, để nguội hỗn hợp rồi rót vào ống nghiệm chứa dung dịch NaCl bão hòa.',
    statements: [
      { id: 'a', statement: 'Phản ứng trên thuộc loại phản ứng thuận nghịch và có tốc độ chậm ở nhiệt độ thường.', correctAnswer: true, explanation: 'Phản ứng ester hóa là phản ứng thuận nghịch có xúc tác acid và đun nóng.' },
      { id: 'b', statement: 'Axít H2SO4 đặc đóng vai trò vừa là chất xúc tác, vừa hút nước làm chuyển dịch cân bằng theo chiều thuận.', correctAnswer: true, explanation: 'H2SO4 đặc háo nước giúp hút sản phẩm nước tạo thành.' },
      { id: 'c', statement: 'Mục đích thêm dung dịch NaCl bão hòa là để tăng tỷ trọng của lớp chất lỏng phía dưới, giúp ester nhẹ hơn tách lớp rõ rệt.', correctAnswer: true, explanation: 'Ester ít tan trong nước và muối, nổi lên trên bề mặt.' },
      { id: 'd', statement: 'Có thể thay thế hoàn toàn H2SO4 đặc bằng dung dịch HCl đặc làm xúc tác mà hiệu suất không thay đổi.', correctAnswer: false, explanation: 'HCl đặc bay hơi nhiều và không có tính háo nước mạnh như H2SO4 đặc, hiệu suất sẽ thấp hơn đáng kể.' },
    ],
    explanation: 'Các ý a, b, c đúng; ý d sai do đặc tính hóa lý của axit clohiđric.',
    source: 'Thí nghiệm thực hành Hóa 12',
    authorId: 'teacher_1',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    parseStatus: 'verified',
  },
  {
    id: 'q_007',
    code: 'H12_DH_007',
    type: 'part2_true_false',
    grade: '12',
    topic: 'hoa_vo_co',
    level: 'van_dung',
    folderId: 'f_12_chuyen',
    content: 'Cho pin điện hóa kẽm – đồng (pin Daniell) gồm thanh Zn nhúng trong dung dịch ZnSO4 1M và thanh Cu nhúng trong dung dịch CuSO4 1M được nối với nhau qua cầu muối chứa KNO3. \nBiết E°(Zn2+/Zn) = -0,76 V và E°(Cu2+/Cu) = +0,34 V.',
    statements: [
      { id: 'a', statement: 'Thanh kẽm (Zn) là cực âm (anode), tại đây xảy ra quá trình oxi hóa: Zn -> Zn2+ + 2e.', correctAnswer: true },
      { id: 'b', statement: 'Sức điện động chuẩn của pin Daniell có giá trị là E°pin = 1,10 V.', correctAnswer: true, explanation: 'E°pin = E°(catot) - E°(anot) = 0,34 - (-0,76) = 1,10 V.' },
      { id: 'c', statement: 'Dòng electron dịch chuyển trong dây dẫn ngoài từ cực đồng sang cực kẽm.', correctAnswer: false, explanation: 'Electron di chuyển từ cực âm (Zn) sang cực dương (Cu).' },
      { id: 'd', statement: 'Cầu muối có vai trò đóng kín mạch điện và duy trì tính trung hòa điện tích giữa hai dung dịch điện cực.', correctAnswer: true },
    ],
    explanation: 'Ý c sai vì dòng e di chuyển từ anode (Zn) sang cathode (Cu).',
    source: 'Chuyên đề Pin điện hóa & Điện phân',
    authorId: 'teacher_1',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    parseStatus: 'verified',
  },

  // --- PHẦN III: TRẮC NGHIỆM TRẢ LỜI NGẮN ---
  {
    id: 'q_008',
    code: 'H12_TL_008',
    type: 'part3_short_answer',
    grade: '12',
    topic: 'hoa_huu_co',
    level: 'van_dung',
    folderId: 'f_12_chuyen',
    content: 'Amine X là hợp chất no, mạch hở, đơn chức có công thức phân tử C4H11N. Hãy xác định tổng số đồng phân cấu tạo amine bậc 1 thỏa mãn công thức của X.',
    shortAnswerConfig: {
      acceptableAnswers: ['4', '4.0', '4,0', 'bốn'],
      isNumeric: true,
      numericValue: 4,
      tolerance: 0,
      unit: 'đồng phân',
    },
    explanation: 'Các amine bậc 1 có nhóm -NH2 gắn vào gốc butyl (C4H9-). Gốc C4H9- có 4 dạng cấu tạo: butyl, sec-butyl, isobutyl, tert-butyl. Vậy có 4 đồng phân amine bậc 1.',
    source: 'Đề minh họa BGD 2025',
    authorId: 'teacher_1',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    parseStatus: 'verified',
  },
  {
    id: 'q_009',
    code: 'H11_TL_009',
    type: 'part3_short_answer',
    grade: '11',
    topic: 'hoa_dai_cuong',
    level: 'thong_hieu',
    folderId: 'f_11_chuyen',
    content: 'Hòa tan hoàn toàn 0,001 mol khí hydrogen chloride (HCl) vào nước cất để thu được 100 mL dung dịch X ở 25 °C. Tính giá trị pH của dung dịch X.',
    shortAnswerConfig: {
      acceptableAnswers: ['2', '2.0', '2,0'],
      isNumeric: true,
      numericValue: 2.0,
      tolerance: 0.05,
    },
    explanation: 'Nồng độ HCl = [H+] = 0,001 mol / 0,1 L = 0,01 M = 10^-2 M. Giá trị pH = -log(0,01) = 2,0.',
    source: 'Sự điện ly & pH dung dịch',
    authorId: 'teacher_1',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    parseStatus: 'verified',
  },
  {
    id: 'q_010',
    code: 'H12_TL_010',
    type: 'part3_short_answer',
    grade: '12',
    topic: 'hoa_vo_co',
    level: 'van_dung',
    folderId: 'f_12_chuyen',
    content: 'Cho 5,4 gam bột nhôm (Al, khối lượng mol 27 g/mol) tác dụng hoàn toàn với lượng dư dung dịch HCl loãng. Thể tích khí H2 (đktc, tính bằng lít) thoát ra là bao nhiêu?',
    shortAnswerConfig: {
      acceptableAnswers: ['6.72', '6,72'],
      isNumeric: true,
      numericValue: 6.72,
      tolerance: 0.05,
      unit: 'lít',
    },
    explanation: 'Số mol Al = 5,4 / 27 = 0,2 mol. Phản ứng: 2Al + 6HCl -> 2AlCl3 + 3H2. Số mol H2 = 0,2 * 1,5 = 0,3 mol. Thể tích V = 0,3 * 22,4 = 6,72 lít.',
    source: 'Kim loại nhóm IIIA',
    authorId: 'teacher_1',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    parseStatus: 'verified',
  },
];

// Parse the attached sample exam (Đề số 5 - Mẫu PDF đính kèm)
const de5Sample = SAMPLE_CHEMISTRY_EXAMS.find(s => s.id === 'sample_attached_exam_de5') || SAMPLE_CHEMISTRY_EXAMS[0];
const parsedDe5 = parseExamContent(de5Sample.content, '12');

export const ATTACHED_EXAM_DE5: Exam = {
  id: 'exam_de5_attached',
  title: 'Đề kiểm tra Giữa kì 1 Hóa 12 (Đề số 5 - Mẫu PDF đính kèm)',
  code: 'HOA12-DE5',
  folderId: 'f_midterm',
  grade: '12',
  topic: 'hoa_huu_co',
  durationMinutes: 45,
  totalQuestions: parsedDe5.questions.length, // 21
  totalScore: 10.0,
  questions: parsedDe5.questions,
  rules: {
    part1ScorePerQuestion: 0.25,
    part2GradingModel: 'standard_moet',
    part3ScorePerQuestion: 0.714,
    totalTargetScore: 10.0,
  },
  shuffleQuestions: false,
  shuffleOptions: false,
  isPublished: true,
  maxAttempts: 3,
  showScoreAfterSubmit: true,
  showAnswersAfterSubmit: true,
  showSolutionsAfterSubmit: true,
  allowReviewLater: true,
  authorId: 'teacher_1',
  authorName: 'Hồ Ngọc Quốc',
  createdAt: new Date(Date.now() - 1 * 86400000).toISOString(),
  updatedAt: new Date().toISOString(),
};

// Initial Exams
export const DEFAULT_EXAMS: Exam[] = [
  ATTACHED_EXAM_DE5,
  {
    id: 'exam_chem12_01',
    title: 'Đề kiểm tra Hóa học 12 - Chuyên đề Amine, Amino Acid & Pin Điện Hóa',
    code: 'CHEM12',
    folderId: 'f_12_chuyen',
    grade: '12',
    topic: 'hoa_huu_co',
    durationMinutes: 45,
    totalQuestions: 8,
    totalScore: 10.0,
    questions: [
      DEFAULT_QUESTIONS[0], // Part 1 - 0.5đ
      DEFAULT_QUESTIONS[1], // Part 1 - 0.5đ
      DEFAULT_QUESTIONS[2], // Part 1 - 0.5đ
      DEFAULT_QUESTIONS[3], // Part 1 - 0.5đ
      DEFAULT_QUESTIONS[4], // Part 1 - 0.5đ
      DEFAULT_QUESTIONS[5], // Part 2 - 2.5đ
      DEFAULT_QUESTIONS[6], // Part 2 - 2.5đ
      DEFAULT_QUESTIONS[7], // Part 3 - 1.25đ
      DEFAULT_QUESTIONS[8], // Part 3 - 1.25đ
    ],
    rules: {
      part1ScorePerQuestion: 0.5,
      part2GradingModel: 'standard_moet',
      part3ScorePerQuestion: 1.25,
      totalTargetScore: 10.0,
    },
    shuffleQuestions: true,
    shuffleOptions: true,
    isPublished: true,
    maxAttempts: 2,
    showScoreAfterSubmit: true,
    showAnswersAfterSubmit: true,
    showSolutionsAfterSubmit: true,
    allowReviewLater: true,
    authorId: 'teacher_1',
    authorName: 'Hồ Ngọc Quốc',
    createdAt: new Date(Date.now() - 3 * 86400000).toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'exam_olymp_01',
    title: 'Khảo sát Năng lực Đội tuyển Học Sinh Giỏi Hóa Học - Đợt 1',
    code: 'OLYMP1',
    folderId: 'f_hsg_nat',
    grade: 'chuyen_hsg',
    topic: 'chuyen_sau_hsg',
    durationMinutes: 60,
    totalQuestions: 5,
    totalScore: 10.0,
    questions: [
      DEFAULT_QUESTIONS[4],
      DEFAULT_QUESTIONS[3],
      DEFAULT_QUESTIONS[5],
      DEFAULT_QUESTIONS[6],
      DEFAULT_QUESTIONS[7],
    ],
    rules: {
      part1ScorePerQuestion: 1.0,
      part2GradingModel: 'standard_moet',
      part3ScorePerQuestion: 2.0,
      totalTargetScore: 10.0,
    },
    shuffleQuestions: false,
    shuffleOptions: true,
    isPublished: true,
    maxAttempts: 1,
    showScoreAfterSubmit: true,
    showAnswersAfterSubmit: false,
    showSolutionsAfterSubmit: false,
    allowReviewLater: false,
    authorId: 'teacher_1',
    authorName: 'Hồ Ngọc Quốc',
    createdAt: new Date(Date.now() - 5 * 86400000).toISOString(),
    updatedAt: new Date().toISOString(),
  },
];

// Initial Student Submissions
export const DEFAULT_SUBMISSIONS: StudentSubmission[] = [
  {
    id: 'sub_001',
    examId: 'exam_chem12_01',
    examTitle: 'Đề kiểm tra Hóa học 12 - Chuyên đề Amine, Amino Acid & Pin Điện Hóa',
    examCode: 'CHEM12',
    studentId: 'student_1',
    studentName: 'Trần Minh Khang',
    studentClass: '12 Hóa 1',
    startedAt: new Date(Date.now() - 3600000).toISOString(),
    submittedAt: new Date(Date.now() - 1200000).toISOString(),
    durationSeconds: 2400,
    answers: {
      q_001: { questionId: 'q_001', questionType: 'part1_single_choice', selectedOptionId: 'A' },
      q_002: { questionId: 'q_002', questionType: 'part1_single_choice', selectedOptionId: 'B' },
      q_003: { questionId: 'q_003', questionType: 'part1_single_choice', selectedOptionId: 'B' },
      q_004: { questionId: 'q_004', questionType: 'part1_single_choice', selectedOptionId: 'B' },
      q_005: { questionId: 'q_005', questionType: 'part1_single_choice', selectedOptionId: 'B' },
      q_006: { questionId: 'q_006', questionType: 'part2_true_false', selectedStatements: { a: true, b: true, c: true, d: false } },
      q_007: { questionId: 'q_007', questionType: 'part2_true_false', selectedStatements: { a: true, b: true, c: false, d: true } },
      q_008: { questionId: 'q_008', questionType: 'part3_short_answer', textAnswer: '4' },
      q_009: { questionId: 'q_009', questionType: 'part3_short_answer', textAnswer: '2.0' },
    },
    part1Score: 2.5,
    part2Score: 5.0,
    part3Score: 2.5,
    totalScore: 10.0,
    maxPossibleScore: 10.0,
    correctQuestionsCount: 9,
    tabSwitchesCount: 0,
    status: 'completed',
  },
  {
    id: 'sub_002',
    examId: 'exam_chem12_01',
    examTitle: 'Đề kiểm tra Hóa học 12 - Chuyên đề Amine, Amino Acid & Pin Điện Hóa',
    examCode: 'CHEM12',
    studentId: 'st_002',
    studentName: 'Lê Thùy Dương',
    studentClass: '12 Hóa 1',
    startedAt: new Date(Date.now() - 7200000).toISOString(),
    submittedAt: new Date(Date.now() - 4800000).toISOString(),
    durationSeconds: 2400,
    answers: {},
    part1Score: 2.0,
    part2Score: 4.25,
    part3Score: 2.5,
    totalScore: 8.75,
    maxPossibleScore: 10.0,
    correctQuestionsCount: 7,
    tabSwitchesCount: 1,
    status: 'completed',
  },
  {
    id: 'sub_003',
    examId: 'exam_chem12_01',
    examTitle: 'Đề kiểm tra Hóa học 12 - Chuyên đề Amine, Amino Acid & Pin Điện Hóa',
    examCode: 'CHEM12',
    studentId: 'st_003',
    studentName: 'Nguyễn Văn Hoàng',
    studentClass: '12 Hóa 2',
    startedAt: new Date(Date.now() - 10800000).toISOString(),
    submittedAt: new Date(Date.now() - 8400000).toISOString(),
    durationSeconds: 2400,
    answers: {},
    part1Score: 2.0,
    part2Score: 3.5,
    part3Score: 1.25,
    totalScore: 6.75,
    maxPossibleScore: 10.0,
    correctQuestionsCount: 6,
    tabSwitchesCount: 2,
    status: 'completed',
  },
  {
    id: 'sub_004',
    examId: 'exam_chem12_01',
    examTitle: 'Đề kiểm tra Hóa học 12 - Chuyên đề Amine, Amino Acid & Pin Điện Hóa',
    examCode: 'CHEM12',
    studentId: 'st_004',
    studentName: 'Vũ Quốc Bảo',
    studentClass: '12 Hóa 1',
    startedAt: new Date(Date.now() - 14400000).toISOString(),
    submittedAt: new Date(Date.now() - 12000000).toISOString(),
    durationSeconds: 2400,
    answers: {},
    part1Score: 2.5,
    part2Score: 5.0,
    part3Score: 2.0,
    totalScore: 9.5,
    maxPossibleScore: 10.0,
    correctQuestionsCount: 8,
    tabSwitchesCount: 0,
    status: 'completed',
  },
];

/**
 * Storage Service Helper Functions
 */
export const StorageService = {
  getCurrentUser(): User {
    const saved = localStorage.getItem(STORAGE_KEYS.CURRENT_USER);
    if (saved) {
      try {
        const u: User = JSON.parse(saved);
        if (u.name && u.name.includes('Nguyễn Hoàng Long')) {
          u.name = 'Hồ Ngọc Quốc';
          u.school = 'Trường THPT chuyên Nguyễn Bỉnh Khiêm, Tp. Đà Nẵng';
          u.email = 'quochn@chuyennguyenbinhkhiem.edu.vn';
          this.setCurrentUser(u);
        }
        return u;
      } catch {
        // fallback
      }
    }
    return DEFAULT_USERS[0]; // Default: Teacher
  },

  setCurrentUser(user: User): void {
    localStorage.setItem(STORAGE_KEYS.CURRENT_USER, JSON.stringify(user));
  },

  getQuestions(): Question[] {
    const saved = localStorage.getItem(STORAGE_KEYS.QUESTIONS);
    if (saved) {
      try {
        const list: Question[] = JSON.parse(saved);
        if (!list.some(q => q.code?.includes('P1_C1') || q.content?.includes('methyl salicylate'))) {
          const merged = [...parsedDe5.questions, ...list];
          this.saveQuestions(merged);
          return merged;
        }
        return list;
      } catch {}
    }
    const initialList = [...parsedDe5.questions, ...DEFAULT_QUESTIONS];
    this.saveQuestions(initialList);
    return initialList;
  },

  saveQuestions(questions: Question[]): void {
    localStorage.setItem(STORAGE_KEYS.QUESTIONS, JSON.stringify(questions));
  },

  addQuestion(question: Question): void {
    const questions = this.getQuestions();
    questions.unshift(question);
    this.saveQuestions(questions);
  },

  updateQuestion(question: Question): void {
    const questions = this.getQuestions();
    const idx = questions.findIndex(q => q.id === question.id);
    if (idx !== -1) {
      questions[idx] = question;
      this.saveQuestions(questions);
    }
  },

  deleteQuestion(id: string): void {
    const questions = this.getQuestions().filter(q => q.id !== id);
    this.saveQuestions(questions);
  },

  getFolders(): Folder[] {
    const saved = localStorage.getItem(STORAGE_KEYS.FOLDERS);
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch {}
    }
    this.saveFolders(DEFAULT_FOLDERS);
    return DEFAULT_FOLDERS;
  },

  saveFolders(folders: Folder[]): void {
    localStorage.setItem(STORAGE_KEYS.FOLDERS, JSON.stringify(folders));
  },

  getExams(): Exam[] {
    const saved = localStorage.getItem(STORAGE_KEYS.EXAMS);
    if (saved) {
      try {
        const list: Exam[] = JSON.parse(saved);
        let changed = false;
        if (!list.some(e => e.id === 'exam_de5_attached')) {
          list.unshift(ATTACHED_EXAM_DE5);
          changed = true;
        }
        list.forEach(e => {
          if (e.authorName && e.authorName.includes('Nguyễn Hoàng Long')) {
            e.authorName = 'Hồ Ngọc Quốc';
            changed = true;
          }
        });
        if (changed) {
          this.saveExams(list);
        }
        return list;
      } catch {}
    }
    this.saveExams(DEFAULT_EXAMS);
    return DEFAULT_EXAMS;
  },

  saveExams(exams: Exam[]): void {
    localStorage.setItem(STORAGE_KEYS.EXAMS, JSON.stringify(exams));
  },

  getExamById(id: string): Exam | undefined {
    return this.getExams().find(e => e.id === id);
  },

  getExamByCode(code: string): Exam | undefined {
    return this.getExams().find(e => e.code.toUpperCase() === code.trim().toUpperCase());
  },

  getSubmissions(examId?: string): StudentSubmission[] {
    const saved = localStorage.getItem(STORAGE_KEYS.SUBMISSIONS);
    let subs = DEFAULT_SUBMISSIONS;
    if (saved) {
      try {
        subs = JSON.parse(saved);
      } catch {}
    } else {
      this.saveSubmissions(DEFAULT_SUBMISSIONS);
    }
    if (examId) {
      return subs.filter(s => s.examId === examId);
    }
    return subs;
  },

  saveSubmissions(subs: StudentSubmission[]): void {
    localStorage.setItem(STORAGE_KEYS.SUBMISSIONS, JSON.stringify(subs));
  },

  addSubmission(sub: StudentSubmission): void {
    const subs = this.getSubmissions();
    subs.unshift(sub);
    this.saveSubmissions(subs);
  },

  // Export full JSON database for Admin/Teacher backup
  exportDatabaseJson(): string {
    const data = {
      version: '1.0',
      exportedAt: new Date().toISOString(),
      folders: this.getFolders(),
      questions: this.getQuestions(),
      exams: this.getExams(),
      submissions: this.getSubmissions(),
    };
    return JSON.stringify(data, null, 2);
  },

  // Restore database from JSON
  restoreDatabaseJson(jsonString: string): boolean {
    try {
      const data = JSON.parse(jsonString);
      if (data.folders) this.saveFolders(data.folders);
      if (data.questions) this.saveQuestions(data.questions);
      if (data.exams) this.saveExams(data.exams);
      if (data.submissions) this.saveSubmissions(data.submissions);
      return true;
    } catch (err) {
      console.error('Restore failed:', err);
      return false;
    }
  },

  // Reset to default sample dataset
  resetToDefaults(): void {
    this.saveFolders(DEFAULT_FOLDERS);
    this.saveQuestions(DEFAULT_QUESTIONS);
    this.saveExams(DEFAULT_EXAMS);
    this.saveSubmissions(DEFAULT_SUBMISSIONS);
  }
};
