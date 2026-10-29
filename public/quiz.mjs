// One question as HTML, shared by the built pages, /today and the review page in the browser. The reader may keep
// picking until the right option; each pick shows that option's feedback (see app.js).
export function escape(text) {
  return String(text).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

export function questionHtml(question, qid, from = null) {
  const options = question.options
    .map((option, n) => `<li class="li"><button type="button" class="opt" data-ok="${option.correct ? 1 : 0}"><span class="k">${'ABCD'[n]}</span>`
      + `<span>${escape(option.text)}</span><span class="st"></span></button><p class="fb" hidden>${escape(option.feedback)}</p></li>`)
    .join('');
  const source = from ? `<p class="from"><a href="${escape(from.href ?? `/m/${from.id}`)}">${escape(from.name)}</a></p>` : '';
  return `<div class="q" data-q="${escape(qid)}">${source}<p class="stem">${escape(question.stem)}</p>`
    + `<p class="qq">${escape(question.question)}</p><ol class="opts">${options}</ol>`
    + `<p class="explain" hidden>${escape(question.explain)}</p></div>`;
}
