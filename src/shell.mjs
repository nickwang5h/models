// The frame every page shares: head, header, footer and scripts. No dependencies, so Pages Functions can render with it too.
import { escape } from '../public/quiz.mjs';

export const HUES = { thinking: 260, math: 215, physics: 190, biology: 140, systems: 170, economics: 35, games: 10, psychology: 330,
  business: 55, investing: 95, society: 290, computing: 235 };

export const REPO = 'https://github.com/nickwang5h/models';

// Where a reader reports a mistake: the content-error issue form, with the card filled in when there is one.
export function reportUrl(id = '') {
  return `${REPO}/issues/new?template=content-error.yml${id ? `&card=${encodeURIComponent(id)}&title=${encodeURIComponent(`[内容] ${id}：`)}` : ''}`;
}

export function shell({ title, description, body, hue = 215, math = false, script = '', report = reportUrl() }) {
  return `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escape(title)}</title>
<meta name="description" content="${escape(description)}">
<meta name="theme-color" content="#f3f0e9" media="(prefers-color-scheme: light)">
<meta name="theme-color" content="#1b1a17" media="(prefers-color-scheme: dark)">
<meta name="mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-title" content="思维模型">
<link rel="manifest" href="/manifest.webmanifest">
<link rel="apple-touch-icon" href="/icons/apple-touch-icon.png">
<link rel="icon" href="/icon.svg" type="image/svg+xml">
<link rel="alternate" type="application/atom+xml" title="思维模型 · 今日一卡" href="/feed.xml">
<script>try { var d = JSON.parse(localStorage.getItem('models-display') || '{}'); if (d.theme === 'light' || d.theme === 'dark') document.documentElement.dataset.theme = d.theme; var z = {large: '1.1', larger: '1.2'}[d.size]; if (z) document.documentElement.style.setProperty('--zoom', z); } catch (e) {}</script>
<link rel="stylesheet" href="/style.css">
${math ? '<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/KaTeX/0.16.11/katex.min.css">' : ''}
</head>
<body style="--hue:${hue}">
<header class="top"><a class="brand" href="/">思维模型<span>格栅</span></a>
<nav><a href="/today">今日</a><a href="/random" data-random>随机一张</a><a href="/review">复习</a></nav></header>
<main>
${body}
</main>
<footer class="foot">芒格说：要掌握约一百个来自不同学科的重要模型，让它们互相支撑，形成一张格栅。<br>进度只保存在这个浏览器里。键盘：1–4 答题，← → 换卡，R 随机一张。<br>代码 <a href="${REPO}/blob/main/LICENSE">MIT</a> · 卡片内容 <a href="https://creativecommons.org/licenses/by-nc-sa/4.0/deed.zh-hans">CC BY-NC-SA 4.0</a> · <a href="${REPO}">源代码</a> · <a href="${escape(report)}">报告错误</a><div class="display" data-display></div></footer>
<script type="module" src="/app.js"></script>
${script}
</body>
</html>
`;
}
