// Keyboard: 1–4 or A–D answer the first question not yet answered; ← and → go to the previous and next card; R opens a random one.
export function keyAction(key) {
  const lower = key.length === 1 ? key.toLowerCase() : key;
  if (lower.length === 1 && '1234'.includes(lower)) return `pick${Number(lower) - 1}`;
  if (lower.length === 1 && 'abcd'.includes(lower)) return `pick${'abcd'.indexOf(lower)}`;
  return {ArrowLeft: 'previous', ArrowRight: 'next', r: 'random'}[lower] ?? null;
}

// Do the action on the page; false when it had nothing to act on.
export function act(action, document) {
  const press = (element) => { if (!element) return false; element.click(); return true; };
  if (action.startsWith('pick')) {
    const open = document.querySelector('.q:not(.done)');
    if (!open) return false;
    open.scrollIntoView?.({block: 'nearest'});
    return press(open.querySelectorAll('button.opt')[Number(action.slice(4))]);
  }
  if (action === 'previous') return press(document.querySelector('.steps a[rel="prev"]'));
  if (action === 'next') return press(document.querySelector('.steps a[rel="next"]'));
  if (action === 'random') return press(document.querySelector('[data-random]'));
  return false;
}
