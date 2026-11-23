// GET /api/counts?days=30 with Authorization: Bearer $CRON_SECRET — the counts kept by src/count.mjs (docs/counts.md).
import { createCountsHandler } from '../../src/count.mjs';

export const onRequest = ({ request, env }) => createCountsHandler({ env })(request);
