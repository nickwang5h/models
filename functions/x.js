// GET /x — the short address printed on pictures, short enough to type by hand. The same as /c/x.
import { createChannelHandler } from '../src/count.mjs';
import { assetLoader } from '../src/handlers.mjs';

export const onRequest = (context) => createChannelHandler({
  db: context.env.COUNTS, load: assetLoader(context.env, context.request), name: 'x', later: (work) => context.waitUntil(work),
})(context.request);
