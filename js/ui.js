// ตัวช่วยสร้างหน้าจอ

export function h(tag, props = {}, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k in el && k !== 'list' && k !== 'style') el[k] = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const kid of kids.flat()) {
    if (kid == null || kid === false) continue;
    el.append(kid.nodeType ? kid : document.createTextNode(kid));
  }
  return el;
}

let toastTimer;
export function toast(msg, ms = 2600) {
  let t = document.getElementById('toast');
  if (!t) {
    t = h('div', { id: 'toast' });
    document.body.append(t);
  }
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), ms);
}

const svg = (d) =>
  `<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${d}</svg>`;
export const icons = {
  menu: svg('<path d="M4 9h16M4 15h10"/>'),
  newChat: svg('<path d="M12 4H6a2 2 0 00-2 2v12a2 2 0 002 2h12a2 2 0 002-2v-6"/><path d="M18.5 2.5a2.1 2.1 0 013 3L12 15l-4 1 1-4z"/>'),
  pencil: svg('<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 013 3L7 19l-4 1 1-4z"/>'),
  copy: svg('<rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V6a2 2 0 012-2h9"/>'),
  retry: svg('<path d="M20 11a8 8 0 10-2.3 5.7"/><path d="M20 4v7h-7"/>'),
  dots: svg('<circle cx="12" cy="5" r="1.3" fill="currentColor"/><circle cx="12" cy="12" r="1.3" fill="currentColor"/><circle cx="12" cy="19" r="1.3" fill="currentColor"/>'),
  back: svg('<path d="M15 18l-6-6 6-6"/>'),
  send: svg('<path d="M12 19V5M5 12l7-7 7 7"/>'),
  stop: '<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><rect x="6" y="6" width="12" height="12" rx="2"/></svg>',
  chat: svg('<path d="M21 12a8 8 0 01-11.5 7.2L4 20l1-4.6A8 8 0 1121 12z"/>'),
  mic: svg('<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0014 0M12 18v3"/>'),
  memory: svg('<path d="M4 5a2 2 0 012-2h5v18H6a2 2 0 01-2-2zM20 5a2 2 0 00-2-2h-5v18h5a2 2 0 002-2z"/>'),
  settings: svg('<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 00.3 1.8l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.7 1.7 0 00-1.8-.3 1.7 1.7 0 00-1 1.5V21a2 2 0 11-4 0v-.1a1.7 1.7 0 00-1.1-1.5 1.7 1.7 0 00-1.8.3l-.1.1a2 2 0 11-2.8-2.8l.1-.1a1.7 1.7 0 00.3-1.8 1.7 1.7 0 00-1.5-1H3a2 2 0 110-4h.1a1.7 1.7 0 001.5-1.1 1.7 1.7 0 00-.3-1.8l-.1-.1a2 2 0 112.8-2.8l.1.1a1.7 1.7 0 001.8.3H9a1.7 1.7 0 001-1.5V3a2 2 0 114 0v.1a1.7 1.7 0 001 1.5 1.7 1.7 0 001.8-.3l.1-.1a2 2 0 112.8 2.8l-.1.1a1.7 1.7 0 00-.3 1.8V9a1.7 1.7 0 001.5 1H21a2 2 0 110 4h-.1a1.7 1.7 0 00-1.5 1z"/>'),
  interview: svg('<path d="M9 9a3 3 0 116 0c0 2-3 2-3 4M12 17h.01"/><circle cx="12" cy="12" r="10"/>'),
  chevron: svg('<path d="M9 18l6-6-6-6"/>'),
  trash: svg('<path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14"/>'),
};

export const iconEl = (name, cls = 'ico') => h('span', { class: cls, innerHTML: icons[name] });

export async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const ta = h('textarea', { value: text, style: 'position:fixed;opacity:0' });
    document.body.append(ta);
    ta.select();
    document.execCommand('copy');
    ta.remove();
  }
  toast('คัดลอกแล้ว');
}

// เมนูลอยข้างปุ่มที่กด (เหมือนเมนู ⋮ ของ ChatGPT) items = [{label, icon, danger, onClick}]
export function popMenu(anchor, items, { align = 'right' } = {}) {
  document.querySelector('.popscrim')?.remove();
  const scrim = h('div', { class: 'popscrim' });
  const close = () => scrim.remove();
  const menu = h('div', { class: 'popmenu' }, items.map((it) =>
    h('button', { class: it.danger ? 'danger' : '', onclick: () => { close(); it.onClick(); } }, it.icon && iconEl(it.icon), it.label)));
  scrim.addEventListener('click', (e) => { if (e.target === scrim) close(); });
  scrim.append(menu);
  document.body.append(scrim);
  const r = anchor.getBoundingClientRect();
  const mw = menu.offsetWidth;
  const mh = menu.offsetHeight;
  const left = Math.max(8, Math.min(align === 'right' ? r.right - mw : r.left, innerWidth - mw - 8));
  let top = r.bottom + 6;
  if (top + mh > innerHeight - 8) top = Math.max(8, r.top - mh - 6);
  menu.style.left = left + 'px';
  menu.style.top = top + 'px';
}

// ทำให้ตัวอักษรท้ายสุดจางลงไล่ระดับ (ดูเหมือนข้อความค่อยๆ ไล่มา) ตัดตามกลุ่มตัวอักษร ไม่ตัดสระ/วรรณยุกต์ขาดจากพยัญชนะ
export function fadeTail(root, n = 14) {
  if (typeof Intl === 'undefined' || !Intl.Segmenter) return;
  const seg = new Intl.Segmenter('th', { granularity: 'grapheme' });
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const nodes = [];
  while (walker.nextNode()) nodes.push(walker.currentNode);
  let dist = 0;
  for (let i = nodes.length - 1; i >= 0 && dist < n; i--) {
    const parts = [...seg.segment(nodes[i].data)].map((x) => x.segment);
    const take = Math.min(n - dist, parts.length);
    if (!take) continue;
    const frag = document.createDocumentFragment();
    const head = parts.slice(0, parts.length - take).join('');
    if (head) frag.append(head);
    for (let k = 0; k < take; k++) {
      const d = take - 1 - k + dist; // 0 = ตัวสุดท้ายของข้อความทั้งหมด
      frag.append(h('span', { style: `opacity:${(0.22 + 0.78 * (d / n)).toFixed(2)}` }, parts[parts.length - take + k]));
    }
    nodes[i].replaceWith(frag);
    dist += take;
  }
}
