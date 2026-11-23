// GET /api/confirm?t=… — adds a confirmed address to the Resend Segment (see src/mail.mjs, docs/email.md).
import { confirmRow, counted } from '../../src/count.mjs';
import { createConfirmHandler } from '../../src/mail.mjs';

export const onRequest = (context) => counted(createConfirmHandler({ env: context.env }),
  { db: context.env.COUNTS, later: (work) => context.waitUntil(work), describe: confirmRow })(context.request);
