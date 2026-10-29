// The pages and the feed around 今日一卡. /today and /feed.xml are rendered per request by Pages Functions
// (functions/), so this file avoids KaTeX and Markdown: the day shows the card's summary and one question, not its body.
import { escape, questionHtml } from '../public/quiz.mjs';
import { reportUrl, shell, subButton } from './shell.mjs';
import { EPOCH, addDays, recentDates } from './daily.mjs';

export const SITE = 'https://models.wuhua.app';
export const FEED_DAYS = 14;
export const BACK_DAYS = 30;   // /today?date= reaches this far back

// One day's page. `current` is today's UTC date, so the page knows whether a later day exists yet; `total` is the
// number of cards, for the top bar.
export function todayPage(day, current, total) {
  const { date, id, card, questionIndex, question } = day;
  const earlier = addDays(date, -1);
  const later = addDays(date, 1);
  const label = (d) => `${Number(d.slice(5, 7))} 月 ${Number(d.slice(8, 10))} 日`;
  const prev = earlier >= EPOCH && earlier >= addDays(current, -BACK_DAYS)
    ? `<a href="/today?date=${earlier}" rel="prev"><span>←</span><b>${label(earlier)}</b></a>` : '';
  const next = later <= current ? `<a class="r" href="${later === current ? '/today' : `/today?date=${later}`}" rel="next"><span>→</span><b>${label(later)}</b></a>` : '';
  const body = `<section class="plainpage day wrap">
<a class="today" href="/m/${escape(id)}"><div class="date"><b>${label(date)}</b></div>
<h1><span class="nm">${escape(card.name)}</span><span class="en">${escape(card.en ?? '')}</span></h1>
<p class="one">${escape(card.one_line)}</p><p class="ex">读整张卡<span class="arr" aria-hidden="true">→</span></p></a>
<div class="qs" data-today-quiz>${questionHtml(question, `${id}-${questionIndex}`)}</div>
<nav class="pn">${prev}${next}</nav>
</section>`;
  return shell({ title: `今日一卡：${card.name} · 思维模型`, description: card.one_line, body, total, report: reportUrl(id) });
}

export function subscribePage(total) {
  const body = `<section class="plainpage wrap">
<h1>每天一张，发到邮箱</h1>
<p class="one">一张卡的一句话、一道题，和读整张卡的链接。</p>
<div class="sub">
<form data-subscribe>
<input id="email" name="email" type="email" required maxlength="254" autocomplete="email" aria-label="邮箱" placeholder="you@example.com">
<span class="trap" aria-hidden="true"><input name="website" tabindex="-1" autocomplete="off"></span>
${subButton()}
</form>
<p class="done" data-subscribe-status role="status" aria-live="polite"></p>
<p class="rss">先收到一封确认信，点开链接才算订阅；每封信都能退订。不想留邮箱，可以用 <a href="/feed.xml">RSS</a>。</p>
</div>
</section>`;
  return shell({ title: '订阅 · 思维模型', description: '每天一张思维模型卡，发到你的邮箱', body, total });
}

export const escapeXml = (text) => String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// The day as HTML for a feed entry or an email body: summary, question and options, no answer.
export function entryHtml(day, site = SITE) {
  const { date, id, card, question } = day;
  const options = question.options.map((option, n) => `<li>${'ABCD'[n]}. ${escape(option.text)}</li>`).join('');
  return `<p>${escape(card.one_line)}</p>`
    + `<p><a href="${site}/m/${escape(id)}">读整张卡：${escape(card.name)}</a></p>`
    + `<p>${escape(question.stem)}</p><p><strong>${escape(question.question)}</strong></p><ol>${options}</ol>`
    + `<p><a href="${site}/today?date=${date}">去网页作答，看解析</a></p>`;
}

// Atom 1.0: one entry per UTC day for the last two weeks, newest first. `days` is [{date, id, card, question, ...}].
export function atomFeed(days, site = SITE) {
  const updated = `${days[0]?.date ?? EPOCH}T00:00:00Z`;
  const host = new URL(site).host;
  const entries = days.map((day) => `  <entry>
    <id>tag:${host},2026:today/${day.date}</id>
    <title>${escapeXml(`${day.date} · ${day.card.name}`)}</title>
    <link rel="alternate" type="text/html" href="${site}/today?date=${day.date}"/>
    <updated>${day.date}T00:00:00Z</updated>
    <published>${day.date}T00:00:00Z</published>
    <summary>${escapeXml(day.card.one_line)}</summary>
    <content type="html">${escapeXml(entryHtml(day, site))}</content>
  </entry>`).join('\n');
  return `<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://www.w3.org/2005/Atom" xml:lang="zh-CN">
  <id>${site}/feed.xml</id>
  <title>思维模型 · 今日一卡</title>
  <subtitle>每天一张跨学科思维模型卡，附一道情境题。</subtitle>
  <link rel="self" type="application/atom+xml" href="${site}/feed.xml"/>
  <link rel="alternate" type="text/html" href="${site}/today"/>
  <updated>${updated}</updated>
  <author><name>思维模型</name><uri>${site}/</uri></author>
  <rights>卡片内容 CC BY-NC-SA 4.0</rights>
${entries}
</feed>
`;
}

export function feedDates(current) {
  return recentDates(current, FEED_DAYS);
}
