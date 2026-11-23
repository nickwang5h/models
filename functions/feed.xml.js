// GET /feed.xml — Atom feed of the last 14 days of 今日一卡.
import { counted, feedRow } from '../src/count.mjs';
import { assetLoader, createFeedHandler } from '../src/handlers.mjs';

export const onRequest = (context) => counted(createFeedHandler({ load: assetLoader(context.env, context.request) }),
  { db: context.env.COUNTS, later: (work) => context.waitUntil(work), describe: feedRow })(context.request);
