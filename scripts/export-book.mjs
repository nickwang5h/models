// The cards as an e-book and as Anki notes, in Chinese and in English:
//   out/models-zh.epub, out/models-en.epub        one chapter per discipline, one section per card, by rank
//   out/models-zh.anki.txt, out/models-en.anki.txt  Anki's text import (2.1.54 or newer, for the header lines): one note per
//                                                   question and one per card
// Usage: node scripts/export-book.mjs [--out DIR] [--date YYYY-MM-DD]
// Figures are the site's own, drawn once at the card column's width; a figure that is interactive on the site shows its
// starting values. Their styles are taken from public/style.css with the light theme's colours written in.
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { crc32, deflateRawSync } from 'node:zlib';
import { join } from 'node:path';
import { markdown } from '../src/render.mjs';
import { uses } from '../public/i18n.mjs';
import { figureSvg } from '../public/figure.mjs';

const args = process.argv.slice(2);
const option = (name, fallback) => (args.includes(name) ? args[args.indexOf(name) + 1] : fallback);
const OUT = option('--out', 'out');
const DATE = option('--date', new Date().toISOString().slice(0, 10));
const SITE = 'https://models.wuhua.app';

const W = {
  zh: {
    lang: 'zh-CN', title: '思维模型', subtitle: (n, d) => `${n} 张卡，${d} 个学科`, author: 'nickwang5h', contents: '目录', about: '关于这本书',
    aboutText: (n) => [
      `这本书是 models.wuhua.app 的 ${n} 张思维模型卡，按学科分章，章内按网站上的名次排列。每张卡先讲一个真实的故事，再讲它怎么起作用、从哪里来、什么时候不灵，然后是用法、三个例子、和相邻模型的分工，最后三道情境题。`,
      '题目的答案和解析紧跟在每道题后面。想先自己做，就先遮住。',
      '网站上的图有一半可以拖动滑块来试，书里画的是它们开始时的样子；每张卡标题下面有它在网站上的地址。',
      `导出日期 ${DATE}。卡片内容以 CC BY-NC-SA 4.0 授权：可以非商业地转载和改编，须署名「思维模型 · models.wuhua.app」并以同样方式共享。`,
    ],
    origin: '来历', limits: '什么时候不灵', uses: '用它来', ask: '用之前问自己', examples: '三个例子', withOthers: '和相邻模型的分工', questions: '三道题',
    answer: '答案', online: '网页版', cards: (n) => `${n} 张`, deck: '思维模型', what: (name) => `「${name}」说的是什么？`, sep: '：', join: '、',
  },
  en: {
    lang: 'en', title: 'Mental Models', subtitle: (n, d) => `${n} cards in ${d} disciplines`, author: 'nickwang5h', contents: 'Contents', about: 'About this book',
    aboutText: (n) => [
      `This book holds the ${n} mental model cards of models.wuhua.app, one chapter per discipline, in the site's rank order within each. A card opens with a true story, then explains how the model works, where it came from and when it fails, and goes on to its uses, three examples, how it divides the work with its neighbours, and three questions.`,
      'The answer and its explanation follow each question. Cover them if you want to try first.',
      'About half the figures are interactive on the site; the book shows them at their starting values, and each card gives its address on the site under its title.',
      `Exported on ${DATE}. The cards are licensed CC BY-NC-SA 4.0: share and adapt them non-commercially, credit “Mental Models · models.wuhua.app”, and share alike.`,
    ],
    origin: 'Where it came from', limits: 'When it fails', uses: 'Use it to', ask: 'Ask before using it', examples: 'Three examples', withOthers: 'With its neighbours', questions: 'Three questions',
    answer: 'Answer', online: 'On the web', cards: (n) => `${n} cards`, deck: 'Mental Models', what: (name) => `What does “${name}” say?`, sep: ': ', join: ', ',
  },
};

const esc = (text) => String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
// Marked writes HTML; an EPUB page is XML, so void elements are closed and the one named entity it may emit is numbered.
const xml = (html) => html.replace(/<(br|hr)>/g, '<$1/>').replace(/&nbsp;/g, '&#160;');
const md = (text) => xml(markdown(text, { output: 'mathml' }));
const md0 = (text) => xml(markdown(text, { inline: true, output: 'mathml' }));
const KEYS = 'ABCD';

async function load(lang) {
  const base = lang === 'en' ? 'content/en' : 'content';
  const index = JSON.parse(await readFile('content/index.json', 'utf8'));
  const names = lang === 'en' ? JSON.parse(await readFile('content/en/index.json', 'utf8')).disciplines : index.disciplines;
  const cards = {};
  for (const entry of index.cards) cards[entry.id] = JSON.parse(await readFile(join(base, `${entry.id}.json`), 'utf8'));
  const chapters = names.map((d) => ({ ...d, cards: index.cards.filter((e) => e.discipline === d.id).sort((a, b) => a.rank - b.rank).map((e) => cards[e.id]) }));
  return { cards, chapters, total: index.cards.length };
}

// The figure rules of the site's stylesheet (top level only, so no phone or dark overrides), with var(--x) replaced by
// the light theme's value: e-book readers differ in how well they handle custom properties.
async function figureCss() {
  const css = await readFile('public/style.css', 'utf8');
  const vars = Object.fromEntries([...css.slice(css.indexOf(':root{'), css.indexOf('}', css.indexOf(':root{'))).matchAll(/--([\w-]+):\s*([^;]+);/g)].map((m) => [m[1], m[2].trim()]));
  const rules = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < css.length; i++) {
    if (css[i] === '{') depth += 1;
    else if (css[i] === '}') {
      depth -= 1;
      if (depth === 0) {
        const rule = css.slice(start, i + 1).replace(/\/\*[\s\S]*?\*\//g, '').trim();
        if (/^\.(fig|fg|fgd|fc|fd)[\w-]*[ .:,>{]/.test(rule)) rules.push(rule.replace(/var\(--([\w-]+)\)/g, (_, name) => vars[name] ?? 'inherit'));
        start = i + 1;
      }
    }
  }
  return rules.join('\n');
}

function figureXhtml(spec) {
  if (!spec) return '';
  // An SVG inside XHTML takes its namespace from the element itself.
  const svg = figureSvg(spec, { size: 'wide' }).replace('<svg ', '<svg xmlns="http://www.w3.org/2000/svg" ');
  return `<figure class="fig fig-${spec.kind}">${spec.title ? `<figcaption class="fh">${esc(spec.title)}</figcaption>` : ''}<div class="fb">${svg}</div>${spec.caption ? `<p class="fcap">${esc(spec.caption)}</p>` : ''}</figure>`;
}

const url = (lang, id) => `${SITE}${lang === 'en' ? '/en' : ''}/m/${id}`;

function page(lang, title, body) {
  return `<?xml version="1.0" encoding="utf-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" lang="${W[lang].lang}" xml:lang="${W[lang].lang}">
<head><meta charset="utf-8"/><title>${esc(title)}</title><link rel="stylesheet" type="text/css" href="style.css"/></head>
<body>
${body}
</body>
</html>
`;
}

function cardXhtml(card, lang, cards) {
  const t = W[lang];
  const useName = Object.fromEntries(uses(lang));
  const { shallow, deep, use } = card;
  // The mechanism's own ### headings sit one level below the card's name.
  const mechanism = md(deep.mechanism);
  const questions = use.questions.map((q, n) => {
    const right = q.options.findIndex((o) => o.correct);
    return `<div class="q"><p class="stem"><b>${n + 1}.</b> ${md0(q.stem)}</p><p class="ask"><b>${md0(q.question)}</b></p>
<ol class="opts" type="A">${q.options.map((o) => `<li>${md0(o.text)}</li>`).join('')}</ol>
<div class="ans"><p><b>${t.answer} ${KEYS[right]}</b>${t.sep}${md0(q.options[right].feedback)}</p><p>${md0(q.explain)}</p>
<ul>${q.options.map((o, k) => (o.correct ? '' : `<li><b>${KEYS[k]}</b>${t.sep}${md0(o.feedback)}</li>`)).join('')}</ul></div></div>`;
  }).join('\n');
  return page(lang, card.name, `<section class="card" id="${esc(card.id)}">
<h2>${esc(card.name)}</h2>
${lang === 'zh' ? `<p class="en">${esc(card.en)}</p>` : ''}
<p class="one">${esc(card.one_line)}</p>
<p class="web">${t.online}${t.sep}<a href="${url(lang, card.id)}">${url(lang, card.id).replace('https://', '')}</a></p>
<div class="scene">${md(shallow.scene)}</div>
<div class="plain">${md(shallow.plain)}</div>
${figureXhtml(card.figure)}
${mechanism}
<h3>${t.limits}</h3>
${md(deep.limits)}
<h3>${t.origin}</h3>
${md(deep.origin)}
<h3>${t.uses}</h3>
<dl>${use.uses.map((u) => `<dt>${useName[u.use]}</dt><dd>${md0(u.text)}</dd>`).join('')}</dl>
<h3>${t.ask}</h3>
<ol>${use.ask.map((a) => `<li>${md0(a)}</li>`).join('')}</ol>
<h3>${t.examples}</h3>
${use.examples.map((e) => `<div class="ex"><h4>${esc(e.title)} <span class="f">${esc(e.field)}</span></h4>${md(e.text)}</div>`).join('\n')}
<h3>${t.withOthers}</h3>
${use.with.map((w) => `<p class="with"><a href="c-${esc(w.id)}.xhtml"><b>${esc(card.name)} × ${esc(cards[w.id].name)}</b></a>${t.sep}${md0(w.sees)}</p>`).join('\n')}
<h3>${t.questions}</h3>
${questions}
</section>`);
}

const CSS = `body{line-height:1.75;margin:0 5%;text-align:start}
h1{font-size:1.8em;margin:2em 0 .5em;line-height:1.3}
h2{font-size:1.6em;margin:1.5em 0 .2em;line-height:1.3}
h3{font-size:1.1em;margin:1.8em 0 .4em}
h4{font-size:1em;margin:1.2em 0 .2em}
p{margin:.6em 0}
.en,.web,.f,.sub{color:#666;font-size:.85em;font-weight:normal}
.en{margin:0}
.one{font-size:1.1em;font-weight:bold;margin:.6em 0}
.plain{border-left:2px solid #999;padding-left:1em;margin:1em 0}
dt{font-weight:bold;margin-top:.6em}
dd{margin:0 0 0 1em}
.q{margin:1.2em 0;padding-top:.6em;border-top:1px solid #ccc}
.ans{margin:.8em 0 0 1em;font-size:.92em;color:#333}
.toc ol{list-style:none;padding-left:0}
.toc ol ol{padding-left:1.2em}
.toc li{margin:.25em 0}
a{color:inherit}
`;

// A ZIP writer for EPUB: `mimetype` first and stored, everything else deflated.
function zip(files) {
  const chunks = [];
  const central = [];
  let offset = 0;
  for (const [name, content, store] of files) {
    const data = Buffer.from(content);
    const packed = store ? data : deflateRawSync(data, { level: 9 });
    const file = Buffer.from(name);
    const head = Buffer.alloc(30);
    head.writeUInt32LE(0x04034b50, 0); head.writeUInt16LE(20, 4); head.writeUInt16LE(0x0800, 6); head.writeUInt16LE(store ? 0 : 8, 8);
    head.writeUInt16LE(0, 10); head.writeUInt16LE(0x21, 12); head.writeUInt32LE(crc32(data), 14);
    head.writeUInt32LE(packed.length, 18); head.writeUInt32LE(data.length, 22); head.writeUInt16LE(file.length, 26);
    const entry = Buffer.alloc(46);
    entry.writeUInt32LE(0x02014b50, 0); entry.writeUInt16LE(20, 4); entry.writeUInt16LE(20, 6); head.copy(entry, 8, 6, 30);
    entry.writeUInt32LE(offset, 42);
    chunks.push(head, file, packed);
    central.push(entry, file);
    offset += 30 + file.length + packed.length;
  }
  const size = central.reduce((n, b) => n + b.length, 0);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(files.length, 8); end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(size, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...chunks, ...central, end]);
}

function epub(lang, { cards, chapters, total }, figures) {
  const t = W[lang];
  const id = createHash('sha256').update(`models.wuhua.app/${lang}`).digest('hex');
  const uuid = `${id.slice(0, 8)}-${id.slice(8, 12)}-4${id.slice(13, 16)}-8${id.slice(17, 20)}-${id.slice(20, 32)}`;
  const pages = [
    ['title', t.title, page(lang, t.title, `<section epub:type="titlepage"><h1>${t.title}</h1><p class="sub">${t.subtitle(total, chapters.length)}</p><p class="sub">models.wuhua.app · ${DATE}</p></section>`)],
    ['about', t.about, page(lang, t.about, `<section><h1>${t.about}</h1>${t.aboutText(total).map((p) => `<p>${esc(p)}</p>`).join('')}</section>`)],
  ];
  for (const chapter of chapters) {
    pages.push([`d-${chapter.id}`, chapter.title, page(lang, chapter.title, `<section epub:type="chapter"><h1>${esc(chapter.title)}</h1><p class="sub">${t.cards(chapter.cards.length)}</p>
<ol>${chapter.cards.map((c) => `<li><a href="c-${c.id}.xhtml">${esc(c.name)}</a>${t.sep}${esc(c.one_line)}</li>`).join('\n')}</ol></section>`)]);
    for (const card of chapter.cards) pages.push([`c-${card.id}`, card.name, cardXhtml(card, lang, cards)]);
  }
  const nav = page(lang, t.contents, `<nav epub:type="toc" class="toc" id="toc"><h1>${t.contents}</h1><ol>
<li><a href="about.xhtml">${t.about}</a></li>
${chapters.map((ch) => `<li><a href="d-${ch.id}.xhtml">${esc(ch.title)}</a><ol>${ch.cards.map((c) => `<li><a href="c-${c.id}.xhtml">${esc(c.name)}</a></li>`).join('')}</ol></li>`).join('\n')}
</ol></nav>`);
  // The package file must say which pages hold MathML or SVG.
  const properties = (body) => [body.includes('<math') && 'mathml', body.includes('<svg') && 'svg'].filter(Boolean).join(' ');
  const opf = `<?xml version="1.0" encoding="utf-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="pub-id" xml:lang="${t.lang}">
<metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
<dc:identifier id="pub-id">urn:uuid:${uuid}</dc:identifier>
<dc:title>${t.title}</dc:title>
<dc:language>${t.lang}</dc:language>
<dc:creator>${t.author}</dc:creator>
<dc:rights>CC BY-NC-SA 4.0</dc:rights>
<dc:source>${SITE}${lang === 'en' ? '/en/' : '/'}</dc:source>
<dc:date>${DATE}</dc:date>
<meta property="dcterms:modified">${DATE}T00:00:00Z</meta>
</metadata>
<manifest>
<item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>
<item id="css" href="style.css" media-type="text/css"/>
${pages.map(([name, , body]) => `<item id="${name}" href="${name}.xhtml" media-type="application/xhtml+xml"${properties(body) ? ` properties="${properties(body)}"` : ''}/>`).join('\n')}
</manifest>
<spine>
<itemref idref="title"/>
<itemref idref="nav"/>
${pages.slice(1).map(([name]) => `<itemref idref="${name}"/>`).join('\n')}
</spine>
</package>
`;
  const container = '<?xml version="1.0" encoding="utf-8"?>\n<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>\n';
  return {
    pages: pages.length,
    data: zip([
      ['mimetype', 'application/epub+zip', true],
      ['META-INF/container.xml', container],
      ['OEBPS/content.opf', opf],
      ['OEBPS/nav.xhtml', nav],
      ['OEBPS/style.css', CSS + figures],
      ...pages.map(([name, , body]) => [`OEBPS/${name}.xhtml`, body]),
    ]),
  };
}

// Anki's text import: tab-separated, HTML allowed, the header lines name the deck, the note type and the tag column.
function anki(lang, { chapters }) {
  const t = W[lang];
  const field = (html) => html.replace(/[\t\r\n]+/g, ' ').trim();
  const rows = [];
  for (const chapter of chapters) {
    for (const card of chapter.cards) {
      const link = `<a href="${url(lang, card.id)}">${esc(card.name)}</a>`;
      const tags = `${chapter.id} ${card.id}`;
      rows.push([`models-${lang}-${card.id}`, `${esc(t.what(card.name))}`, `<b>${esc(card.one_line)}</b><br><br>${md(card.shallow.plain)}<br>${link}`, tags]);
      card.use.questions.forEach((q, n) => {
        const right = q.options.findIndex((o) => o.correct);
        rows.push([
          `models-${lang}-${card.id}-q${n + 1}`,
          `<div><small>${esc(chapter.title)}</small></div>${md0(q.stem)}<br><br><b>${md0(q.question)}</b><ol type="A">${q.options.map((o) => `<li>${md0(o.text)}</li>`).join('')}</ol>`,
          `<b>${KEYS[right]}</b>${t.sep}${md0(q.options[right].text)}<br><br>${md0(q.options[right].feedback)}<br><br>${md0(q.explain)}<br><br>${link}${t.sep}${esc(card.one_line)}`,
          tags,
        ]);
      });
    }
  }
  // The first column is a stable id: importing a newer export updates the notes already in the collection, schedules
  // kept, instead of adding them a second time when a question's wording has changed.
  const header = ['#separator:Tab', '#html:true', '#notetype:Basic', `#deck:${t.deck}`, '#guid column:1', '#tags column:4', ''];
  return { notes: rows.length, data: header.join('\n') + rows.map((r) => r.map(field).join('\t')).join('\n') + '\n' };
}

await mkdir(OUT, { recursive: true });
// The site's figure rules, then what differs on a book page.
const FIGURES = `${await figureCss()}\n.fig{margin:1.2em 0;max-width:100%;page-break-inside:avoid}\n.fig .fb{padding:.8em}\n.fig .fc{max-width:100%}\n`;
for (const lang of ['zh', 'en']) {
  const book = await load(lang);
  const e = epub(lang, book, FIGURES);
  const a = anki(lang, book);
  await writeFile(join(OUT, `models-${lang}.epub`), e.data);
  await writeFile(join(OUT, `models-${lang}.anki.txt`), a.data);
  console.log(`${lang}: ${book.total} cards → ${OUT}/models-${lang}.epub (${e.pages} pages, ${(e.data.length / 1024).toFixed(0)} KB), ${OUT}/models-${lang}.anki.txt (${a.notes} notes)`);
}
