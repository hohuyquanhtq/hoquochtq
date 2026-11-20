import { createExamApiHandlers } from '../../server/examApiHandlers.ts';
import { createVercelHandler } from '../../server/vercelAdapter.ts';

const handlers = createExamApiHandlers();
export default createVercelHandler(handlers.handleSubmitAndGradeExam);
