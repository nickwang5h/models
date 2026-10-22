// POST /api/subscribe {email, website} — sends a confirmation link (see src/mail.mjs, docs/email.md).
import { createSubscribeHandler } from '../../src/mail.mjs';

export const onRequest = ({ request, env }) => createSubscribeHandler({ env })(request);
