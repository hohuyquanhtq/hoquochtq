import { CognitiveLevel, Question } from '../types';

const VALID_LEVELS = new Set<CognitiveLevel>([
  'nhan_biet',
  'thong_hieu',
  'van_dung',
  'van_dung_cao',
]);

/**
 * AI-assisted chemistry question explanation generator (calls server-side /api/gemini/explain)
 */
export async function generateAiChemistryExplanation(question: Question): Promise<string> {
  try {
    const response = await fetch('/api/gemini/explain', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        content: question.content,
        type: question.type,
        options: question.options,
        correctOptionId: question.correctOptionId,
        statements: question.statements,
      }),
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      return (
        data?.error ||
        'Lưu ý: Cần thiết lập GEMINI_API_KEY để sử dụng trợ lý giải thích AI tự động.'
      );
    }

    return typeof data?.explanation === 'string' && data.explanation.trim()
      ? data.explanation
      : 'Không thể tạo lời giải tự động.';
  } catch (error) {
    console.error('Gemini explanation error:', error);
    return 'Đã xảy ra lỗi khi kết nối tới mô hình AI. Vui lòng thử lại sau.';
  }
}

/**
 * Optional fast AI fallback to classify cognitive levels ONLY for questions that
 * did not have explicit [NB], [TH], [VD], [VDC] tags in the uploaded Word file.
 * Strictly timeout-guarded (5s) and returns {} silently if AI is off, busy, or unreachable.
 */
export async function classifyMissingCognitiveLevelsWithAi(
  items: Array<{ id: string; content: string; type?: string }>
): Promise<Record<string, CognitiveLevel>> {
  if (!items || items.length === 0) return {};

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 5000);

  try {
    const response = await fetch('/api/gemini/classify-levels', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ items }),
      signal: controller.signal,
    });

    if (!response.ok) return {};
    const data = await response.json().catch(() => ({}));
    if (!data?.available || !data?.levels || typeof data.levels !== 'object') {
      return {};
    }

    const result: Record<string, CognitiveLevel> = {};
    for (const [id, lvl] of Object.entries(data.levels)) {
      if (typeof lvl === 'string' && VALID_LEVELS.has(lvl as CognitiveLevel)) {
        result[id] = lvl as CognitiveLevel;
      }
    }
    return result;
  } catch {
    return {};
  } finally {
    clearTimeout(timeoutId);
  }
}
