/**
 * ANSWER EXTRACTION ENGINE - Type Definitions
 * Hệ thống trích xuất, phân tích và kiểm định đáp án đề thi trắc nghiệm Chương trình GDPT 2018
 */

import { QuestionType, RecognitionStatus, RecognitionSource } from '../../types';

export interface RawDocumentTable {
  id: string;
  sourceType: 'docx_html' | 'markdown' | 'pdf_coords' | 'text_grid';
  rows: string[][]; // rows[rowIndex][colIndex]
  rawText?: string;
  surroundingHeader?: string;
  pageNumber?: number;
}

export interface ExtractedAnswerItem {
  id: string; // e.g. "I.1", "II.1a", "III.1"
  section: 'part1' | 'part2' | 'part3';
  questionNumber: number;
  subQuestion?: 'a' | 'b' | 'c' | 'd';
  answerType: 'choice' | 'true_false' | 'short_answer';
  correctAnswer: string;
  acceptedAnswers?: string[];
  numericValue?: number;
  tolerance?: number;
  source: RecognitionSource;
  confidence: number; // 0.0 - 1.0
  sourceSnippet?: string;
  notes?: string;
  validationStatus: RecognitionStatus;
  validationIssues?: string[];
  teacherVerified: boolean;
}

export type ValidationErrorType = 
  | 'missing_answer'
  | 'duplicate_question'
  | 'wrong_section'
  | 'matrix_transposition_error'
  | 'invalid_domain_value'
  | 'contradictory_solution'
  | 'unlinked_question';

export interface ValidationIssue {
  type: ValidationErrorType;
  severity: 'error' | 'warning' | 'info';
  message: string;
  section: 'part1' | 'part2' | 'part3';
  questionNumber: number;
  subQuestion?: 'a' | 'b' | 'c' | 'd';
  suggestedFix?: string;
}

export interface EngineVerificationReport {
  totalExpectedItems: number;
  verifiedCount: number;
  needsReviewCount: number;
  notFoundCount: number;
  successRatePercent: number;
  issues: ValidationIssue[];
  part1Summary: { total: number; found: number; missing: number[] };
  part2Summary: { totalStatements: number; found: number; missing: string[] };
  part3Summary: { total: number; found: number; missing: number[] };
}

export interface ExtractionEngineResult {
  engineVersion: string;
  extractedTablesCount: number;
  items: ExtractedAnswerItem[];
  part1Answers: Map<number, ExtractedAnswerItem>;
  part2Answers: Map<number, Map<string, ExtractedAnswerItem>>; // qNum -> 'a'|'b'|'c'|'d' -> item
  part3Answers: Map<number, ExtractedAnswerItem>;
  detailedSolutions: Map<string, string>; // "I.1" or "III.2" -> solution text
  verificationReport: EngineVerificationReport;
}
