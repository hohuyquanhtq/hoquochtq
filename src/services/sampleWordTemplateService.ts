import {
  AlignmentType,
  BorderStyle,
  Document,
  Footer,
  Packer,
  PageBreak,
  PageNumber,
  Paragraph,
  ShadingType,
  Table,
  TableCell,
  TableRow,
  TextRun,
  VerticalAlign,
  WidthType,
  convertMillimetersToTwip,
} from 'docx';
import { saveAs } from 'file-saver';
import type { Exam, Question } from '../types';
import { renderFormulaTextRuns } from './docxExportService';

const FONT = 'Times New Roman';
const SIZE_12 = 24;
const SIZE_11 = 22;
const SIZE_13 = 26;
const SIZE_10 = 20;

const NO_BORDER = { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' };
const THIN_BORDER = { style: BorderStyle.SINGLE, size: 4, color: '334155' };

const NO_BORDERS = {
  top: NO_BORDER,
  bottom: NO_BORDER,
  left: NO_BORDER,
  right: NO_BORDER,
  insideHorizontal: NO_BORDER,
  insideVertical: NO_BORDER,
};

const ALL_BORDERS = {
  top: THIN_BORDER,
  bottom: THIN_BORDER,
  left: THIN_BORDER,
  right: THIN_BORDER,
  insideHorizontal: THIN_BORDER,
  insideVertical: THIN_BORDER,
};

function txt(
  text: string,
  opts?: { bold?: boolean; italics?: boolean; size?: number; subScript?: boolean; superScript?: boolean }
): TextRun {
  return new TextRun({
    text,
    font: FONT,
    size: opts?.size ?? SIZE_12,
    bold: opts?.bold,
    italics: opts?.italics,
    subScript: opts?.subScript,
    superScript: opts?.superScript,
  });
}

function formulaRuns(text: string, opts?: { bold?: boolean; italics?: boolean; size?: number }): TextRun[] {
  return renderFormulaTextRuns(text, {
    bold: opts?.bold,
    italics: opts?.italics,
    size: opts?.size ?? SIZE_12,
  });
}

function buildOfficialHeaderTable(params: {
  schoolName: string;
  examTitle: string;
  subjectLabel: string;
  durationMinutes: number;
  examCode: string;
}): Table {
  const { schoolName, examTitle, subjectLabel, durationMinutes, examCode } = params;
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: NO_BORDERS,
    rows: [
      new TableRow({
        children: [
          new TableCell({
            width: { size: 44, type: WidthType.PERCENTAGE },
            verticalAlign: VerticalAlign.TOP,
            children: [
              new Paragraph({
                alignment: AlignmentType.CENTER,
                spacing: { after: 40 },
                children: [txt('SỞ GIÁO DỤC VÀ ĐÀO TẠO TP. ĐÀ NẴNG', { size: SIZE_11 })],
              }),
              new Paragraph({
                alignment: AlignmentType.CENTER,
                spacing: { after: 60 },
                children: [txt(schoolName.toUpperCase(), { bold: true, size: SIZE_11 })],
              }),
              new Paragraph({
                alignment: AlignmentType.CENTER,
                children: [txt('(Đề kiểm tra gồm 03 phần theo chuẩn GDPT 2018)', { italics: true, size: SIZE_10 })],
              }),
            ],
          }),
          new TableCell({
            width: { size: 56, type: WidthType.PERCENTAGE },
            verticalAlign: VerticalAlign.TOP,
            children: [
              new Paragraph({
                alignment: AlignmentType.CENTER,
                spacing: { after: 40 },
                children: [txt(examTitle.toUpperCase(), { bold: true, size: SIZE_12 })],
              }),
              new Paragraph({
                alignment: AlignmentType.CENTER,
                spacing: { after: 40 },
                children: [txt(`Môn: ${subjectLabel} — Thời gian làm bài: ${durationMinutes} phút`, { bold: true, size: SIZE_11 })],
              }),
              new Paragraph({
                alignment: AlignmentType.CENTER,
                children: [txt(`Mã đề: ${examCode}`, { bold: true, size: SIZE_11 })],
              }),
            ],
          }),
        ],
      }),
    ],
  });
}

function buildFooter(): Footer {
  return new Footer({
    children: [
      new Paragraph({
        alignment: AlignmentType.RIGHT,
        children: [
          txt('Hệ thống HQTest · Chuẩn GDPT 2018 — Trang ', { italics: true, size: SIZE_10 }),
          new TextRun({ children: [PageNumber.CURRENT], font: FONT, size: SIZE_10, italics: true }),
          txt(' / ', { italics: true, size: SIZE_10 }),
          new TextRun({ children: [PageNumber.TOTAL_PAGES], font: FONT, size: SIZE_10, italics: true }),
        ],
      }),
    ],
  });
}

function sanitizeFileSlug(raw: string): string {
  return (
    (raw || 'De_Hoa_Hoc_HQTest')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/đ/g, 'd')
      .replace(/Đ/g, 'D')
      .replace(/[^a-zA-Z0-9_-]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .slice(0, 64) || 'De_Hoa_Hoc_HQTest'
  );
}

/**
 * Tạo và tải xuống file Word (.docx) mẫu chuẩn cấu trúc 3 phần môn Hóa học GDPT 2018.
 * File này tương thích 100% với bộ bóc tách ExamUploader và có thể in ấn trực tiếp.
 */
export async function downloadStandardChemistryWordTemplate(): Promise<void> {
  const sampleQuestions: Question[] = [
    {
      id: 'tpl_p1_1',
      code: 'HH12-NB-01',
      type: 'part1_single_choice',
      grade: '12',
      topic: 'hoa_huu_co',
      chapterName: 'Ester – Lipid',
      level: 'nhan_biet',
      content: 'Công thức phân tử của ethyl acetate là',
      options: [
        { id: 'A', text: 'CH_3COOC_2H_5', isCorrect: true },
        { id: 'B', text: 'HCOOC_2H_5', isCorrect: false },
        { id: 'C', text: 'CH_3COOCH_3', isCorrect: false },
        { id: 'D', text: 'C_2H_5COOCH_3', isCorrect: false },
      ],
      correctOptionId: 'A',
      explanation: 'Ethyl acetate được tạo từ acetic acid (CH_3COOH) và ethanol (C_2H_5OH), có công thức CH_3COOC_2H_5.',
      authorId: 'template',
      createdAt: '',
      updatedAt: '',
    },
    {
      id: 'tpl_p1_2',
      code: 'HH12-TH-02',
      type: 'part1_single_choice',
      grade: '12',
      topic: 'hoa_huu_co',
      chapterName: 'Carbohydrate',
      level: 'thong_hieu',
      content: 'Thủy phân hoàn toàn saccharose (C_{12}H_{22}O_{11}) trong môi trường acid (H_2SO_4 loãng, đun nóng) thu được hai monosaccharide là',
      options: [
        { id: 'A', text: 'glucose và galactose.', isCorrect: false },
        { id: 'B', text: 'glucose và fructose.', isCorrect: true },
        { id: 'C', text: 'fructose và maltose.', isCorrect: false },
        { id: 'D', text: 'chỉ có glucose.', isCorrect: false },
      ],
      correctOptionId: 'B',
      explanation: 'C_{12}H_{22}O_{11} + H_2O -> C_6H_{12}O_6 (glucose) + C_6H_{12}O_6 (fructose).',
      authorId: 'template',
      createdAt: '',
      updatedAt: '',
    },
    {
      id: 'tpl_p1_3',
      code: 'HH12-TH-03',
      type: 'part1_single_choice',
      grade: '12',
      topic: 'hoa_huu_co',
      chapterName: 'Hợp chất chứa nitrogen',
      level: 'thong_hieu',
      content: 'Dung dịch chất nào sau đây làm quỳ tím chuyển sang màu xanh?',
      options: [
        { id: 'A', text: 'Aniline (C_6H_5NH_2)', isCorrect: false },
        { id: 'B', text: 'Glycine (H_2NCH_2COOH)', isCorrect: false },
        { id: 'C', text: 'Methylamine (CH_3NH_2)', isCorrect: true },
        { id: 'D', text: 'Glutamic acid', isCorrect: false },
      ],
      correctOptionId: 'C',
      explanation: 'Methylamine (CH_3NH_2) có tính base mạnh hơn NH_3, làm quỳ tím ẩm hóa xanh.',
      authorId: 'template',
      createdAt: '',
      updatedAt: '',
    },
    {
      id: 'tpl_p1_4',
      code: 'HH12-VD-04',
      type: 'part1_single_choice',
      grade: '12',
      topic: 'hoa_vo_co',
      chapterName: 'Pin điện và điện phân',
      level: 'van_dung',
      content: 'Cho thế điện cực chuẩn E^0(Zn^{2+}/Zn) = -0,762 V và E^0(Cu^{2+}/Cu) = +0,340 V. Sức điện động chuẩn của pin Galvani Zn–Cu là',
      options: [
        { id: 'A', text: '0,422 V', isCorrect: false },
        { id: 'B', text: '1,102 V', isCorrect: true },
        { id: 'C', text: '1,020 V', isCorrect: false },
        { id: 'D', text: '0,762 V', isCorrect: false },
      ],
      correctOptionId: 'B',
      explanation: 'E^0_{pin} = E^0(Cu^{2+}/Cu) - E^0(Zn^{2+}/Zn) = 0,340 - (-0,762) = 1,102 V.',
      authorId: 'template',
      createdAt: '',
      updatedAt: '',
    },
    {
      id: 'tpl_p2_1',
      code: 'HH12-TF-01',
      type: 'part2_true_false',
      grade: '12',
      topic: 'hoa_huu_co',
      chapterName: 'Ester – Lipid',
      level: 'thong_hieu',
      content: 'Tiến hành thí nghiệm xà phòng hóa chất béo tristearin ((C_{17}H_{35}COO)_3C_3H_5) bằng dung dịch NaOH đặc, đun nóng nhẹ và khuấy đều.',
      statements: [
        {
          id: 'a',
          statement: 'Tristearin là triester của glycerol với stearic acid (C_{17}H_{35}COOH).',
          correctAnswer: true,
        },
        {
          id: 'b',
          statement: 'Phản ứng xà phòng hóa tristearin trong dung dịch NaOH là phản ứng thuận nghịch.',
          correctAnswer: false,
        },
        {
          id: 'c',
          statement: 'Sản phẩm thu được gồm muối C_{17}H_{35}COONa (xà phòng) và glycerol (C_3H_5(OH)_3).',
          correctAnswer: true,
        },
        {
          id: 'd',
          statement: 'Thêm dung dịch NaCl bão hòa vào hỗn hợp sau phản ứng để tách muối sodium stearate nổi lên trên.',
          correctAnswer: true,
        },
      ],
      explanation: 'Phản ứng thủy phân ester trong môi trường kiềm là phản ứng một chiều (không thuận nghịch), nên ý b sai.',
      authorId: 'template',
      createdAt: '',
      updatedAt: '',
    },
    {
      id: 'tpl_p3_1',
      code: 'HH12-SA-01',
      type: 'part3_short_answer',
      grade: '12',
      topic: 'hoa_huu_co',
      chapterName: 'Ester – Lipid',
      level: 'van_dung',
      content: 'Đun nóng 8,8 gam ethyl acetate (CH_3COOC_2H_5) với dung dịch NaOH dư đến khi phản ứng xảy ra hoàn toàn. Khối lượng muối CH_3COONa thu được là bao nhiêu gam? (Làm tròn đến phần mười).',
      shortAnswerConfig: {
        acceptableAnswers: ['8,2', '8.2'],
        isNumeric: true,
        numericValue: 8.2,
        tolerance: 0.05,
        unit: 'gam',
      },
      explanation: 'n(CH_3COOC_2H_5) = 8,8 / 88 = 0,1 mol => m(CH_3COONa) = 0,1 × 82 = 8,2 gam.',
      authorId: 'template',
      createdAt: '',
      updatedAt: '',
    },
    {
      id: 'tpl_p3_2',
      code: 'HH12-SA-02',
      type: 'part3_short_answer',
      grade: '12',
      topic: 'hoa_huu_co',
      chapterName: 'Carbohydrate',
      level: 'van_dung',
      content: 'Lên men hoàn toàn 18 gam glucose (C_6H_{12}O_6) thành ethanol với hiệu suất 80%. Khối lượng ethanol (C_2H_5OH) thu được là bao nhiêu gam? (Làm tròn đến hai chữ số thập phân).',
      shortAnswerConfig: {
        acceptableAnswers: ['7,36', '7.36'],
        isNumeric: true,
        numericValue: 7.36,
        tolerance: 0.05,
        unit: 'gam',
      },
      explanation: 'n(glucose) = 0,1 mol => n(C_2H_5OH) = 2 × 0,1 × 0,8 = 0,16 mol => m = 0,16 × 46 = 7,36 gam.',
      authorId: 'template',
      createdAt: '',
      updatedAt: '',
    },
  ];

  const templateExam: Exam = {
    id: 'template_gdpt2018_chem',
    title: 'ĐỀ THI MẪU CHUẨN HÓA HỌC — CHƯƠNG TRÌNH GDPT 2018',
    code: 'MAU2025',
    grade: '12',
    subjectName: 'Hóa học 12',
    durationMinutes: 50,
    totalQuestions: sampleQuestions.length,
    totalScore: 10,
    questions: sampleQuestions,
    rules: {
      part1ScorePerQuestion: 0.25,
      part2GradingModel: 'standard_moet',
      part3ScorePerQuestion: 0.25,
      totalTargetScore: 10,
    },
    shuffleQuestions: false,
    shuffleOptions: false,
    isPublished: false,
    maxAttempts: 1,
    showScoreAfterSubmit: true,
    showAnswersAfterSubmit: true,
    showSolutionsAfterSubmit: true,
    allowReviewLater: true,
    authorId: 'hqtest',
    authorName: 'Tổ Hóa học · HQTest',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  await exportPrintReadyExamWithAnswersDocx(
    templateExam,
    'TRƯỜNG THPT CHUYÊN NGUYỄN BỈNH KHIÊM',
    'De_Mau_Chuan_GDPT2018_HoaHoc_HQTest.docx'
  );
}

/**
 * Xuất 01 đề thi hoàn chỉnh ra file Word (.docx) chuẩn in ấn A4, giữ nguyên công thức hóa học
 * (subscript/superscript) và đính kèm trang Hướng dẫn chấm + Bảng đáp án 3 phần ở cuối tệp.
 */
export async function exportPrintReadyExamWithAnswersDocx(
  exam: Exam,
  schoolName = 'TRƯỜNG THPT CHUYÊN NGUYỄN BỈNH KHIÊM',
  customFileName?: string
): Promise<void> {
  const part1 = exam.questions.filter(
    (q) => q.type === 'part1_single_choice' || q.type === 'part1_multiple_choice'
  );
  const part2 = exam.questions.filter((q) => q.type === 'part2_true_false');
  const part3 = exam.questions.filter((q) => q.type === 'part3_short_answer');

  const children: (Paragraph | Table)[] = [];

  children.push(
    buildOfficialHeaderTable({
      schoolName: schoolName || 'TRƯỜNG THPT',
      examTitle: exam.title || 'ĐỀ KIỂM TRA MÔN HÓA HỌC',
      subjectLabel: exam.subjectName || `Hóa học ${exam.grade === 'chuyen_hsg' ? 'Chuyên' : exam.grade}`,
      durationMinutes: exam.durationMinutes || 45,
      examCode: exam.publicCode || exam.code || '101',
    })
  );

  children.push(
    new Paragraph({
      spacing: { before: 140, after: 120 },
      children: [
        txt('Họ và tên thí sinh: ..........................................................   Lớp: ..................   SBD: .................', {
          size: SIZE_11,
        }),
      ],
    })
  );

  // PHẦN I
  if (part1.length > 0) {
    children.push(
      new Paragraph({
        spacing: { before: 120, after: 80 },
        children: [
          txt('PHẦN I. Câu trắc nghiệm nhiều phương án lựa chọn. ', { bold: true, size: SIZE_12 }),
          txt(
            `Thí sinh trả lời từ câu 1 đến câu ${part1.length}. Mỗi câu hỏi thí sinh chỉ chọn một phương án.`,
            { italics: true, size: SIZE_11 }
          ),
        ],
      })
    );

    part1.forEach((q, idx) => {
      children.push(
        new Paragraph({
          spacing: { before: 80, after: 40 },
          children: [txt(`Câu ${idx + 1}: `, { bold: true }), ...formulaRuns(q.content)],
        })
      );
      (q.options || []).forEach((opt) => {
        children.push(
          new Paragraph({
            indent: { left: convertMillimetersToTwip(6) },
            spacing: { after: 30 },
            children: [txt(`${opt.id}. `, { bold: true }), ...formulaRuns(opt.text)],
          })
        );
      });
    });
  }

  // PHẦN II
  if (part2.length > 0) {
    children.push(
      new Paragraph({
        spacing: { before: 160, after: 80 },
        children: [
          txt('PHẦN II. Câu trắc nghiệm đúng sai. ', { bold: true, size: SIZE_12 }),
          txt(
            `Thí sinh trả lời từ câu 1 đến câu ${part2.length}. Trong mỗi ý a), b), c), d) ở mỗi câu, thí sinh chọn đúng hoặc sai.`,
            { italics: true, size: SIZE_11 }
          ),
        ],
      })
    );

    part2.forEach((q, idx) => {
      children.push(
        new Paragraph({
          spacing: { before: 80, after: 40 },
          children: [txt(`Câu ${idx + 1}: `, { bold: true }), ...formulaRuns(q.content)],
        })
      );
      (q.statements || []).forEach((st) => {
        children.push(
          new Paragraph({
            indent: { left: convertMillimetersToTwip(6) },
            spacing: { after: 30 },
            children: [txt(`${st.id}) `, { bold: true }), ...formulaRuns(st.statement)],
          })
        );
      });
    });
  }

  // PHẦN III
  if (part3.length > 0) {
    children.push(
      new Paragraph({
        spacing: { before: 160, after: 80 },
        children: [
          txt('PHẦN III. Câu trắc nghiệm yêu cầu trả lời ngắn. ', { bold: true, size: SIZE_12 }),
          txt(`Thí sinh trả lời từ câu 1 đến câu ${part3.length}.`, { italics: true, size: SIZE_11 }),
        ],
      })
    );

    part3.forEach((q, idx) => {
      children.push(
        new Paragraph({
          spacing: { before: 80, after: 50 },
          children: [txt(`Câu ${idx + 1}: `, { bold: true }), ...formulaRuns(q.content)],
        })
      );
    });
  }

  children.push(
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 200, after: 120 },
      children: [txt('---------------- HẾT ----------------', { bold: true, size: SIZE_11 })],
    })
  );

  // TRANG MỚI: ĐÁP ÁN & HƯỚNG DẪN CHẤM 3 PHẦN
  children.push(new Paragraph({ children: [new PageBreak()] }));
  children.push(
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 100 },
      children: [txt('ĐÁP ÁN VÀ HƯỚNG DẪN CHẤM (CHUẨN GDPT 2018)', { bold: true, size: SIZE_13 })],
    })
  );

  if (part1.length > 0) {
    children.push(
      new Paragraph({
        spacing: { before: 80, after: 60 },
        children: [
          txt(
            `PHẦN I (Mỗi câu đúng đạt ${exam.rules?.part1ScorePerQuestion ?? 0.25} điểm):`,
            { bold: true, size: SIZE_11 }
          ),
        ],
      })
    );
    const p1HeaderCells = [
      new TableCell({
        shading: { type: ShadingType.CLEAR, fill: 'E2E8F0' },
        children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [txt('Câu', { bold: true, size: SIZE_11 })] })],
      }),
      ...part1.map(
        (_, i) =>
          new TableCell({
            shading: { type: ShadingType.CLEAR, fill: 'E2E8F0' },
            children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [txt(`${i + 1}`, { bold: true, size: SIZE_11 })] })],
          })
      ),
    ];
    const p1AnswerCells = [
      new TableCell({
        children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [txt('Đáp án', { bold: true, size: SIZE_11 })] })],
      }),
      ...part1.map((q) => {
        const ans =
          q.correctOptionId ||
          q.options?.find((o) => o.isCorrect)?.id ||
          '—';
        return new TableCell({
          children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [txt(ans, { bold: true, size: SIZE_11 })] })],
        });
      }),
    ];
    children.push(
      new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        borders: ALL_BORDERS,
        rows: [new TableRow({ children: p1HeaderCells }), new TableRow({ children: p1AnswerCells })],
      })
    );
  }

  if (part2.length > 0) {
    children.push(
      new Paragraph({
        spacing: { before: 140, after: 60 },
        children: [
          txt('PHẦN II (Đúng/Sai — Thang điểm lũy tiến Bộ GD&ĐT: 1 ý=0,1đ; 2 ý=0,25đ; 3 ý=0,5đ; 4 ý=1,0đ):', {
            bold: true,
            size: SIZE_11,
          }),
        ],
      })
    );
    const p2Rows = [
      new TableRow({
        children: ['Câu', 'Ý a', 'Ý b', 'Ý c', 'Ý d'].map(
          (lbl) =>
            new TableCell({
              shading: { type: ShadingType.CLEAR, fill: 'E2E8F0' },
              children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [txt(lbl, { bold: true, size: SIZE_11 })] })],
            })
        ),
      }),
      ...part2.map((q, idx) => {
        const map = new Map((q.statements || []).map((s) => [s.id.toLowerCase(), s.correctAnswer]));
        return new TableRow({
          children: [
            new TableCell({
              children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [txt(`Câu ${idx + 1}`, { bold: true, size: SIZE_11 })] })],
            }),
            ...(['a', 'b', 'c', 'd'] as const).map(
              (key) =>
                new TableCell({
                  children: [
                    new Paragraph({
                      alignment: AlignmentType.CENTER,
                      children: [
                        txt(map.has(key) ? (map.get(key) ? 'Đúng' : 'Sai') : '—', {
                          bold: true,
                          size: SIZE_11,
                        }),
                      ],
                    }),
                  ],
                })
            ),
          ],
        });
      }),
    ];
    children.push(
      new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        borders: ALL_BORDERS,
        rows: p2Rows,
      })
    );
  }

  if (part3.length > 0) {
    children.push(
      new Paragraph({
        spacing: { before: 140, after: 60 },
        children: [
          txt(`PHẦN III (Trả lời ngắn — Mỗi câu đúng đạt ${exam.rules?.part3ScorePerQuestion ?? 0.25} điểm):`, {
            bold: true,
            size: SIZE_11,
          }),
        ],
      })
    );
    const p3Rows = [
      new TableRow({
        children: ['Câu', 'Đáp án chuẩn', 'Đơn vị / Ghi chú'].map(
          (lbl) =>
            new TableCell({
              shading: { type: ShadingType.CLEAR, fill: 'E2E8F0' },
              children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [txt(lbl, { bold: true, size: SIZE_11 })] })],
            })
        ),
      }),
      ...part3.map((q, idx) => {
        const primary = q.shortAnswerConfig?.acceptableAnswers?.[0] || '—';
        const unit = q.shortAnswerConfig?.unit || '';
        return new TableRow({
          children: [
            new TableCell({
              children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [txt(`Câu ${idx + 1}`, { bold: true, size: SIZE_11 })] })],
            }),
            new TableCell({
              children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [txt(primary, { bold: true, size: SIZE_11 })] })],
            }),
            new TableCell({
              children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [txt(unit || '—', { size: SIZE_11 })] })],
            }),
          ],
        });
      }),
    ];
    children.push(
      new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        borders: ALL_BORDERS,
        rows: p3Rows,
      })
    );
  }

  // Lời giải tóm tắt nếu có
  const withSolutions = exam.questions.filter((q) => q.explanation && q.explanation.trim());
  if (withSolutions.length > 0) {
    children.push(
      new Paragraph({
        spacing: { before: 160, after: 60 },
        children: [txt('HƯỚNG DẪN GIẢI CHI TIẾT:', { bold: true, size: SIZE_11 })],
      })
    );
    withSolutions.forEach((q, idx) => {
      children.push(
        new Paragraph({
          spacing: { after: 40 },
          children: [
            txt(`${idx + 1}. [${q.code}] `, { bold: true, size: SIZE_11 }),
            ...formulaRuns(q.explanation || '', { size: SIZE_11 }),
          ],
        })
      );
    });
  }

  const doc = new Document({
    sections: [
      {
        properties: {
          page: {
            size: {
              width: convertMillimetersToTwip(210),
              height: convertMillimetersToTwip(297),
            },
            margin: {
              top: convertMillimetersToTwip(20),
              bottom: convertMillimetersToTwip(20),
              left: convertMillimetersToTwip(25),
              right: convertMillimetersToTwip(20),
            },
          },
        },
        footers: {
          default: buildFooter(),
        },
        children,
      },
    ],
  });

  const blob = await Packer.toBlob(doc);
  const fileName = customFileName || `${sanitizeFileSlug(exam.title)}_HQTest.docx`;
  saveAs(blob, fileName);
}
