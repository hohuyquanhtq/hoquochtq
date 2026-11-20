import {
  AlignmentType,
  BorderStyle,
  Document,
  Footer,
  Packer,
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
import JSZip from 'jszip';
import { saveAs } from 'file-saver';
import type {
  ExamHeaderMeta,
  ShuffledExamBundle,
  ShuffledExamVariant,
} from '../utils/examShuffler';

const FONT_FAMILY = 'Times New Roman';
const FONT_SIZE_12PT = 24; // docx uses half-points: 12pt = 24
const FONT_SIZE_11PT = 22;
const FONT_SIZE_13PT = 26;
const FONT_SIZE_10PT = 20;

const A4_WIDTH_TWIP = convertMillimetersToTwip(210);
const A4_HEIGHT_TWIP = convertMillimetersToTwip(297);
const MARGIN_TOP_TWIP = convertMillimetersToTwip(20); // 2cm
const MARGIN_BOTTOM_TWIP = convertMillimetersToTwip(20); // 2cm
const MARGIN_LEFT_TWIP = convertMillimetersToTwip(25); // 2.5cm
const MARGIN_RIGHT_TWIP = convertMillimetersToTwip(20); // 2cm

const NO_BORDER = { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' };
const THIN_BORDER = { style: BorderStyle.SINGLE, size: 4, color: '334155' };
const BOX_BORDER = { style: BorderStyle.SINGLE, size: 6, color: '0F172A' };

const NO_BORDERS_ALL = {
  top: NO_BORDER,
  bottom: NO_BORDER,
  left: NO_BORDER,
  right: NO_BORDER,
  insideHorizontal: NO_BORDER,
  insideVertical: NO_BORDER,
};

const TABLE_BORDERS_ALL = {
  top: THIN_BORDER,
  bottom: THIN_BORDER,
  left: THIN_BORDER,
  right: THIN_BORDER,
  insideHorizontal: THIN_BORDER,
  insideVertical: THIN_BORDER,
};

interface InlineStyleFlags {
  bold?: boolean;
  italics?: boolean;
  size?: number;
}

/**
 * Cleans common LaTeX/HTML tokens from parsed Word text and converts inline bold/italic/sub/sup
 * into native Word TextRun objects formatted in Times New Roman 12pt.
 */
function normalizeRichTextForWord(raw: string): string {
  if (!raw) return '';
  let text = raw
    .replace(/\r\n/g, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&amp;/gi, '&')
    .replace(/\\xrightarrow\{([^}]*)\}/g, ' →[$1] ')
    .replace(/\\rightarrow|\\to\b/g, ' → ')
    .replace(/\\rightleftharpoons|\\leftrightarrow/g, ' ⇌ ')
    .replace(/\\uparrow/g, '↑')
    .replace(/\\downarrow/g, '↓')
    .replace(/\\times/g, '×')
    .replace(/\\cdot/g, '·')
    .replace(/\\pm/g, '±')
    .replace(/\\le\b|\\leq\b/g, '≤')
    .replace(/\\ge\b|\\geq\b/g, '≥')
    .replace(/\\neq\b/g, '≠')
    .replace(/\\approx\b/g, '≈')
    .replace(/\\Delta\b/g, 'Δ')
    .replace(/\\alpha\b/g, 'α')
    .replace(/\\beta\b/g, 'β')
    .replace(/\\gamma\b/g, 'γ')
    .replace(/\\pi\b/g, 'π')
    .replace(/\\degree|\^\\circ|\^\{\\circ\}/g, '°')
    .replace(/\\text\{([^}]*)\}/g, '$1')
    .replace(/\\mathrm\{([^}]*)\}/g, '$1')
    .replace(/\\ce\{([^}]*)\}/g, '$1')
    .replace(/\\frac\{([^}]*)\}\{([^}]*)\}/g, '($1/$2)')
    .replace(/\\sqrt\{([^}]*)\}/g, '√($1)')
    .replace(/\\,/g, ' ')
    .replace(/\\;/g, ' ')
    .replace(/\$\$/g, '')
    .replace(/\$/g, '');

  // Strip stray HTML tags except <sub>, <sup>, <b>, <strong>, <i>, <em>
  text = text.replace(/<\/?(?!sub\b|sup\b|b\b|strong\b|i\b|em\b)[a-z][^>]*>/gi, '');

  // Normalize <strong>/<b> and <em>/<i> to markdown tokens for uniform parsing
  text = text
    .replace(/<(?:b|strong)>([\s\S]*?)<\/(?:b|strong)>/gi, '**$1**')
    .replace(/<(?:i|em)>([\s\S]*?)<\/(?:i|em)>/gi, '*$1*');

  return text.trim();
}

function buildTextRunsFromLine(line: string, base: InlineStyleFlags = {}): TextRun[] {
  const fontSize = base.size ?? FONT_SIZE_12PT;
  const runs: TextRun[] = [];

  // Tokenize bold (**...**), <sub>...</sub>, <sup>...</sup>, _{...}, ^{...}, _2, ^+
  const tokenRegex =
    /(\*\*[^*]+\*\*|<sub>[^<]+<\/sub>|<sup>[^<]+<\/sup>|_\{[^}]+\}|\^\{[^}]+\}|_[0-9]+|\^[0-9+-]+)/g;

  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = tokenRegex.exec(line)) !== null) {
    if (match.index > lastIndex) {
      const plain = line.slice(lastIndex, match.index);
      if (plain) {
        runs.push(
          new TextRun({
            text: plain,
            font: FONT_FAMILY,
            size: fontSize,
            bold: base.bold,
            italics: base.italics,
          })
        );
      }
    }

    const token = match[0];
    if (token.startsWith('**') && token.endsWith('**')) {
      runs.push(
        new TextRun({
          text: token.slice(2, -2),
          font: FONT_FAMILY,
          size: fontSize,
          bold: true,
          italics: base.italics,
        })
      );
    } else if (token.toLowerCase().startsWith('<sub>')) {
      runs.push(
        new TextRun({
          text: token.slice(5, -6),
          font: FONT_FAMILY,
          size: fontSize,
          subScript: true,
          bold: base.bold,
          italics: base.italics,
        })
      );
    } else if (token.toLowerCase().startsWith('<sup>')) {
      runs.push(
        new TextRun({
          text: token.slice(5, -6),
          font: FONT_FAMILY,
          size: fontSize,
          superScript: true,
          bold: base.bold,
          italics: base.italics,
        })
      );
    } else if (token.startsWith('_{') && token.endsWith('}')) {
      runs.push(
        new TextRun({
          text: token.slice(2, -1),
          font: FONT_FAMILY,
          size: fontSize,
          subScript: true,
          bold: base.bold,
          italics: base.italics,
        })
      );
    } else if (token.startsWith('^{') && token.endsWith('}')) {
      runs.push(
        new TextRun({
          text: token.slice(2, -1),
          font: FONT_FAMILY,
          size: fontSize,
          superScript: true,
          bold: base.bold,
          italics: base.italics,
        })
      );
    } else if (token.startsWith('_')) {
      runs.push(
        new TextRun({
          text: token.slice(1),
          font: FONT_FAMILY,
          size: fontSize,
          subScript: true,
          bold: base.bold,
          italics: base.italics,
        })
      );
    } else if (token.startsWith('^')) {
      runs.push(
        new TextRun({
          text: token.slice(1),
          font: FONT_FAMILY,
          size: fontSize,
          superScript: true,
          bold: base.bold,
          italics: base.italics,
        })
      );
    }

    lastIndex = match.index + token.length;
  }

  if (lastIndex < line.length) {
    const rest = line.slice(lastIndex);
    if (rest) {
      runs.push(
        new TextRun({
          text: rest,
          font: FONT_FAMILY,
          size: fontSize,
          bold: base.bold,
          italics: base.italics,
        })
      );
    }
  }

  if (runs.length === 0) {
    runs.push(
      new TextRun({
        text: '',
        font: FONT_FAMILY,
        size: fontSize,
        bold: base.bold,
        italics: base.italics,
      })
    );
  }

  return runs;
}

/**
 * Strips leading duplicated question number prefix (e.g. "Câu 12.", "Câu 1:") from content
 * so re-numbered shuffled questions never show "Câu 1. Câu 12. ...".
 */
function stripLeadingQuestionPrefix(content: string): string {
  return content
    .replace(/^\s*(?:\*\*)?(?:Câu|Bài)\s*\d+\s*[:.)\-–—]?\s*(?:\*\*)?\s*/i, '')
    .trim();
}

/**
 * Strips leading duplicated option prefix (e.g. "A.", "B)") from option text.
 */
function stripLeadingOptionPrefix(text: string): string {
  return text.replace(/^\s*(?:\*\*)?[A-H]\s*[.)]\s*(?:\*\*)?\s*/i, '').trim();
}

/**
 * Strips leading duplicated statement prefix (e.g. "a)", "b.") from Part II statement text.
 */
function stripLeadingStatementPrefix(text: string): string {
  return text.replace(/^\s*(?:\*\*)?[a-h]\s*[.)]\s*(?:\*\*)?\s*/, '').trim();
}

function buildExamHeaderBlock(meta: ExamHeaderMeta, variantCode: string): (Paragraph | Table)[] {
  const schoolUpper = (meta.schoolName || 'TRƯỜNG THPT ...').trim().toUpperCase();
  const deptUpper = (meta.departmentName || 'SỞ GIÁO DỤC VÀ ĐÀO TẠO').trim().toUpperCase();
  const examTitleUpper = (meta.examTitle || 'ĐỀ KIỂM TRA ĐỊNH KỲ').trim().toUpperCase();
  const subjectText = (meta.subjectName || 'Hóa học').trim();
  const yearText = (meta.schoolYear || 'Năm học 2025 – 2026').trim();
  const durationText = `Thời gian làm bài: ${meta.durationMinutes || 50} phút, không kể thời gian phát đề`;

  const topBannerTable = new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: NO_BORDERS_ALL,
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
                children: [
                  new TextRun({
                    text: deptUpper,
                    font: FONT_FAMILY,
                    size: FONT_SIZE_11PT,
                  }),
                ],
              }),
              new Paragraph({
                alignment: AlignmentType.CENTER,
                spacing: { after: 40 },
                children: [
                  new TextRun({
                    text: schoolUpper,
                    font: FONT_FAMILY,
                    size: FONT_SIZE_11PT,
                    bold: true,
                  }),
                ],
              }),
              new Paragraph({
                alignment: AlignmentType.CENTER,
                spacing: { after: 40 },
                children: [
                  new TextRun({
                    text: 'ĐỀ CHÍNH THỨC',
                    font: FONT_FAMILY,
                    size: FONT_SIZE_11PT,
                    bold: true,
                  }),
                ],
              }),
              new Paragraph({
                alignment: AlignmentType.CENTER,
                children: [
                  new TextRun({
                    text: '——————————',
                    font: FONT_FAMILY,
                    size: FONT_SIZE_10PT,
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
                children: [
                  new TextRun({
                    text: examTitleUpper,
                    font: FONT_FAMILY,
                    size: FONT_SIZE_12PT,
                    bold: true,
                  }),
                ],
              }),
              new Paragraph({
                alignment: AlignmentType.CENTER,
                spacing: { after: 40 },
                children: [
                  new TextRun({
                    text: yearText.toUpperCase(),
                    font: FONT_FAMILY,
                    size: FONT_SIZE_11PT,
                    bold: true,
                  }),
                ],
              }),
              new Paragraph({
                alignment: AlignmentType.CENTER,
                spacing: { after: 40 },
                children: [
                  new TextRun({
                    text: `Môn: ${subjectText}`,
                    font: FONT_FAMILY,
                    size: FONT_SIZE_12PT,
                    bold: true,
                  }),
                ],
              }),
              new Paragraph({
                alignment: AlignmentType.CENTER,
                children: [
                  new TextRun({
                    text: durationText,
                    font: FONT_FAMILY,
                    size: FONT_SIZE_11PT,
                    italics: true,
                  }),
                ],
              }),
            ],
          }),
        ],
      }),
    ],
  });

  const studentAndCodeTable = new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: NO_BORDERS_ALL,
    rows: [
      new TableRow({
        children: [
          new TableCell({
            width: { size: 74, type: WidthType.PERCENTAGE },
            verticalAlign: VerticalAlign.CENTER,
            margins: { top: 80, bottom: 80, left: 40, right: 120 },
            children: [
              new Paragraph({
                spacing: { after: 60 },
                children: [
                  new TextRun({
                    text: 'Họ và tên thí sinh: ',
                    font: FONT_FAMILY,
                    size: FONT_SIZE_12PT,
                    bold: true,
                  }),
                  new TextRun({
                    text: '.........................................................................',
                    font: FONT_FAMILY,
                    size: FONT_SIZE_12PT,
                  }),
                ],
              }),
              new Paragraph({
                children: [
                  new TextRun({
                    text: 'Số báo danh: ',
                    font: FONT_FAMILY,
                    size: FONT_SIZE_12PT,
                    bold: true,
                  }),
                  new TextRun({
                    text: '.....................................   ',
                    font: FONT_FAMILY,
                    size: FONT_SIZE_12PT,
                  }),
                  new TextRun({
                    text: 'Lớp: ',
                    font: FONT_FAMILY,
                    size: FONT_SIZE_12PT,
                    bold: true,
                  }),
                  new TextRun({
                    text: '......................',
                    font: FONT_FAMILY,
                    size: FONT_SIZE_12PT,
                  }),
                ],
              }),
            ],
          }),
          new TableCell({
            width: { size: 26, type: WidthType.PERCENTAGE },
            verticalAlign: VerticalAlign.CENTER,
            borders: {
              top: BOX_BORDER,
              bottom: BOX_BORDER,
              left: BOX_BORDER,
              right: BOX_BORDER,
            },
            margins: { top: 100, bottom: 100, left: 100, right: 100 },
            children: [
              new Paragraph({
                alignment: AlignmentType.CENTER,
                children: [
                  new TextRun({
                    text: `Mã đề thi: ${variantCode}`,
                    font: FONT_FAMILY,
                    size: FONT_SIZE_12PT,
                    bold: true,
                  }),
                ],
              }),
            ],
          }),
        ],
      }),
    ],
  });

  const divider = new Paragraph({
    spacing: { before: 80, after: 140 },
    border: {
      bottom: { style: BorderStyle.SINGLE, size: 6, color: '1E293B' },
    },
    children: [],
  });

  return [
    topBannerTable,
    new Paragraph({ spacing: { before: 100, after: 40 }, children: [] }),
    studentAndCodeTable,
    divider,
  ];
}

function buildQuestionParagraphs(label: string, rawContent: string): Paragraph[] {
  const normalized = normalizeRichTextForWord(stripLeadingQuestionPrefix(rawContent));
  const lines = normalized.split('\n').filter((l, idx) => idx === 0 || l.trim().length > 0);
  if (lines.length === 0) {
    return [
      new Paragraph({
        spacing: { before: 120, after: 60, line: 276 },
        children: [
          new TextRun({
            text: `${label} `,
            font: FONT_FAMILY,
            size: FONT_SIZE_12PT,
            bold: true,
          }),
        ],
      }),
    ];
  }

  return lines.map((line, idx) => {
    if (idx === 0) {
      return new Paragraph({
        spacing: { before: 120, after: 50, line: 276 },
        alignment: AlignmentType.JUSTIFIED,
        children: [
          new TextRun({
            text: `${label} `,
            font: FONT_FAMILY,
            size: FONT_SIZE_12PT,
            bold: true,
          }),
          ...buildTextRunsFromLine(line),
        ],
      });
    }
    return new Paragraph({
      spacing: { before: 20, after: 50, line: 276 },
      indent: { left: convertMillimetersToTwip(5) },
      alignment: AlignmentType.JUSTIFIED,
      children: buildTextRunsFromLine(line),
    });
  });
}

function buildPart1OptionsElements(
  options: Array<{ id: string; text: string }>
): (Paragraph | Table)[] {
  if (options.length === 0) return [];

  const cleanedOpts = options.map((opt) => ({
    id: opt.id,
    text: normalizeRichTextForWord(stripLeadingOptionPrefix(opt.text || '')),
  }));

  const maxLen = Math.max(...cleanedOpts.map((o) => o.text.length));
  const hasMultiline = cleanedOpts.some((o) => o.text.includes('\n'));

  // 4-column single row for short options (<= 16 chars)
  if (!hasMultiline && cleanedOpts.length === 4 && maxLen <= 16) {
    return [
      new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        borders: NO_BORDERS_ALL,
        rows: [
          new TableRow({
            children: cleanedOpts.map(
              (opt) =>
                new TableCell({
                  width: { size: 25, type: WidthType.PERCENTAGE },
                  margins: { top: 20, bottom: 40, left: 60, right: 60 },
                  children: [
                    new Paragraph({
                      spacing: { after: 20, line: 264 },
                      children: [
                        new TextRun({
                          text: `${opt.id}. `,
                          font: FONT_FAMILY,
                          size: FONT_SIZE_12PT,
                          bold: true,
                        }),
                        ...buildTextRunsFromLine(opt.text),
                      ],
                    }),
                  ],
                })
            ),
          }),
        ],
      }),
    ];
  }

  // 2x2 grid for medium options (<= 38 chars)
  if (!hasMultiline && cleanedOpts.length === 4 && maxLen <= 38) {
    const buildRow = (pair: typeof cleanedOpts) =>
      new TableRow({
        children: pair.map(
          (opt) =>
            new TableCell({
              width: { size: 50, type: WidthType.PERCENTAGE },
              margins: { top: 20, bottom: 40, left: 60, right: 80 },
              children: [
                new Paragraph({
                  spacing: { after: 20, line: 264 },
                  children: [
                    new TextRun({
                      text: `${opt.id}. `,
                      font: FONT_FAMILY,
                      size: FONT_SIZE_12PT,
                      bold: true,
                    }),
                    ...buildTextRunsFromLine(opt.text),
                  ],
                }),
              ],
            })
        ),
      });

    return [
      new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        borders: NO_BORDERS_ALL,
        rows: [buildRow(cleanedOpts.slice(0, 2)), buildRow(cleanedOpts.slice(2, 4))],
      }),
    ];
  }

  // Vertical 1-per-line layout for longer options
  return cleanedOpts.map(
    (opt) =>
      new Paragraph({
        spacing: { before: 20, after: 40, line: 276 },
        indent: { left: convertMillimetersToTwip(5) },
        alignment: AlignmentType.JUSTIFIED,
        children: [
          new TextRun({
            text: `${opt.id}. `,
            font: FONT_FAMILY,
            size: FONT_SIZE_12PT,
            bold: true,
          }),
          ...buildTextRunsFromLine(opt.text.replace(/\n/g, ' ')),
        ],
      })
  );
}

/**
 * Creates a formatted Word (.docx) Document for a single shuffled exam variant.
 */
export function buildVariantExamDocument(
  variant: ShuffledExamVariant,
  meta: ExamHeaderMeta
): Document {
  const children: (Paragraph | Table)[] = [
    ...buildExamHeaderBlock(meta, variant.variantCode),
  ];

  // PHẦN I
  if (variant.part1.length > 0) {
    children.push(
      new Paragraph({
        spacing: { before: 120, after: 40 },
        children: [
          new TextRun({
            text: 'PHẦN I. Câu trắc nghiệm nhiều phương án lựa chọn. ',
            font: FONT_FAMILY,
            size: FONT_SIZE_12PT,
            bold: true,
          }),
          new TextRun({
            text: `Thí sinh trả lời từ câu 1 đến câu ${variant.part1.length}. Mỗi câu hỏi thí sinh chỉ chọn một phương án.`,
            font: FONT_FAMILY,
            size: FONT_SIZE_12PT,
            italics: true,
          }),
        ],
      })
    );

    for (const item of variant.part1) {
      children.push(...buildQuestionParagraphs(`Câu ${item.newNumber}.`, item.question.content));
      if (Array.isArray(item.question.options) && item.question.options.length > 0) {
        children.push(...buildPart1OptionsElements(item.question.options));
      }
    }
  }

  // PHẦN II
  if (variant.part2.length > 0) {
    children.push(
      new Paragraph({
        spacing: { before: 200, after: 40 },
        children: [
          new TextRun({
            text: 'PHẦN II. Câu trắc nghiệm đúng sai. ',
            font: FONT_FAMILY,
            size: FONT_SIZE_12PT,
            bold: true,
          }),
          new TextRun({
            text: `Thí sinh trả lời từ câu 1 đến câu ${variant.part2.length}. Trong mỗi ý a), b), c), d) ở mỗi câu, thí sinh chọn đúng hoặc sai.`,
            font: FONT_FAMILY,
            size: FONT_SIZE_12PT,
            italics: true,
          }),
        ],
      })
    );

    for (const item of variant.part2) {
      children.push(...buildQuestionParagraphs(`Câu ${item.newNumber}.`, item.question.content));
      const statements = Array.isArray(item.question.statements) ? item.question.statements : [];
      for (const st of statements) {
        const cleanSt = normalizeRichTextForWord(stripLeadingStatementPrefix(st.statement || ''));
        children.push(
          new Paragraph({
            spacing: { before: 30, after: 40, line: 276 },
            indent: { left: convertMillimetersToTwip(6) },
            alignment: AlignmentType.JUSTIFIED,
            children: [
              new TextRun({
                text: `${st.id}) `,
                font: FONT_FAMILY,
                size: FONT_SIZE_12PT,
                bold: true,
              }),
              ...buildTextRunsFromLine(cleanSt.replace(/\n/g, ' ')),
            ],
          })
        );
      }
    }
  }

  // PHẦN III
  if (variant.part3.length > 0) {
    children.push(
      new Paragraph({
        spacing: { before: 200, after: 40 },
        children: [
          new TextRun({
            text: 'PHẦN III. Câu trắc nghiệm trả lời ngắn. ',
            font: FONT_FAMILY,
            size: FONT_SIZE_12PT,
            bold: true,
          }),
          new TextRun({
            text: `Thí sinh trả lời từ câu 1 đến câu ${variant.part3.length}.`,
            font: FONT_FAMILY,
            size: FONT_SIZE_12PT,
            italics: true,
          }),
        ],
      })
    );

    for (const item of variant.part3) {
      children.push(...buildQuestionParagraphs(`Câu ${item.newNumber}.`, item.question.content));
    }
  }

  // End marker
  children.push(
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 260, after: 60 },
      children: [
        new TextRun({
          text: '---------------- HẾT ----------------',
          font: FONT_FAMILY,
          size: FONT_SIZE_12PT,
          bold: true,
        }),
      ],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [
        new TextRun({
          text: '(Thí sinh không được sử dụng tài liệu. Cán bộ coi thi không giải thích gì thêm.)',
          font: FONT_FAMILY,
          size: FONT_SIZE_11PT,
          italics: true,
        }),
      ],
    })
  );

  return new Document({
    sections: [
      {
        properties: {
          page: {
            size: {
              width: A4_WIDTH_TWIP,
              height: A4_HEIGHT_TWIP,
            },
            margin: {
              top: MARGIN_TOP_TWIP,
              bottom: MARGIN_BOTTOM_TWIP,
              left: MARGIN_LEFT_TWIP,
              right: MARGIN_RIGHT_TWIP,
            },
          },
        },
        footers: {
          default: new Footer({
            children: [
              new Paragraph({
                alignment: AlignmentType.RIGHT,
                children: [
                  new TextRun({
                    text: `Trang `,
                    font: FONT_FAMILY,
                    size: FONT_SIZE_10PT,
                    italics: true,
                  }),
                  new TextRun({
                    children: [PageNumber.CURRENT],
                    font: FONT_FAMILY,
                    size: FONT_SIZE_10PT,
                    italics: true,
                  }),
                  new TextRun({
                    text: ' / ',
                    font: FONT_FAMILY,
                    size: FONT_SIZE_10PT,
                    italics: true,
                  }),
                  new TextRun({
                    children: [PageNumber.TOTAL_PAGES],
                    font: FONT_FAMILY,
                    size: FONT_SIZE_10PT,
                    italics: true,
                  }),
                  new TextRun({
                    text: `   —   Mã đề ${variant.variantCode}`,
                    font: FONT_FAMILY,
                    size: FONT_SIZE_10PT,
                    bold: true,
                  }),
                ],
              }),
            ],
          }),
        },
        children,
      },
    ],
  });
}

function makeMatrixHeaderCell(text: string, widthPercent: number): TableCell {
  return new TableCell({
    width: { size: widthPercent, type: WidthType.PERCENTAGE },
    verticalAlign: VerticalAlign.CENTER,
    shading: { type: ShadingType.SOLID, color: 'E2E8F0', fill: 'E2E8F0' },
    margins: { top: 80, bottom: 80, left: 60, right: 60 },
    children: [
      new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [
          new TextRun({
            text,
            font: FONT_FAMILY,
            size: FONT_SIZE_11PT,
            bold: true,
          }),
        ],
      }),
    ],
  });
}

function makeMatrixCell(text: string, widthPercent: number, bold = false): TableCell {
  return new TableCell({
    width: { size: widthPercent, type: WidthType.PERCENTAGE },
    verticalAlign: VerticalAlign.CENTER,
    margins: { top: 55, bottom: 55, left: 60, right: 60 },
    children: [
      new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [
          new TextRun({
            text,
            font: FONT_FAMILY,
            size: FONT_SIZE_11PT,
            bold,
          }),
        ],
      }),
    ],
  });
}

/**
 * Creates a consolidated Answer Key Matrix Word (.docx) document comparing all generated exam codes.
 */
export function buildConsolidatedAnswerKeyDocument(bundle: ShuffledExamBundle): Document {
  const { meta, variants, sourceCounts } = bundle;
  const children: (Paragraph | Table)[] = [];

  children.push(
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 40 },
      children: [
        new TextRun({
          text: (meta.schoolName || 'TRƯỜNG THPT ...').trim().toUpperCase(),
          font: FONT_FAMILY,
          size: FONT_SIZE_11PT,
          bold: true,
        }),
      ],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 40, after: 40 },
      children: [
        new TextRun({
          text: 'BẢNG ĐÁP ÁN TỔNG HỢP CÁC MÃ ĐỀ',
          font: FONT_FAMILY,
          size: FONT_SIZE_13PT,
          bold: true,
        }),
      ],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 40 },
      children: [
        new TextRun({
          text: `${(meta.examTitle || 'ĐỀ KIỂM TRA').trim()} — Môn: ${(meta.subjectName || 'Hóa học').trim()}`,
          font: FONT_FAMILY,
          size: FONT_SIZE_12PT,
          bold: true,
        }),
      ],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 180 },
      children: [
        new TextRun({
          text: `${meta.schoolYear || 'Năm học 2025 – 2026'}  ·  Tổng cộng ${variants.length} mã đề (${variants.map((v) => v.variantCode).join(', ')})`,
          font: FONT_FAMILY,
          size: FONT_SIZE_11PT,
          italics: true,
        }),
      ],
    })
  );

  const firstColPct = 14;
  const variantColPct = Math.floor((100 - firstColPct) / Math.max(1, variants.length));

  // PART I MATRIX
  if (sourceCounts.part1 > 0) {
    children.push(
      new Paragraph({
        spacing: { before: 120, after: 80 },
        children: [
          new TextRun({
            text: `PHẦN I. ĐÁP ÁN TRẮC NGHIỆM NHIỀU PHƯƠNG ÁN LỰA CHỌN (${sourceCounts.part1} câu)`,
            font: FONT_FAMILY,
            size: FONT_SIZE_12PT,
            bold: true,
          }),
        ],
      })
    );

    const headerRow = new TableRow({
      tableHeader: true,
      children: [
        makeMatrixHeaderCell('Câu', firstColPct),
        ...variants.map((v) => makeMatrixHeaderCell(`Mã ${v.variantCode}`, variantColPct)),
      ],
    });

    const dataRows: TableRow[] = [];
    for (let qNum = 1; qNum <= sourceCounts.part1; qNum++) {
      dataRows.push(
        new TableRow({
          children: [
            makeMatrixCell(String(qNum), firstColPct, true),
            ...variants.map((v) => makeMatrixCell(v.part1Answers[qNum] || '—', variantColPct, true)),
          ],
        })
      );
    }

    children.push(
      new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        borders: TABLE_BORDERS_ALL,
        rows: [headerRow, ...dataRows],
      })
    );
  }

  // PART II MATRIX
  if (sourceCounts.part2 > 0) {
    children.push(
      new Paragraph({
        spacing: { before: 220, after: 80 },
        children: [
          new TextRun({
            text: `PHẦN II. ĐÁP ÁN TRẮC NGHIỆM ĐÚNG / SAI (${sourceCounts.part2} câu — Đ: Đúng, S: Sai)`,
            font: FONT_FAMILY,
            size: FONT_SIZE_12PT,
            bold: true,
          }),
        ],
      })
    );

    const qColPct = 10;
    const subColPct = 8;
    const p2VarColPct = Math.floor((100 - qColPct - subColPct) / Math.max(1, variants.length));

    const headerRow = new TableRow({
      tableHeader: true,
      children: [
        makeMatrixHeaderCell('Câu', qColPct),
        makeMatrixHeaderCell('Ý', subColPct),
        ...variants.map((v) => makeMatrixHeaderCell(`Mã ${v.variantCode}`, p2VarColPct)),
      ],
    });

    const dataRows: TableRow[] = [];
    for (let qNum = 1; qNum <= sourceCounts.part2; qNum++) {
      // Collect union of sub-statement keys across variants (typically a, b, c, d)
      const firstVarMap = variants[0]?.part2Answers[qNum] || { a: false, b: false, c: false, d: false };
      const letters = Object.keys(firstVarMap).length > 0 ? Object.keys(firstVarMap) : ['a', 'b', 'c', 'd'];

      letters.forEach((letter, lIdx) => {
        dataRows.push(
          new TableRow({
            children: [
              makeMatrixCell(lIdx === 0 ? `Câu ${qNum}` : '', qColPct, true),
              makeMatrixCell(`${letter})`, subColPct, true),
              ...variants.map((v) => {
                const map = v.part2Answers[qNum];
                const val = map && letter in map ? (map[letter] ? 'Đ' : 'S') : '—';
                return makeMatrixCell(val, p2VarColPct, val === 'Đ');
              }),
            ],
          })
        );
      });
    }

    children.push(
      new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        borders: TABLE_BORDERS_ALL,
        rows: [headerRow, ...dataRows],
      })
    );
  }

  // PART III MATRIX
  if (sourceCounts.part3 > 0) {
    children.push(
      new Paragraph({
        spacing: { before: 220, after: 80 },
        children: [
          new TextRun({
            text: `PHẦN III. ĐÁP ÁN TRẢ LỜI NGẮN (${sourceCounts.part3} câu)`,
            font: FONT_FAMILY,
            size: FONT_SIZE_12PT,
            bold: true,
          }),
        ],
      })
    );

    const headerRow = new TableRow({
      tableHeader: true,
      children: [
        makeMatrixHeaderCell('Câu', firstColPct),
        ...variants.map((v) => makeMatrixHeaderCell(`Mã ${v.variantCode}`, variantColPct)),
      ],
    });

    const dataRows: TableRow[] = [];
    for (let qNum = 1; qNum <= sourceCounts.part3; qNum++) {
      dataRows.push(
        new TableRow({
          children: [
            makeMatrixCell(String(qNum), firstColPct, true),
            ...variants.map((v) => makeMatrixCell(v.part3Answers[qNum] || '—', variantColPct, true)),
          ],
        })
      );
    }

    children.push(
      new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        borders: TABLE_BORDERS_ALL,
        rows: [headerRow, ...dataRows],
      })
    );
  }

  return new Document({
    sections: [
      {
        properties: {
          page: {
            size: {
              width: A4_WIDTH_TWIP,
              height: A4_HEIGHT_TWIP,
            },
            margin: {
              top: MARGIN_TOP_TWIP,
              bottom: MARGIN_BOTTOM_TWIP,
              left: MARGIN_LEFT_TWIP,
              right: MARGIN_RIGHT_TWIP,
            },
          },
        },
        footers: {
          default: new Footer({
            children: [
              new Paragraph({
                alignment: AlignmentType.RIGHT,
                children: [
                  new TextRun({
                    text: 'Bảng đáp án tổng hợp  ·  Trang ',
                    font: FONT_FAMILY,
                    size: FONT_SIZE_10PT,
                    italics: true,
                  }),
                  new TextRun({
                    children: [PageNumber.CURRENT],
                    font: FONT_FAMILY,
                    size: FONT_SIZE_10PT,
                    italics: true,
                  }),
                  new TextRun({
                    text: ' / ',
                    font: FONT_FAMILY,
                    size: FONT_SIZE_10PT,
                    italics: true,
                  }),
                  new TextRun({
                    children: [PageNumber.TOTAL_PAGES],
                    font: FONT_FAMILY,
                    size: FONT_SIZE_10PT,
                    italics: true,
                  }),
                ],
              }),
            ],
          }),
        },
        children,
      },
    ],
  });
}

function sanitizeFileName(raw: string): string {
  return (raw || 'De_Thi')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .replace(/[^a-zA-Z0-9_-]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 64) || 'De_Thi';
}

/**
 * Generates a single variant Word (.docx) Blob.
 */
export async function generateVariantDocxBlob(
  variant: ShuffledExamVariant,
  meta: ExamHeaderMeta
): Promise<Blob> {
  const doc = buildVariantExamDocument(variant, meta);
  return Packer.toBlob(doc);
}

/**
 * Generates the consolidated answer key Word (.docx) Blob.
 */
export async function generateAnswerKeyDocxBlob(bundle: ShuffledExamBundle): Promise<Blob> {
  const doc = buildConsolidatedAnswerKeyDocument(bundle);
  return Packer.toBlob(doc);
}

/**
 * Downloads a single variant Word file (`De_<CODE>.docx`).
 */
export async function downloadSingleVariantDocx(
  variant: ShuffledExamVariant,
  meta: ExamHeaderMeta
): Promise<void> {
  const blob = await generateVariantDocxBlob(variant, meta);
  const safeCode = sanitizeFileName(variant.variantCode);
  saveAs(blob, `De_${safeCode}.docx`);
}

/**
 * Downloads the consolidated answer key Word file (`Bang_Dap_An_Tong_Hop.docx`).
 */
export async function downloadConsolidatedAnswerKeyDocx(bundle: ShuffledExamBundle): Promise<void> {
  const blob = await generateAnswerKeyDocxBlob(bundle);
  saveAs(blob, 'Bang_Dap_An_Tong_Hop.docx');
}

/**
 * Packages all shuffled exam variants (`De_101.docx`, `De_102.docx`, ...) and
 * the consolidated answer key matrix (`Bang_Dap_An_Tong_Hop.docx`) into a single `.zip`
 * file entirely on the client side and initiates browser download.
 */
export async function exportShuffledExamBundleAsZip(
  bundle: ShuffledExamBundle,
  onProgress?: (percent: number, message: string) => void
): Promise<{ fileName: string; fileCount: number }> {
  const zip = new JSZip();
  const totalSteps = bundle.variants.length + 2;

  for (let i = 0; i < bundle.variants.length; i++) {
    const variant = bundle.variants[i];
    onProgress?.(
      Math.round(((i + 0.5) / totalSteps) * 100),
      `Đang tạo file Word cho Mã đề ${variant.variantCode}...`
    );
    const docxBlob = await generateVariantDocxBlob(variant, bundle.meta);
    const safeCode = sanitizeFileName(variant.variantCode);
    zip.file(`De_${safeCode}.docx`, docxBlob);
  }

  onProgress?.(
    Math.round(((bundle.variants.length + 0.6) / totalSteps) * 100),
    'Đang tạo bảng đáp án tổng hợp tất cả các mã đề...'
  );
  const answerKeyBlob = await generateAnswerKeyDocxBlob(bundle);
  zip.file('Bang_Dap_An_Tong_Hop.docx', answerKeyBlob);

  onProgress?.(92, 'Đang nén tất cả tệp Word vào gói .zip...');
  const zipBlob = await zip.generateAsync({
    type: 'blob',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 },
  });

  const slug = sanitizeFileName(bundle.meta.examTitle || 'Bo_De_Tron');
  const fileName = `${slug}_${bundle.variants.length}MaDe.zip`;
  saveAs(zipBlob, fileName);

  onProgress?.(100, `Đã xuất thành công ${bundle.variants.length} đề thi và 1 bảng đáp án.`);
  return {
    fileName,
    fileCount: bundle.variants.length + 1,
  };
}
