// One question as HTML, shared by the built card pages and the review page in the browser.
export function escape(text) {
  return String(text).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

export function questionHtml(question, qid, from = null) {
  const options = question.options
    .map((option) => `<li><button type="button" class="opt" data-ok="${option.correct ? 1 : 0}">${escape(option.text)}</button>`
      + `<p class="fb" hidden>${escape(option.feedback)}</p></li>`)
    .join('');
  const source = from ? `<p class="from">来自 <a href="/m/${escape(from.id)}">${escape(from.name)}</a></p>` : '';
  return `<div class="q" data-q="${escape(qid)}">${source}<p class="stem">${escape(question.stem)}</p>`
    + `<p class="ask">${escape(question.question)}</p><ol class="opts">${options}</ol>`
    + `<p class="explain" hidden>${escape(question.explain)}</p></div>`;
}
