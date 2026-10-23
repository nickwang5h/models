// The frame every page shares: head, top bar, footer and scripts. No dependencies, so Pages Functions can render with it too.
import { escape } from '../public/quiz.mjs';

export const REPO = 'https://github.com/nickwang5h/models';

// Where a reader reports a mistake: the content-error issue form, with the card filled in when there is one.
export function reportUrl(id = '') {
  return `${REPO}/issues/new?template=content-error.yml${id ? `&card=${encodeURIComponent(id)}&title=${encodeURIComponent(`[内容] ${id}：`)}` : ''}`;
}

const THEME_ICON = '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><circle cx="10" cy="10" r="7.2"/><path d="M10 2.8a7.2 7.2 0 0 1 0 14.4z" fill="currentColor"/></svg>';

// `total` is the number of cards, shown in the top bar until the reader has read some.
export function shell({ title, description, body, total, math = false, script = '', report = reportUrl() }) {
  return `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${escape(title)}</title>
<meta name="description" content="${escape(description)}">
<meta name="theme-color" content="#ffffff" media="(prefers-color-scheme: light)">
<meta name="theme-color" content="#141619" media="(prefers-color-scheme: dark)">
<meta name="mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-title" content="思维模型">
<link rel="manifest" href="/manifest.webmanifest">
<link rel="apple-touch-icon" href="/icons/apple-touch-icon.png">
<link rel="icon" href="/icon.svg" type="image/svg+xml">
<link rel="alternate" type="application/atom+xml" title="思维模型 · 今日一卡" href="/feed.xml">
<script>try { var d = JSON.parse(localStorage.getItem('models-display') || '{}'); if (d.theme === 'light' || d.theme === 'dark') document.documentElement.dataset.theme = d.theme; } catch (e) {}</script>
<link rel="preload" href="/fonts/inter-latin.woff2" as="font" type="font/woff2" crossorigin>
<link rel="stylesheet" href="/style.css">
${math ? '<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/KaTeX/0.16.11/katex.min.css">' : ''}
</head>
<body>
<header class="bar"><div class="wrap">
<a class="mark" href="/">思维模型<small>${total} 张卡 · 12 门学科</small></a>
<nav><a href="/review">复习</a><a href="/random" data-random>随机一张</a><a class="count" href="/#read" data-count>${total} 张</a><button class="theme" type="button" aria-label="切换深浅色" data-theme-toggle>${THEME_ICON}</button></nav>
</div></header>
<main>
${body}
</main>
<footer class="foot"><div class="wrap"><span>思维模型 · models.wuhua.app</span><a href="/today">今日一卡</a><a href="/feed.xml">RSS</a><a href="${REPO}">源代码</a><a href="${escape(report)}">报告错误</a><span>卡片内容 <a href="https://creativecommons.org/licenses/by-nc-sa/4.0/deed.zh-hans">CC BY-NC-SA 4.0</a> · 代码 <a href="${REPO}/blob/main/LICENSE">MIT</a></span></div></footer>
<script type="module" src="/app.js"></script>
${script}
</body>
</html>
`;
}
