// GET /today — the card of the UTC day and its question (?date=YYYY-MM-DD for the last 30 days).
import { assetLoader, createTodayHandler } from '../src/handlers.mjs';

export const onRequest = ({ request, env }) => createTodayHandler({ load: assetLoader(env, request) })(request);
