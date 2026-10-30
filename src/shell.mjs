// The frame every page shares: head, top bar, footer and scripts. No dependencies, so Pages Functions can render with it too.
import { escape } from '../public/quiz.mjs';
import { T, href } from '../public/i18n.mjs';

export const SITE = 'https://models.wuhua.app';

export const REPO = 'https://github.com/nickwang5h/models';

// Where a reader reports a mistake: the content-error issue form, with the card filled in when there is one.
export function reportUrl(id = '') {
  return `${REPO}/issues/new?template=content-error.yml${id ? `&card=${encodeURIComponent(id)}&title=${encodeURIComponent(`[内容] ${id}：`)}` : ''}`;
}

// Support: a pill to Ko-fi with a line-drawn dumpling (Ko-fi's tip unit here is a dumpling too). Steam rises when it is
// pointed at, it hops when pressed; nothing moves by itself. Colours are the site's own --accent and --paper.
export const KOFI = 'https://ko-fi.com/nickwang5h';
const DUMPLING = '<svg class="dp" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><g class="d-all">'
  + '<path class="d-steam" d="M8.2 6.1c-.9-1 .9-1.9 0-3.1"/><path class="d-steam s2" d="M12 5.4c-.9-1 .9-1.9 0-3.1"/><path class="d-steam s3" d="M15.8 6.1c-.9-1 .9-1.9 0-3.1"/>'
  + '<path class="d-body" d="M2.3 13.6c.5-.2 1 .1 1.3.6 3.4 5.9 13.4 5.9 16.8 0 .3-.5.8-.8 1.3-.6C20.2 5.2 3.8 5.2 2.3 13.6Z"/>'
  + '<path class="d-pleat" d="M6.8 9.8l1 2.3M9.5 8.7l.6 2.5M12.2 8.3l.1 2.6M14.9 8.6l-.4 2.5M17.5 9.6l-.8 2.3"/></g></svg>';
export const tip = (cls = '', lang = 'zh') => `<a class="tip${cls}" href="${KOFI}" target="_blank" rel="noopener noreferrer" aria-label="${T[lang].tipLabel}" data-tip>${DUMPLING}<span class="tl">${T[lang].tipLong}</span></a>`;

// The end of a card: one line and the same pill. Its dumpling lets off steam once a session (app.js).
// Hidden until app.js decides: the first card read to the end in a session, and the last card of a discipline.
export const tipAfter = (lang = 'zh', { last = false } = {}) => `<aside class="tip-after" aria-label="${T[lang].tipLong}" data-tip-after${last ? ' data-last' : ''} hidden><div class="art" aria-hidden="true">${DUMPLING}</div>
<p class="line">${T[lang].tipLine}</p><p class="row">${tip('', lang)}<span class="note">${T[lang].tipNote}</span></p></aside>`;

// Subscribe: the dumpling's companion, the same pill outlined, with a line envelope whose flap opens on hover and lets
// a slip rise out. It replaces the subscribe forms' submit button; the flow and the words stay as they were.
const ENVELOPE = '<svg class="env" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><rect class="e-slip" x="7" y="5" width="10" height="9" rx="1"/>'
  + '<path class="e-body" d="M3.5 9.5v9a1 1 0 0 0 1 1h15a1 1 0 0 0 1-1v-9"/><path class="e-body" d="M3.5 9.5l8.5 5.6 8.5-5.6"/><path class="e-flap" d="M3.5 9.5l8.5-5 8.5 5"/></svg>';
export const subButton = () => `<button class="letter" type="submit">${ENVELOPE}<span>订阅</span></button>`;

// app.js and every module it imports, fetched together instead of one after another (the import chain is two deep).
const MODULES = ['app.js', 'progress.mjs', 'quiz.mjs', 'keys.mjs', 'display.mjs', 'list.mjs', 'daily.mjs', 'i18n.mjs'].map((f) => `<link rel="modulepreload" href="/${f}">`).join('');

const THEME_ICON = '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><circle cx="10" cy="10" r="7.2"/><path d="M10 2.8a7.2 7.2 0 0 1 0 14.4z" fill="currentColor"/></svg>';

// Phones (≤720px) navigate from a bar at the bottom: today, find, review. A card page has its spine there instead
// (render.mjs), so it passes `tab: null`. Hidden on wider screens.
const TABS = [
  ['today', '/', 'today', '<rect x="4.5" y="5" width="15" height="15" rx="2"/><path d="M4.5 9.5h15M9 3v4M15 3v4"/>'],
  ['find', '/#sieve', 'find', '<circle cx="10.5" cy="10.5" r="6"/><path d="m15 15 5 5"/>'],
  ['review', '/review', 'review', '<path d="M5 12a7 7 0 1 0 2.1-5"/><path d="M5 4.5V8h3.5"/>'],
];
const tabs = (tab, lang) => `<nav class="tabs" aria-label="${T[lang].mainNav}">${TABS.map(([key, path, word, icon]) => `<a href="${href(lang, path)}" data-tab="${key}"${key === tab ? ' class="on" aria-current="page"' : ''}>`
  + `<svg viewBox="0 0 24 24" aria-hidden="true">${icon}</svg><span>${T[lang][word]}</span>${key === 'review' ? '<b class="due" data-due hidden></b>' : ''}</a>`).join('')}</nav>`;

// `total` is the number of cards, shown in the top bar until the reader has read some. `head` goes at the end of <head>.
// `lang` is the page's language and `path` its address without the /en prefix, so each page links to its other half.
export function shell({ title, description, body, total, math = false, script = '', report = reportUrl(), tab = 'today', head = '', lang = 'zh', path = '/' }) {
  const t = T[lang];
  const other = t.other;
  const alt = (l) => `${SITE}${href(l, path)}`;
  return `<!doctype html>
<html lang="${lang === 'en' ? 'en' : 'zh-CN'}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${escape(title)}</title>
<meta name="description" content="${escape(description)}">
<meta name="theme-color" content="#ffffff" media="(prefers-color-scheme: light)">
<meta name="theme-color" content="#141619" media="(prefers-color-scheme: dark)">
<meta name="mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-title" content="${t.site}">
<link rel="manifest" href="/manifest.webmanifest">
<link rel="apple-touch-icon" href="/icons/apple-touch-icon.png">
<link rel="icon" href="/icon.svg" type="image/svg+xml">
${lang === 'zh' ? '<link rel="alternate" type="application/atom+xml" title="思维模型 · 今日一卡" href="/feed.xml">\n' : ''}<link rel="alternate" hreflang="zh" href="${alt('zh')}"><link rel="alternate" hreflang="en" href="${alt('en')}">
<script>try { var d = JSON.parse(localStorage.getItem('models-display') || '{}'); if (d.theme === 'light' || d.theme === 'dark') document.documentElement.dataset.theme = d.theme; } catch (e) {}</script>
<link rel="preload" href="/fonts/inter-latin.woff2" as="font" type="font/woff2" crossorigin>
<link rel="stylesheet" href="/style.css">
${MODULES}
${math ? '<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/KaTeX/0.16.11/katex.min.css">' : ''}
${head}</head>
<body>
<header class="bar"><div class="wrap">
<a class="mark" href="${href(lang, '/')}">${t.site}<small>${t.brandCount(total)}</small></a>
<nav><a href="${href(lang, '/review')}">${t.review}</a><a href="${href(lang, '/random')}" data-random>${t.random}</a><a class="count" href="${href(lang, '/#read')}" data-count>${t.count(total)}</a>${tip(' hd', lang)}<button class="theme" type="button" aria-label="${t.theme}" data-theme-toggle>${THEME_ICON}</button></nav>
</div></header>
<main>
${body}
</main>
<footer class="foot"><div class="wrap"><span>${t.footSite}</span>${lang === 'zh' ? '<a href="/today">今日一卡</a><a href="/feed.xml">RSS</a>' : ''}<a href="${REPO}">${t.source}</a><a href="${escape(report)}">${t.report}</a><a href="${href(other.lang, path)}" hreflang="${other.lang}" lang="${other.lang === 'en' ? 'en' : 'zh-CN'}">${other.label}</a><button class="theme ft" type="button" data-theme-toggle>${THEME_ICON}<span>${t.themeShort}</span></button><span>${t.license(`<a href="https://creativecommons.org/licenses/by-nc-sa/4.0/${lang === 'en' ? '' : 'deed.zh-hans'}">CC BY-NC-SA 4.0</a>`, `<a href="${REPO}/blob/main/LICENSE">MIT</a>`)}</span></div></footer>
${tab ? tabs(tab, lang) : ''}
<script type="module" src="/app.js"></script>
${script}
</body>
</html>
`;
}
