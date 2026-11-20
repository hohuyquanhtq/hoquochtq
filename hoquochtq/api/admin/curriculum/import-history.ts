import { createCurriculumImportHandlers } from '../../../server/curriculumImportHandler.ts';
import { createVercelHandler } from '../../../server/vercelAdapter.ts';

const handlers = createCurriculumImportHandlers();
export default createVercelHandler(handlers.handleGetCurriculumImportHistory);
