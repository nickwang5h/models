// POST /api/daily-mail with Authorization: Bearer $CRON_SECRET — sends today's card as one Resend Broadcast.
// ops/models-daily.py calls it once a day (see docs/email.md).
import { assetLoader } from '../../src/handlers.mjs';
import { createDailyMailHandler } from '../../src/mail.mjs';

export const onRequest = ({ request, env }) => createDailyMailHandler({ env, load: assetLoader(env, request) })(request);
