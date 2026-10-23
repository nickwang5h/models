// A card's figure, drawn as SVG from the `figure` object in its JSON (README, 卡片格式 · figure). Shared by the build,
// which renders every figure into the page, and the browser, which redraws demos as sliders move and draws today's
// figure on the home page. Colors are classes styled by style.css, so figures follow the light and dark themes.
//
// Four kinds:
//   flow   boxes and arrows: a chain or tree laid out in layers ('right' or 'down'), or a ring ('loop')
//   grid   a small table of short cells: a payoff matrix, a 2×2
//   chart  lines, dots or bars from numbers written in the JSON
//   demo   a chart whose numbers come from formulas over sliders: a function of x, or a state stepped forward
import { escape } from './quiz.mjs';

// ---------- formulas ----------
// A small arithmetic language for demos: numbers, names, + - * / % ^, comparisons, and the functions below.
// No property access and no calls except these, so a card's JSON can't run code.
const FUNCS = {
  exp: Math.exp, log: Math.log, ln: Math.log, log10: Math.log10, log2: Math.log2, sqrt: Math.sqrt, abs: Math.abs,
  min: Math.min, max: Math.max, pow: Math.pow, floor: Math.floor, ceil: Math.ceil, round: Math.round,
  sin: Math.sin, cos: Math.cos, sign: Math.sign,
  clamp: (v, lo, hi) => Math.min(hi, Math.max(lo, v)),
  if: (c, a, b) => (c ? a : b),
};
const RANDOM = new Set(['rand', 'randn', 'flip']);
const CONSTS = { pi: Math.PI, e: Math.E };

function tokens(src) {
  const out = [];
  const re = /\s*(?:(\d+(?:\.\d+)?(?:e[+-]?\d+)?)|([A-Za-z_][A-Za-z0-9_]*)|(<=|>=|==|!=|&&|\|\||[-+*/%^(),<>!?:]))/y;
  let at = 0;
  while (at < src.length) {
    if (/^\s*$/.test(src.slice(at))) break;
    re.lastIndex = at;
    const m = re.exec(src);
    if (!m) throw new Error(`公式「${src}」第 ${at + 1} 个字符看不懂`);
    out.push(m[1] != null ? { t: 'num', v: Number(m[1]) } : m[2] != null ? { t: 'name', v: m[2] } : { t: 'op', v: m[3] });
    at = re.lastIndex;
  }
  return out;
}

// Compiles a formula to a function of an environment object; `names` collects the variables it reads.
export function compile(src, names = new Set()) {
  if (typeof src === 'number') return () => src;
  const ts = tokens(String(src));
  let i = 0;
  const peek = () => ts[i];
  const take = (v) => { if (ts[i]?.v === v) { i++; return true; } return false; };
  const need = (v) => { if (!take(v)) throw new Error(`公式「${src}」少了「${v}」`); };
  const BIN = [['||'], ['&&'], ['==', '!='], ['<', '>', '<=', '>='], ['+', '-'], ['*', '/', '%']];
  const OPS = {
    '||': (a, b) => (a || b ? 1 : 0), '&&': (a, b) => (a && b ? 1 : 0), '==': (a, b) => (a === b ? 1 : 0), '!=': (a, b) => (a !== b ? 1 : 0),
    '<': (a, b) => (a < b ? 1 : 0), '>': (a, b) => (a > b ? 1 : 0), '<=': (a, b) => (a <= b ? 1 : 0), '>=': (a, b) => (a >= b ? 1 : 0),
    '+': (a, b) => a + b, '-': (a, b) => a - b, '*': (a, b) => a * b, '/': (a, b) => a / b, '%': (a, b) => a % b,
  };
  const ternary = () => {
    const c = binary(0);
    if (!take('?')) return c;
    const a = ternary(); need(':'); const b = ternary();
    return (env) => (c(env) ? a(env) : b(env));
  };
  const binary = (level) => {
    if (level === BIN.length) return unary();
    let left = binary(level + 1);
    for (;;) {
      const op = peek();
      if (op?.t !== 'op' || !BIN[level].includes(op.v)) return left;
      i++;
      const l = left; const r = binary(level + 1); const f = OPS[op.v];
      left = (env) => f(l(env), r(env));
    }
  };
  // a sign applies after the power, as in -2^2 = -4; the exponent may carry its own sign and power: 2^-x, 2^3^2
  const unary = () => {
    if (take('-')) { const v = unary(); return (env) => -v(env); }
    if (take('+')) return unary();
    if (take('!')) { const v = unary(); return (env) => (v(env) ? 0 : 1); }
    return power();
  };
  const power = () => {
    const base = atom();
    if (!take('^')) return base;
    const exp = unary();
    return (env) => base(env) ** exp(env);
  };
  const atom = () => {
    const tk = ts[i++];
    if (!tk) throw new Error(`公式「${src}」没写完`);
    if (tk.t === 'num') return () => tk.v;
    if (tk.v === '(') { const v = ternary(); need(')'); return v; }
    if (tk.t === 'name') {
      if (take('(')) {
        const args = [];
        if (!take(')')) { do args.push(ternary()); while (take(',')); need(')'); }
        if (RANDOM.has(tk.v)) {
          names.add('$random');
          const a = args;
          if (tk.v === 'rand') return (env) => env.$rand();
          if (tk.v === 'flip') return (env) => (env.$rand() < a[0](env) ? 1 : 0);
          return (env) => { const u = 1 - env.$rand(); const v = env.$rand(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };
        }
        const f = Object.hasOwn(FUNCS, tk.v) ? FUNCS[tk.v] : null;
        if (!f) throw new Error(`公式「${src}」里的函数 ${tk.v} 不认识`);
        return (env) => f(...args.map((a) => a(env)));
      }
      if (Object.hasOwn(CONSTS, tk.v)) return () => CONSTS[tk.v];
      names.add(tk.v);
      const name = tk.v;
      return (env) => {
        const v = Object.hasOwn(env, name) ? env[name] : undefined;
        if (typeof v !== 'number') throw new Error(`公式「${src}」用到的 ${name} 没有定义`);
        return v;
      };
    }
    throw new Error(`公式「${src}」在「${tk.v}」处看不懂`);
  };
  const f = ternary();
  if (i < ts.length) throw new Error(`公式「${src}」在「${ts[i].v}」处多出东西`);
  return f;
}

// Seeded so the build and every reader draw the same first picture; 重抽 changes the seed.
export function seeded(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------- text ----------
// SVG text can't be measured at build time; Chinese characters are about 1em wide, Latin letters and digits a bit
// over half.
export function textWidth(text, size) {
  let w = 0;
  for (const ch of String(text)) w += /[\u2E80-\uFFFF]/.test(ch) ? 1 : /[MW@%]/.test(ch) ? 0.85 : /[ilj.,:;'|!·]/.test(ch) ? 0.3 : 0.58;
  return w * size;
}
const t1 = (v) => (Math.round(v * 10) / 10).toString();
const txt = (x, y, text, cls, anchor = 'start', extra = '') => `<text class="${cls}" x="${t1(x)}" y="${t1(y)}"${anchor !== 'start' ? ` text-anchor="${anchor}"` : ''}${extra}>${escape(text)}</text>`;

// ---------- numbers ----------
function niceStep(span, count) {
  const raw = span / Math.max(1, count);
  const p = 10 ** Math.floor(Math.log10(raw));
  for (const k of [1, 2, 2.5, 5, 10]) if (k * p >= raw - 1e-12) return k * p;
  return 10 * p;
}
export function ticks(lo, hi, count = 4) {
  if (!(hi > lo)) hi = lo + 1;
  const step = niceStep(hi - lo, count);
  const start = Math.ceil(lo / step - 1e-9) * step;
  const out = [];
  for (let v = start; v <= hi + step * 1e-9; v += step) out.push(Math.abs(v) < step * 1e-9 ? 0 : v);
  return { values: out, step };
}
const trim0 = (s) => (s.includes('.') ? s.replace(/\.?0+$/, '') : s);
// `format` 'cn' writes 万 and 亿; otherwise the number with as many decimals as the tick step needs, and the unit.
export function formatNumber(v, { unit = '', format = '', step = 0 } = {}) {
  if (format === 'cn') {
    const a = Math.abs(v);
    if (a >= 1e8) return `${trim0((v / 1e8).toFixed(a >= 1e9 ? 0 : 1))} 亿${unit}`;
    if (a >= 1e4) return `${trim0((v / 1e4).toFixed(a >= 1e6 ? 0 : a >= 1e5 ? 1 : 2))} 万${unit}`;
  }
  const digits = step ? Math.max(0, Math.min(4, -Math.floor(Math.log10(step) + 1e-9))) : Math.abs(v) >= 100 ? 0 : Math.abs(v) >= 10 ? 1 : 2;
  const s = trim0(v.toFixed(step ? digits + (String(step).includes('.5') || String(step).includes('.25') ? 1 : 0) : digits));
  return `${s === '-0' ? '0' : s}${unit}`;
}

// ---------- flow ----------
const FONT = 14;
const SUB = 12;
const TONES = new Set(['accent', 'muted', 'warn']);
function nodeBox(n) {
  const w = Math.max(textWidth(n.label, FONT), n.sub ? textWidth(n.sub, SUB) : 0) + 28;
  return { w: Math.max(64, Math.ceil(w)), h: n.sub ? 54 : 38 };
}

// Point on a cubic Bézier.
const bez = (p0, p1, p2, p3, t) => {
  const u = 1 - t;
  return [u * u * u * p0[0] + 3 * u * u * t * p1[0] + 3 * u * t * t * p2[0] + t * t * t * p3[0],
    u * u * u * p0[1] + 3 * u * u * t * p1[1] + 3 * u * t * t * p2[1] + t * t * t * p3[1]];
};
const inBox = (p, b, pad) => p[0] > b.x - b.w / 2 - pad && p[0] < b.x + b.w / 2 + pad && p[1] > b.y - b.h / 2 - pad && p[1] < b.y + b.h / 2 + pad;

// An edge as a sampled curve, trimmed where it enters and leaves the two boxes, with its arrowhead.
function edgePath(ctrl, from, to, edge) {
  const N = 48;
  const pts = Array.from({ length: N + 1 }, (_, k) => bez(...ctrl, k / N));
  let a = 0; while (a < N && inBox(pts[a], from, 3)) a++;
  let b = N; while (b > a && inBox(pts[b], to, 5)) b--;
  const seg = pts.slice(a, b + 1);
  if (seg.length < 2) return { d: '', head: '', mid: pts[N >> 1], seg: pts };
  const end = seg[seg.length - 1];
  const prev = seg[Math.max(0, seg.length - 4)];
  const ang = Math.atan2(end[1] - prev[1], end[0] - prev[0]);
  const L = 9; const W = 4.5;
  const tip = [end[0] + Math.cos(ang) * 2, end[1] + Math.sin(ang) * 2];
  const back = [tip[0] - Math.cos(ang) * L, tip[1] - Math.sin(ang) * L];
  const head = `M${t1(tip[0])} ${t1(tip[1])}L${t1(back[0] - Math.sin(ang) * W)} ${t1(back[1] + Math.cos(ang) * W)}L${t1(back[0] + Math.sin(ang) * W)} ${t1(back[1] - Math.cos(ang) * W)}Z`;
  const d = `M${seg.map((p) => `${t1(p[0])} ${t1(p[1])}`).join('L')}`;
  const tone = TONES.has(edge.tone) ? edge.tone : '';
  return { d, head, mid: seg[seg.length >> 1], seg, tone };
}

function edgeLabel(at, text, cls = 'fg-el') {
  const w = textWidth(text, 12) + 10;
  return `<rect class="fg-lb" x="${t1(at[0] - w / 2)}" y="${t1(at[1] - 10)}" width="${t1(w)}" height="18" rx="3"/>${txt(at[0], at[1] + 4, text, cls, 'middle')}`;
}

function nodeSvg(n, b) {
  const tone = TONES.has(n.tone) ? ` fg-${n.tone}` : '';
  let s = `<g class="fg-n${tone}"><rect x="${t1(b.x - b.w / 2)}" y="${t1(b.y - b.h / 2)}" width="${b.w}" height="${b.h}" rx="6"/>`;
  if (n.sub) s += txt(b.x, b.y - 4, n.label, 'fg-t', 'middle') + txt(b.x, b.y + 15, n.sub, 'fg-s', 'middle');
  else s += txt(b.x, b.y + 5, n.label, 'fg-t', 'middle');
  return `${s}</g>`;
}

// Layers by longest path from the sources; an edge that closes a cycle is drawn around the outside instead.
function layered(spec, dir) {
  const nodes = spec.nodes;
  const ids = nodes.map((n) => n.id);
  const out = Object.fromEntries(ids.map((id) => [id, []]));
  const back = new Set();
  const state = {};
  const visit = (id) => {
    state[id] = 1;
    spec.edges.forEach((e, k) => {
      if (e.from !== id) return;
      if (state[e.to] === 1) back.add(k);
      else if (!state[e.to]) visit(e.to);
    });
    state[id] = 2;
  };
  for (const id of ids) if (!state[id]) visit(id);
  spec.edges.forEach((e, k) => { if (!back.has(k)) out[e.from].push(e.to); });
  const layer = Object.fromEntries(ids.map((id) => [id, 0]));
  for (let pass = 0; pass < ids.length; pass++) for (const id of ids) for (const to of out[id]) layer[to] = Math.max(layer[to], layer[id] + 1);
  // a node's explicit `layer` wins, for trees whose leaves should line up
  for (const n of nodes) if (Number.isInteger(n.layer)) layer[n.id] = n.layer;
  const count = Math.max(...Object.values(layer)) + 1;
  const rows = Array.from({ length: count }, () => []);
  for (const id of ids) rows[layer[id]].push(id);
  const preds = Object.fromEntries(ids.map((id) => [id, []]));
  spec.edges.forEach((e, k) => { if (!back.has(k)) preds[e.to].push(e.from); });
  for (let sweep = 0; sweep < 4; sweep++) {
    for (let l = 1; l < count; l++) {
      const pos = Object.fromEntries(rows[l - 1].map((id, n) => [id, n]));
      const bary = (id) => { const p = preds[id].filter((q) => q in pos); return p.length ? p.reduce((s, q) => s + pos[q], 0) / p.length : Infinity; };
      rows[l].sort((a, b) => { const d = bary(a) - bary(b); return Number.isFinite(d) ? d : ids.indexOf(a) - ids.indexOf(b); });
    }
  }
  const size = Object.fromEntries(nodes.map((n) => [n.id, nodeBox(n)]));
  const box = {};
  const labelW = Math.max(0, ...spec.edges.filter((e) => e.label).map((e) => textWidth(e.label, 12)));
  const GAP_L = dir === 'right' ? Math.max(48, labelW + 36) : 46;
  const GAP_N = dir === 'right' ? 18 : 16;
  if (dir === 'right') {
    let x = 0;
    const heights = rows.map((r) => r.reduce((s, id) => s + size[id].h, 0) + GAP_N * (r.length - 1));
    const H = Math.max(...heights);
    rows.forEach((r, l) => {
      const w = Math.max(...r.map((id) => size[id].w));
      let y = (H - heights[l]) / 2;
      for (const id of r) { box[id] = { ...size[id], x: x + w / 2, y: y + size[id].h / 2 }; y += size[id].h + GAP_N; }
      x += w + GAP_L;
    });
  } else {
    let y = 0;
    const widths = rows.map((r) => r.reduce((s, id) => s + size[id].w, 0) + GAP_N * (r.length - 1));
    const W = Math.max(...widths);
    rows.forEach((r, l) => {
      const h = Math.max(...r.map((id) => size[id].h));
      let x = (W - widths[l]) / 2;
      for (const id of r) { box[id] = { ...size[id], x: x + size[id].w / 2, y: y + h / 2 }; x += size[id].w + GAP_N; }
      y += h + GAP_L;
    });
  }
  return { box, back };
}

function flowSvg(spec, dir) {
  const ring = dir === 'loop';
  const box = {};
  let back = new Set();
  let center = null;
  if (ring) {
    const n = spec.nodes.length;
    const size = spec.nodes.map(nodeBox);
    const maxW = Math.max(...size.map((s) => s.w));
    const maxH = Math.max(...size.map((s) => s.h));
    // big enough that neighbours don't touch
    const rx = Math.max(110, (maxW + 36) / (2 * Math.sin(Math.PI / Math.max(n, 2))) * (n <= 2 ? 0.6 : 1), n === 2 ? maxW * 0.9 : 0);
    const ry = n <= 2 ? Math.max(48, maxH * 1.2) : Math.max(80, rx * 0.62, (maxH + 34) / (2 * Math.sin(Math.PI / n)) * 0.8);
    spec.nodes.forEach((node, k) => {
      const a = -Math.PI / 2 + (2 * Math.PI * k) / n;
      box[node.id] = { ...size[k], x: Math.cos(a) * rx, y: Math.sin(a) * ry };
    });
    center = { x: 0, y: 0 };
  } else {
    const r = layered(spec, dir);
    Object.assign(box, r.box);
    back = r.back;
  }

  let minX = Math.min(...Object.values(box).map((b) => b.x - b.w / 2));
  let maxX = Math.max(...Object.values(box).map((b) => b.x + b.w / 2));
  let minY = Math.min(...Object.values(box).map((b) => b.y - b.h / 2));
  let maxY = Math.max(...Object.values(box).map((b) => b.y + b.h / 2));

  const edges = [];
  const labels = [];
  let lane = 0;
  spec.edges.forEach((e, k) => {
    const a = box[e.from]; const b = box[e.to];
    let ctrl;
    let labelAt = null;
    if (ring) {
      const mx = (a.x + b.x) / 2; const my = (a.y + b.y) / 2;
      const len = Math.hypot(mx, my) || 1;
      const push = Math.hypot(b.x - a.x, b.y - a.y) * (e.bend ?? 0.32);
      // bend away from the middle for neighbours on the ring, a gentle curve for chords
      const c = [mx + (mx / len) * push, my + (my / len) * push];
      if (Math.hypot(mx, my) < 1) { c[0] = mx - (b.y - a.y) * 0.3; c[1] = my + (b.x - a.x) * 0.3; }
      ctrl = [[a.x, a.y], [a.x + (c[0] - a.x) * 0.66, a.y + (c[1] - a.y) * 0.66], [b.x + (c[0] - b.x) * 0.66, b.y + (c[1] - b.y) * 0.66], [b.x, b.y]];
    } else if (back.has(k)) {
      lane++;
      if (dir === 'right') {
        const y = maxY + 26 * lane;
        ctrl = [[a.x, a.y], [a.x + 30, y + 14], [b.x - 30, y + 14], [b.x, b.y]];
        labelAt = [(a.x + b.x) / 2, y + 4];
      } else {
        const x = maxX + 30 * lane;
        ctrl = [[a.x, a.y], [x + 18, a.y + 20], [x + 18, b.y - 20], [b.x, b.y]];
        labelAt = [x + 4, (a.y + b.y) / 2];
      }
    } else if (dir === 'right') {
      const dx = (b.x - a.x) / 2;
      ctrl = [[a.x, a.y], [a.x + dx, a.y], [b.x - dx, b.y], [b.x, b.y]];
    } else {
      const dy = (b.y - a.y) / 2;
      ctrl = [[a.x, a.y], [a.x, a.y + dy], [b.x, b.y - dy], [b.x, b.y]];
    }
    const p = edgePath(ctrl, a, b, e);
    for (const q of p.seg) { minX = Math.min(minX, q[0]); maxX = Math.max(maxX, q[0]); minY = Math.min(minY, q[1]); maxY = Math.max(maxY, q[1]); }
    edges.push(`<path class="fg-e${p.tone ? ` fg-${p.tone}` : ''}${e.dashed ? ' fg-d' : ''}" d="${p.d}"/><path class="fg-h${p.tone ? ` fg-${p.tone}` : ''}" d="${p.head}"/>`);
    if (e.label) {
      let at = labelAt ?? p.mid;
      if (ring) {
        const len = Math.hypot(at[0], at[1]) || 1;
        const off = textWidth(e.label, 12) / 2 + 6;
        at = [at[0] + (at[0] / len) * Math.min(off, 22), at[1] + (at[1] / len) * 12];
      }
      const w = textWidth(e.label, 12) + 10;
      minX = Math.min(minX, at[0] - w / 2); maxX = Math.max(maxX, at[0] + w / 2); minY = Math.min(minY, at[1] - 12); maxY = Math.max(maxY, at[1] + 10);
      labels.push(edgeLabel(at, e.label, `fg-el${p.tone ? ` fg-${p.tone}` : ''}`));
    }
  });
  let mid = '';
  if (center && spec.center) {
    mid = txt(0, spec.centerSub ? -2 : 6, spec.center, 'fg-c', 'middle');
    if (spec.centerSub) mid += txt(0, 18, spec.centerSub, 'fg-s', 'middle');
  }
  const nodes = spec.nodes.map((n) => nodeSvg(n, box[n.id])).join('');
  const pad = 8;
  const vb = [minX - pad, minY - pad, maxX - minX + 2 * pad, maxY - minY + 2 * pad].map(t1);
  return { svg: `${edges.join('')}${labels.join('')}${mid}${nodes}`, viewBox: vb.join(' '), width: Number(vb[2]), height: Number(vb[3]) };
}

// ---------- grid ----------
// A table of short cells: a payoff matrix, or a 2×2 of two questions. `cells[r][c]` is a string or {text, sub, tone}.
function gridSvg(spec) {
  const rows = spec.rows ?? [];
  const cols = spec.cols ?? [];
  const cell = (r, c) => { const v = spec.cells[r][c]; return typeof v === 'string' ? { text: v } : v; };
  const hasSub = spec.cells.some((row) => row.some((v) => typeof v === 'object' && v.sub));
  const colW = cols.map((h, c) => Math.max(96, textWidth(h, 13) + 24, ...rows.map((_, r) => Math.max(textWidth(cell(r, c).text, 14), cell(r, c).sub ? textWidth(cell(r, c).sub, 12) : 0) + 28)));
  const headW = Math.max(...rows.map((h) => textWidth(h, 13)), spec.rowLabel ? textWidth(spec.rowLabel, 12) : 0) + 24;
  const rowH = hasSub ? 62 : 46;
  const top = spec.colLabel ? 24 : 0;
  const headH = 34;
  let g = '';
  if (spec.colLabel) g += txt(headW + colW.reduce((a, b) => a + b, 0) / 2, 14, spec.colLabel, 'fc-ax', 'middle');
  if (spec.rowLabel) g += txt(0, top + 22, spec.rowLabel, 'fc-ax');
  let x = headW;
  cols.forEach((h, c) => { g += txt(x + colW[c] / 2, top + 22, h, 'fgd-h', 'middle'); x += colW[c]; });
  rows.forEach((h, r) => {
    const y = top + headH + rowH * r;
    g += txt(headW - 12, y + rowH / 2 + 5, h, 'fgd-h', 'end');
    let cx = headW;
    cols.forEach((_, c) => {
      const v = cell(r, c);
      const tone = TONES.has(v.tone) ? ` fg-${v.tone}` : '';
      g += `<g class="fgd-c${tone}"><rect x="${t1(cx + 2)}" y="${t1(y + 2)}" width="${t1(colW[c] - 4)}" height="${rowH - 4}" rx="5"/>`;
      if (v.sub) g += txt(cx + colW[c] / 2, y + rowH / 2 - 3, v.text, 'fgd-t', 'middle') + txt(cx + colW[c] / 2, y + rowH / 2 + 16, v.sub, 'fg-s', 'middle');
      else g += txt(cx + colW[c] / 2, y + rowH / 2 + 5, v.text, 'fgd-t', 'middle');
      g += '</g>';
      cx += colW[c];
    });
  });
  const W = headW + colW.reduce((a, b) => a + b, 0);
  const H = top + headH + rowH * rows.length;
  return { svg: g, width: W, height: H };
}

// ---------- chart ----------
const SERIES_TONES = ['accent', 'ink', 'muted', 'warn'];

// The chart's frame and marks. `data` is {series:[{name, tone, points:[[x,y]...], dots, line, fill, dashed}], marks}.
function chartSvg(spec, data, W, H) {
  const narrow = W < 480;
  const type = spec.type ?? 'line';
  const x = spec.x ?? {};
  const y = spec.y ?? {};
  if (type === 'bar' || type === 'hbar') return barSvg(spec, data, W, H);
  const all = data.series.flatMap((s) => s.points).filter((p) => Number.isFinite(p[0]) && Number.isFinite(p[1]));
  const marks = data.marks ?? [];
  let ylo = y.min ?? Math.min(0, ...all.map((p) => p[1]), ...marks.filter((m) => m.y != null).map((m) => m.y));
  let yhi = y.max ?? Math.max(...all.map((p) => p[1]), ...marks.filter((m) => m.y != null).map((m) => m.y));
  if (y.max == null) yhi += (yhi - ylo) * 0.04;
  if (!(yhi > ylo)) yhi = ylo + 1;
  let yt = ticks(ylo, yhi, narrow ? 3 : 4);
  // without a fixed range the axis runs to the next round tick, so the top line has a gridline above it
  if (y.max == null) yhi = Math.ceil(yhi / yt.step - 1e-9) * yt.step;
  if (y.min == null) ylo = Math.floor(ylo / yt.step + 1e-9) * yt.step;
  yt = { ...ticks(ylo, yhi, narrow ? 3 : 4), step: yt.step };
  yt.values = yt.values.filter((v) => Math.abs(Math.round(v / yt.step) * yt.step - v) < yt.step * 1e-6);
  // a demo's x.min and x.max may be formulas; runDemo works them out
  const xlo = typeof x.min === 'number' ? x.min : data.xmin ?? Math.min(...all.map((p) => p[0]));
  const xhi = typeof x.max === 'number' ? x.max : data.xmax ?? Math.max(...all.map((p) => p[0]));
  const fmtY = (v) => formatNumber(v, { unit: y.unit ?? '', format: y.format, step: yt.step });
  const tickW = Math.max(...yt.values.map((v) => textWidth(fmtY(v), 12)));
  // the end of each line carries its name (no legend), so the right margin fits the longest name
  const ends = data.series.filter((s) => s.name && s.points.length && s.label !== false);
  const endW = ends.length ? Math.min(narrow ? 110 : 170, Math.max(...ends.map((s) => textWidth(s.name, 12))) + 16) : 12;
  const L = Math.ceil(tickW) + 14;
  const R = endW;
  const T = y.label ? 30 : 12;
  const B = x.label ? 46 : 30;
  const sx = (v) => L + ((W - L - R) * (v - xlo)) / (xhi - xlo || 1);
  const sy = (v) => H - B - ((H - T - B) * (v - ylo)) / (yhi - ylo);
  const yClamp = (v) => Math.max(T - 4, Math.min(H - B + 4, sy(v)));
  let g = '';
  for (const v of yt.values) {
    if (v < ylo - 1e-9 || v > yhi + 1e-9) continue;
    g += `<line class="fc-g${v === 0 ? ' fc-0' : ''}" x1="${L}" x2="${t1(W - R)}" y1="${t1(sy(v))}" y2="${t1(sy(v))}"/>`;
    g += txt(L - 8, sy(v) + 4, fmtY(v), 'fc-tk', 'end');
  }
  const xticks = x.ticks ?? ticks(xlo, xhi, narrow ? 4 : 6).values;
  const xstep = x.ticks ? 0 : ticks(xlo, xhi, narrow ? 4 : 6).step;
  for (const v of xticks) {
    const val = typeof v === 'object' ? v.at : v;
    const label = typeof v === 'object' ? v.label : formatNumber(val, { unit: x.unit ?? '', format: x.format, step: xstep });
    if (val < xlo - 1e-9 || val > xhi + 1e-9) continue;
    g += txt(sx(val), H - B + 18, label, 'fc-tk', 'middle');
  }
  if (x.label) g += txt((L + W - R) / 2, H - 8, x.label, 'fc-ax', 'middle');
  if (y.label) g += txt(0, 14, y.label, 'fc-ax');
  // marks: a horizontal or vertical reference line, or a labelled point
  for (const m of marks) {
    if (m.y != null && m.x == null) {
      const yy = sy(m.y);
      g += `<line class="fc-m" x1="${L}" x2="${t1(W - R)}" y1="${t1(yy)}" y2="${t1(yy)}"/>`;
      if (m.text) g += txt(W - R - 4, yy - 6, m.text, 'fc-mt', 'end');
    } else if (m.x != null && m.y == null) {
      const xx = sx(m.x);
      g += `<line class="fc-m" x1="${t1(xx)}" x2="${t1(xx)}" y1="${T}" y2="${t1(H - B)}"/>`;
      if (m.text) g += txt(xx + 5, T + 10, m.text, 'fc-mt');
    } else if (m.x != null && m.y != null) {
      const xx = sx(m.x); const yy = sy(m.y);
      g += `<circle class="fc-pt" cx="${t1(xx)}" cy="${t1(yy)}" r="4"/>`;
      if (m.text) {
        const right = xx + textWidth(m.text, 12) + 10 < W - R;
        g += txt(right ? xx + 8 : xx - 8, yy - 8, m.text, 'fc-mt', right ? 'start' : 'end');
      }
    }
  }
  const path = (pts) => `M${pts.map((p) => `${t1(sx(p[0]))} ${t1(yClamp(p[1]))}`).join('L')}`;
  data.series.forEach((s, k) => {
    const tone = SERIES_TONES.includes(s.tone) ? s.tone : SERIES_TONES[Math.min(k, 2)];
    const pts = s.points.filter((p) => Number.isFinite(p[0]) && Number.isFinite(p[1]));
    if (!pts.length) return;
    if (s.fill) g += `<path class="fc-a fc-${tone}" d="${path(pts)}L${t1(sx(pts[pts.length - 1][0]))} ${t1(sy(Math.max(ylo, 0)))}L${t1(sx(pts[0][0]))} ${t1(sy(Math.max(ylo, 0)))}Z"/>`;
    if (s.line !== false && pts.length > 1) g += `<path class="fc-l fc-${tone}${s.dashed ? ' fc-d' : ''}${s.thin ? ' fc-thin' : ''}" d="${path(pts)}"/>`;
    if (s.dots || pts.length === 1) for (const p of pts) g += `<circle class="fc-dot fc-${tone}" cx="${t1(sx(p[0]))}" cy="${t1(yClamp(p[1]))}" r="${s.dots === 'small' ? 2.5 : 3.5}"/>`;
  });
  // names at the ends of the lines, pushed apart so they don't overlap
  const tags = ends.map((s) => {
    const k = data.series.indexOf(s);
    const tone = SERIES_TONES.includes(s.tone) ? s.tone : SERIES_TONES[Math.min(k, 2)];
    const p = s.points.filter((q) => Number.isFinite(q[1])).at(-1);
    return { y: yClamp(p[1]), x: sx(p[0]), name: s.name, tone };
  }).sort((a, b) => a.y - b.y);
  for (let k = 1; k < tags.length; k++) if (tags[k].y - tags[k - 1].y < 16) tags[k].y = tags[k - 1].y + 16;
  const over = tags.length ? tags[tags.length - 1].y - (H - B + 6) : 0;
  if (over > 0) for (const tag of tags) tag.y -= over;
  for (const tag of tags) g += txt(Math.min(tag.x, W - R) + 8, tag.y + 4, tag.name, `fc-nm fc-${tag.tone}`);
  return g;
}

function barSvg(spec, data, W, H) {
  const narrow = W < 480;
  const horizontal = spec.type === 'hbar';
  const y = spec.y ?? {};
  const cats = spec.categories ?? [];
  const series = data.series;
  const values = series.flatMap((s) => s.values ?? []);
  const lo = Math.min(0, y.min ?? 0, ...values);
  let hi = y.max ?? Math.max(...values) * 1.08;
  if (!(hi > lo)) hi = lo + 1;
  const yt = ticks(lo, hi, narrow ? 3 : 4);
  const fmt = (v, step = yt.step) => formatNumber(v, { unit: y.unit ?? '', format: y.format, step });
  const fmtVal = (v) => formatNumber(v, { unit: y.unit ?? '', format: y.format, step: spec.digits != null ? 10 ** -spec.digits : 0 });
  let g = '';
  const legend = series.length > 1;
  if (horizontal) {
    const catW = Math.min(narrow ? 120 : 200, Math.max(...cats.map((c) => textWidth(c, 13))) + 12);
    const L = catW; const R = 56; const T = legend ? 30 : 8; const B = 8;
    const band = (H - T - B) / cats.length;
    const barH = Math.min(26, (band * 0.7) / series.length);
    const sx = (v) => L + ((W - L - R) * (v - lo)) / (hi - lo);
    cats.forEach((c, i) => {
      const cy = T + band * i + band / 2;
      g += txt(L - 10, cy + 5, c, 'fc-cat', 'end');
      series.forEach((s, k) => {
        const tone = SERIES_TONES.includes(s.tone) ? s.tone : SERIES_TONES[Math.min(k, 2)];
        const v = s.values[i];
        const yy = cy - (barH * series.length) / 2 + barH * k;
        const tc = Array.isArray(s.tones) && s.tones[i] ? s.tones[i] : tone;
        g += `<rect class="fc-b fc-${tc}" x="${t1(Math.min(sx(0), sx(v)))}" y="${t1(yy + 1)}" width="${t1(Math.abs(sx(v) - sx(0)))}" height="${t1(barH - 2)}" rx="2"/>`;
        g += txt(Math.max(sx(0), sx(v)) + 6, yy + barH / 2 + 4, fmtVal(v), 'fc-v');
      });
    });
    if (legend) g += legendSvg(series, L, 14);
    return g;
  }
  const tickW = Math.max(...yt.values.map((v) => textWidth(fmt(v), 12)));
  const L = Math.ceil(tickW) + 14; const R = 8; const T = (y.label || legend) ? 30 : 14; const B = spec.x?.label ? 50 : 32;
  const band = (W - L - R) / cats.length;
  const barW = Math.min(narrow ? 34 : 56, (band * 0.72) / series.length);
  const sy = (v) => H - B - ((H - T - B) * (v - lo)) / (hi - lo);
  for (const v of yt.values) {
    if (v > hi + 1e-9) continue;
    g += `<line class="fc-g${v === 0 ? ' fc-0' : ''}" x1="${L}" x2="${t1(W - R)}" y1="${t1(sy(v))}" y2="${t1(sy(v))}"/>`;
    g += txt(L - 8, sy(v) + 4, fmt(v), 'fc-tk', 'end');
  }
  cats.forEach((c, i) => {
    const cx = L + band * i + band / 2;
    const size = textWidth(c, 12) > band - 4 ? 11 : 12;
    g += txt(cx, H - B + 18, c, size === 11 ? 'fc-tk fc-sm' : 'fc-tk', 'middle');
    series.forEach((s, k) => {
      const tone = SERIES_TONES.includes(s.tone) ? s.tone : SERIES_TONES[Math.min(k, 2)];
      const tc = Array.isArray(s.tones) && s.tones[i] ? s.tones[i] : tone;
      const v = s.values[i];
      const xx = cx - (barW * series.length) / 2 + barW * k;
      g += `<rect class="fc-b fc-${tc}" x="${t1(xx + 1)}" y="${t1(Math.min(sy(0), sy(v)))}" width="${t1(barW - 2)}" height="${t1(Math.abs(sy(v) - sy(0)))}" rx="2"/>`;
      if (!narrow || series.length === 1) g += txt(xx + barW / 2, Math.min(sy(0), sy(v)) - 6, fmtVal(v), 'fc-v', 'middle');
    });
  });
  if (spec.x?.label) g += txt((L + W - R) / 2, H - 8, spec.x.label, 'fc-ax', 'middle');
  if (legend) g += legendSvg(series, L, 14);
  else if (y.label) g += txt(0, 14, y.label, 'fc-ax');
  return g;
}

function legendSvg(series, x, y) {
  let g = '';
  series.forEach((s, k) => {
    const tone = SERIES_TONES.includes(s.tone) ? s.tone : SERIES_TONES[Math.min(k, 2)];
    g += `<rect class="fc-b fc-${tone}" x="${t1(x)}" y="${y - 9}" width="10" height="10" rx="2"/>${txt(x + 15, y, s.name, 'fc-tk')}`;
    x += textWidth(s.name, 12) + 34;
  });
  return g;
}

// ---------- demo ----------
const num = (v, env) => (typeof v === 'number' ? v : compile(v)(env));

// The demo's numbers for these slider values: {series, marks, readouts}. `seed` drives rand().
export function runDemo(spec, values = {}, seed = 1) {
  const env = {};
  for (const p of spec.params ?? []) env[p.id] = values[p.id] ?? p.value;
  const rand = seeded(seed);
  env.$rand = rand;
  const x = spec.x ?? {};
  const series = [];
  const runs = Math.min(30, Math.max(1, spec.runs ?? 1));
  const plots = (spec.series ?? []).map((s) => ({ ...s, f: compile(s.expr) }));
  let last = { ...env };
  let xmin; let xmax;
  if (spec.model) {
    const steps = Math.min(2000, Math.max(1, Math.round(num(spec.model.steps ?? x.max ?? 50, env))));
    const init = Object.entries(spec.model.init ?? {}).map(([k, v]) => [k, compile(v)]);
    const next = Object.entries(spec.model.next ?? {}).map(([k, v]) => [k, compile(v)]);
    for (let run = 0; run < runs; run++) {
      const st = { ...env, k: 0, n: steps };
      for (const [k, f] of init) st[k] = f(st);
      const pts = plots.map(() => []);
      for (let k = 0; ; k++) {
        st.k = k; st.x = k;
        plots.forEach((p, n) => { if (k >= (p.from ?? 0)) pts[n].push([k, p.f(st)]); });
        if (k === steps) break;
        const upd = next.map(([key, f]) => [key, f(st)]);
        for (const [key, v] of upd) st[key] = v;
      }
      plots.forEach((p, n) => series.push({ name: run === 0 ? p.name : '', tone: p.tone, dashed: p.dashed, dots: p.dots, fill: p.fill, line: p.line, thin: runs > 1 && p.thin !== false, points: pts[n], label: run === 0 && p.label !== false }));
      if (run === 0) last = { ...st };
    }
  } else {
    const lo = num(x.min ?? 0, env);
    const hi = num(x.max ?? 10, env);
    const samples = Math.min(400, Math.max(2, x.step ? Math.round((hi - lo) / x.step) : 80));
    for (const p of plots) {
      const pts = [];
      for (let k = 0; k <= samples; k++) { const xv = lo + ((hi - lo) * k) / samples; pts.push([xv, p.f({ ...env, x: xv })]); }
      series.push({ name: p.name, tone: p.tone, dashed: p.dashed, dots: p.dots, fill: p.fill, line: p.line, points: pts, label: p.label });
    }
    last = { ...env, x: hi };
    xmin = lo; xmax = hi;
  }
  const marks = (spec.marks ?? []).map((m) => ({ text: m.text, x: m.x != null ? num(m.x, last) : undefined, y: m.y != null ? num(m.y, last) : undefined }));
  const readouts = (spec.readouts ?? []).map((r) => {
    const v = compile(r.expr)(last);
    return { label: r.label, value: formatNumber(v, { unit: r.unit ?? '', format: r.format, step: r.digits != null ? 10 ** -r.digits : 0 }) };
  });
  return { series, marks, readouts, xmin, xmax };
}

// ---------- the figure ----------
// An SVG at one width: 'wide' for the card column, 'narrow' for phones.
export function figureSvg(spec, { size = 'wide', values, seed = 1 } = {}) {
  const label = escape(spec.title ?? '');
  if (spec.kind === 'flow') {
    const layout = spec.layout ?? 'right';
    const dir = size === 'narrow' && layout === 'right' && spec.nodes.length > 3 ? 'down' : layout;
    const f = flowSvg(spec, dir);
    const max = size === 'narrow' ? 360 : 940;
    const w = Math.min(f.width, max);
    return `<svg class="fg" viewBox="${f.viewBox}" width="${t1(w)}" role="img" aria-label="${label}" style="max-width:100%;height:auto">${f.svg}</svg>`;
  }
  if (spec.kind === 'grid') {
    const f = gridSvg(spec);
    return `<svg class="fg" viewBox="-4 -4 ${t1(f.width + 8)} ${t1(f.height + 8)}" width="${t1(Math.min(f.width + 8, size === 'narrow' ? 360 : 760))}" role="img" aria-label="${label}" style="max-width:100%;height:auto">${f.svg}</svg>`;
  }
  const W = size === 'narrow' ? 340 : 680;
  const auto = spec.type === 'hbar' ? 24 + (spec.categories?.length ?? 2) * (spec.series?.length > 1 ? 64 : 46) + ((spec.series?.length ?? 1) > 1 ? 30 : 0) : (size === 'narrow' ? 240 : 300);
  const H = spec.height ? Math.round(spec.height * (size === 'narrow' ? 0.82 : 1)) : auto;
  const data = spec.kind === 'demo' ? runDemo(spec, values, seed) : { series: spec.series ?? [], marks: spec.marks ?? [] };
  return `<svg class="fc" viewBox="0 0 ${W} ${H}" role="img" aria-label="${label}">${chartSvg(spec, data, W, H)}</svg>`;
}

// The figure block for a card page or the home page. `live` adds the demo's sliders (the card page); without it a demo
// is drawn at its starting values.
export function figureHtml(spec, { live = false, id = '' } = {}) {
  const both = `<div class="fw">${figureSvg(spec, { size: 'wide' })}</div><div class="fn">${figureSvg(spec, { size: 'narrow' })}</div>`;
  const head = spec.title ? `<figcaption class="fh">${escape(spec.title)}</figcaption>` : '';
  const cap = spec.caption ? `<p class="fcap">${escape(spec.caption)}</p>` : '';
  if (spec.kind !== 'demo' || !live) return `<figure class="fig fig-${spec.kind}">${head}<div class="fb">${both}</div>${cap}</figure>`;
  const random = (spec.model ? Object.values({ ...spec.model.init, ...spec.model.next }) : []).concat((spec.series ?? []).map((s) => s.expr))
    .some((f) => /\b(rand|randn|flip)\s*\(/.test(String(f)));
  const { readouts } = runDemo(spec);
  const ctl = `<div class="ctl">${(spec.params ?? []).map((p) => `<label><span class="lv">${escape(p.label)}<output data-o="${escape(p.id)}">${escape(formatNumber(p.value, { unit: p.unit ?? '', step: p.step ?? 1 }))}</output></span>`
    + `<input data-i="${escape(p.id)}" type="range" min="${p.min}" max="${p.max}" step="${p.step ?? 1}" value="${p.value}"></label>`).join('')}`
    + (readouts.length ? `<div class="rd">${readouts.map((r, n) => `<div><span>${escape(r.label)}</span><b data-r="${n}">${escape(r.value)}</b></div>`).join('')}</div>` : '')
    + `<div class="btns">${random ? '<button class="again" type="button">重抽</button>' : ''}<button class="reset" type="button" hidden>还原</button></div></div>`;
  return `<figure class="fig fig-demo" data-fig="${escape(id)}">${head}<div class="fb fdemo">${ctl}<div class="fv">${both}</div></div>${cap}`
    + `<script type="application/json" data-spec>${JSON.stringify(spec).replace(/</g, '\\u003c')}</script></figure>`;
}

// ---------- the schema ----------
const short = (s, n) => typeof s === 'string' && s.trim() !== '' && [...s].length <= n;
// Problems with a card's figure, as sentences for the build's error list; empty when it draws.
export function figureProblems(spec) {
  const out = [];
  if (!spec || typeof spec !== 'object') return ['figure 要是一个对象'];
  if (!['flow', 'grid', 'chart', 'demo'].includes(spec.kind)) return [`figure.kind ${spec.kind} 不认识（flow、grid、chart、demo）`];
  if (!short(spec.title, 28)) out.push('figure.title 要有，最多 28 个字');
  if (spec.caption != null && !short(spec.caption, 90)) out.push('figure.caption 最多 90 个字');
  if (spec.kind === 'flow') {
    if (!['right', 'down', 'loop'].includes(spec.layout ?? 'right')) out.push(`figure.layout ${spec.layout} 不认识`);
    const nodes = spec.nodes ?? [];
    if (nodes.length < 2 || nodes.length > 12) out.push('flow 要 2–12 个节点');
    const ids = new Set(nodes.map((n) => n.id));
    if (ids.size !== nodes.length) out.push('flow 的节点 id 有重复');
    for (const n of nodes) {
      if (!short(n.label, 12)) out.push(`节点 ${n.id} 的 label 要有，最多 12 个字`);
      if (n.sub != null && !short(n.sub, 16)) out.push(`节点 ${n.id} 的 sub 最多 16 个字`);
      if (n.tone != null && !TONES.has(n.tone)) out.push(`节点 ${n.id} 的 tone ${n.tone} 不认识`);
    }
    const edges = spec.edges ?? [];
    if (!edges.length) out.push('flow 至少要 1 条边');
    for (const e of edges) {
      if (!ids.has(e.from) || !ids.has(e.to)) out.push(`边 ${e.from}→${e.to} 指向不存在的节点`);
      if (e.from === e.to) out.push(`边 ${e.from}→${e.to} 指向自己`);
      if (e.label != null && !short(e.label, 10)) out.push(`边 ${e.from}→${e.to} 的 label 最多 10 个字`);
    }
    if (spec.center != null && !short(spec.center, 6)) out.push('figure.center 最多 6 个字');
    if (!out.length) {
      // the home page gives a figure about 600px; wider than this and its words get too small to read
      const { width } = flowSvg(spec, spec.layout ?? 'right');
      if (width > 900) out.push(`flow 画出来 ${Math.round(width)} 宽，超过 900：减少同一行的节点、缩短文字，或改 layout: down`);
    }
  }
  if (spec.kind === 'grid') {
    const rows = spec.rows ?? []; const cols = spec.cols ?? [];
    if (rows.length < 1 || rows.length > 5 || cols.length < 2 || cols.length > 4) out.push('grid 要 1–5 行、2–4 列');
    for (const h of [...rows, ...cols]) if (!short(h, 10)) out.push(`grid 的表头「${h}」最多 10 个字`);
    if (spec.rowLabel != null && !short(spec.rowLabel, 8)) out.push('grid.rowLabel 最多 8 个字');
    if (spec.colLabel != null && !short(spec.colLabel, 16)) out.push('grid.colLabel 最多 16 个字');
    if (!Array.isArray(spec.cells) || spec.cells.length !== rows.length || spec.cells.some((row) => !Array.isArray(row) || row.length !== cols.length)) out.push('grid.cells 要和 rows、cols 一样大');
    else for (const row of spec.cells) for (const v of row) {
      const c = typeof v === 'string' ? { text: v } : v ?? {};
      if (!short(c.text, 14)) out.push(`grid 的格子「${c.text}」要有，最多 14 个字`);
      if (c.sub != null && !short(c.sub, 18)) out.push(`grid 的格子「${c.text}」的 sub 最多 18 个字`);
      if (c.tone != null && !TONES.has(c.tone)) out.push(`grid 的格子「${c.text}」的 tone ${c.tone} 不认识`);
    }
  }
  if (spec.kind === 'chart' || spec.kind === 'demo') {
    const type = spec.type ?? 'line';
    if (!['line', 'bar', 'hbar'].includes(type)) out.push(`figure.type ${type} 不认识（line、bar、hbar）`);
    if (spec.kind === 'demo' && type !== 'line') out.push('demo 只画折线');
    const series = spec.series ?? [];
    if (!series.length || series.length > 6) out.push('figure.series 要 1–6 条');
    for (const s of series) if (s.name != null && s.name !== '' && !short(s.name, 12)) out.push(`系列「${s.name}」的名字最多 12 个字`);
    if (spec.x?.label != null && !short(spec.x.label, 20)) out.push('x.label 最多 20 个字');
    if (spec.y?.label != null && !short(spec.y.label, 20)) out.push('y.label 最多 20 个字');
    for (const m of spec.marks ?? []) if (m.text != null && !short(m.text, 16)) out.push(`标注「${m.text}」最多 16 个字`);
  }
  if (spec.kind === 'chart') {
    const type = spec.type ?? 'line';
    if (type === 'line') {
      for (const s of spec.series ?? []) if (!Array.isArray(s.points) || !s.points.length || !s.points.every((p) => Array.isArray(p) && p.length === 2 && p.every(Number.isFinite))) out.push(`系列「${s.name}」的 points 要是 [x, y] 数对`);
    } else {
      const cats = spec.categories ?? [];
      if (cats.length < 2 || cats.length > 12) out.push('bar 要 2–12 个 categories');
      for (const c of cats) if (!short(c, 14)) out.push(`类别「${c}」最多 14 个字`);
      for (const s of spec.series ?? []) if (!Array.isArray(s.values) || s.values.length !== cats.length || !s.values.every(Number.isFinite)) out.push(`系列「${s.name}」的 values 要和 categories 一样多`);
    }
  }
  if (spec.kind === 'demo') {
    const params = spec.params ?? [];
    if (!params.length || params.length > 4) out.push('demo 要 1–4 个滑块');
    for (const p of params) {
      if (!/^[a-z][a-z0-9_]*$/i.test(p.id ?? '') || Object.hasOwn(CONSTS, p.id) || p.id === 'x' || p.id === 'k' || p.id === 'n') out.push(`滑块 id ${p.id} 不能用`);
      if (!short(p.label, 10)) out.push(`滑块 ${p.id} 的 label 要有，最多 10 个字`);
      if (![p.min, p.max, p.value].every(Number.isFinite) || !(p.min < p.max) || p.value < p.min || p.value > p.max) out.push(`滑块 ${p.id} 的 min、max、value 不对`);
    }
    for (const r of spec.readouts ?? []) if (!short(r.label, 12)) out.push(`读数「${r.label}」的 label 最多 12 个字`);
    if ((spec.readouts ?? []).length > 3) out.push('readouts 最多 3 个');
    try {
      const corners = [Object.fromEntries(params.map((p) => [p.id, p.value])), Object.fromEntries(params.map((p) => [p.id, p.min])), Object.fromEntries(params.map((p) => [p.id, p.max]))];
      for (const values of corners) {
        const r = runDemo(spec, values);
        const bad = r.series.some((s) => !s.points.length || s.points.some((p) => !Number.isFinite(p[1])));
        if (bad) out.push(`demo 在滑块取 ${JSON.stringify(values)} 时算出了非数（除以零或对负数取对数）`);
      }
    } catch (error) {
      out.push(`demo：${error.message}`);
    }
  }
  if (!out.length) {
    try {
      for (const size of ['wide', 'narrow']) if (/NaN|Infinity/.test(figureSvg(spec, { size }))) out.push(`figure 在${size === 'wide' ? '宽屏' : '手机'}上画出了非数坐标`);
    } catch (error) { out.push(`figure 画不出来：${error.message}`); }
  }
  return out;
}
