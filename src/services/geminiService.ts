import { GoogleGenAI } from '@google/genai';
import { Question } from '../types';

let aiInstance: GoogleGenAI | null = null;

function getAiClient(): GoogleGenAI | null {
  if (aiInstance) return aiInstance;
  const apiKey = (typeof process !== 'undefined' && process.env?.GEMINI_API_KEY) || (import.meta as any).env?.VITE_GEMINI_API_KEY;
  if (apiKey && apiKey !== 'MY_GEMINI_API_KEY') {
    aiInstance = new GoogleGenAI({ apiKey });
    return aiInstance;
  }
  return null;
}

/**
 * AI-assisted chemistry question explanation generator
 */
export async function generateAiChemistryExplanation(question: Question): Promise<string> {
  const ai = getAiClient();
  if (!ai) {
    return 'Lưu ý: Cần thiết lập GEMINI_API_KEY để sử dụng trợ lý giải thích AI tự động.';
  }

  try {
    const prompt = `Bạn là chuyên gia giảng dạy môn Hóa học THPT và Chuyên Hóa Việt Nam. Hãy viết lời giải chi tiết, rõ ràng, khoa học cho câu hỏi sau:
Nội dung: ${question.content}
Dạng câu: ${question.type}
${question.options ? `Các phương án: ${question.options.map(o => `${o.id}. ${o.text}`).join('; ')}` : ''}
${question.correctOptionId ? `Đáp án đúng: ${question.correctOptionId}` : ''}
${question.statements ? `Mệnh đề: ${question.statements.map(s => `${s.id}) ${s.statement}`).join('; ')}` : ''}

Yêu cầu:
- Trình bày phương trình hóa học đầy đủ, đúng điều kiện nhiệt độ/xúc tác.
- Giải thích bản chất hiện tượng hóa học hoặc tính toán từng bước.
- Ngắn gọn, súc tích, chuẩn chương trình giáo dục phổ thông mới.`;

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
    });

    return response.text || 'Không thể tạo lời giải tự động.';
  } catch (error) {
    console.error('Gemini explanation error:', error);
    return 'Đã xảy ra lỗi khi kết nối tới mô hình AI. Vui lòng kiểm tra API key.';
  }
}
