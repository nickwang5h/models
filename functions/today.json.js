// GET /today.json — the same day as data (?date=YYYY-MM-DD for any day); the Telegram push reads this.
import { assetLoader, createTodayJsonHandler } from '../src/handlers.mjs';

export const onRequest = ({ request, env }) => createTodayJsonHandler({ load: assetLoader(env, request) })(request);
