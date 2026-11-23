// POST /api/subscribe {email, website, place} — sends a confirmation link (see src/mail.mjs, docs/email.md).
import { counted, subscribeRow } from '../../src/count.mjs';
import { createSubscribeHandler } from '../../src/mail.mjs';

export const onRequest = (context) => counted(createSubscribeHandler({ env: context.env }),
  { db: context.env.COUNTS, later: (work) => context.waitUntil(work), describe: subscribeRow })(context.request);
