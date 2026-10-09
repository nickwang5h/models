// How the page looks to this reader: light or dark (or the system's choice) and the size of everything. Kept on the device.
const KEY = 'models-display';
export const THEMES = {auto: '跟随系统', light: '浅色', dark: '深色'};
export const SIZES = {normal: '标准', large: '大', larger: '特大'};
const ZOOM = {normal: 1, large: 1.1, larger: 1.2};

export function read(storage) {
  let saved = {};
  try { saved = JSON.parse(storage.getItem(KEY) ?? '{}') ?? {}; } catch { saved = {}; }
  return {theme: saved.theme in THEMES ? saved.theme : 'auto', size: saved.size in SIZES ? saved.size : 'normal'};
}

export function save(storage, prefs) {
  try { storage.setItem(KEY, JSON.stringify(prefs)); } catch { /* private window: the choice lasts for this visit */ }
}

export function apply(root, prefs) {
  if (prefs.theme === 'auto') delete root.dataset.theme; else root.dataset.theme = prefs.theme;
  root.style.setProperty('--zoom', String(ZOOM[prefs.size]));
}
