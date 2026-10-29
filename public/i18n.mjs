// The site's words in Chinese (/) and English (/en/), shared by the build, the Pages Functions and the browser. The
// cards themselves are content/<id>.json and content/en/<id>.json; this file is only the frame around them.
export const LANGS = ['zh', 'en'];

// Where a page lives: Chinese at the root, English under /en.
export const root = (lang) => (lang === 'en' ? '/en' : '');
export const href = (lang, path) => `${root(lang)}${path}`;
// The language of the page the browser is on.
export const pageLang = (doc) => (doc?.documentElement?.lang === 'en' ? 'en' : 'zh');

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export const dayLabel = (date, lang = 'zh') => (lang === 'en'
  ? `${MONTHS[Number(date.slice(5, 7)) - 1]} ${Number(date.slice(8, 10))}`
  : `${Number(date.slice(5, 7))} 月 ${Number(date.slice(8, 10))} 日`);

// Scott Page's REDCAPE: what a model is good for.
export const USE_KEYS = ['reason', 'explain', 'design', 'communicate', 'act', 'predict', 'explore'];
const USE_NAMES = {
  zh: ['推理', '解释', '设计', '沟通', '行动', '预测', '探索'],
  en: ['Reason', 'Explain', 'Design', 'Communicate', 'Act', 'Predict', 'Explore'],
};
export const uses = (lang = 'zh') => USE_KEYS.map((key, n) => [key, USE_NAMES[lang][n]]);

export const T = {
  zh: {
    site: '思维模型',
    brandCount: (n) => `${n} 张卡 · 12 门学科`,
    count: (n) => `${n} 张`,
    readCount: (n) => `读过 <b>${n}</b>`,
    review: '复习',
    random: '随机一张',
    theme: '切换深浅色',
    themeShort: '深浅色',
    today: '今日',
    find: '找',
    mainNav: '主导航',
    footSite: '思维模型 · models.wuhua.app',
    todayCard: '今日一卡',
    source: '源代码',
    report: '报告错误',
    license: (cc, mit) => `卡片内容 ${cc} · 代码 ${mit}`,
    other: { lang: 'en', label: 'English' },
    homeTitle: '思维模型',
    homeDescription: (n) => `${n} 张跨学科思维模型卡，按重要程度排列`,
    cardTitle: (name) => `${name} · 思维模型`,
    disciplineTitle: (title) => `${title} · 思维模型`,
    reviewTitle: '复习 · 思维模型',
    reviewDescription: '复习读过的思维模型',
    reviewEmpty: '还没有读过的卡片。',
    findLabel: '找一张卡',
    allCards: '全部卡片',
    pastDays: '前几天',
    notFound: (q) => `没有找到${q ? `「${q}」` : ''}`,
    outline: '本页',
    outlineButton: '本页目录',
    questionsCount: (n) => `${n} 道题`,
    toQuestions: '去答题',
    nextQuestion: (n) => `第 ${n} 题`,
    sameField: '同学科',
    back: '返回',
    yearBC: (n) => `前 ${n}`,
    decade: (d) => `${d} 年代`,
    tipLong: '请我吃个饺子',
    tipLabel: '在 Ko-fi 请我吃个饺子（新窗口）',
    tipLine: '这张卡读完了。卡片都免费；觉得有用，请我吃个饺子。',
    tipNote: 'Ko-fi · 一个 $5',
    reviewNext: '下一题',
    reviewDone: '做完了',
    reviewAgain: '再来一组',
    again: '重抽',
    reset: '还原',
  },
  en: {
    site: 'Mental Models',
    brandCount: (n) => `${n} cards · 12 fields`,
    count: (n) => `${n} cards`,
    readCount: (n) => `Read <b>${n}</b>`,
    review: 'Review',
    random: 'Random card',
    theme: 'Switch light and dark',
    themeShort: 'Light / dark',
    today: 'Today',
    find: 'Find',
    mainNav: 'Main',
    footSite: 'Mental Models · models.wuhua.app',
    todayCard: null,
    source: 'Source',
    report: 'Report a mistake',
    license: (cc, mit) => `Cards ${cc} · Code ${mit}`,
    other: { lang: 'zh', label: '中文' },
    homeTitle: 'Mental Models',
    homeDescription: (n) => `${n} mental models from many fields, most useful first`,
    cardTitle: (name) => `${name} · Mental Models`,
    disciplineTitle: (title) => `${title} · Mental Models`,
    reviewTitle: 'Review · Mental Models',
    reviewDescription: 'Go over the cards you have read',
    reviewEmpty: 'No cards read yet.',
    findLabel: 'Find a card',
    allCards: 'All cards',
    pastDays: 'Days before',
    notFound: (q) => (q ? `Nothing found for “${q}”` : 'Nothing found'),
    outline: 'On this page',
    outlineButton: 'Outline',
    questionsCount: (n) => `${n} questions`,
    toQuestions: 'Go to the questions',
    nextQuestion: (n) => `Question ${n}`,
    sameField: 'Same field',
    back: 'Back',
    yearBC: (n) => `${n} BC`,
    decade: (d) => `${d}s`,
    tipLong: 'Buy me a dumpling',
    tipLabel: 'Buy me a dumpling on Ko-fi (opens a new tab)',
    tipLine: 'That’s the card. Every card here stays free; if this one helped, buy me a dumpling.',
    tipNote: 'Ko-fi · $5 each',
    reviewNext: 'Next',
    reviewDone: 'Done',
    reviewAgain: 'Another round',
    again: 'Reroll',
    reset: 'Reset',
  },
};
