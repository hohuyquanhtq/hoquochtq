import { createPublicExamLinkHandlers } from '../../server/publicExamLinkHandler.ts';
import { createVercelHandler } from '../../server/vercelAdapter.ts';

const handlers = createPublicExamLinkHandlers();

export default createVercelHandler(handlers.handleAllocatePublicCode);
