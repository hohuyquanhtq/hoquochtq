/**
 * ANSWER EXTRACTION ENGINE 2.0
 * Module độc lập trích xuất, phân tích và kiểm định đáp án đề thi trắc nghiệm Chương trình GDPT 2018
 */

import {
  RawDocumentTable,
  ExtractedAnswerItem,
  ExtractionEngineResult,
} from './types';
import {
  readDocxStructure,
  extractTablesFromText,
  isolateAnswerBlock,
} from './documentTableReader';
import { extractAnswersAlgorithmically } from './algorithmicExtractor';
import { validateAndCrossCheckAnswers } from './answerValidator';
import { deepScanWithGemini } from './geminiAnswerAssistant';

export * from './types';
export * from './documentTableReader';
export * from './algorithmicExtractor';
export * from './answerValidator';
export * from './geminiAnswerAssistant';

export interface ExtractionOptions {
  docxBuffer?: ArrayBuffer;
  tables?: RawDocumentTable[];
  enableGeminiFallback?: boolean;
  expectedCounts?: {
    part1?: number;
    part2?: number;
    part3?: number;
  };
}

/**
 * Main entry point for the Answer Extraction Engine
 */
export async function runAnswerExtractionEngine(
  rawText: string,
  options?: ExtractionOptions
): Promise<ExtractionEngineResult> {
  let fullText = rawText;
  let tables: RawDocumentTable[] = options?.tables ? [...options.tables] : [];

  // 1. If DOCX ArrayBuffer is provided, parse HTML tables directly
  if (options?.docxBuffer) {
    try {
      const docxResult = await readDocxStructure(options.docxBuffer);
      fullText = docxResult.fullMarkdownText || rawText;
      if (docxResult.tables.length > 0) {
        tables = [...docxResult.tables, ...tables];
      }
    } catch (e) {
      console.warn('Docx structure reading inside engine:', e);
    }
  }

  // 2. Also extract any Markdown or text grid tables found inside fullText
  const textTables = extractTablesFromText(fullText);
  if (textTables.length > 0) {
    tables = [...tables, ...textTables];
  }

  // 3. Isolate the answer key block to optimize accuracy
  const { answerSectionText, isExplicitAnswerBlock } = isolateAnswerBlock(fullText);
  const textToScan = isExplicitAnswerBlock ? answerSectionText : fullText;

  // 4. Algorithmic Extraction (2D tables, transposed matrices, inline lists)
  const algoResult = extractAnswersAlgorithmically(tables, textToScan);
  let { part1Items, part2Items, part3Items } = algoResult;
  const { detailedSolutions, solutionChoices } = algoResult;

  // 5. Check if Gemini Deep Scan is needed (only if enabled and items are missing)
  if (options?.enableGeminiFallback) {
    const isP1Deficient = (options.expectedCounts?.part1 || 12) > part1Items.length;
    const isP2Deficient = (options.expectedCounts?.part2 || 4) * 4 > part2Items.length;
    const isP3Deficient = (options.expectedCounts?.part3 || 6) > part3Items.length;

    if (isP1Deficient || isP2Deficient || isP3Deficient) {
      const missingContext = `Thiếu: ${isP1Deficient ? 'Phần I; ' : ''}${isP2Deficient ? 'Phần II; ' : ''}${isP3Deficient ? 'Phần III' : ''}`;
      const aiResults = await deepScanWithGemini(textToScan, missingContext);

      // Merge non-duplicate AI items
      const existingP1 = new Set(part1Items.map(i => i.questionNumber));
      for (const item of aiResults.aiPart1) {
        if (!existingP1.has(item.questionNumber)) {
          part1Items.push(item);
        }
      }

      const existingP2 = new Set(part2Items.map(i => `${i.questionNumber}-${i.subQuestion}`));
      for (const item of aiResults.aiPart2) {
        if (!existingP2.has(`${item.questionNumber}-${item.subQuestion}`)) {
          part2Items.push(item);
        }
      }

      const existingP3 = new Set(part3Items.map(i => i.questionNumber));
      for (const item of aiResults.aiPart3) {
        if (!existingP3.has(item.questionNumber)) {
          part3Items.push(item);
        }
      }
    }
  }

  // 6. 7-Point Validation and Cross-Checking
  const validationResult = validateAndCrossCheckAnswers(
    part1Items,
    part2Items,
    part3Items,
    solutionChoices,
    tables,
    options?.expectedCounts
  );

  // 7. Assemble final lookup maps
  const part1Map = new Map<number, ExtractedAnswerItem>();
  for (const item of validationResult.validatedPart1) {
    part1Map.set(item.questionNumber, item);
  }

  const part2Map = new Map<number, Map<string, ExtractedAnswerItem>>();
  for (const item of validationResult.validatedPart2) {
    if (!part2Map.has(item.questionNumber)) {
      part2Map.set(item.questionNumber, new Map());
    }
    if (item.subQuestion) {
      part2Map.get(item.questionNumber)!.set(item.subQuestion, item);
    }
  }

  const part3Map = new Map<number, ExtractedAnswerItem>();
  for (const item of validationResult.validatedPart3) {
    part3Map.set(item.questionNumber, item);
  }

  const allItems = [
    ...validationResult.validatedPart1,
    ...validationResult.validatedPart2,
    ...validationResult.validatedPart3,
  ];

  return {
    engineVersion: '2.0-GDPT2018',
    extractedTablesCount: tables.length,
    items: allItems,
    part1Answers: part1Map,
    part2Answers: part2Map,
    part3Answers: part3Map,
    detailedSolutions,
    verificationReport: validationResult.report,
  };
}
