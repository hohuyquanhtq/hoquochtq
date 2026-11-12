import mammoth from 'mammoth';
import { Question, QuestionType, ParsedExamResult, MultipleChoiceOption, TrueFalseStatement } from '../types';
import { extractComprehensiveAnswerKeys, buildAnswerRecognitionItems } from './answerRecognizer';
import { readDocxStructure } from './answerExtractionEngine/documentTableReader';

/**
 * Extracts structured Markdown text with preserved table grids from DOCX ArrayBuffer
 */
export async function extractTextFromDocx(arrayBuffer: ArrayBuffer): Promise<string> {
  try {
    const { fullMarkdownText } = await readDocxStructure(arrayBuffer);
    if (fullMarkdownText && fullMarkdownText.trim().length > 0) {
      return fullMarkdownText;
    }
    const result = await mammoth.extractRawText({ arrayBuffer });
    return result.value || '';
  } catch (err) {
    console.error('Error extracting text from DOCX:', err);
    throw new Error('Không thể đọc nội dung file DOCX. Vui lòng kiểm tra định dạng file.');
  }
}

/**
 * Extracts text from PDF using PDF.js
 */
export async function extractTextFromPdf(arrayBuffer: ArrayBuffer): Promise<string> {
  const pdfjs = (window as any).pdfjsLib;
  if (!pdfjs) {
    throw new Error('Thư viện xử lý PDF đang tải hoặc chưa sẵn sàng. Vui lòng thử lại sau vài giây hoặc dán nội dung văn bản.');
  }

  try {
    if (!pdfjs.GlobalWorkerOptions.workerSrc) {
      pdfjs.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.js';
    }

    const pdf = await pdfjs.getDocument({
      data: arrayBuffer,
      cMapPacked: true,
      disableFontFace: true,
    }).promise;
    let fullText = '';

    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const content = await page.getTextContent();
      
      // Group items by line according to their vertical Y coordinate
      const lineMap = new Map<number, { x: number; text: string }[]>();
      
      content.items.forEach((item: any) => {
        if (!item.str) return;
        const y = Math.round(item.transform[5]); // Y coordinate
        const x = item.transform[4];            // X coordinate
        
        // Find existing close Y (within 4 pixels tolerance)
        let matchedY = y;
        for (const existingY of lineMap.keys()) {
          if (Math.abs(existingY - y) <= 4) {
            matchedY = existingY;
            break;
          }
        }

        if (!lineMap.has(matchedY)) {
          lineMap.set(matchedY, []);
        }
        lineMap.get(matchedY)!.push({ x, text: item.str });
      });

      // Sort Y descending (top of page to bottom)
      const sortedY = Array.from(lineMap.keys()).sort((a, b) => b - a);

      sortedY.forEach(y => {
        const lineItems = lineMap.get(y)!;
        // Sort X ascending (left to right)
        lineItems.sort((a, b) => a.x - b.x);
        const lineStr = lineItems.map(it => it.text).join(' ').trim();
        if (lineStr) {
          fullText += lineStr + '\n';
        }
      });

      fullText += '\n';
    }

    return fullText;
  } catch (err: any) {
    console.error('Error extracting PDF:', err);
    throw new Error('Lỗi khi đọc file PDF: ' + (err.message || 'File có thể bị mã hóa hoặc lỗi định dạng.'));
  }
}

interface SectionAnswers {
  part1: Map<number, string>; // questionNum -> 'A' | 'B' | 'C' | 'D'
  part2: Map<number, Record<string, boolean>>; // questionNum -> { a: true, b: true, c: true, d: false }
  part3: Map<number, string>; // questionNum -> "6" or "188,0"
  explanations: Map<string, string>; // "part1_1" or "part3_2" -> explanation text
}

/**
 * Parses Vietnamese Chemistry Exam text into structured Question array
 */
export function parseExamContent(rawText: string, defaultGrade: '10' | '11' | '12' | 'chuyen_hsg' = '12'): ParsedExamResult {
  const lines = rawText.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  
  // Find exam title
  let title = 'Đề kiểm tra Hóa học';
  for (let i = 0; i < Math.min(8, lines.length); i++) {
    const line = lines[i];
    if (/ĐỀ (THI|KIỂM TRA|KHẢO SÁT|ÔN TẬP)/i.test(line) || /HÓA HỌC/i.test(line)) {
      title = line.replace(/^[#*_\s\-–—:]+|[#*_\s\-–—:]+$/g, '');
      break;
    }
  }

  // Pre-extract Answer Keys block
  const answerKeys = extractComprehensiveAnswerKeys(rawText);

  // Section headers regex
  const part1Regex = /PHẦN\s+(I|1)[\s.:\-–—]+(TRẮC NGHIỆM|CÂU HỎI TRẮC NGHIỆM|NHIỀU LỰA CHỌN|4 LỰA CHỌN|CÂU TRẮC NGHIỆM NHIỀU PHƯƠNG ÁN LỰA CHỌN|LỰA CHỌN)/i;
  const part2Regex = /PHẦN\s+(II|2)[\s.:\-–—]+(TRẮC NGHIỆM|ĐÚNG\s*[-–—/]\s*SAI|CÂU HỎI ĐÚNG SAI|CÂU TRẮC NGHIỆM ĐÚNG SAI)/i;
  const part3Regex = /PHẦN\s+(III|3)[\s.:\-–—]+(TRẢ LỜI NGẮN|ĐIỀN KHUYẾT|TỰ LUẬN NGẮN|CÂU TRẮC NGHIỆM TRẢ LỜI NGẮN)/i;

  // Flexible question header regex: handles "Câu 1.", "Câu 1:", "Câu 1 -", and "Câu 1 (Biết - Lipid):"
  const questionHeaderRegex = /^Câu\s+(\d+)(?:\s*[\(\[][^\)\]]*[\)\]])?[\s.:\-–—]+(.*)$/i;

  let currentSection: QuestionType = 'part1_single_choice';
  const questions: Question[] = [];

  let currentQuestion: Partial<Question> | null = null;
  let currentSectionNum = 0;
  let currentOptionLetter: string | null = null;
  let currentStatementLetter: string | null = null;
  let tempContentLines: string[] = [];

  const finalizeCurrentQuestion = () => {
    if (!currentQuestion) return;

    if (tempContentLines.length > 0 && !currentQuestion.content) {
      currentQuestion.content = tempContentLines.join('\n').trim();
    }

    // Match answers using section-specific question number
    const qSecNum = currentSectionNum || 1;

    if (currentQuestion.type === 'part1_single_choice') {
      const detectedKey = answerKeys.part1.get(qSecNum);
      if (!currentQuestion.correctOptionId && detectedKey) {
        currentQuestion.correctOptionId = detectedKey.answer;
        currentQuestion.recognitionSource = detectedKey.source || 'answer_table';
        currentQuestion.teacherVerified = true;
      }
      if (currentQuestion.options) {
        if (!currentQuestion.correctOptionId) {
          const found = currentQuestion.options.find(o => o.isCorrect);
          if (found) {
            currentQuestion.correctOptionId = found.id;
            currentQuestion.recognitionSource = 'question_content';
          }
        }
        if (currentQuestion.correctOptionId) {
          currentQuestion.options.forEach(o => {
            o.isCorrect = o.id === currentQuestion!.correctOptionId;
          });
        }
      }
    } else if (currentQuestion.type === 'part2_true_false') {
      const detectedTF = answerKeys.part2.get(qSecNum);
      if (detectedTF && currentQuestion.statements) {
        currentQuestion.recognitionSource = detectedTF.source || 'answer_table';
        currentQuestion.teacherVerified = true;
        currentQuestion.statements.forEach(st => {
          if (detectedTF.statements && detectedTF.statements[st.id] !== undefined) {
            st.correctAnswer = detectedTF.statements[st.id];
          }
        });
      }
    } else if (currentQuestion.type === 'part3_short_answer') {
      const detectedShort = answerKeys.part3.get(qSecNum);
      if (detectedShort && (!currentQuestion.shortAnswerConfig || currentQuestion.shortAnswerConfig.acceptableAnswers.length === 0)) {
        const cleanVal = (detectedShort.answer || '').trim();
        const isNum = !isNaN(Number(cleanVal.replace(',', '.')));
        currentQuestion.recognitionSource = detectedShort.source || 'answer_table';
        currentQuestion.teacherVerified = true;
        currentQuestion.shortAnswerConfig = {
          acceptableAnswers: detectedShort.acceptedAnswers && detectedShort.acceptedAnswers.length > 0 
            ? detectedShort.acceptedAnswers 
            : [cleanVal, cleanVal.replace(',', '.'), cleanVal.replace('.', ',')],
          isNumeric: isNum,
          numericValue: isNum ? parseFloat(cleanVal.replace(',', '.')) : undefined,
          tolerance: isNum ? 0.05 : undefined,
        };
      }
    }

    // Attach explanation if found in detailed solution section
    const expKey = `${currentQuestion.type}_${qSecNum}`;
    if (!currentQuestion.explanation && answerKeys.explanations.has(expKey)) {
      currentQuestion.explanation = answerKeys.explanations.get(expKey);
    }

    // Check status
    let parseStatus: 'verified' | 'needs_review' | 'error' = 'verified';
    let parseWarning = '';

    if (currentQuestion.type === 'part1_single_choice') {
      if (!currentQuestion.options || currentQuestion.options.length < 2) {
        parseStatus = 'error';
        parseWarning = 'Không tìm đủ các phương án A, B, C, D';
      } else if (!currentQuestion.correctOptionId) {
        parseStatus = 'needs_review';
        parseWarning = 'Chưa nhận dạng được đáp án đúng (A/B/C/D)';
      }
    } else if (currentQuestion.type === 'part2_true_false') {
      if (!currentQuestion.statements || currentQuestion.statements.length < 2) {
        parseStatus = 'needs_review';
        parseWarning = 'Chưa nhận dạng đủ các ý a, b, c, d';
      }
    } else if (currentQuestion.type === 'part3_short_answer') {
      if (!currentQuestion.shortAnswerConfig || currentQuestion.shortAnswerConfig.acceptableAnswers.length === 0) {
        parseStatus = 'needs_review';
        parseWarning = 'Chưa có đáp án số hoặc từ khóa trả lời ngắn';
      }
    }

    currentQuestion.parseStatus = parseStatus;
    currentQuestion.parseWarning = parseWarning;

    questions.push(currentQuestion as Question);
    currentQuestion = null;
    tempContentLines = [];
    currentOptionLetter = null;
    currentStatementLetter = null;
  };

  for (let idx = 0; idx < lines.length; idx++) {
    const line = lines[idx];

    // Detect Answer section starts (e.g. "ĐÁP ÁN:", "BẢNG ĐÁP ÁN", "HƯỚNG DẪN CHẤM", or repeated "PHẦN I" after questions)
    // Stop reading question prompts once answer key section is reached
    const isAnswerSectionStart = 
      /^[\-–—*_\s]*(?:BẢNG\s+)?(?:ĐÁP\s*ÁN|HƯỚNG\s*DẪN\s*(?:CHẤM|GIẢI\s*CHI\s*TIẾT))[\s.:\-–—]*$/i.test(line) ||
      (part1Regex.test(line) && questions.length >= 4) ||
      (/^Câu(?:\s*:)?\s+[\d\s]+$/i.test(line) && idx + 1 < lines.length && /^(?:Đáp\s*án|[a-d]\))/i.test(lines[idx + 1]));

    if (isAnswerSectionStart && idx > 5) {
      finalizeCurrentQuestion();
      break;
    }

    // Detect Section transitions
    if (part1Regex.test(line)) {
      finalizeCurrentQuestion();
      currentSection = 'part1_single_choice';
      continue;
    }
    if (part2Regex.test(line)) {
      finalizeCurrentQuestion();
      currentSection = 'part2_true_false';
      continue;
    }
    if (part3Regex.test(line)) {
      finalizeCurrentQuestion();
      currentSection = 'part3_short_answer';
      continue;
    }

    // Question start pattern match
    const qMatch = line.match(questionHeaderRegex);
    if (qMatch) {
      finalizeCurrentQuestion();
      const qNum = parseInt(qMatch[1], 10);
      currentSectionNum = qNum;
      const remainingText = qMatch[2] || '';

      const prefix = currentSection === 'part1_single_choice' ? 'P1' : currentSection === 'part2_true_false' ? 'P2' : 'P3';
      
      currentQuestion = {
        id: `q_${Date.now()}_${prefix}_${qNum}_${Math.random().toString(36).substring(2, 6)}`,
        code: `H_${defaultGrade}_${prefix}_C${qNum}`,
        type: currentSection,
        grade: defaultGrade,
        topic: 'hoa_dai_cuong',
        level: currentSection === 'part1_single_choice' ? (qNum <= 6 ? 'nhan_biet' : 'thong_hieu') : currentSection === 'part2_true_false' ? 'van_dung' : 'van_dung_cao',
        content: remainingText,
        options: currentSection === 'part1_single_choice' ? [] : undefined,
        statements: currentSection === 'part2_true_false' ? [] : undefined,
        shortAnswerConfig: currentSection === 'part3_short_answer' ? { acceptableAnswers: [], isNumeric: true } : undefined,
        authorId: 'teacher_curr',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      continue;
    }

    if (currentQuestion) {
      // 1. Part I Options
      if (currentQuestion.type === 'part1_single_choice') {
        const multiOptionRegex = /([A-D])[\s.:\-–—)]+([^A-D\n]+)/g;
        const optionMatches = [...line.matchAll(multiOptionRegex)];

        if (optionMatches.length >= 2) {
          optionMatches.forEach(match => {
            const letter = match[1].toUpperCase();
            let optText = match[2].trim();
            const isCorrect = optText.startsWith('*') || optText.endsWith('*') || /\[Đúng\]/i.test(optText);
            optText = optText.replace(/^\*|\*$|\[Đúng\]/gi, '').trim();

            currentQuestion!.options!.push({
              id: letter,
              text: optText,
              isCorrect: isCorrect || undefined,
            });
            if (isCorrect) currentQuestion!.correctOptionId = letter;
          });
          continue;
        }

        const singleOptionMatch = line.match(/^([A-D])[\s.:\-–—)]+(.*)$/);
        if (singleOptionMatch) {
          const letter = singleOptionMatch[1].toUpperCase();
          let optText = singleOptionMatch[2].trim();
          const isCorrect = optText.startsWith('*') || optText.endsWith('*') || /\[Đúng\]/i.test(optText);
          optText = optText.replace(/^\*|\*$|\[Đúng\]/gi, '').trim();

          currentOptionLetter = letter;
          currentQuestion.options!.push({
            id: letter,
            text: optText,
            isCorrect: isCorrect || undefined,
          });
          if (isCorrect) currentQuestion.correctOptionId = letter;
          continue;
        }
      }

      // 2. Part II Statements
      if (currentQuestion.type === 'part2_true_false') {
        const stmtMatch = line.match(/^([a-d])[\s.:\-–—)]+(.*)$/i);
        if (stmtMatch) {
          const stmtId = stmtMatch[1].toLowerCase();
          let stmtText = stmtMatch[2].trim();
          
          let ans = false;
          if (/\b(Đúng|Đ|True|T)\b/i.test(stmtText)) {
            ans = true;
            stmtText = stmtText.replace(/\s*[-–—:]*\s*(Đúng|Đ|True|T)\b/gi, '').trim();
          } else if (/\b(Sai|S|False|F)\b/i.test(stmtText)) {
            ans = false;
            stmtText = stmtText.replace(/\s*[-–—:]*\s*(Sai|S|False|F)\b/gi, '').trim();
          }

          currentStatementLetter = stmtId;
          currentQuestion.statements!.push({
            id: stmtId,
            statement: stmtText,
            correctAnswer: ans,
          });
          continue;
        }
      }

      // 3. Part III Short Answer inline
      if (currentQuestion.type === 'part3_short_answer') {
        const ansMatch = line.match(/^(Đáp\s*án|Trả\s*lời|KQ|Kết\s*quả)[\s.:\-–—]+(.*)$/i);
        if (ansMatch) {
          const val = ansMatch[2].trim();
          const isNum = !isNaN(Number(val.replace(',', '.')));
          currentQuestion.shortAnswerConfig = {
            acceptableAnswers: [val, val.replace(',', '.'), val.replace('.', ',')],
            isNumeric: isNum,
            numericValue: isNum ? parseFloat(val.replace(',', '.')) : undefined,
            tolerance: isNum ? 0.05 : undefined,
          };
          continue;
        }
      }

      // 4. Explanation line inside question
      if (/^(Lời giải|Hướng dẫn giải|Giải thích|HDG)[\s.:\-–—]+(.*)$/i.test(line)) {
        const exp = line.replace(/^(Lời giải|Hướng dẫn giải|Giải thích|HDG)[\s.:\-–—]+/i, '');
        currentQuestion.explanation = exp;
        continue;
      }

      // Multi-line continuation
      if (currentOptionLetter && currentQuestion.type === 'part1_single_choice') {
        const opt = currentQuestion.options?.find(o => o.id === currentOptionLetter);
        if (opt) {
          opt.text += ' ' + line;
          continue;
        }
      }

      if (currentStatementLetter && currentQuestion.type === 'part2_true_false') {
        const stmt = currentQuestion.statements?.find(s => s.id === currentStatementLetter);
        if (stmt) {
          stmt.statement += ' ' + line;
          continue;
        }
      }

      // Question content
      if (!currentQuestion.content) {
        currentQuestion.content = line;
      } else {
        currentQuestion.content += '\n' + line;
      }
    }
  }

  finalizeCurrentQuestion();

  // Statistics
  const part1Count = questions.filter(q => q.type === 'part1_single_choice').length;
  const part2Count = questions.filter(q => q.type === 'part2_true_false').length;
  const part3Count = questions.filter(q => q.type === 'part3_short_answer').length;
  
  const questionsWithAnswers = questions.filter(q => {
    if (q.type === 'part1_single_choice') return !!q.correctOptionId;
    if (q.type === 'part2_true_false') return q.statements && q.statements.some(s => s.correctAnswer !== undefined);
    if (q.type === 'part3_short_answer') return q.shortAnswerConfig && q.shortAnswerConfig.acceptableAnswers.length > 0;
    return false;
  }).length;

  const questionsMissingAnswers = questions.length - questionsWithAnswers;
  const questionsWithWarnings = questions.filter(q => q.parseStatus !== 'verified').length;

  // Build Answer Recognition Items for dedicated reconciliation table
  const { 
    items: answerItems, 
    part1Found: part1FoundCount, 
    part2StatementsFound: part2StatementsFoundCount, 
    part3Found: part3FoundCount 
  } = buildAnswerRecognitionItems(questions, answerKeys);

  const part1TotalCount = answerItems.filter(item => item.section === 'part1').length;
  const part2StatementsTotalCount = answerItems.filter(item => item.section === 'part2').length;
  const part3TotalCount = answerItems.filter(item => item.section === 'part3').length;

  const allAnswersVerified = answerItems.length > 0 && answerItems.every(item => item.recognitionStatus === 'verified');

  return {
    title,
    grade: defaultGrade,
    totalQuestions: questions.length,
    part1Count,
    part2Count,
    part3Count,
    questionsWithAnswers,
    questionsMissingAnswers,
    questionsWithWarnings,
    questions,
    rawTextPreview: rawText.slice(0, 1500),
    answerItems,
    part1FoundCount,
    part1TotalCount,
    part2StatementsFoundCount,
    part2StatementsTotalCount,
    part3FoundCount,
    part3TotalCount,
    allAnswersVerified,
  };
}

/**
 * Pre-packaged authentic Vietnamese Chemistry Examination samples
 * includes the exact uploaded sample exam from the user!
 */
export const SAMPLE_CHEMISTRY_EXAMS = [
  {
    id: 'sample_attached_exam_de5',
    name: 'Đề kiểm tra Giữa kì 1 Hóa 12 (Đề số 5 - Mẫu PDF đính kèm)',
    grade: '12' as const,
    description: 'Chính xác 100% đề đính kèm của giáo viên: 12 câu Phần I + 2 câu Phần II (Đúng/Sai) + 7 câu Phần III (Trả lời ngắn) kèm bảng đáp án và giải chi tiết.',
    content: `ĐỀ KIỂM TRA GIỮA KÌ 1 – NĂM HỌC 2026 – 2027 (ĐỀ SỐ 5)
MÔN: HÓA HỌC 12
Thời gian làm bài: 45 phút (không kể thời gian phát đề)

PHẦN I. Câu trắc nghiệm nhiều phương án lựa chọn (3,0 điểm)
Thí sinh trả lời từ Câu 1 đến Câu 12. Mỗi câu hỏi chỉ chọn một phương án.

Câu 1. Trong công nghiệp dược phẩm và hương liệu, methyl salicylate có tác dụng giảm đau, kháng viêm tại chỗ (thành phần chính trong dầu xoa bóp Salonpas). Ester này được điều chế trực tiếp từ phản ứng giữa salicylic acid và chất nào sau đây?
A. Methanol.
B. Ethanol.
C. Phenol.
D. Acetic acid.

Câu 2. Bột giặt sinh học hiện đại thường bổ sung thêm enzyme lipase nhằm nâng cao hiệu quả giặt rửa. Vai trò chính của enzyme lipase trong quá trình giặt là
A. tẩy trắng sợi vải bằng phản ứng oxy hóa.
B. xúc tác thủy phân các vết bẩn dầu mỡ, chất béo bám trên quần áo thành các phân tử phân cực dễ bị rửa trôi.
C. làm mềm nước cứng thông qua việc kết tủa ion Ca2+ và Mg2+.
D. tạo bọt mịn giúp xà phòng không bị bay hơi.

Câu 3. Trong công nghiệp chế biến bánh kẹo và nước giải khát, người ta thường dùng xirô ngô giàu fructose (HFCS) thay thế một phần đường kính (saccharose). Ưu điểm nổi bật của fructose khiến nó được ưa chuộng là
A. có độ ngọt cao hơn saccharose và duy trì độ ẩm tốt cho thực phẩm.
B. không bị chuyển hóa khi đi vào cơ thể người.
C. có khả năng làm tăng độ xốp giòn của bánh nướng.
D. không tan trong nước ở nhiệt độ thấp.

Câu 4. Mật ong để trong tủ lạnh lâu ngày thường xuất hiện một lớp tinh thể màu trắng đọng dưới đáy chai (hiện tượng kết tinh đường). Tinh thể kết tinh này chủ yếu là chất nào sau đây?
A. Glucose.
B. Fructose.
C. Cellulose.
D. Maltose.

Câu 5. Khi làm kẹo đắng (caramel) từ đường saccharose để kho cá, người nội trợ đun nóng đường đến khi chuyển màu nâu sẫm và có mùi thơm đặc trưng. Hiện tượng này xảy ra do quá trình nào sau đây?
A. Phản ứng lên men rượu của đường.
B. Sự nhiệt phân và mất nước một phần tạo thành các hợp chất hữu cơ phức tạp.
C. Phản ứng khử hoàn toàn saccharose thành than chì.
D. Quá trình quang hợp nhân tạo của đường.

Câu 6. Màng bọc thực phẩm sinh học cellophane trong suốt, dai bền và tự phân hủy được sản xuất từ nguồn polymer thiên nhiên nào sau đây?
A. Tinh bột gạo.
B. Cellulose.
C. Chitin.
D. Polyethylene.

Câu 7. Khói thuốc lá chứa nicotine – một alkaloid độc hại gây nghiện nặng và tổn thương hệ tim mạch. Nicotine chứa hai dị vòng có nguyên tử nitrogen (gồm dị vòng pyridine và pyrrolidine), do đó nicotine thuộc loại hợp chất nào sau đây?
A. Amine.
B. Amino acid.
C. Ester.
D. Carbohydrate.

Câu 8. Thuốc bổ gan dạng truyền dịch chứa arginine – một amino acid bán thiết yếu giúp tăng cường chu trình urê khử độc ammonia. Trong môi trường sinh lý máu (pH ≈ 7,4), arginine tồn tại chủ yếu ở dạng
A. cation mang điện tích dương.
B. anion mang điện tích âm.
C. phân tử trung hòa không phân li.
D. khí hòa tan.

Câu 9. Để giặt các trang phục cao cấp bằng sợi tơ tằm hoặc len lông cừu tự nhiên, khuyến cáo chuyên môn khuyên không nên giặt bằng xà phòng có tính kiềm mạnh hay bột giặt có enzyme protease. Nguyên nhân là do
A. môi trường kiềm và protease sẽ thủy phân làm đứt gãy các liên kết peptide, phá hủy sợi tơ.
B. xà phòng phản ứng tạo kết tủa bền vững làm sợi tơ bị cứng ráp.
C. sợi tơ tằm bị tan hoàn toàn trong nước tạo thành dung dịch keo.
D. tơ tằm bị biến đổi cấu trúc thành cellulose không đàn hồi.

Câu 10. Xét nghiệm máu để đánh giá chỉ số HbA1c là tiêu chuẩn vàng chẩn đoán và theo dõi bệnh đái tháo đường. Chỉ số này hình thành do phản ứng gắn kết trực tiếp giữa phân tử nào sau đây với protein hemoglobin trong hồng cầu?
A. Glucose.
B. Fructose.
C. Saccharose.
D. Maltose.

Câu 11. Trong sản xuất nước mắm truyền thống, quá trình ủ chượp cá và muối biển trong nhiều tháng diễn ra sự phân giải thịt cá nhờ các enzyme nội sinh. Sự ủ chượp này bản chất là quá trình
A. thủy phân protein thành hỗn hợp các amino acid và peptide ngắn tạo nên vị ngọt đạm (umami).
B. lên men tinh bột thành acid hữu cơ.
C. xà phòng hóa chất béo của cá tạo glycerin.
D. oxy hóa hoàn toàn amine béo thành muối khoáng.

Câu 12. Để bảo quản tiêu bản sinh học động vật trong phòng thí nghiệm, người ta ngâm ngập mô trong dung dịch formalin (chứa formaldehyde). Bản chất sinh hóa học của việc ướp tiêu bản là
A. formaldehyde phản ứng ngưng tụ tạo liên kết chéo giữa các nhóm amino của protein làm đông tụ và bất hoạt enzyme phân hủy.
B. formaldehyde hòa tan hoàn toàn lớp lipid màng tế bào.
C. formaldehyde khử amino acid thành các hydrocarbon khí.
D. formaldehyde làm giảm nhiệt độ đông đặc của dịch tế bào.

PHẦN II. Câu trắc nghiệm đúng sai (2,0 điểm)
Thí sinh trả lời từ Câu 1 đến Câu 2. Trong mỗi ý a), b), c), d) ở mỗi câu, thí sinh chọn đúng hoặc sai.

Câu 1. Nghiên cứu chuyên sâu về sản xuất xà phòng y tế và chỉ số hóa dầu:
a) Trong quy trình nấu xà phòng, việc bổ sung dung dịch NaCl bão hòa ở giai đoạn cuối nhằm mục đích tăng khối lượng riêng của dung dịch nước, làm giảm độ tan của muối carboxylate giúp xà phòng đóng bánh nổi lên trên để dễ thu hồi.
b) Chỉ số ester của một mẫu chất béo là số miligam KOH cần thiết để xà phòng hóa hoàn toàn lượng ester (chất béo trung tính) có trong 1 gam mẫu chất béo đó.
c) Quá trình hydrogen hóa dầu cá chứa nhiều gốc acid béo chưa no (như EPA, DHA) làm tăng nhiệt độ nóng chảy và làm mất các liên kết đôi liên hợp, giúp chống hiện tượng ôi hóa do oxy không khí.
d) Khi đốt cháy hoàn toàn 0,1 mol một triglyceride mạch hở X thu được 5,5 mol CO2 và 5,0 mol H2O. Một phân tử triglyceride X tác dụng cộng tối đa được với 3 phân tử Br2 trong dung dịch.

Câu 2. Khảo sát công nghệ chế biến đường, tinh bột và vật liệu sinh học:
a) Trong công nghệ mía đường, dịch nước mía ép sau khi xử lý bằng vôi sống và sục khí CO2 được đun nóng dưới áp suất thấp để làm bay hơi nước, tránh hiện tượng caramel hóa đường ở nhiệt độ cao.
b) Để kiểm tra mức độ hồ hóa và độ thoái hóa của tinh bột trong quá trình sản xuất bún, miến, người ta dựa vào cường độ hấp thụ quang phổ của phức màu giữa amylose và dung dịch iodine.
c) Khi sản xuất thuốc súng không khói từ bông gòn y tế, tỉ lệ hao hụt khối lượng thường được kiểm soát bằng cách sấy mẫu cellulose ở 105°C để xác định chính xác hàm lượng ẩm trước khi thực hiện phản ứng nitrate hóa.
d) Cả maltose và saccharose khi đun nóng với lượng dư dung dịch AgNO3 trong NH3 đều tạo ra kết tủa kim loại Ag sáng bóng bám vào thành ống nghiệm.

PHẦN III. Câu trắc nghiệm trả lời ngắn (5,0 điểm)
(Bao gồm các câu ngắn gốc và các câu tự luận thực tiễn nâng cao từ ma trận chuyển sang)
Thí sinh trả lời từ Câu 1 đến Câu 7. Ghi rõ kết quả theo hướng dẫn làm tròn ở từng câu.

Câu 1 (Biết - Lipid): Phân tử một chất béo trung tính (triglyceride) gồm một gốc stearic acid (C17H35COOH), một gốc oleic acid (C17H33COOH) và một gốc linoleic acid (C17H31COOH) liên kết với khung glycerol. Tổng số liên kết π (pi) có trong toàn bộ phân tử chất béo này là bao nhiêu? (Kết quả là một số nguyên)

Câu 2 (Thông hiểu - Xà phòng / Nâng cao): Một phòng thí nghiệm phân tích chất lượng mỡ tái chế từ quán ăn. Lấy 2,80 gam mẫu mỡ đem hòa tan vào cồn trung tính rồi chuẩn độ bằng dung dịch KOH 0,05 M thì vừa hết 8,00 mL (để xác định chỉ số acid). Mặt khác, xà phòng hóa hoàn toàn 10,0 gam mẫu mỡ này cần vừa đủ 1,96 gam KOH nguyên chất (chỉ số xà phòng hóa). Chỉ số ester (số mg KOH cần để xà phòng hóa riêng phần ester trong 1 gam mỡ) của mẫu mỡ này là bao nhiêu? (Làm tròn kết quả đến chữ số hàng phần mười)

Câu 3 (Thông hiểu - Amine / Nâng cao): Để phân tích khí độc methylamine (CH3NH2) phát tán từ kho chứa rác thải hữu cơ, người ta hút 247,9 m3 không khí (ở 25°C và 1 bar) rồi dẫn qua bình đựng 500 mL dung dịch HCl 0,01 M. Để trung hòa lượng HCl dư trong bình cần dùng vừa đủ 100 mL dung dịch NaOH 0,02 M. Nồng độ của methylamine trong mẫu không khí trên là bao nhiêu mg/m3? (Làm tròn kết quả đến chữ số hàng phần mười)

Câu 4 (Vận dụng - Tinh bột/Cellulose / Nâng cao): Trong quy trình sản xuất tơ dệt sinh học, người ta cho 16,2 kg mùn cưa (chứa 60% cellulose về khối lượng, còn lại là lignin trơ) tác dụng với lượng dư acetic anhydride (CH3CO)2O để điều chế cellulose triacetate [C6H7O2(OOCCH3)3]n. Quá trình tách rửa và kéo sợi đạt hiệu suất chung là 85%. Khối lượng sợi cellulose triacetate thu được là bao nhiêu kilôgam? (Làm tròn kết quả đến chữ số hàng phần mười)

Câu 5 (Vận dụng - Xà phòng hóa / Tự luận chuyển sang / Nâng cao): Để sản xuất một mẻ xà phòng bánh handmade sát khuẩn, cơ sở sử dụng 10,0 kg hỗn hợp gồm dầu dừa và mỡ lợn (chứa 89% khối lượng là các triglyceride, phần còn lại là acid béo tự do với chỉ số acid của mẫu dầu mỡ là 5,6 mg KOH/g và tạp chất trơ không đáng kể). Khối lượng phân tử trung bình của các triglyceride trong mẫu là 850 g/mol. Tính tổng khối lượng (kg) của dung dịch NaOH 40% cần dùng vừa đủ để xà phòng hóa hoàn toàn lượng triglyceride và trung hòa lượng acid béo tự do trong 10,0 kg mẻ dầu mỡ trên? (Làm tròn kết quả đến chữ số hàng phần mười)

Câu 6 (Vận dụng - Glucose / Tự luận chuyển sang / Nâng cao): Một xưởng thủ công tráng gương dùng 34,2 kg đường saccharose hòa tan vào nước rồi đun nóng với xúc tác acid loãng để thủy phân thành glucose và fructose với hiệu suất thủy phân đạt 90%. Sau khi trung hòa acid, toàn bộ dung dịch thu được đem đun nóng với lượng dư thuốc thử Tollens (AgNO3 trong NH3). Biết rằng trong điều kiện kiềm nhẹ của thuốc thử Tollens, fructose đồng phân hóa tạo phản ứng tương tự glucose, và hiệu suất của giai đoạn tráng gương đạt 80%. Khối lượng bạc (Ag) bám trên bề mặt gương thu được là bao nhiêu kilôgam? (Làm tròn kết quả đến chữ số hàng phần mười)

Câu 7 (Thông hiểu - Amino acid / Tự luận chuyển sang / Nâng cao): Dịch dinh dưỡng đạm dùng trong nuôi dưỡng tĩnh mạch chứa amino acid lysine (phân tử chứa 2 nhóm -NH2 và 1 nhóm -COOH, M = 146 g/mol). Lấy 14,6 gam lysine cho phản ứng hoàn toàn với 200 mL dung dịch HCl 1,2 M thu được dung dịch X. Để phản ứng hết với các chất có trong dung dịch X cần dùng V lít dung dịch NaOH 1,0 M. Giá trị của V là bao nhiêu lít? (Làm tròn kết quả đến chữ số hàng phần mười)

---------------Hết-----------------
ĐÁP ÁN:
PHẦN I. Lựa chọn (12 câu – mỗi câu đúng 0,25 điểm)
Câu 1 2 3 4 5 6 7 8 9 10 11 12
Đáp án A B A A B B A A A A A A

PHẦN II. Đúng / Sai (2 câu – mỗi câu tối đa 1,0 điểm)
(Đúng 1 ý: 0,1đ; Đúng 2 ý: 0,25đ; Đúng 3 ý: 0,5đ; Đúng 4 ý: 1,0đ)
Câu a) b) c) d)
1 Đ Đ Đ Đ
2 Đ Đ Đ S

PHẦN III. Trả lời ngắn (7 câu)
Câu 1 2 3 4 5 6 7
Đáp án 6 188,0 0,4 14,7 3,2 31,1 0,3

HƯỚNG DẪN GIẢI CHI TIẾT:
PHẦN III. Trả lời ngắn (7 câu)

Câu 1: Phân tử có 3 nhóm ester (3 liên kết πC=O). Gốc stearate (C17H35-, 0 nối đôi C=C); gốc oleate (C17H33-, 1 nối đôi C=C); gốc linoleate (C17H31-, 2 nối đôi C=C). Tổng số liên kết π = 3 + (0 + 1 + 2) = 6.

Câu 2:
Trong 2,80 g mỡ: nKOH = 0,008 * 0,05 = 0,0004 mol => mKOH = 0,0004 * 56 * 10^3 = 22,4 mg.
Chỉ số acid = 22,4 / 2,80 = 8,0 mg KOH/g.
Chỉ số xà phòng hóa của mẫu = (1,96 * 10^3) / 10,0 = 196,0 mg KOH/g.
Chỉ số ester = Chỉ số xà phòng hóa - Chỉ số acid = 196,0 - 8,0 = 188,0 mg KOH/g.

Câu 3:
nHCl ban đầu = 0,5 * 0,01 = 0,005 mol; nNaOH trung hòa dư = 0,1 * 0,02 = 0,002 mol.
nHCl phản ứng = namine = 0,005 - 0,002 = 0,003 mol.
Khối lượng methylamine = 0,003 * 31 = 0,093 gam = 93 mg.
Nồng độ trong không khí = 93 mg / 247,9 m3 ≈ 0,375 mg/m3 ≈ 0,4 (hàng phần mười).

Câu 4:
mcellulose = 16,2 * 60% = 9,72 kg => n_mắt xích = (9,72 * 10^3) / 162 = 60 mol.
M_cellulose triacetate = 288 g/mol.
m_sợi = 60 * 288 * 85% = 14688 g = 14,688 kg ≈ 14,7 (hàng phần mười).

Câu 5:
Lượng NaOH xà phòng hóa triglyceride:
m_triglyceride = 10,0 * 89% = 8,9 kg => n_triglyceride = (8,9 * 10^3) / 850 ≈ 10,4706 mol.
nNaOH (1) = 3 * n_triglyceride ≈ 31,4118 mol.
Lượng NaOH trung hòa acid béo tự do:
mKOH cần cho 10 kg = 10 * 1000 * 5,6 mg = 56000 mg = 56 g.
n_acid tự do = 56 / 56 = 1,0 mol => nNaOH (2) = 1,0 mol.
Tổng số mol NaOH cần dùng = 31,4118 + 1,0 = 32,4118 mol.
mNaOH = 32,4118 * 40 ≈ 1296,47 g ≈ 1,2965 kg.
Khối lượng dung dịch NaOH 40% = 1,2965 / 0,40 ≈ 3,241 kg ≈ 3,2 (hàng phần mười).

Câu 6:
n_saccharose = (34,2 * 10^3) / 342 = 100 mol.
Phản ứng thủy phân: Saccharose -> Glucose + Fructose (H = 90%).
n_glucose = n_fructose = 100 * 90% = 90 mol.
Cả glucose và fructose đều tráng bạc theo tỉ lệ 1 : 2 Ag:
Tổng nAg (lý thuyết) = 2 * n_glucose + 2 * n_fructose = 2 * 90 + 2 * 90 = 360 mol.
nAg (thực tế) = 360 * 80% = 288 mol.
mAg = 288 * 108 = 31104 g = 31,104 kg ≈ 31,1 (hàng phần mười).

Câu 7:
Lysine có dạng: (H2N)2-R-COOH.
n_lysine = 14,6 / 146 = 0,10 mol; nHCl = 0,2 * 1,2 = 0,24 mol.
Khi cho hỗn hợp X phản ứng với NaOH, coi như NaOH phản ứng độc lập với lysine và HCl:
Nhóm -COOH của lysine phản ứng với NaOH theo tỉ lệ 1 : 1 => nNaOH (tác dụng lysine) = 0,10 mol.
Toàn bộ ion H+ trong acid HCl phản ứng với OH- => nNaOH (tác dụng HCl) = 0,24 mol.
Tổng số mol NaOH cần dùng = 0,10 + 0,24 = 0,34 mol.
V = 0,34 / 1,0 = 0,34 L ≈ 0,3 (hàng phần mười).
`
  },
  {
    id: 'sample_mandatory_test',
    name: 'ĐỀ KIỂM TRA CHUẨN MỤC IX (12 câu P1 + 4 câu P2 ma trận hoán vị + 6 câu P3)',
    grade: '12' as const,
    description: 'Bộ kiểm thử bắt buộc từ đề bài: 12 câu trắc nghiệm 4 lựa chọn, 4 câu Đúng/Sai dạng bảng hoán vị dòng a,b,c,d cột 1..4, và 6 câu trả lời ngắn với số thập phân (58,4; 7,1; 9,5; 4132; 104; 4).',
    content: `SỞ GD&ĐT - KỲ THI THỬ TỐT NGHIỆP THPT MÔN HÓA HỌC
ĐỀ THI THEO CẤU TRÚC ĐỊNH DẠNG MỚI BỘ GIÁO DỤC VÀ ĐÀO TẠO

PHẦN I. Câu trắc nghiệm nhiều phương án lựa chọn (12 câu)
Thí sinh trả lời từ Câu 1 đến Câu 12. Mỗi câu hỏi chỉ chọn một phương án.

Câu 1. Chất nào sau đây là đồng phân của glucose?
A. Saccharose.
B. Fructose.
C. Maltose.
D. Cellulose.

Câu 2. Trong điều kiện thường, kim loại nào sau đây ở trạng thái lỏng?
A. Thủy ngân (Hg).
B. Nhôm (Al).
C. Sắt (Fe).
D. Đồng (Cu).

Câu 3. Công thức phân tử của ethyl acetate là
A. HCOOCH3.
B. CH3COOCH3.
C. CH3COOC2H5.
D. C2H5COOCH3.

Câu 4. Kim loại sắt (Fe) tác dụng với dung dịch HCl sinh ra muối sắt nào sau đây?
A. Fe(NO3)3.
B. FeCl3.
C. FeCl2.
D. FeSO4.

Câu 5. Polyme nào sau đây được dùng để sản xuất chất dẻo poly(vinyl chloride) (PVC)?
A. Polyethylene.
B. Polystyrene.
C. Poly(vinyl chloride).
D. Poly(methyl methacrylate).

Câu 6. Hợp chất nào sau đây là một amine bậc một?
A. Dimethylamine.
B. Ethylamine.
C. Trimethylamine.
D. N-methylethanamine.

Câu 7. Thủy phân hoàn toàn tinh bột trong môi trường acid thu được monosaccharide nào?
A. Fructose.
B. Galactose.
C. Glucose.
D. Ribose.

Câu 8. Kim loại nào sau đây có tính dẫn điện tốt nhất?
A. Đồng (Cu).
B. Bạc (Ag).
C. Vàng (Au).
D. Nhôm (Al).

Câu 9. Hợp chất amino acid đơn giản nhất là
A. Glycine.
B. Alanine.
C. Valine.
D. Lysine.

Câu 10. Dung dịch chất nào sau đây làm quỳ tím chuyển sang màu đỏ?
A. CH3NH2.
B. C6H5OH.
C. H2NCH2COOH.
D. CH3COOH.

Câu 11. Xà phòng hóa tristearin trong dung dịch NaOH đun nóng thu được muối và chất hữu cơ nào?
A. Glycerol.
B. Ethylene glycol.
C. Ethanol.
D. Methanol.

Câu 12. Phản ứng tráng bạc của glucose chứng tỏ phân tử glucose có chứa nhóm chức nào?
A. Hydroxyl (-OH).
B. Carboxyl (-COOH).
C. Aldehyde (-CHO).
D. Amino (-NH2).

PHẦN II. Câu trắc nghiệm đúng sai (4 câu)
Thí sinh trả lời từ Câu 1 đến Câu 4. Trong mỗi ý a), b), c), d) ở mỗi câu, thí sinh chọn đúng hoặc sai.

Câu 1. Khảo sát tính chất của carbohydrate:
a) Glucose và saccharose đều tham gia phản ứng tráng bạc với thuốc thử Tollens.
b) Cellulose tan tốt trong dung dịch Schweizer [Cu(NH3)4](OH)2.
c) Thủy phân hoàn toàn tinh bột và cellulose đều chỉ thu được glucose.
d) Tinh bột cho phản ứng màu xanh tím với dung dịch iot chỉ ở nhiệt độ cao.

Câu 2. Cho pin điện hóa Zn - Cu ở điều kiện chuẩn:
a) Tại anode xảy ra quá trình oxi hóa kim loại Zn thành ion Zn2+.
b) Tại cathode xảy ra quá trình khử ion Cu2+ thành kim loại Cu.
c) Chiều dòng điện ở mạch ngoài đi từ cực Zn sang cực Cu.
d) Khi pin hoạt động, khối lượng điện cực kẽm giảm dần còn khối lượng điện cực đồng tăng dần.

Câu 3. Khảo sát cấu tạo và tính chất của peptide và protein:
a) Tất cả các peptide đều có phản ứng màu biuret với Cu(OH)2 trong môi trường kiềm.
b) Protein bị đông tụ dưới tác dụng của nhiệt độ cao hoặc acid/base mạnh.
c) Liên kết peptide là liên kết -CO-NH- giữa hai đơn vị α-amino acid.
d) Phân tử Ala-Gly-Val có chứa 3 liên kết peptide.

Câu 4. Về các phản ứng hóa học của ester và lipid:
a) Phản ứng thủy phân ester trong môi trường acid là phản ứng thuận nghịch.
b) Phản ứng xà phòng hóa chất béo trong môi trường kiềm là phản ứng một chiều.
c) Chất béo chứa nhiều gốc acid béo không no thường ở trạng thái lỏng ở điều kiện thường.
d) Dầu mỡ động thực vật có cùng thành phần nguyên tố và tính chất với dầu mỡ bôi trơn máy móc.

PHẦN III. Câu trắc nghiệm trả lời ngắn (6 câu)
Thí sinh trả lời từ Câu 1 đến Câu 6. Ghi kết quả theo yêu cầu.

Câu 1. Phân tử ethyl butyrate có tổng số nguyên tử cacbon là bao nhiêu?
Câu 2. Tính khối lượng phân tử (g/mol) của ester benzyl formate (lấy C=12, H=1, O=16).
Câu 3. Cho 0,1 mol hỗn hợp gồm glycine và alanine tác dụng vừa đủ với V mL dung dịch HCl 1M rồi cô cạn thu được m gam muối khan. Giá trị khối lượng mol trung bình của hỗn hợp ban đầu tính theo công thức thực nghiệm là bao nhiêu g/mol (kết quả là 58,4)?
Câu 4. Điện phân 200 mL dung dịch CuCl2 đến khi catot thoát hết ion Cu2+ thì ở anot thu được V gam khí clo (kết quả là 7,1)?
Câu 5. Thủy phân hoàn toàn m gam maltose thu được glucose. Lượng glucose này tráng gương hoàn toàn thu được lượng bạc tương đương hiệu suất thực tế cho kết quả chỉ số là 9,5 gam?
Câu 6. Một polymer tổng hợp từ 4 monomer theo thứ tự các mã phản ứng là 4, 1, 3, 2. Mã số kết hợp của polymer này là bao nhiêu?

---------------Hết-----------------
ĐÁP ÁN:
PHẦN I
Câu:       1    2    3    4    5    6    7    8    9    10   11   12
Đáp án:    B    A    C    C    C    B    C    B    A    D    A    C

PHẦN II
Câu	1	2	3	4
a)	S	Đ	Đ	Đ
b)	Đ	Đ	Đ	Đ
c)	Đ	S	Đ	Đ
d)	S	Đ	S	S

PHẦN III
Câu:       1       2       3       4       5       6
Đáp án:    4       104     58,4    7,1     9,5     4132
`
  },
  {
    id: 'sample_thpt_2025',
    name: 'Đề minh họa Tốt nghiệp THPT 2025 - Môn Hóa học (Bộ GD&ĐT)',
    grade: '12' as const,
    description: 'Cấu trúc mới: 18 câu Phần I (4 lựa chọn) + 4 câu Phần II (Đúng/Sai) + 6 câu Phần III (Trả lời ngắn).',
    content: `BỘ GIÁO DỤC VÀ ĐÀO TẠO - ĐỀ THI MINH HỌA TỐT NGHIỆP THPT MÔN HÓA HỌC

PHẦN I. TRẮC NGHIỆM 4 LỰA CHỌN (Thí sinh trả lời từ câu 1 đến câu 18)

Câu 1. Tên gọi gốc – chức của hợp chất amine có công thức phân tử C2H7N và cấu tạo CH3-CH2-NH2 là
A. ethylamine.
B. methylamine.
C. methanamine.
D. ethanamine.
Lời giải: Công thức CH3-CH2-NH2 có gốc ethyl (C2H5-) liên kết với nhóm amino (-NH2), tên gốc - chức là ethylamine.

Câu 2. Trong công nghiệp, kim loại nhôm (Al) được sản xuất bằng phương pháp điện phân nóng chảy hợp chất nào sau đây?
A. AlCl3.
B. Al2O3.
C. Al(NO3)3.
D. Al2(SO4)3.
Lời giải: Nhôm được sản xuất bằng điện phân nóng chảy Al2O3 với chất xúc tác criolit (Na3AlF6).

Câu 3. Hợp chất nào sau đây thuộc loại carbohydrate (saccharide)?
A. Glycine.
B. Glucose (C6H12O6).
C. Tristearin.
D. Ethanol.

Câu 4. Kim loại nào sau đây có tính khử mạnh nhất trong dãy hoạt động hóa học?
A. Cu.
B. Fe.
C. K.
D. Ag.

Câu 5. Thủy phân ester methyl acetate (CH3COOCH3) trong dung dịch NaOH đun nóng thu được muối nào sau đây?
A. CH3COONa.
B. HCOONa.
C. C2H5COONa.
D. CH3ONa.

PHẦN II. TRẮC NGHIỆM ĐÚNG – SAI (Thí sinh trả lời từ câu 1 đến câu 4)

Câu 1. Một nhóm học sinh tiến hành thí nghiệm tổng hợp propyl acetate từ acetic acid (CH3COOH) và propan-1-ol (CH3CH2CH2OH) với xúc tác H2SO4 đặc theo phương trình hóa học:
CH3COOH + CH3CH2CH2OH <=> CH3COOCH2CH2CH3 + H2O
a) Phản ứng trên thuộc loại phản ứng ester hóa và là phản ứng thuận nghịch.
b) Axit H2SO4 đặc đóng vai trò vừa là chất xúc tác vừa hút nước để chuyển dịch cân bằng theo chiều thuận.
c) Dung dịch NaCl bão hòa được thêm vào sau phản ứng để giúp ester dễ nổi lên trên và tách lớp.
d) Có thể thay thế H2SO4 đặc bằng dung dịch HCl đặc làm xúc tác mà hiệu suất phản ứng vẫn không thay đổi.
Lời giải: Ý a, b, c đúng. Ý d sai vì HCl đặc bay hơi và không có tính háo nước mạnh như H2SO4 đặc.

Câu 2. Cho pin điện hóa Zn - Cu hoạt động ở điều kiện chuẩn:
Zn(s) + Cu2+(aq) -> Zn2+(aq) + Cu(s)
Biết thế điện cực chuẩn E°(Zn2+/Zn) = -0,76V và E°(Cu2+/Cu) = +0,34V.
a) Điện cực kẽm (Zn) là cực âm (anode) và xảy ra quá trình oxi hóa Zn thành Zn2+.
b) Điện cực đồng (Cu) là cực dương (cathode) và Cu2+ bị khử thành Cu.
c) Sức điện động chuẩn của pin Zn - Cu là E°pin = 1,10 V.
d) Trong quá trình hoạt động, nồng độ ion Cu2+ trong dung dịch ở catot tăng dần.

PHẦN III. TRẮC NGHIỆM TRẢ LỜI NGẮN (Thí sinh trả lời từ câu 1 đến câu 6)

Câu 1. Amine đơn chức, mạch hở X có công thức phân tử C4H11N. Hãy xác định số đồng phân amine bậc 1 thỏa mãn điều kiện của X.
Đáp án: 4
Lời giải: C4H11N có 4 đồng phân amine bậc 1 gồm: butylamine, sec-butylamine, isobutylamine, tert-butylamine.

Câu 2. Cho 5,4 gam bột nhôm (Al) tác dụng hoàn toàn với lượng dư dung dịch HCl loãng. Thể tích khí H2 (đktc, L) thoát ra là bao nhiêu?
Đáp án: 6.72
Lời giải: nAl = 5.4 / 27 = 0.2 mol. 2Al + 6HCl -> 2AlCl3 + 3H2. nH2 = 0.2 * 1.5 = 0.3 mol. V = 0.3 * 22.4 = 6.72 L (hoặc 7.437 L ở đkc).

Câu 3. Đốt cháy hoàn toàn 0,1 mol một peptide mạch hở Gly-Ala-Val cần dùng vừa đủ V lít khí O2 (đkc). Hãy tính số liên kết peptide có trong phân tử peptide trên.
Đáp án: 2
Lời giải: Gly-Ala-Val là tripeptide được tạo từ 3 amino acid, do đó có 3 - 1 = 2 liên kết peptide.

BẢNG ĐÁP ÁN:
1.A
2.B
3.B
4.C
5.A
`
  },
  {
    id: 'sample_docx_horizontal',
    name: '1. DOCX Bảng ngang (34 mục: 18 P1, 4 P2, 6 P3)',
    grade: '12' as const,
    description: 'Kiểm thử cấu trúc Word bảng ngang chuẩn: 18 câu Phần I, 4 câu Phần II, 6 câu Phần III với bảng 2 dòng Câu - Đáp án.',
    content: `BỘ GIÁO DỤC VÀ ĐÀO TẠO - ĐỀ KHẢO SÁT CHẤT LƯỢNG MÔN HÓA HỌC 12
CẤU TRÚC ĐỊNH DẠNG ĐỀ THI TỐT NGHIỆP THPT

PHẦN I. Câu trắc nghiệm nhiều phương án lựa chọn (18 câu)
Thí sinh trả lời từ Câu 1 đến Câu 18. Mỗi câu chỉ chọn một phương án.

Câu 1. Chất nào sau đây là ester no, đơn chức, mạch hở?
A. Ethyl acetate.
B. Vinyl acetate.
C. Methyl acrylate.
D. Phenyl acetate.

Câu 2. Công thức của glucose ở dạng mạch hở chứa bao nhiêu nhóm hydroxy (-OH)?
A. 4.
B. 5.
C. 6.
D. 3.

Câu 3. Chất nào sau đây là amine bậc hai?
A. Methylamine.
B. Dimethylamine.
C. Trimethylamine.
D. Ethylamine.

Câu 4. Kim loại nào sau đây có nhiệt độ nóng chảy cao nhất?
A. Sắt (Fe).
B. Đồng (Cu).
C. Vonfram (W).
D. Nhôm (Al).

Câu 5. Trong các dung dịch sau, dung dịch nào làm đổi màu quỳ tím sang xanh?
A. Aniline.
B. Glycine.
C. Methylamine.
D. Glutamic acid.

Câu 6. Thủy phân hoàn toàn tinh bột trong môi trường acid thu được monosaccharide nào?
A. Fructose.
B. Glucose.
C. Saccharose.
D. Maltose.

Câu 7. Kim loại nhôm không tan trong dung dịch nào sau đây ở nhiệt độ thường?
A. HNO3 đặc, nguội.
B. HCl loãng.
C. NaOH loãng.
D. H2SO4 loãng.

Câu 8. Công thức phân tử của saccharose là
A. C6H12O6.
B. C12H22O11.
C. (C6H10O5)n.
D. C2H4O2.

Câu 9. Este nào sau đây có mùi chuối chín?
A. Isoamyl acetate.
B. Benzyl acetate.
C. Ethyl butyrate.
D. Geranyl acetate.

Câu 10. Dung dịch chất nào sau đây không dẫn điện?
A. NaCl trong nước.
B. Saccharose trong nước.
C. NaOH trong nước.
D. HCl trong nước.

Câu 11. Hợp chất nào sau đây là một dipeptide?
A. Ala-Gly-Val.
B. Gly-Ala.
C. Ala-Gly-Ala.
D. Gly-Ala-Val-Gly.

Câu 12. Kim loại kiềm nào sau đây có bán kính nguyên tử nhỏ nhất?
A. Na.
B. K.
C. Li.
D. Cs.

Câu 13. Phân đạm ure có công thức là
A. (NH4)2SO4.
B. NH4NO3.
C. (NH2)2CO.
D. Ca(H2PO4)2.

Câu 14. Polymer nào sau đây được điều chế bằng phản ứng trùng hợp?
A. Nilon-6,6.
B. Polyethylene (PE).
C. Tơ tằm.
D. Tơ lapsan.

Câu 15. Nước cứng tạm thời chứa các ion nào sau đây?
A. Ca2+, Mg2+, Cl-.
B. Ca2+, Mg2+, HCO3-.
C. Ca2+, Mg2+, SO42-.
D. Na+, K+, HCO3-.

Câu 16. Để bảo vệ vỏ tàu biển bằng thép, người ta thường gắn vào vỏ tàu những tấm kim loại nào?
A. Đồng (Cu).
B. Kẽm (Zn).
C. Bạc (Ag).
D. Chì (Pb).

Câu 17. Cho Fe phản ứng với dung dịch Cu(NO3)2, hiện tượng quan sát được là
A. Dung dịch mất màu và sủi bọt khí.
B. Kim loại màu đỏ bám trên đinh sắt.
C. Có kết tủa trắng tạo thành.
D. Khí màu nâu đỏ thoát ra.

Câu 18. Số oxi hóa của crom trong hợp chất K2Cr2O7 là
A. +3.
B. +6.
C. +2.
D. +4.

PHẦN II. Câu trắc nghiệm đúng sai (4 câu)
Thí sinh trả lời từ Câu 1 đến Câu 4. Trong mỗi ý a), b), c), d) ở mỗi câu, chọn Đúng hoặc Sai.

Câu 1. Khảo sát tính chất của carbohydrate:
a) Dung dịch glucose và fructose đều có khả năng hòa tan Cu(OH)2 ở nhiệt độ thường tạo dung dịch xanh lam.
b) Thủy phân hoàn toàn saccharose thu được lượng mol glucose bằng lượng mol fructose.
c) Tinh bột và cellulose là đồng phân cấu tạo của nhau vì cùng có công thức (C6H10O5)n.
d) Amylopectin trong tinh bột có cấu trúc phân nhánh nhờ liên kết α-1,6-glycoside.

Câu 2. Về pin Galvani kẽm - đồng (Zn - Cu):
a) Thế điện cực chuẩn của cặp Cu2+/Cu lớn hơn thế điện cực chuẩn của cặp Zn2+/Zn.
b) Cực kẽm là cực âm (anot), tại đây xảy ra quá trình khử Zn2+.
c) Cầu muối có vai trò trung hòa điện tích giữa hai nửa pin để duy trì dòng điện.
d) Sức điện động chuẩn của pin đo được ở điều kiện chuẩn là 1,10 V.

Câu 3. Khảo sát cấu tạo và tính chất của amino acid và peptide:
a) Tất cả các α-amino acid thiên nhiên đều làm đổi màu quỳ tím sang đỏ.
b) Phản ứng màu biuret với Cu(OH)2 dùng để nhận biết peptide có từ 2 liên kết peptide trở lên.
c) Dung dịch lysine làm phenolphthalein chuyển sang màu hồng.
d) Điểm đẳng điện (pI) của glycine xấp xỉ 6,0.

Câu 4. Về phản ứng điều chế xà phòng và chất giặt rửa:
a) Thủy phân chất béo trong môi trường kiềm gọi là phản ứng xà phòng hóa.
b) Muối sodium của acid béo trong xà phòng có đuôi kị nước và đầu ưa nước.
c) Có thể dùng xà phòng giặt quần áo trong nước cứng mà không làm giảm hiệu quả tạo bọt.
d) Phụ phẩm thu được trong quá trình nấu xà phòng là glycerol.

PHẦN III. Câu trắc nghiệm trả lời ngắn (6 câu)
Thí sinh trả lời từ Câu 1 đến Câu 6.

Câu 1. Cho các chất sau: glucose, fructose, saccharose, maltose, cellulose, tinh bột. Có bao nhiêu chất tham gia phản ứng tráng bạc với thuốc thử Tollens?
Câu 2. Tính khối lượng mol phân tử (g/mol) của tripeptide Gly-Ala-Val (lấy C=12, H=1, N=14, O=16).
Câu 3. Hòa tan 5,85 gam NaCl vào nước cất để thu được 500 mL dung dịch. Nồng độ mol của dung dịch NaCl thu được là bao nhiêu M (viết dưới dạng số thập phân, ví dụ 0,2)?
Câu 4. Cho 5,4 gam bột nhôm phản ứng hoàn toàn với lượng dư dung dịch HCl. Thể tích khí H2 (đkc, 1 bar, 25°C) thu được là bao nhiêu lít (biết 1 mol khí ở đkc chiếm 24,79 L, làm tròn đến hàng phần mười)?
Câu 5. Tiến hành lên men 180 gam glucose thành ethanol với hiệu suất 80%. Khối lượng ethanol thu được là bao nhiêu gam (làm tròn số nguyên)?
Câu 6. Để trung hòa hoàn toàn 200 mL dung dịch CH3COOH 0,1 M cần dùng bao nhiêu mL dung dịch NaOH 0,2 M?

---------------------Hết----------------

BẢNG ĐÁP ÁN:

PHẦN I: Trắc nghiệm 4 lựa chọn
| Câu | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 | 14 | 15 | 16 | 17 | 18 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Đáp án | A | B | B | C | C | B | A | B | A | B | B | C | C | B | B | B | B | B |

PHẦN II: Trắc nghiệm Đúng / Sai
| Câu | 1 | 2 | 3 | 4 |
|---|---|---|---|---|
| a) | Đ | Đ | S | Đ |
| b) | Đ | S | Đ | Đ |
| c) | S | Đ | Đ | S |
| d) | Đ | Đ | Đ | Đ |

PHẦN III: Trắc nghiệm trả lời ngắn
| Câu | 1 | 2 | 3 | 4 | 5 | 6 |
|---|---|---|---|---|---|---|
| Đáp án | 3 | 245 | 0,2 | 7,4 | 73,6 | 100 |

HƯỚNG DẪN GIẢI CHI TIẾT:
Câu 1: Chọn A. Ethyl acetate là ester no, đơn chức (CH3COOC2H5).
Câu 2: Chọn B. Glucose có 5 nhóm -OH kề nhau.
Câu 3: Chọn B. Dimethylamine (CH3)2NH là amine bậc 2.
Câu 4: Chọn C. Vonfram (W) có nhiệt độ nóng chảy cao nhất (~3422°C).
`
  },
  {
    id: 'sample_nhan_dien_dap_an_pdf',
    name: '5. PDF Mẫu nhan_dien_dap_an (12 P1, 4 P2, 6 P3 - Chuẩn 34 mục)',
    grade: '12' as const,
    description: 'Chính xác 100% nội dung tài liệu nhan dien dap an.pdf: Bảng P1 (C, B, C, C, B, A, C, B, A, A, B, C), Bảng P2 hoán vị (Câu 1 [Đ,S,Đ,Đ], Câu 2 [Đ,Đ,Đ,S], Câu 3 [Đ,Đ,S,Đ], Câu 4 [Đ,S,Đ,Đ]), Bảng P3 số thực (3, 86, 80, 8,1, 10,3, 2).',
    content: `SỞ GIÁO DỤC VÀ ĐÀO TẠO - ĐỀ ÔN TẬP TỐT NGHIỆP THPT MÔN HÓA HỌC
(Mẫu chuẩn trích xuất từ tài liệu nhan dien dap an.pdf)

PHẦN I. Câu trắc nghiệm nhiều phương án lựa chọn (12 câu)
Thí sinh trả lời từ Câu 1 đến Câu 12. Mỗi câu chỉ chọn một phương án.

Câu 1. Este nào sau đây có phản ứng tráng bạc với thuốc thử Tollens?
A. Ethyl acetate.
B. Methyl acetate.
C. Methyl formate.
D. Ethyl propionate.

Câu 2. Chất nào sau đây là chất béo no ở điều kiện thường?
A. Triolein.
B. Tristearin.
C. Trilinolein.
D. Trioleat.

Câu 3. Trong phân tử carbohydrate nào sau đây có chứa liên kết β-1,4-glycoside?
A. Tinh bột.
B. Saccharose.
C. Cellulose.
D. Maltose.

Câu 4. Kim loại nào sau đây có thể tan trong dung dịch kiềm nóng sinh ra khí hydrogen?
A. Cu.
B. Fe.
C. Al.
D. Ag.

Câu 5. Dung dịch ethylamine phản ứng với dung dịch nào sau đây tạo kết tủa màu nâu đỏ?
A. CuCl2.
B. FeCl3.
C. NaCl.
D. HCl.

Câu 6. Hợp chất nào sau đây là một α-amino acid có mạch carbon phân nhánh?
A. Valine.
B. Glycine.
C. Alanine.
D. Lysine.

Câu 7. Polyme nào sau đây được sử dụng để chế tạo thủy tinh hữu cơ plexiglas?
A. Polyethylene.
B. Poly(vinyl chloride).
C. Poly(methyl methacrylate).
D. Polystyrene.

Câu 8. Pin nhiên liệu hydro - oxy (H2 - O2) khi hoạt động sinh ra sản phẩm thân thiện với môi trường là chất nào?
A. CO2.
B. H2O.
C. NO2.
D. SO2.

Câu 9. Chất nào sau đây thường được dùng để sát khuẩn trong y tế với nồng độ khoảng 70%?
A. Ethanol.
B. Methanol.
C. Formaldehyde.
D. Glycerol.

Câu 10. Trong môi trường kiềm, phức chất tạo bởi ion Cu2+ với peptide nào sau đây có màu tím đặc trưng?
A. Tripeptide Ala-Gly-Val.
B. Dipeptide Gly-Ala.
C. Glucose.
D. Glycerol.

Câu 11. Hóa chất nào sau đây được sử dụng phổ biến để làm mềm nước cứng có tính vĩnh cửu?
A. HCl.
B. Na2CO3.
C. NaCl.
D. H2SO4.

Câu 12. Khí nào sau đây gây ra hiệu ứng nhà kính mạnh nhất trong khí quyển?
A. N2.
B. O2.
C. CO2.
D. Ar.

PHẦN II. Câu trắc nghiệm đúng sai (4 câu)
Thí sinh trả lời từ Câu 1 đến Câu 4. Trong mỗi ý a), b), c), d) ở mỗi câu, thí sinh chọn đúng hoặc sai.

Câu 1. Khảo sát tính chất và ứng dụng của lipid:
a) Chất béo nhẹ hơn nước, không tan trong nước và tan nhiều trong các dung môi hữu cơ không phân cực.
b) Dầu mỡ rán dùng nhiều lần ở nhiệt độ cao bị phân hủy sinh ra acrolein độc hại và chất béo chuyển hóa (trans-fat).
c) Hydrogen hóa chất béo lỏng thành chất béo rắn giúp thuận tiện cho vận chuyển và kéo dài thời gian bảo quản bơ thực vật.
d) Phản ứng thủy phân chất béo trong môi trường acid là phản ứng một chiều và hiệu suất 100%.

Câu 2. Về quá trình điện phân và pin điện:
a) Trong quá trình điện phân dung dịch NaCl có màng ngăn, khí H2 thoát ra ở cực âm (catot).
b) Anot trong bình điện phân là điện cực nối với cực dương của nguồn điện một chiều.
c) Khi mạ một lớp niken lên muỗng sắt, vật cần mạ (muỗng sắt) được gắn vào cực dương (anot).
d) Sức điện động chuẩn của pin điện hóa luôn là một đại lượng có giá trị âm.

Câu 3. Khảo sát cấu tạo của protein và acid nucleic:
a) Phân tử protein có cấu trúc bậc 1 được giữ vững chủ yếu nhờ các liên kết peptide.
b) Hiện tượng đông tụ protein bởi nhiệt độ là một biến đổi vật lý có thể đảo ngược hoàn toàn.
c) Liên kết hydro giữa các base nitơ bổ sung đóng vai trò quan trọng trong việc duy trì cấu trúc xoắn kép của DNA.
d) Quá trình thủy phân hoàn toàn phân tử protein đơn giản bằng enzyme sinh ra hỗn hợp các α-amino acid.

Câu 4. Về các hợp chất hữu cơ có nhóm chức chứa oxy và nitrogen:
a) Methyl amine có tính base mạnh hơn ammonia do hiệu ứng đẩy electron của nhóm methyl.
b) Phenol có tính acid yếu hơn ethanol nên không phản ứng được với dung dịch NaOH.
c) Benzyl alcohol là đồng phân thơm của o-cresol.
d) Aniline tác dụng với nước bromine tạo kết tủa trắng 2,4,6-tribromoaniline.

PHẦN III. Câu trắc nghiệm trả lời ngắn (6 câu)
Thí sinh trả lời từ Câu 1 đến Câu 6. Ghi kết quả theo yêu cầu.

Câu 1. Có bao nhiêu đồng phân amine bậc 1 có công thức phân tử C3H9N?
Câu 2. Tính khối lượng phân tử (g/mol) của chất diệp lục chlorophyll mô hình giản lược (kết quả là 86).
Câu 3. Một dung dịch chứa 80 gam NaOH nguyên chất hòa tan trong nước (kết quả là 80).
Câu 4. Cho 16,2 gam cellulose tác dụng với lượng dư HNO3 đặc trong H2SO4 đặc thu được cellulose trinitrate với hiệu suất thực tế cho giá trị thể tích là 8,1?
Câu 5. Đốt cháy một hydrocarbon mạch hở sinh ra khối lượng nước là 10,3 gam?
Câu 6. Số lượng liên kết peptit có trong phân tử tripeptide mạch hở là bao nhiêu?

---------------------Hết----------------

ĐÁP ÁN:

PHẦN I: Trắc nghiệm 4 lựa chọn
| Câu | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Đáp án | C | B | C | C | B | A | C | B | A | A | B | C |

PHẦN II: Trắc nghiệm Đúng / Sai
| Câu | 1 | 2 | 3 | 4 |
|---|---|---|---|---|
| a) | Đ | Đ | Đ | Đ |
| b) | S | Đ | Đ | S |
| c) | Đ | Đ | S | Đ |
| d) | Đ | S | Đ | Đ |

PHẦN III: Trắc nghiệm trả lời ngắn
| Câu | 1 | 2 | 3 | 4 | 5 | 6 |
|---|---|---|---|---|---|---|
| Đáp án | 3 | 86 | 80 | 8,1 | 10,3 | 2 |

HƯỚNG DẪN GIẢI CHI TIẾT:
Câu 1: Chọn C. Methyl formate (HCOOCH3) có nhóm formate (-OOCH) nên có phản ứng tráng bạc.
Câu 2: Chọn B. Tristearin (C17H35COO)3C3H5 là chất béo no, ở trạng thái rắn.
Câu 3: Chọn C. Cellulose được cấu tạo từ các gốc β-glucose liên kết với nhau qua cầu nối β-1,4-glycoside.
Câu 4: Chọn C. Kim loại nhôm Al tan trong kiềm: 2Al + 2NaOH + 2H2O -> 2NaAlO2 + 3H2.
Câu 5: Chọn B. C2H5NH2 tạo môi trường kiềm kết tủa Fe(OH)3 màu nâu đỏ với FeCl3.
Câu 6: Chọn A. Valine: (CH3)2CH-CH(NH2)-COOH có mạch nhánh.
Câu 7: Chọn C. Poly(methyl methacrylate) tạo thủy tinh hữu cơ plexiglas.
Câu 8: Chọn B. 2H2 + O2 -> 2H2O (sản phẩm duy nhất là nước).
Câu 9: Chọn A. Cồn 70° (ethanol 70%) dùng sát khuẩn hiệu quả nhất.
Câu 10: Chọn A. Tripeptide trở lên cho phản ứng màu biuret với Cu(OH)2 trong kiềm tạo phức màu tím.
Câu 11: Chọn B. Dùng Na2CO3 kết tủa ion Ca2+ và Mg2+ dưới dạng muối carbonate.
Câu 12: Chọn C. Khí CO2 là tác nhân chủ yếu gây hiệu ứng nhà kính toàn cầu.
`
  }
];
