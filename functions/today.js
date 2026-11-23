// GET /today — the card of the UTC day and its question (?date=YYYY-MM-DD for the last 30 days).
import { counted, todayRow } from '../src/count.mjs';
import { assetLoader, createTodayHandler } from '../src/handlers.mjs';

export const onRequest = (context) => counted(createTodayHandler({ load: assetLoader(context.env, context.request) }),
  { db: context.env.COUNTS, later: (work) => context.waitUntil(work), describe: todayRow })(context.request);
