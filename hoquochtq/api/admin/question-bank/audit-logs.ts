import { createAdminQuestionBankHandlers } from '../../../server/adminQuestionBankHandler.ts';
import { createVercelHandler } from '../../../server/vercelAdapter.ts';

const handlers = createAdminQuestionBankHandlers();
export default createVercelHandler(handlers.handleGetQuestionAuditLogs);
