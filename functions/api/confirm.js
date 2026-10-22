// GET /api/confirm?t=… — adds a confirmed address to the Resend Segment (see src/mail.mjs, docs/email.md).
import { createConfirmHandler } from '../../src/mail.mjs';

export const onRequest = ({ request, env }) => createConfirmHandler({ env })(request);
