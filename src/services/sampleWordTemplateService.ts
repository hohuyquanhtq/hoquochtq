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
import { getCognitiveLevelTagCode } from '../utils/cognitiveLevelTagParser';

const FONT = 'Times New Roman';
const SIZE_12 = 24;
const SIZE_11 = 22;
const SIZE_13 = 26;
const SIZE_10 = 20;

const NO_BORDER = { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' };
const THIN_BORDER = { style: BorderStyle.SINGLE, size: 4, color: '334155' };
const GUIDE_BORDER = { style: BorderStyle.SINGLE, size: 6, color: '60A5FA' };

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

const GUIDE_BOX_BORDERS = {
  top: GUIDE_BORDER,
  bottom: GUIDE_BORDER,
  left: GUIDE_BORDER,
  right: GUIDE_BORDER,
  insideHorizontal: NO_BORDER,
  insideVertical: NO_BORDER,
};

function txt(
  text: string,
  opts?: {
    bold?: boolean;
    italics?: boolean;
    size?: number;
    color?: string;
    subScript?: boolean;
    superScript?: boolean;
  }
): TextRun {
  return new TextRun({
    text,
    font: FONT,
    size: opts?.size ?? SIZE_12,
    bold: opts?.bold,
    italics: opts?.italics,
    color: opts?.color,
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
  subtitle?: string;
}): Table {
  const { schoolName, examTitle, subjectLabel, durationMinutes, examCode, subtitle } = params;
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
                children: [
                  txt(subtitle || '(Đề kiểm tra gồm 03 phần theo chuẩn GDPT 2018)', {
                    italics: true,
                    size: SIZE_10,
                  }),
                ],
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
                children: [
                  txt(`Môn: ${subjectLabel} — Thời gian làm bài: ${durationMinutes} phút`, {
                    bold: true,
                    size: SIZE_11,
                  }),
                ],
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

/**
 * Khung hướng dẫn màu xanh nhạt đặt ở đầu mỗi file Word mẫu (.docx)
 * giải thích rõ quy ước gắn thẻ mức độ nhận thức [NB], [TH], [VD], [VDC].
 */
function buildCognitiveLevelTagGuideBox(extraFormatHint?: string): Table {
  const cellParagraphs: Paragraph[] = [
    new Paragraph({
      spacing: { before: 40, after: 60 },
      children: [
        txt('HƯỚNG DẪN GẮN THẺ MỨC ĐỘ NHẬN THỨC (TỰ ĐỘNG PHÂN LOẠI KHI TẢI LÊN)', {
          bold: true,
          size: SIZE_11,
          color: '1E3A8A',
        }),
      ],
    }),
    new Paragraph({
      spacing: { after: 40 },
      children: [
        txt('• Quy ước thẻ đặt ngay sau số thứ tự câu hỏi: ', { bold: true, size: SIZE_11, color: '0F172A' }),
        txt('[NB]', { bold: true, size: SIZE_11, color: '047857' }),
        txt(' = Nhận biết  |  ', { size: SIZE_11, color: '0F172A' }),
        txt('[TH]', { bold: true, size: SIZE_11, color: '1D4ED8' }),
        txt(' = Thông hiểu  |  ', { size: SIZE_11, color: '0F172A' }),
        txt('[VD]', { bold: true, size: SIZE_11, color: 'C2410C' }),
        txt(' = Vận dụng  |  ', { size: SIZE_11, color: '0F172A' }),
        txt('[VDC]', { bold: true, size: SIZE_11, color: '7E22CE' }),
        txt(' = Vận dụng cao (cũng hỗ trợ [M1], [M2], [M3], [M4]).', { size: SIZE_11, color: '0F172A' }),
      ],
    }),
    new Paragraph({
      spacing: { after: extraFormatHint ? 40 : 20 },
      children: [
        txt(
          '• Lưu ý: Có thể trộn nhiều mức độ trong cùng 1 file Word. Nếu bỏ trống thẻ, hệ thống tự động gán mức Nhận biết. Các ký hiệu hóa học như [H+], [OH-], [Fe3+] được bảo toàn nguyên vẹn.',
          { italics: true, size: SIZE_10, color: '1E40AF' }
        ),
      ],
    }),
  ];

  if (extraFormatHint) {
    cellParagraphs.push(
      new Paragraph({
        spacing: { after: 20 },
        children: [txt(`• ${extraFormatHint}`, { italics: true, size: SIZE_10, color: '0F766E' })],
      })
    );
  }

  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: GUIDE_BOX_BORDERS,
    rows: [
      new TableRow({
        children: [
          new TableCell({
            shading: { type: ShadingType.CLEAR, fill: 'EFF6FF' },
            margins: {
              top: convertMillimetersToTwip(2.5),
              bottom: convertMillimetersToTwip(2.5),
              left: convertMillimetersToTwip(4),
              right: convertMillimetersToTwip(4),
            },
            children: cellParagraphs,
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

// ============================================================================
// BỘ CÂU HỎI MẪU CHUẨN ĐỦ 4 MỨC ĐỘ [NB], [TH], [VD], [VDC] CHO TỪNG DẠNG
// ============================================================================

const SAMPLE_PART1_QUESTIONS: Question[] = [
  {
    id: 'tpl_p1_1',
    code: 'HH12-NB-01',
    type: 'part1_single_choice',
    grade: '12',
    topic: 'hoa_vo_co',
    chapterName: 'Đại cương về kim loại',
    level: 'nhan_biet',
    content: 'Kim loại nào sau đây có tính dẫn điện tốt nhất?',
    options: [
      { id: 'A', text: 'Cu.', isCorrect: false },
      { id: 'B', text: 'Au.', isCorrect: false },
      { id: 'C', text: 'Ag.', isCorrect: true },
      { id: 'D', text: 'Al.', isCorrect: false },
    ],
    correctOptionId: 'C',
    explanation: 'Thứ tự độ dẫn điện giảm dần của kim loại: Ag > Cu > Au > Al > Fe. Do đó Ag dẫn điện tốt nhất.',
    authorId: 'template',
    createdAt: '',
    updatedAt: '',
  },
  {
    id: 'tpl_p1_2',
    code: 'HH11-NB-02',
    type: 'part1_single_choice',
    grade: '11',
    topic: 'hoa_vo_co',
    chapterName: 'Cân bằng hóa học',
    level: 'nhan_biet',
    content: 'Trong dung dịch nước ở 25 °C, tích số ion của nước là [H+].[OH-] = 10^{-14}. Dung dịch có môi trường kiềm (base) khi nào?',
    options: [
      { id: 'A', text: '[H+] > 10^{-7} M.', isCorrect: false },
      { id: 'B', text: '[OH-] > 10^{-7} M.', isCorrect: true },
      { id: 'C', text: '[H+] = [OH-].', isCorrect: false },
      { id: 'D', text: '[OH-] < 10^{-7} M.', isCorrect: false },
    ],
    correctOptionId: 'B',
    explanation: 'Ở 25 °C, dung dịch có môi trường kiềm (pH > 7) khi [OH-] > 10^{-7} M và [H+] < 10^{-7} M.',
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
    chapterName: 'Ester – Lipid',
    level: 'thong_hieu',
    content: 'Phát biểu nào sau đây đúng khi nói về tính chất hóa học của ester?',
    options: [
      { id: 'A', text: 'Phản ứng thủy phân ester trong môi trường acid là phản ứng một chiều.', isCorrect: false },
      { id: 'B', text: 'Tất cả các ester đều tham gia phản ứng tráng bạc với thuốc thử Tollens.', isCorrect: false },
      { id: 'C', text: 'Ester luôn tan tốt trong nước nhờ tạo liên kết hydrogen bền vững với nước.', isCorrect: false },
      { id: 'D', text: 'Phản ứng thủy phân ester trong môi trường kiềm (xà phòng hóa) là phản ứng một chiều.', isCorrect: true },
    ],
    correctOptionId: 'D',
    explanation: 'Thủy phân ester trong môi trường acid là phản ứng thuận nghịch, còn trong môi trường kiềm (xà phòng hóa) là phản ứng một chiều.',
    authorId: 'template',
    createdAt: '',
    updatedAt: '',
  },
  {
    id: 'tpl_p1_4',
    code: 'HH11-TH-04',
    type: 'part1_single_choice',
    grade: '11',
    topic: 'hoa_vo_co',
    chapterName: 'Cân bằng hóa học',
    level: 'thong_hieu',
    content: 'Dung dịch HCl 0,01 M (coi HCl điện li hoàn toàn) có nồng độ ion [H+] và giá trị pH lần lượt là',
    options: [
      { id: 'A', text: '[H+] = 10^{-1} M và pH = 1.', isCorrect: false },
      { id: 'B', text: '[H+] = 10^{-3} M và pH = 3.', isCorrect: false },
      { id: 'C', text: '[H+] = 10^{-2} M và pH = 2.', isCorrect: true },
      { id: 'D', text: '[H+] = 10^{-12} M và pH = 12.', isCorrect: false },
    ],
    correctOptionId: 'C',
    explanation: 'HCl là acid mạnh điện li hoàn toàn nên [H+] = 0,01 M = 10^{-2} M => pH = -lg[H+] = 2.',
    authorId: 'template',
    createdAt: '',
    updatedAt: '',
  },
  {
    id: 'tpl_p1_5',
    code: 'HH12-NB-05',
    type: 'part1_single_choice',
    grade: '12',
    topic: 'hoa_huu_co',
    chapterName: 'Carbohydrate',
    level: 'nhan_biet',
    content: 'Công thức phân tử của saccharose là',
    options: [
      { id: 'A', text: 'C_{12}H_{22}O_{11}.', isCorrect: true },
      { id: 'B', text: 'C_6H_{12}O_6.', isCorrect: false },
      { id: 'C', text: '(C_6H_{10}O_5)_n.', isCorrect: false },
      { id: 'D', text: 'C_2H_4O_2.', isCorrect: false },
    ],
    correctOptionId: 'A',
    explanation: 'Saccharose thuộc loại disaccharide có công thức phân tử là C_{12}H_{22}O_{11}.',
    authorId: 'template',
    createdAt: '',
    updatedAt: '',
  },
  {
    id: 'tpl_p1_6',
    code: 'HH12-TH-06',
    type: 'part1_single_choice',
    grade: '12',
    topic: 'hoa_huu_co',
    chapterName: 'Hợp chất chứa nitrogen',
    level: 'thong_hieu',
    content: 'Chất nào sau đây thuộc loại amine bậc hai?',
    options: [
      { id: 'A', text: 'CH_3NH_2.', isCorrect: false },
      { id: 'B', text: 'CH_3-NH-CH_3.', isCorrect: true },
      { id: 'C', text: '(CH_3)_3N.', isCorrect: false },
      { id: 'D', text: 'C_6H_5NH_2.', isCorrect: false },
    ],
    correctOptionId: 'B',
    explanation: 'Dimethylamine (CH_3-NH-CH_3) có 2 nguyên tử hydrogen của NH_3 bị thay thế bởi gốc hydrocarbon nên là amine bậc hai.',
    authorId: 'template',
    createdAt: '',
    updatedAt: '',
  },
  {
    id: 'tpl_p1_7',
    code: 'HH12-VD-07',
    type: 'part1_single_choice',
    grade: '12',
    topic: 'hoa_vo_co',
    chapterName: 'Đại cương về kim loại',
    level: 'van_dung',
    content: 'Cho m gam Fe tác dụng hoàn toàn với dung dịch H_2SO_4 loãng dư, thu được 2,479 lít khí H_2 (đkc). Giá trị của m là',
    options: [
      { id: 'A', text: '2,8.', isCorrect: false },
      { id: 'B', text: '4,2.', isCorrect: false },
      { id: 'C', text: '5,6.', isCorrect: true },
      { id: 'D', text: '8,4.', isCorrect: false },
    ],
    correctOptionId: 'C',
    explanation: 'n(H_2) = 2,479 / 24,79 = 0,1 mol. Fe + H_2SO_4 -> FeSO_4 + H_2 => n(Fe) = 0,1 mol => m = 0,1 × 56 = 5,6 gam.',
    authorId: 'template',
    createdAt: '',
    updatedAt: '',
  },
  {
    id: 'tpl_p1_8',
    code: 'HH11-VD-08',
    type: 'part1_single_choice',
    grade: '11',
    topic: 'hoa_vo_co',
    chapterName: 'Cân bằng hóa học',
    level: 'van_dung',
    content: 'Trộn 100 mL dung dịch NaOH 0,1 M với 100 mL dung dịch HCl 0,06 M, thu được 200 mL dung dịch X. Nồng độ [OH-] trong dung dịch X là',
    options: [
      { id: 'A', text: '0,01 M.', isCorrect: false },
      { id: 'B', text: '0,04 M.', isCorrect: false },
      { id: 'C', text: '0,05 M.', isCorrect: false },
      { id: 'D', text: '0,02 M.', isCorrect: true },
    ],
    correctOptionId: 'D',
    explanation: 'n(OH-) = 0,01 mol; n(H+) = 0,006 mol => n(OH- dư) = 0,004 mol => [OH-] = 0,004 / 0,2 = 0,02 M.',
    authorId: 'template',
    createdAt: '',
    updatedAt: '',
  },
  {
    id: 'tpl_p1_9',
    code: 'HH12-VDC-09',
    type: 'part1_single_choice',
    grade: '12',
    topic: 'hoa_huu_co',
    chapterName: 'Ester – Lipid',
    level: 'van_dung_cao',
    content: 'Hỗn hợp E gồm hai ester mạch hở X và Y (M_X < M_Y) đều đơn chức, đồng phân của nhau, không chứa nhóm chức khác. Đun nóng 14,8 gam E cần vừa đủ 200 mL dung dịch NaOH 1 M, thu được hỗn hợp muối và hỗn hợp hai alcohol kế tiếp nhau trong dãy đồng đẳng. Công thức phân tử của hai ester X, Y là',
    options: [
      { id: 'A', text: 'C_3H_6O_2.', isCorrect: true },
      { id: 'B', text: 'C_4H_8O_2.', isCorrect: false },
      { id: 'C', text: 'C_2H_4O_2.', isCorrect: false },
      { id: 'D', text: 'C_5H_{10}O_2.', isCorrect: false },
    ],
    correctOptionId: 'A',
    explanation: 'n(E) = n(NaOH) = 0,2 mol => M(E) = 14,8 / 0,2 = 74 g/mol => C_3H_6O_2 (gồm HCOOC_2H_5 và CH_3COOCH_3).',
    authorId: 'template',
    createdAt: '',
    updatedAt: '',
  },
  {
    id: 'tpl_p1_10',
    code: 'HH12-VDC-10',
    type: 'part1_single_choice',
    grade: '12',
    topic: 'hoa_huu_co',
    chapterName: 'Carbohydrate',
    level: 'van_dung_cao',
    content: 'Thủy phân hoàn toàn 17,1 gam saccharose trong môi trường acid (hiệu suất 80%), thu được dung dịch X. Trung hòa acid dư trong X rồi cho tác dụng với lượng dư dung dịch AgNO_3 trong NH_3 (chứa phức chất [Ag(NH_3)_2]+), đun nóng thu được m gam Ag. Giá trị của m là',
    options: [
      { id: 'A', text: '21,60.', isCorrect: false },
      { id: 'B', text: '17,28.', isCorrect: true },
      { id: 'C', text: '8,64.', isCorrect: false },
      { id: 'D', text: '10,80.', isCorrect: false },
    ],
    correctOptionId: 'B',
    explanation: 'n(saccharose) = 17,1 / 342 = 0,05 mol; hiệu suất 80% => n(glucose) = n(fructose) = 0,04 mol => n(Ag) = 4 × 0,04 = 0,16 mol => m(Ag) = 17,28 gam.',
    authorId: 'template',
    createdAt: '',
    updatedAt: '',
  },
];

const SAMPLE_PART2_QUESTIONS: Question[] = [
  {
    id: 'tpl_p2_1',
    code: 'HH12-TF-NB-01',
    type: 'part2_true_false',
    grade: '12',
    topic: 'hoa_huu_co',
    chapterName: 'Carbohydrate',
    level: 'nhan_biet',
    content: 'Xét các tính chất cơ bản của glucose (C_6H_{12}O_6) và saccharose (C_{12}H_{22}O_{11}).',
    statements: [
      {
        id: 'a',
        statement: 'Glucose thuộc loại monosaccharide, có nhiều trong quả nho chín.',
        correctAnswer: true,
      },
      {
        id: 'b',
        statement: 'Cả glucose và saccharose đều tham gia phản ứng tráng bạc với thuốc thử Tollens.',
        correctAnswer: false,
      },
      {
        id: 'c',
        statement: 'Saccharose thuộc loại disaccharide, được cấu tạo từ 1 đơn vị α-glucose và 1 đơn vị β-fructose.',
        correctAnswer: true,
      },
      {
        id: 'd',
        statement: 'Cả glucose và saccharose đều hòa tan Cu(OH)_2 ở điều kiện thường tạo dung dịch màu xanh lam.',
        correctAnswer: true,
      },
    ],
    explanation: 'Saccharose không còn nhóm -OH hemiacetal tự do nên không tham gia phản ứng tráng bạc (ý b sai).',
    authorId: 'template',
    createdAt: '',
    updatedAt: '',
  },
  {
    id: 'tpl_p2_2',
    code: 'HH12-TF-TH-02',
    type: 'part2_true_false',
    grade: '12',
    topic: 'hoa_huu_co',
    chapterName: 'Ester – Lipid',
    level: 'thong_hieu',
    content: 'Cho thí nghiệm điều chế ethyl acetate từ acetic acid (CH_3COOH) và ethanol (C_2H_5OH) có mặt H_2SO_4 đặc làm xúc tác, đun nóng nhẹ trong ống nghiệm.',
    statements: [
      {
        id: 'a',
        statement: 'Phản ứng ester hóa giữa acetic acid và ethanol là phản ứng thuận nghịch.',
        correctAnswer: true,
      },
      {
        id: 'b',
        statement: 'H_2SO_4 đặc vừa đóng vai trò chất xúc tác vừa hút nước để chuyển dịch cân bằng theo chiều thuận.',
        correctAnswer: true,
      },
      {
        id: 'c',
        statement: 'Sau khi thêm dung dịch NaCl bão hòa vào ống nghiệm hứng sản phẩm, ethyl acetate chìm xuống lớp dưới cùng.',
        correctAnswer: false,
      },
      {
        id: 'd',
        statement: 'Ethyl acetate tạo thành có mùi thơm dịu đặc trưng, ít tan trong nước.',
        correctAnswer: true,
      },
    ],
    explanation: 'Ethyl acetate nhẹ hơn nước và ít tan trong nước nên nổi lên lớp trên (ý c sai).',
    authorId: 'template',
    createdAt: '',
    updatedAt: '',
  },
  {
    id: 'tpl_p2_3',
    code: 'HH12-TF-VD-03',
    type: 'part2_true_false',
    grade: '12',
    topic: 'hoa_huu_co',
    chapterName: 'Ester – Lipid',
    level: 'van_dung',
    content: 'Tiến hành thí nghiệm xà phòng hóa hoàn toàn 8,9 gam chất béo tristearin ((C_{17}H_{35}COO)_3C_3H_5) bằng dung dịch NaOH vừa đủ, đun nóng nhẹ và khuấy đều.',
    statements: [
      {
        id: 'a',
        statement: 'Số mol tristearin đã tham gia phản ứng là 0,01 mol.',
        correctAnswer: true,
      },
      {
        id: 'b',
        statement: 'Số mol NaOH tối thiểu cần dùng cho phản ứng là 0,03 mol.',
        correctAnswer: true,
      },
      {
        id: 'c',
        statement: 'Khối lượng glycerol (C_3H_5(OH)_3) thu được sau phản ứng là 1,84 gam.',
        correctAnswer: false,
      },
      {
        id: 'd',
        statement: 'Thêm dung dịch NaCl bão hòa vào hỗn hợp sau phản ứng để tách muối sodium stearate nổi lên trên.',
        correctAnswer: true,
      },
    ],
    explanation: 'n(tristearin) = 8,9 / 890 = 0,01 mol => n(glycerol) = 0,01 mol => m(glycerol) = 0,92 gam (ý c sai).',
    authorId: 'template',
    createdAt: '',
    updatedAt: '',
  },
  {
    id: 'tpl_p2_4',
    code: 'HH12-TF-VDC-04',
    type: 'part2_true_false',
    grade: '12',
    topic: 'hoa_vo_co',
    chapterName: 'Pin điện và điện phân',
    level: 'van_dung_cao',
    content: 'Điện phân 200 mL dung dịch hỗn hợp CuSO_4 0,5 M và NaCl 0,5 M với điện cực trơ, màng ngăn xốp, cường độ dòng điện I = 5 A trong thời gian t = 3860 giây (giả sử hiệu suất điện phân đạt 100%, hằng số Faraday F = 96500 C/mol).',
    statements: [
      {
        id: 'a',
        statement: 'Tổng số mol electron trao đổi ở mỗi điện cực là 0,2 mol.',
        correctAnswer: true,
      },
      {
        id: 'b',
        statement: 'Tại anode, chỉ có khí Cl_2 thoát ra trong suốt quá trình điện phân.',
        correctAnswer: false,
      },
      {
        id: 'c',
        statement: 'Tại cathode, toàn bộ ion Cu^{2+} bị khử hoàn toàn tạo 6,4 gam kim loại Cu bám lên điện cực.',
        correctAnswer: true,
      },
      {
        id: 'd',
        statement: 'Dung dịch sau điện phân có [H+] > [OH-] (pH < 7) do sự điện phân nước ở anode sinh ra ion [H+].',
        correctAnswer: true,
      },
    ],
    explanation: 'n_e = I.t/F = 0,2 mol; n(Cl^-) = 0,1 mol nên Cl^- hết sau khi trao đổi 0,1 mol e, tiếp theo H_2O bị oxi hóa ở anode sinh O_2 và [H+] (ý b sai).',
    authorId: 'template',
    createdAt: '',
    updatedAt: '',
  },
];

const SAMPLE_PART3_QUESTIONS: Question[] = [
  {
    id: 'tpl_p3_1',
    code: 'HH12-SA-NB-01',
    type: 'part3_short_answer',
    grade: '12',
    topic: 'hoa_huu_co',
    chapterName: 'Carboxylic acid',
    level: 'nhan_biet',
    content: 'Cho 0,025 mol acetic acid (CH_3COOH) tác dụng hoàn toàn với dung dịch NaHCO_3 dư, thu được bao nhiêu gam khí CO_2?',
    shortAnswerConfig: {
      acceptableAnswers: ['1,1', '1.1'],
      isNumeric: true,
      numericValue: 1.1,
      tolerance: 0.05,
      unit: 'gam',
    },
    explanation: 'n(CO_2) = n(CH_3COOH) = 0,025 mol => m(CO_2) = 0,025 × 44 = 1,1 gam.',
    authorId: 'template',
    createdAt: '',
    updatedAt: '',
  },
  {
    id: 'tpl_p3_2',
    code: 'HH11-SA-TH-02',
    type: 'part3_short_answer',
    grade: '11',
    topic: 'hoa_vo_co',
    chapterName: 'Cân bằng hóa học',
    level: 'thong_hieu',
    content: 'Trung hòa hoàn toàn 200 mL dung dịch HCl có [H+] = 0,1 M cần dùng vừa đủ bao nhiêu gam NaOH rắn?',
    shortAnswerConfig: {
      acceptableAnswers: ['0,8', '0.8'],
      isNumeric: true,
      numericValue: 0.8,
      tolerance: 0.05,
      unit: 'gam',
    },
    explanation: 'n(H+) = 0,2 × 0,1 = 0,02 mol => n(NaOH) = 0,02 mol => m(NaOH) = 0,02 × 40 = 0,8 gam.',
    authorId: 'template',
    createdAt: '',
    updatedAt: '',
  },
  {
    id: 'tpl_p3_3',
    code: 'HH12-SA-VD-03',
    type: 'part3_short_answer',
    grade: '12',
    topic: 'hoa_vo_co',
    chapterName: 'Đại cương về kim loại',
    level: 'van_dung',
    content: 'Cho 4,76 gam kim loại Fe tác dụng hoàn toàn với dung dịch HCl dư, thu được bao nhiêu lít khí H_2 (ở điều kiện chuẩn, 1 mol khí chiếm 24,79 lít)? (Làm tròn kết quả đến hàng phần trăm).',
    shortAnswerConfig: {
      acceptableAnswers: ['2,11', '2.11'],
      isNumeric: true,
      numericValue: 2.11,
      tolerance: 0.05,
      unit: 'lít',
    },
    explanation: 'n(Fe) = 4,76 / 56 = 0,085 mol => n(H_2) = 0,085 mol => V(H_2) = 0,085 × 24,79 = 2,10715 ≈ 2,11 lít.',
    authorId: 'template',
    createdAt: '',
    updatedAt: '',
  },
  {
    id: 'tpl_p3_4',
    code: 'HH12-SA-VD-04',
    type: 'part3_short_answer',
    grade: '12',
    topic: 'hoa_vo_co',
    chapterName: 'Pin điện và điện phân',
    level: 'van_dung',
    content: 'Điện phân dung dịch CuSO_4 dư với điện cực trơ, cường độ dòng điện I = 5 A trong thời gian t = 3860 giây (hiệu suất 100%, F = 96500 C/mol). Khối lượng kim loại Cu thu được ở cathode là bao nhiêu gam?',
    shortAnswerConfig: {
      acceptableAnswers: ['6,4', '6.4'],
      isNumeric: true,
      numericValue: 6.4,
      tolerance: 0.05,
      unit: 'gam',
    },
    explanation: 'n_e = 5 × 3860 / 96500 = 0,2 mol => n(Cu) = 0,1 mol => m(Cu) = 0,1 × 64 = 6,4 gam.',
    authorId: 'template',
    createdAt: '',
    updatedAt: '',
  },
  {
    id: 'tpl_p3_5',
    code: 'HH12-SA-VDC-05',
    type: 'part3_short_answer',
    grade: '12',
    topic: 'hoa_huu_co',
    chapterName: 'Carbohydrate',
    level: 'van_dung_cao',
    content: 'Cho 9,0 gam glucose (C_6H_{12}O_6) tác dụng với lượng dư dung dịch AgNO_3 trong NH_3 đun nóng (hiệu suất phản ứng đạt 50%). Khối lượng kim loại Ag thu được là bao nhiêu gam?',
    shortAnswerConfig: {
      acceptableAnswers: ['5,4', '5.4'],
      isNumeric: true,
      numericValue: 5.4,
      tolerance: 0.05,
      unit: 'gam',
    },
    explanation: 'n(glucose) = 9,0 / 180 = 0,05 mol => n(Ag) = 2 × 0,05 × 0,5 = 0,05 mol => m(Ag) = 0,05 × 108 = 5,4 gam.',
    authorId: 'template',
    createdAt: '',
    updatedAt: '',
  },
  {
    id: 'tpl_p3_6',
    code: 'HH12-SA-NB-06',
    type: 'part3_short_answer',
    grade: '12',
    topic: 'hoa_huu_co',
    chapterName: 'Ester – Lipid',
    level: 'nhan_biet',
    content: 'Thủy phân hoàn toàn 1 mol chất béo tristearin ((C_{17}H_{35}COO)_3C_3H_5) trong dung dịch NaOH đun nóng cần tối đa bao nhiêu mol NaOH?',
    shortAnswerConfig: {
      acceptableAnswers: ['3'],
      isNumeric: true,
      numericValue: 3,
      tolerance: 0,
      unit: 'mol',
    },
    explanation: 'Tristearin là triester của glycerol nên 1 mol tristearin phản ứng tối đa với 3 mol NaOH.',
    authorId: 'template',
    createdAt: '',
    updatedAt: '',
  },
];

function buildTemplateExamWrapper(params: {
  id: string;
  title: string;
  code: string;
  questions: Question[];
}): Exam {
  return {
    id: params.id,
    title: params.title,
    code: params.code,
    grade: '12',
    subjectName: 'Hóa học 12',
    durationMinutes: 50,
    totalQuestions: params.questions.length,
    totalScore: 10,
    questions: params.questions,
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
}

/**
 * 1. File Word mẫu TỔNG HỢP chuẩn cấu trúc 3 phần môn Hóa học GDPT 2018.
 * Gồm đầy đủ 10 câu Phần I, 4 câu Phần II, 6 câu Phần III minh họa đủ 4 mức độ [NB], [TH], [VD], [VDC]
 * và các bảng đáp án chuẩn hóa 100% tương thích bộ bóc tách HQTest.
 */
export function buildStandardChemistryWordTemplateDoc(): Document {
  const sampleQuestions: Question[] = [
    ...SAMPLE_PART1_QUESTIONS,
    ...SAMPLE_PART2_QUESTIONS,
    ...SAMPLE_PART3_QUESTIONS,
  ];

  const templateExam = buildTemplateExamWrapper({
    id: 'template_gdpt2018_chem_full',
    title: 'ĐỀ THI MẪU CHUẨN HÓA HỌC — CHƯƠNG TRÌNH GDPT 2018',
    code: 'MAU-3PHAN',
    questions: sampleQuestions,
  });

  return buildPrintReadyExamWithAnswersDoc(
    templateExam,
    'TRƯỜNG THPT CHUYÊN NGUYỄN BỈNH KHIÊM',
    {
      includeLevelTags: true,
      showLevelGuideBox: true,
      showAlternativeAnswerFormatNotes: true,
      headerSubtitle: '(Mẫu tổng hợp 03 phần — Đủ 4 mức độ [NB], [TH], [VD], [VDC])',
      guideExtraHint:
        'Mẫu tổng hợp gồm Phần I (10 câu Trắc nghiệm 4 lựa chọn), Phần II (4 câu Đúng/Sai 4 ý a, b, c, d) và Phần III (6 câu Trả lời ngắn) kèm bảng đáp án chuẩn ở cuối tệp.',
    }
  );
}

export async function downloadStandardChemistryWordTemplate(): Promise<void> {
  const doc = buildStandardChemistryWordTemplateDoc();
  const blob = await Packer.toBlob(doc);
  saveAs(blob, 'De_Mau_Chuan_GDPT2018_HoaHoc_HQTest.docx');
}

/**
 * 2. File Word mẫu RIÊNG: Trắc nghiệm nhiều lựa chọn (Phần I) — đủ 4 mức [NB], [TH], [VD], [VDC].
 */
export async function downloadSingleChoiceWordTemplate(): Promise<void> {
  const templateExam = buildTemplateExamWrapper({
    id: 'template_part1_single_choice',
    title: 'MẪU CÂU HỎI TRẮC NGHIỆM NHIỀU LỰA CHỌN (PHẦN I)',
    code: 'MAU-PHAN1',
    questions: SAMPLE_PART1_QUESTIONS,
  });

  await exportPrintReadyExamWithAnswersDocx(
    templateExam,
    'TRƯỜNG THPT CHUYÊN NGUYỄN BỈNH KHIÊM',
    'Mau_TracNghiem_NhieuLuaChon_HQTest.docx',
    {
      includeLevelTags: true,
      showLevelGuideBox: true,
      showAlternativeAnswerFormatNotes: true,
      headerSubtitle: '(Mẫu Phần I · Trắc nghiệm 4 lựa chọn A, B, C, D)',
      guideExtraHint:
        'Đặt thẻ [NB], [TH], [VD], [VDC] ngay sau "Câu 1.", "Câu 2."... Các đáp án A., B., C., D. trình bày rõ ràng kèm bảng đáp án lưới ngang ở cuối file.',
    }
  );
}

/**
 * 3. File Word mẫu RIÊNG: Trắc nghiệm Đúng/Sai 4 ý a, b, c, d (Phần II) — đủ 4 mức [NB], [TH], [VD], [VDC].
 */
export async function downloadTrueFalseWordTemplate(): Promise<void> {
  const templateExam = buildTemplateExamWrapper({
    id: 'template_part2_true_false',
    title: 'MẪU CÂU HỎI TRẮC NGHIỆM ĐÚNG / SAI (PHẦN II)',
    code: 'MAU-PHAN2',
    questions: SAMPLE_PART2_QUESTIONS,
  });

  await exportPrintReadyExamWithAnswersDocx(
    templateExam,
    'TRƯỜNG THPT CHUYÊN NGUYỄN BỈNH KHIÊM',
    'Mau_TracNghiem_DungSai_HQTest.docx',
    {
      includeLevelTags: true,
      showLevelGuideBox: true,
      showAlternativeAnswerFormatNotes: true,
      headerSubtitle: '(Mẫu Phần II · Trắc nghiệm Đúng/Sai 4 ý a, b, c, d)',
      guideExtraHint:
        'Với dạng Đúng/Sai, gắn 1 thẻ mức độ chung ngay đầu câu hỏi lớn (VD: Câu 2. [TH] Cho thí nghiệm điều chế ethyl acetate...) và liệt kê các ý a), b), c), d) bên dưới.',
    }
  );
}

/**
 * 4. File Word mẫu RIÊNG: Trả lời ngắn / Điền khuyết (Phần III) — đủ 4 mức [NB], [TH], [VD], [VDC].
 */
export async function downloadShortAnswerWordTemplate(): Promise<void> {
  const templateExam = buildTemplateExamWrapper({
    id: 'template_part3_short_answer',
    title: 'MẪU CÂU HỎI TRẢ LỜI NGẮN / ĐIỀN KHUYẾT (PHẦN III)',
    code: 'MAU-PHAN3',
    questions: SAMPLE_PART3_QUESTIONS,
  });

  await exportPrintReadyExamWithAnswersDocx(
    templateExam,
    'TRƯỜNG THPT CHUYÊN NGUYỄN BỈNH KHIÊM',
    'Mau_TraLoiNgan_DienKhuyet_HQTest.docx',
    {
      includeLevelTags: true,
      showLevelGuideBox: true,
      showAlternativeAnswerFormatNotes: true,
      headerSubtitle: '(Mẫu Phần III · Trả lời ngắn / Điền khuyết)',
      guideExtraHint:
        'Gắn thẻ [NB], [TH], [VD], [VDC] ngay đầu mỗi câu hỏi trả lời ngắn và ghi đáp án số/thập phân tối đa 4 ký tự trong bảng lưới ngang ở cuối file.',
    }
  );
}

export interface WordExportOptions {
  includeLevelTags?: boolean;
  showLevelGuideBox?: boolean;
  showAlternativeAnswerFormatNotes?: boolean;
  headerSubtitle?: string;
  guideExtraHint?: string;
  templateNote?: string;
}

/**
 * Helper tạo bảng đáp án dạng lưới ngang (Hàng 1: Câu | 1 | 2 | ..., Hàng 2: Đáp án | ...).
 * Tự động ngắt thành từng block 10 cột nếu số câu lớn hơn 10 để in đẹp trên khổ A4.
 */
function buildHorizontalAnswerGridTable(
  items: { num: number; answer: string }[],
  maxColsPerBlock = 10
): Table {
  const rows: TableRow[] = [];
  for (let start = 0; start < items.length; start += maxColsPerBlock) {
    const chunk = items.slice(start, start + maxColsPerBlock);
    const questionRowCells = [
      new TableCell({
        shading: { type: ShadingType.CLEAR, fill: 'E2E8F0' },
        children: [
          new Paragraph({
            alignment: AlignmentType.CENTER,
            children: [txt('Câu', { bold: true, size: SIZE_11 })],
          }),
        ],
      }),
      ...chunk.map(
        (item) =>
          new TableCell({
            shading: { type: ShadingType.CLEAR, fill: 'E2E8F0' },
            children: [
              new Paragraph({
                alignment: AlignmentType.CENTER,
                children: [txt(`${item.num}`, { bold: true, size: SIZE_11 })],
              }),
            ],
          })
      ),
    ];

    const answerRowCells = [
      new TableCell({
        shading: { type: ShadingType.CLEAR, fill: 'F8FAFC' },
        children: [
          new Paragraph({
            alignment: AlignmentType.CENTER,
            children: [txt('Đáp án', { bold: true, size: SIZE_11 })],
          }),
        ],
      }),
      ...chunk.map(
        (item) =>
          new TableCell({
            children: [
              new Paragraph({
                alignment: AlignmentType.CENTER,
                children: [txt(item.answer, { bold: true, size: SIZE_11 })],
              }),
            ],
          })
      ),
    ];

    rows.push(new TableRow({ children: questionRowCells }));
    rows.push(new TableRow({ children: answerRowCells }));
  }

  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: ALL_BORDERS,
    rows,
  });
}

/**
 * Helper tạo bảng đáp án Phần II dạng chuẩn 5 cột:
 * Tiêu đề cột: [ Câu | a) | b) | c) | d) ]
 * Các hàng:    [ 1   | Đ  | S  | Đ  | Đ  ]
 */
function buildPart2FiveColumnTable(part2: Question[]): Table {
  const p2Rows = [
    new TableRow({
      children: ['Câu', 'a)', 'b)', 'c)', 'd)'].map(
        (lbl) =>
          new TableCell({
            shading: { type: ShadingType.CLEAR, fill: 'E2E8F0' },
            children: [
              new Paragraph({
                alignment: AlignmentType.CENTER,
                children: [txt(lbl, { bold: true, size: SIZE_11 })],
              }),
            ],
          })
      ),
    }),
    ...part2.map((q, idx) => {
      const map = new Map((q.statements || []).map((s) => [s.id.toLowerCase(), s.correctAnswer]));
      return new TableRow({
        children: [
          new TableCell({
            children: [
              new Paragraph({
                alignment: AlignmentType.CENTER,
                children: [txt(`${idx + 1}`, { bold: true, size: SIZE_11 })],
              }),
            ],
          }),
          ...(['a', 'b', 'c', 'd'] as const).map(
            (key) =>
              new TableCell({
                children: [
                  new Paragraph({
                    alignment: AlignmentType.CENTER,
                    children: [
                      txt(map.has(key) ? (map.get(key) ? 'Đ' : 'S') : '—', {
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

  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: ALL_BORDERS,
    rows: p2Rows,
  });
}

/**
 * Helper tạo bảng đáp án Phần II dạng ma trận ngang (mẫu thay thế):
 * Cột: [ Câu | 1 | 2 | 3 | ... ]
 * Dòng: a), b), c), d)
 */
function buildPart2TransposedMatrixTable(part2: Question[]): Table {
  const headerRow = new TableRow({
    children: [
      new TableCell({
        shading: { type: ShadingType.CLEAR, fill: 'F1F5F9' },
        children: [
          new Paragraph({
            alignment: AlignmentType.CENTER,
            children: [txt('Câu', { bold: true, size: SIZE_11 })],
          }),
        ],
      }),
      ...part2.map(
        (_, idx) =>
          new TableCell({
            shading: { type: ShadingType.CLEAR, fill: 'F1F5F9' },
            children: [
              new Paragraph({
                alignment: AlignmentType.CENTER,
                children: [txt(`${idx + 1}`, { bold: true, size: SIZE_11 })],
              }),
            ],
          })
      ),
    ],
  });

  const subRows = (['a', 'b', 'c', 'd'] as const).map(
    (subKey) =>
      new TableRow({
        children: [
          new TableCell({
            shading: { type: ShadingType.CLEAR, fill: 'F8FAFC' },
            children: [
              new Paragraph({
                alignment: AlignmentType.CENTER,
                children: [txt(`${subKey})`, { bold: true, size: SIZE_11 })],
              }),
            ],
          }),
          ...part2.map((q) => {
            const st = (q.statements || []).find((s) => s.id.toLowerCase() === subKey);
            return new TableCell({
              children: [
                new Paragraph({
                  alignment: AlignmentType.CENTER,
                  children: [
                    txt(st ? (st.correctAnswer ? 'Đ' : 'S') : '—', {
                      bold: true,
                      size: SIZE_11,
                    }),
                  ],
                }),
              ],
            });
          }),
        ],
      })
  );

  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: ALL_BORDERS,
    rows: [headerRow, ...subRows],
  });
}

/**
 * Xây dựng đối tượng Document (.docx) hoàn chỉnh chuẩn in ấn A4 với bảng đáp án chuẩn hóa 3 phần.
 */
export function buildPrintReadyExamWithAnswersDoc(
  exam: Exam,
  schoolName = 'TRƯỜNG THPT CHUYÊN NGUYỄN BỈNH KHIÊM',
  options?: WordExportOptions
): Document {
  const includeLevelTags = Boolean(options?.includeLevelTags);
  const showAltFormatNotes = Boolean(options?.showAlternativeAnswerFormatNotes);
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
      subtitle: options?.headerSubtitle,
    })
  );

  children.push(
    new Paragraph({
      spacing: { before: 120, after: 100 },
      children: [
        txt('Họ và tên thí sinh: ..........................................................   Lớp: ..................   SBD: .................', {
          size: SIZE_11,
        }),
      ],
    })
  );

  if (options?.showLevelGuideBox) {
    children.push(buildCognitiveLevelTagGuideBox(options.guideExtraHint));
    children.push(new Paragraph({ spacing: { after: 80 }, children: [] }));
  } else if (options?.templateNote) {
    children.push(
      new Paragraph({
        spacing: { before: 40, after: 100 },
        children: [txt(options.templateNote, { italics: true, size: SIZE_10 })],
      })
    );
  }

  const buildQuestionPrefixRuns = (idx: number, q: Question): TextRun[] => {
    if (includeLevelTags) {
      return [
        txt(`Câu ${idx + 1}. `, { bold: true }),
        txt(`[${getCognitiveLevelTagCode(q.level)}] `, { bold: true }),
      ];
    }
    return [txt(`Câu ${idx + 1}: `, { bold: true })];
  };

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
          children: [...buildQuestionPrefixRuns(idx, q), ...formulaRuns(q.content)],
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
          children: [...buildQuestionPrefixRuns(idx, q), ...formulaRuns(q.content)],
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
          children: [...buildQuestionPrefixRuns(idx, q), ...formulaRuns(q.content)],
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

  // 1. PHẦN I: TRẮC NGHIỆM (Bảng lưới ngang chuẩn)
  if (part1.length > 0) {
    children.push(
      new Paragraph({
        spacing: { before: 100, after: 60 },
        children: [
          txt('PHẦN I: TRẮC NGHIỆM', { bold: true, size: SIZE_11 }),
          txt(` (Mỗi câu đúng đạt ${exam.rules?.part1ScorePerQuestion ?? 0.25} điểm)`, {
            italics: true,
            size: SIZE_10,
            color: '475569',
          }),
        ],
      })
    );

    const p1Items = part1.map((q, i) => ({
      num: i + 1,
      answer: q.correctOptionId || q.options?.find((o) => o.isCorrect)?.id || '—',
    }));
    children.push(buildHorizontalAnswerGridTable(p1Items, 10));

    if (showAltFormatNotes) {
      children.push(
        new Paragraph({
          spacing: { before: 60, after: 80 },
          children: [
            txt(
              'Ghi chú: Ngoài bảng lưới ngang trên, HQTest cũng hỗ trợ dạng bảng 2 cột dọc với tiêu đề [ Câu | Đáp án ] (mỗi dòng 1 câu, ví dụ: hàng tiêu đề "Câu | Đáp án", các hàng tiếp theo liệt kê số thứ tự câu ở cột trái và chữ cái A/B/C/D ở cột phải).',
              { italics: true, size: SIZE_10, color: '334155' }
            ),
          ],
        })
      );
    }
  }

  // 2. PHẦN II: ĐÚNG SAI (Bảng chuẩn 5 cột + Mẫu ma trận ngang thay thế cho file mẫu)
  if (part2.length > 0) {
    children.push(
      new Paragraph({
        spacing: { before: 140, after: 60 },
        children: [
          txt('PHẦN II: ĐÚNG SAI', { bold: true, size: SIZE_11 }),
          txt(' (Thang điểm lũy tiến Bộ GD&ĐT: 1 ý = 0,1đ; 2 ý = 0,25đ; 3 ý = 0,5đ; 4 ý = 1,0đ)', {
            italics: true,
            size: SIZE_10,
            color: '475569',
          }),
        ],
      })
    );

    children.push(buildPart2FiveColumnTable(part2));

    if (showAltFormatNotes) {
      children.push(
        new Paragraph({
          spacing: { before: 80, after: 40 },
          children: [
            txt(
              'Ghi chú — Mẫu ma trận ngang thay thế (HQTest cũng hỗ trợ bảng có Cột [Câu | 1 | 2 | 3 | ...], Dòng [a), b), c), d)] với cùng giá trị Đ/S):',
              { italics: true, size: SIZE_10, color: '334155' }
            ),
          ],
        })
      );
      children.push(buildPart2TransposedMatrixTable(part2));
    }
  }

  // 3. PHẦN III: TRẢ LỜI NGẮN (Bảng lưới ngang chuẩn, giá trị số/thập phân tối đa 4 ký tự)
  if (part3.length > 0) {
    children.push(
      new Paragraph({
        spacing: { before: 140, after: 60 },
        children: [
          txt('PHẦN III: TRẢ LỜI NGẮN', { bold: true, size: SIZE_11 }),
          txt(` (Mỗi câu đúng đạt ${exam.rules?.part3ScorePerQuestion ?? 0.25} điểm)`, {
            italics: true,
            size: SIZE_10,
            color: '475569',
          }),
        ],
      })
    );

    const p3Items = part3.map((q, i) => ({
      num: i + 1,
      answer: q.shortAnswerConfig?.acceptableAnswers?.[0] || '—',
    }));
    children.push(buildHorizontalAnswerGridTable(p3Items, 10));

    if (showAltFormatNotes) {
      children.push(
        new Paragraph({
          spacing: { before: 60, after: 80 },
          children: [
            txt(
              'Ghi chú: Giá trị đáp án Phần III chỉ gồm số nguyên hoặc số thập phân tối đa 4 ký tự (bao gồm cả dấu phẩy/chấm thập phân hoặc dấu âm, VD: 1,1; 0,8; 2,11; 6,4; 5,4; 3).',
              { italics: true, size: SIZE_10, color: '334155' }
            ),
          ],
        })
      );
    }
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

  return new Document({
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
}

/**
 * Xuất 01 đề thi hoàn chỉnh ra file Word (.docx) chuẩn in ấn A4, giữ nguyên công thức hóa học
 * (subscript/superscript) và đính kèm trang Hướng dẫn chấm + Bảng đáp án 3 phần ở cuối tệp.
 */
export async function exportPrintReadyExamWithAnswersDocx(
  exam: Exam,
  schoolName = 'TRƯỜNG THPT CHUYÊN NGUYỄN BỈNH KHIÊM',
  customFileName?: string,
  options?: WordExportOptions
): Promise<void> {
  const doc = buildPrintReadyExamWithAnswersDoc(exam, schoolName, options);
  const blob = await Packer.toBlob(doc);
  const fileName = customFileName || `${sanitizeFileSlug(exam.title)}_HQTest.docx`;
  saveAs(blob, fileName);
}
