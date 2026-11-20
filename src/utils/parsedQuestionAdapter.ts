import {
  ParsedQuestion,
  ParsedQuestionType,
  Question,
  QuestionType,
  SubQuestion,
} from '../types';

export function mapQuestionTypeToParsedType(type: QuestionType): ParsedQuestionType {
  if (type === 'part2_true_false') return 'true_false';
  if (type === 'part3_short_answer') return 'short_answer';
  return 'multiple_choice';
}

export function mapParsedTypeToQuestionType(type: ParsedQuestionType): QuestionType {
  if (type === 'true_false') return 'part2_true_false';
  if (type === 'short_answer' || type === 'essay') return 'part3_short_answer';
  return 'part1_single_choice';
}

export function questionToParsedQuestion(q: Question, order: number): ParsedQuestion {
  const parsedType = mapQuestionTypeToParsedType(q.type);

  const options: string[] | undefined =
    parsedType === 'multiple_choice' && q.options
      ? q.options.map((opt) => `${opt.id}. ${opt.text}`)
      : undefined;

  const subQuestions: SubQuestion[] | undefined =
    parsedType === 'true_false' && q.statements
      ? q.statements.map((st) => ({
          id: st.id,
          content: st.statement,
          answer: typeof st.correctAnswer === 'boolean' ? st.correctAnswer : null,
        }))
      : undefined;

  let correctAnswer: string | null = null;
  if (parsedType === 'multiple_choice') {
    correctAnswer =
      q.correctOptionId ||
      (q.correctOptionIds && q.correctOptionIds.length > 0
        ? q.correctOptionIds.join(',')
        : null);
  } else if (parsedType === 'short_answer') {
    correctAnswer = q.shortAnswerConfig?.acceptableAnswers?.[0] ?? null;
  }

  return {
    id: q.id,
    order,
    type: parsedType,
    content: q.content,
    ...(options ? { options } : {}),
    ...(subQuestions ? { sub_questions: subQuestions } : {}),
    correct_answer: correctAnswer,
    explanation: q.explanation ?? null,
    subject: q.subjectName || q.subjectId,
    grade: q.grade,
    topic: q.lessonName || q.lessonTopic || q.chapterName,
    difficulty: q.level,
  };
}

export function questionsToParsedQuestions(list: Question[]): ParsedQuestion[] {
  return list.map((q, idx) => questionToParsedQuestion(q, idx + 1));
}
