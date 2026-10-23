// The compounding card's chart: ten thousand yuan at a chosen rate for a chosen number of years, interest added back
// against interest taken out each year; the shaded band is the interest earned on interest.
const fig = document.querySelector('[data-demo]');
if (fig) {
  const $ = (s) => fig.querySelector(s);
  const rate = $('[data-i="r"]');
  const years = $('[data-i="n"]');
  const svg = $('svg');
  const reset = $('.reset');
  const P = 10000;
  const trim = (x) => x.replace(/\.?0+$/, '');
  const money = (v) => (v >= 1e8 ? `${trim((v / 1e8).toFixed(v >= 1e9 ? 0 : 1))} 亿`
    : v >= 1e4 ? `${trim((v / 1e4).toFixed(v >= 1e6 ? 0 : v >= 1e5 ? 1 : 2))} 万` : `${Math.round(v).toLocaleString('en')} 元`);
  const nice = (m) => { const p = 10 ** Math.floor(Math.log10(m)); for (const k of [1, 2, 2.5, 5, 10]) if (k * p >= m) return k * p; return 10 * p; };
  const draw = () => {
    const r = Number(rate.value) / 100;
    const n = Number(years.value);
    $('[data-o="r"]').textContent = `${rate.value}%`;
    $('[data-o="n"]').textContent = n;
    reset.hidden = rate.value === '10' && years.value === '30';
    const comp = (k) => P * (1 + r) ** k;
    const simp = (k) => P * (1 + r * k);
    const top = nice(comp(n) * 1.04);
    const W = Math.max(280, Math.round(svg.parentNode.clientWidth - 26));
    const H = W < 520 ? 230 : 330;
    const L = 52; const R = W < 520 ? 64 : 96; const T = 14; const B = 34;
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    const x = (k) => L + ((W - L - R) * k) / n;
    const y = (v) => H - B - ((H - T - B) * v) / top;
    const steps = Math.max(n * 4, 40);
    const points = (f) => Array.from({ length: steps + 1 }, (_, i) => { const k = (n * i) / steps; return [x(k), y(f(k))]; });
    const pc = points(comp);
    const ps = points(simp);
    const line = (p) => `M${p.map((q) => `${q[0].toFixed(1)} ${q[1].toFixed(1)}`).join('L')}`;
    const area = `${line(pc)}L${ps.slice().reverse().map((q) => `${q[0].toFixed(1)} ${q[1].toFixed(1)}`).join('L')}Z`;
    let g = '';
    for (let i = 0; i <= 4; i++) {
      const v = (top * i) / 4;
      g += `<line class="ax" x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}"/><text class="tk" x="${L - 8}" y="${y(v) + 4}" text-anchor="end">${i ? money(v) : '0'}</text>`;
    }
    const tick = n <= 10 ? 1 : n <= 25 ? 5 : 10;
    for (let k = 0; k <= n; k += tick) g += `<text class="tk" x="${x(k)}" y="${H - B + 18}" text-anchor="middle">${k}</text>`;
    g += `<text class="tk" x="${W - R + 8}" y="${H - B + 18}">年</text>`;
    const yc = y(comp(n));
    const ys = y(simp(n));
    const ysl = Math.min(ys, H - B - 4);
    const ycl = Math.min(yc, ysl - 18);
    g += `<path class="ar" d="${area}"/><path class="ls" d="${line(ps)}"/><path class="lc" d="${line(pc)}"/>`
      + `<circle cx="${x(n)}" cy="${yc}" r="4" fill="var(--accent)"/><circle cx="${x(n)}" cy="${ys}" r="3.5" fill="var(--ink3)"/>`
      + `<text class="el" x="${x(n) + 10}" y="${Math.max(ycl, T + 6) + 4}" fill="var(--accent)">${money(comp(n))}</text>`
      + `<text class="el" x="${x(n) + 10}" y="${ysl + 4}" fill="var(--ink3)">${money(simp(n))}</text>`;
    svg.innerHTML = g;
    $('[data-v="c"]').textContent = money(comp(n));
    $('[data-v="s"]').textContent = money(simp(n));
    $('[data-v="d"]').textContent = money(comp(n) - simp(n));
  };
  rate.addEventListener('input', draw);
  years.addEventListener('input', draw);
  addEventListener('resize', draw);
  reset.addEventListener('click', () => { rate.value = 10; years.value = 30; draw(); });
  draw();
}
