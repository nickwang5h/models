// GET /feed.xml — Atom feed of the last 14 days of 今日一卡.
import { assetLoader, createFeedHandler } from '../src/handlers.mjs';

export const onRequest = ({ request, env }) => createFeedHandler({ load: assetLoader(env, request) })(request);
