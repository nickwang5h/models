// GET /c/<name> — a link posted in one place (mail, tg, …): counts the visit, then goes on to the day (src/count.mjs).
import { createChannelHandler } from '../../src/count.mjs';
import { assetLoader } from '../../src/handlers.mjs';

export const onRequest = (context) => createChannelHandler({
  db: context.env.COUNTS, load: assetLoader(context.env, context.request), name: context.params.name, later: (work) => context.waitUntil(work),
})(context.request);
