import mammoth from 'mammoth';
import { Question, QuestionType, ParsedExamResult, MultipleChoiceOption, TrueFalseStatement } from '../types';

/**
 * Extracts raw text from DOCX ArrayBuffer using mammoth
 */
export async function extractTextFromDocx(arrayBuffer: ArrayBuffer): Promise<string> {
  try {
    const result = await mammoth.extractRawText({ arrayBuffer });
    return result.value || '';
  } catch (err) {
    console.error('Error extracting text from DOCX:', err);
    throw new Error('Không thể đọc nội dung file DOCX. Vui lòng kiểm tra định dạng file.');
  }
}

/**
 * Parses Vietnamese Chemistry Exam text into structured Question array
 */
export function parseExamContent(rawText: string, defaultGrade: '10' | '11' | '12' | 'chuyen_hsg' = '12'): ParsedExamResult {
  const lines = rawText.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  
  // Try to find exam title
  let title = 'Đề kiểm tra Hóa học';
  for (let i = 0; i < Math.min(5, lines.length); i++) {
    const line = lines[i];
    if (/ĐỀ (THI|KIỂM TRA|KHẢO SÁT|ÔN TẬP)/i.test(line) || /HÓA HỌC/i.test(line)) {
      title = line.replace(/^[#*_\s]+|[#*_\s]+$/g, '');
      break;
    }
  }

  // Pre-extract Answer Keys block if present at bottom
  // e.g. "ĐÁP ÁN", "BẢNG ĐÁP ÁN", "HƯỚNG DẪN CHẤM"
  const answerKeyMap = extractAnswerKeys(rawText);

  // Split into sections or process sequentially
  let currentSection: QuestionType = 'part1_single_choice';
  const questions: Question[] = [];
  
  // Section headers regex
  const part1Regex = /PHẦN\s+(I|1)[\s.:\-–—]+(TRẮC NGHIỆM|CÂU HỎI TRẮC NGHIỆM|NHIỀU LỰA CHỌN|4 LỰA CHỌN)?/i;
  const part2Regex = /PHẦN\s+(II|2)[\s.:\-–—]+(TRẮC NGHIỆM|ĐÚNG\s*[-–—/]\s*SAI|CÂU HỎI ĐÚNG SAI)?/i;
  const part3Regex = /PHẦN\s+(III|3)[\s.:\-–—]+(TRẢ LỜI NGẮN|ĐIỀN KHUYẾT|TỰ LUẬN NGẮN)?/i;

  // Question header regex e.g. "Câu 1:", "Câu 1.", "Câu 1 -", "Câu 1:"
  const questionHeaderRegex = /^Câu\s+(\d+)[\s.:\-–—]+(.*)$/i;

  let currentQuestion: Partial<Question> | null = null;
  let currentOptionLetter: string | null = null;
  let currentStatementLetter: string | null = null;
  let tempContentLines: string[] = [];

  const finalizeCurrentQuestion = () => {
    if (!currentQuestion) return;

    if (tempContentLines.length > 0) {
      if (!currentQuestion.content) {
        currentQuestion.content = tempContentLines.join('\n').trim();
      }
    }

    // Auto-detect answer from map if not yet found
    const qNum = parseInt(currentQuestion.code?.replace(/\D/g, '') || '0', 10);
    const keyData = answerKeyMap.get(qNum);

    if (currentQuestion.type === 'part1_single_choice') {
      if (!currentQuestion.correctOptionId && keyData?.option) {
        currentQuestion.correctOptionId = keyData.option;
      }
      // Check if any option is marked as correct
      if (currentQuestion.options) {
        const foundCorrect = currentQuestion.options.find(o => o.isCorrect);
        if (foundCorrect && !currentQuestion.correctOptionId) {
          currentQuestion.correctOptionId = foundCorrect.id;
        } else if (currentQuestion.correctOptionId) {
          currentQuestion.options.forEach(o => {
            o.isCorrect = o.id === currentQuestion!.correctOptionId;
          });
        }
      }
    } else if (currentQuestion.type === 'part2_true_false') {
      if (keyData?.trueFalseMap && currentQuestion.statements) {
        currentQuestion.statements.forEach(st => {
          if (keyData.trueFalseMap![st.id] !== undefined) {
            st.correctAnswer = keyData.trueFalseMap![st.id];
          }
        });
      }
    } else if (currentQuestion.type === 'part3_short_answer') {
      if ((!currentQuestion.shortAnswerConfig || currentQuestion.shortAnswerConfig.acceptableAnswers.length === 0) && keyData?.shortAnswer) {
        const isNum = !isNaN(Number(keyData.shortAnswer.replace(',', '.')));
        currentQuestion.shortAnswerConfig = {
          acceptableAnswers: [keyData.shortAnswer, keyData.shortAnswer.replace(',', '.'), keyData.shortAnswer.replace('.', ',')],
          isNumeric: isNum,
          numericValue: isNum ? parseFloat(keyData.shortAnswer.replace(',', '.')) : undefined,
          tolerance: isNum ? 0.05 : undefined,
        };
      }
    }

    // Add parse status
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

    // Check if line indicates Answer Table section (stop parsing questions)
    if (/^(BẢNG\s+)?(ĐÁP\s*ÁN|HƯỚNG\s*DẪN\s*CHẤM|LỜI\s*GIẢI\s*CHI\s*TIẾT)/i.test(line) && idx > 5) {
      finalizeCurrentQuestion();
      break;
    }

    // Check section transitions
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

    // Check for question start
    const qMatch = line.match(questionHeaderRegex);
    if (qMatch) {
      finalizeCurrentQuestion();
      const qNum = parseInt(qMatch[1], 10);
      const remainingText = qMatch[2] || '';

      currentQuestion = {
        id: `q_${Date.now()}_${qNum}_${Math.random().toString(36).substring(2, 6)}`,
        code: `H_${defaultGrade}_C${qNum}`,
        type: currentSection,
        grade: defaultGrade,
        topic: 'hoa_dai_cuong',
        level: qNum <= 10 ? 'nhan_biet' : qNum <= 20 ? 'thong_hieu' : qNum <= 25 ? 'van_dung' : 'van_dung_cao',
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

    // If currently inside a question
    if (currentQuestion) {
      // 1. Check for inline Part I options (e.g. "A. xx   B. yy   C. zz   D. tt")
      if (currentQuestion.type === 'part1_single_choice') {
        const multiOptionRegex = /([A-D])[\s.:\-–—)]+([^A-D\n]+)/g;
        const optionMatches = [...line.matchAll(multiOptionRegex)];

        if (optionMatches.length >= 2) {
          // Multiple options on the same line!
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
            if (isCorrect) {
              currentQuestion!.correctOptionId = letter;
            }
          });
          continue;
        }

        // Single option line e.g. "A. ethylamine"
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
          if (isCorrect) {
            currentQuestion.correctOptionId = letter;
          }
          continue;
        }
      }

      // 2. Check for Part II statements: a), b), c), d)
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

      // 3. Check for Short Answer cue in Part III
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

      // 4. Check for explanation lines
      if (/^(Lời giải|Hướng dẫn giải|Giải thích|HDG)[\s.:\-–—]+(.*)$/i.test(line)) {
        const exp = line.replace(/^(Lời giải|Hướng dẫn giải|Giải thích|HDG)[\s.:\-–—]+/i, '');
        currentQuestion.explanation = exp;
        continue;
      }

      // Append multiline text
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

      // Default: part of question prompt/content
      if (!currentQuestion.content) {
        currentQuestion.content = line;
      } else {
        currentQuestion.content += '\n' + line;
      }
    }
  }

  finalizeCurrentQuestion();

  // Calculate statistics
  const part1Count = questions.filter(q => q.type === 'part1_single_choice').length;
  const part2Count = questions.filter(q => q.type === 'part2_true_false').length;
  const part3Count = questions.filter(q => q.type === 'part3_short_answer').length;
  
  const questionsWithAnswers = questions.filter(q => {
    if (q.type === 'part1_single_choice') return !!q.correctOptionId;
    if (q.type === 'part2_true_false') return q.statements && q.statements.length > 0;
    if (q.type === 'part3_short_answer') return q.shortAnswerConfig && q.shortAnswerConfig.acceptableAnswers.length > 0;
    return false;
  }).length;

  const questionsMissingAnswers = questions.length - questionsWithAnswers;
  const questionsWithWarnings = questions.filter(q => q.parseStatus !== 'verified').length;

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
  };
}

/**
 * Extracts answer keys table like:
 * 1.A 2.B 3.C 4.D
 * or "BẢNG ĐÁP ÁN: 1 - A; 2 - C; ..."
 */
function extractAnswerKeys(text: string): Map<number, { option?: string; trueFalseMap?: Record<string, boolean>; shortAnswer?: string }> {
  const map = new Map<number, { option?: string; trueFalseMap?: Record<string, boolean>; shortAnswer?: string }>();
  
  // Pattern 1: Single choice "1.A" or "1 - A" or "1: A" or "Câu 1: A"
  const singleKeyRegex = /(?:Câu\s+)?(\d+)[\s.:\-–—)]+([A-D])\b/gi;
  for (const match of text.matchAll(singleKeyRegex)) {
    const qNum = parseInt(match[1], 10);
    const opt = match[2].toUpperCase();
    map.set(qNum, { option: opt });
  }

  // Pattern 2: Part II True-False keys like: "Câu 1: a-Đ, b-S, c-Đ, d-S" or "1: a-Đ; b-S"
  const part2KeyRegex = /(?:Câu\s+)?(\d+)[\s.:\-–—]+([a-d]\s*[-:]\s*[ĐS](?:[,\s;]+[a-d]\s*[-:]\s*[ĐS])*)/gi;
  for (const match of text.matchAll(part2KeyRegex)) {
    const qNum = parseInt(match[1], 10);
    const rawPairs = match[2];
    const tfMap: Record<string, boolean> = {};
    const subMatches = [...rawPairs.matchAll(/([a-d])\s*[-:]\s*([ĐS])/gi)];
    subMatches.forEach(sm => {
      tfMap[sm[1].toLowerCase()] = sm[2].toUpperCase() === 'Đ';
    });
    if (Object.keys(tfMap).length > 0) {
      map.set(qNum, { trueFalseMap: tfMap });
    }
  }

  return map;
}

/**
 * Pre-packaged authentic Vietnamese Chemistry Examination samples
 * ready for instant 1-click loading and testing by teachers!
 */
export const SAMPLE_CHEMISTRY_EXAMS = [
  {
    id: 'sample_thpt_2025',
    name: 'Đề minh họa Tốt nghiệp THPT 2025 - Môn Hóa học (Chuẩn Bộ GD&ĐT)',
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
    id: 'sample_hsg_olympiad',
    name: 'Đề Bồi Dưỡng Học Sinh Giỏi Quốc Gia - Chuyên Đề Phức Chất & Nhiệt Động Học',
    grade: 'chuyen_hsg' as const,
    description: 'Chuyên đề bồi dưỡng đội tuyển HSG: Cân bằng ion, phức chất phối trí, entanpy phản ứng và hằng số bền.',
    content: `TRƯỜNG THPT CHUYÊN - KỲ THI CHỌN ĐỘI TUYỂN HỌC SINH GIỎI MÔN HÓA HỌC

PHẦN I. TRẮC NGHIỆM 4 LỰA CHỌN

Câu 1. Cho phức chất [Co(NH3)6]Cl3. Số phối trí của ion trung tâm Co3+ trong phức chất này là
A. 6.
B. 3.
C. 4.
D. 2.
Lời giải: Ion trung tâm Co3+ liên kết phối trí với 6 phối tử đơn càng NH3, do đó số phối trí là 6.

Câu 2. Cho phản ứng: N2(k) + 3H2(k) <=> 2NH3(k), có biến thiên enthalpy chuẩn ΔrH°298 = -92,2 kJ. Khi tăng nhiệt độ của hệ thì cân bằng sẽ chuyển dịch theo chiều nào?
A. Chiều nghịch (hấp thu nhiệt).
B. Chiều thuận (tỏa nhiệt).
C. Không chuyển dịch.
D. Ban đầu theo chiều thuận, sau đó theo chiều nghịch.

PHẦN II. TRẮC NGHIỆM ĐÚNG – SAI

Câu 1. Xét dung dịch phức chất [Cu(H2O)6]2+ khi thêm dần dung dịch NH3 đặc vào:
[Cu(H2O)6]2+ (xanh nhạt) + 4NH3 <=> [Cu(NH3)4(H2O)2]2+ (xanh thẫm) + 4H2O
a) Phối tử NH3 có trường tinh thể mạnh hơn phối tử H2O nên thay thế H2O trong cầu nội phối trí.
b) Phức chất tứ ammine đồng(II) có dạng hình học bát diện bị biến dạng theo hiệu ứng Jahn-Teller.
c) Dung dịch chuyển từ màu xanh nhạt sang kết tủa màu nâu đỏ rồi tan thành dung dịch không màu.
d) Khi thêm tiếp dung dịch axit H2SO4 loãng vào dung dịch xanh thẫm, màu xanh thẫm sẽ biến mất và trở lại màu xanh lam nhạt.
Lời giải: Ý a, b, d đúng. Ý c sai vì Cu(OH)2 có màu xanh lơ, phức tan có màu xanh thẫm đặc trưng.

PHẦN III. TRẮC NGHIỆM TRẢ LỜI NGẮN

Câu 1. Tính độ pH của dung dịch thu được khi hòa tan 0,01 mol axit mạnh HCl vào nước để được 1 lít dung dịch ở 25°C.
Đáp án: 2.0
Lời giải: [H+] = 0.01 M = 10^-2 M => pH = -log(0.01) = 2.0.

Câu 2. Một mẫu quặng hematit chứa 80% Fe2O3 theo khối lượng (còn lại là tạp chất trơ không chứa sắt). Tính phần trăm khối lượng của nguyên tố Fe trong mẫu quặng trên (lấy Fe=56, O=16, làm tròn đến 1 chữ số thập phân).
Đáp án: 56.0
Lời giải: %Fe trong Fe2O3 = (2*56)/160 = 70%. Trong quặng: %Fe = 80% * 70% = 56.0%.

BẢNG ĐÁP ÁN:
1.A
2.A
`
  }
];
