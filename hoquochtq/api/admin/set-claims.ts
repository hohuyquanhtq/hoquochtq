import { handleSetAdminClaims } from '../../server/adminClaimsHandler.ts';
import { createVercelHandler } from '../../server/vercelAdapter.ts';

export default createVercelHandler(handleSetAdminClaims);
