import { GoogleGenAI, ThinkingLevel, Type } from '@google/genai';

type CognitiveLevel = 'nhan_biet' | 'thong_hieu' | 'van_dung' | 'van_dung_cao';

const VALID_LEVELS = new Set<CognitiveLevel>([
  'nhan_biet',
  'thong_hieu',
  'van_dung',
  'van_dung_cao',
]);

let cachedClient: GoogleGenAI | null = null;

function getServerGeminiClient(): GoogleGenAI | null {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') {
    return null;
  }
  if (!cachedClient) {
    cachedClient = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    });
  }
  return cachedClient;
}

interface HttpRequestLike {
  method?: string;
  body?: unknown;
}

interface HttpResponseLike {
  status: number;
  body: Record<string, unknown>;
}

/**
 * POST /api/gemini/classify-levels
 * Optional fast server-side fallback classifier for questions that do not have
 * explicit [NB]/[TH]/[VD]/[VDC] tags in the uploaded Word file.
 */
export async function handleClassifyCognitiveLevels(
  req: HttpRequestLike
): Promise<HttpResponseLike> {
  if ((req.method || 'GET').toUpperCase() !== 'POST') {
    return { status: 405, body: { error: 'Method Not Allowed' } };
  }

  const ai = getServerGeminiClient();
  if (!ai) {
    return {
      status: 200,
      body: {
        available: false,
        levels: {},
      },
    };
  }

  const body = (req.body || {}) as {
    items?: Array<{ id?: unknown; content?: unknown; type?: unknown }>;
  };

  if (!Array.isArray(body.items) || body.items.length === 0) {
    return {
      status: 200,
      body: {
        available: true,
        levels: {},
      },
    };
  }

  // Cap batch size so classification stays fast and bounded
  const safeItems = body.items
    .slice(0, 40)
    .map((item) => ({
      id: typeof item.id === 'string' ? item.id.slice(0, 120) : '',
      type: typeof item.type === 'string' ? item.type.slice(0, 40) : '',
      content: typeof item.content === 'string' ? item.content.replace(/<[^>]+>/g, ' ').trim().slice(0, 500) : '',
    }))
    .filter((item) => item.id && item.content);

  if (safeItems.length === 0) {
    return {
      status: 200,
      body: {
        available: true,
        levels: {},
      },
    };
  }

  try {
    const prompt = `Phân loại mức độ nhận thức theo chương trình GDPT 2018 (môn Hóa học / Khoa học tự nhiên) cho từng câu hỏi dưới đây.
Chọn đúng 1 trong 4 giá trị:
- "nhan_biet": ghi nhớ khái niệm, công thức, tính chất cơ bản trực tiếp.
- "thong_hieu": giải thích hiện tượng, so sánh, xác định sản phẩm/tính chất ở mức hiểu.
- "van_dung": tính toán, kết hợp nhiều phản ứng hoặc tình huống thực tiễn.
- "van_dung_cao": bài toán tổng hợp nhiều bước, biện luận phức tạp hoặc phân tích chuyên sâu.

Danh sách câu hỏi:
${safeItems.map((it, idx) => `${idx + 1}. [id=${it.id}] (${it.type}): ${it.content}`).join('\n')}`;

    const response = await ai.models.generateContent({
      model: 'gemini-4-hydrogen',
      contents: prompt,
      config: {
        thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              id: { type: Type.STRING },
              level: { type: Type.STRING },
            },
          },
        },
      },
    });

    const rawText = (response.text || '[]').trim();
    const parsed = JSON.parse(rawText);
    const levels: Record<string, CognitiveLevel> = {};

    if (Array.isArray(parsed)) {
      for (const entry of parsed) {
        if (
          entry &&
          typeof entry.id === 'string' &&
          typeof entry.level === 'string' &&
          VALID_LEVELS.has(entry.level as CognitiveLevel)
        ) {
          levels[entry.id] = entry.level as CognitiveLevel;
        }
      }
    }

    return {
      status: 200,
      body: {
        available: true,
        levels,
      },
    };
  } catch (err) {
    console.error('[HQTest Gemini] classify-levels fallback:', err instanceof Error ? err.message : err);
    return {
      status: 200,
      body: {
        available: false,
        levels: {},
      },
    };
  }
}

/**
 * POST /api/gemini/explain
 * Server-side chemistry explanation generator (migrated off browser SDK).
 */
export async function handleExplainChemistryQuestion(
  req: HttpRequestLike
): Promise<HttpResponseLike> {
  if ((req.method || 'GET').toUpperCase() !== 'POST') {
    return { status: 405, body: { error: 'Method Not Allowed' } };
  }

  const ai = getServerGeminiClient();
  if (!ai) {
    return {
      status: 503,
      body: {
        error: 'Chưa cấu hình GEMINI_API_KEY trên máy chủ để tạo lời giải AI tự động.',
      },
    };
  }

  const body = (req.body || {}) as {
    content?: string;
    type?: string;
    options?: Array<{ id?: string; text?: string }>;
    correctOptionId?: string;
    statements?: Array<{ id?: string; statement?: string }>;
  };

  if (!body.content || typeof body.content !== 'string') {
    return { status: 400, body: { error: 'Thiếu nội dung câu hỏi.' } };
  }

  try {
    const optionsLine = Array.isArray(body.options) && body.options.length > 0
      ? `Các phương án: ${body.options.map((o) => `${o.id}. ${o.text}`).join('; ')}`
      : '';
    const statementsLine = Array.isArray(body.statements) && body.statements.length > 0
      ? `Mệnh đề: ${body.statements.map((s) => `${s.id}) ${s.statement}`).join('; ')}`
      : '';

    const prompt = `Bạn là chuyên gia giảng dạy môn Hóa học THPT và Chuyên Hóa Việt Nam. Hãy viết lời giải chi tiết, rõ ràng, khoa học cho câu hỏi sau:
Nội dung: ${body.content.slice(0, 2000)}
Dạng câu: ${body.type || ''}
${optionsLine}
${body.correctOptionId ? `Đáp án đúng: ${body.correctOptionId}` : ''}
${statementsLine}

Yêu cầu:
- Trình bày phương trình hóa học đầy đủ, đúng điều kiện nhiệt độ/xúc tác.
- Giải thích bản chất hiện tượng hóa học hoặc tính toán từng bước.
- Ngắn gọn, súc tích, chuẩn chương trình giáo dục phổ thông mới.`;

    const response = await ai.models.generateContent({
      model: 'gemini-4-hydrogen',
      contents: prompt,
      config: {
        thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
      },
    });

    return {
      status: 200,
      body: {
        explanation: response.text || 'Không thể tạo lời giải tự động.',
      },
    };
  } catch (err) {
    console.error('[HQTest Gemini] explain error:', err instanceof Error ? err.message : err);
    return {
      status: 502,
      body: {
        error: 'Đã xảy ra lỗi khi kết nối tới mô hình AI. Vui lòng thử lại sau.',
      },
    };
  }
}
