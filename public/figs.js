// A card's demo: the sliders redraw the chart and the readouts; 重抽 draws new random numbers; 还原 puts the sliders back.
import { figureSvg, formatNumber, runDemo } from './figure.mjs';

for (const fig of document.querySelectorAll('[data-fig]')) {
  const spec = JSON.parse(fig.querySelector('[data-spec]').textContent);
  const inputs = [...fig.querySelectorAll('[data-i]')];
  const reset = fig.querySelector('.reset');
  const again = fig.querySelector('.again');
  let seed = 1;
  const draw = () => {
    const values = Object.fromEntries(inputs.map((i) => [i.dataset.i, Number(i.value)]));
    for (const p of spec.params) fig.querySelector(`[data-o="${p.id}"]`).textContent = formatNumber(values[p.id], { unit: p.unit ?? '', step: p.step ?? 1 });
    fig.querySelector('.fw').innerHTML = figureSvg(spec, { size: 'wide', values, seed });
    fig.querySelector('.fn').innerHTML = figureSvg(spec, { size: 'narrow', values, seed });
    runDemo(spec, values, seed).readouts.forEach((r, n) => { fig.querySelector(`[data-r="${n}"]`).textContent = r.value; });
    reset.hidden = seed === 1 && spec.params.every((p) => values[p.id] === p.value);
  };
  for (const input of inputs) input.addEventListener('input', draw);
  again?.addEventListener('click', () => { seed += 1; draw(); });
  reset.addEventListener('click', () => {
    for (const p of spec.params) fig.querySelector(`[data-i="${p.id}"]`).value = p.value;
    seed = 1;
    draw();
  });
}
